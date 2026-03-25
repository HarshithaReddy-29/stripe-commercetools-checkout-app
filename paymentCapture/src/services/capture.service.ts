import * as dotenv from 'dotenv';
dotenv.config();

import Stripe from 'stripe';
import { ClientBuilder } from '@commercetools/ts-client';
import {
  createApiBuilderFromCtpClient,
  type Payment,
  type Order,
  type ClientResponse,
} from '@commercetools/platform-sdk';

/**
 * Get commercetools API client
 */
function getApiRoot() {
  const authHost = process.env.CTP_AUTH_URL!;
  const apiHost = process.env.CTP_API_URL!;
  const projectKey = process.env.CTP_PROJECT_KEY!;
  const clientId = process.env.CTP_CLIENT_ID!;
  const clientSecret = process.env.CTP_CLIENT_SECRET!;

  if (!authHost || !apiHost || !projectKey || !clientId || !clientSecret) {
    throw new Error('Missing required commercetools environment variables');
  }

  const ctpClient = new ClientBuilder()
    .withClientCredentialsFlow({
      host: authHost,
      projectKey,
      credentials: {
        clientId,
        clientSecret,
      },
    })
    .withHttpMiddleware({
      host: apiHost,
    })
    .build();

  return createApiBuilderFromCtpClient(ctpClient).withProjectKey({ projectKey });
}

/**
 * Resolve Stripe region
 */
function getRegionFromCurrency(currency: string): 'US' | 'CA' | 'EU' {
  const normalized = currency.toUpperCase();
  if (normalized === 'USD') return 'US';
  if (normalized === 'CAD') return 'CA';
  return 'EU';
}

/**
 * Get Stripe client per region
 */
function getStripeClient(region: 'US' | 'CA' | 'EU'): Stripe {
  const key =
    region === 'CA'
      ? process.env.STRIPE_SECRET_KEY_CA
      : region === 'EU'
      ? process.env.STRIPE_SECRET_KEY_EU
      : process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error(`Missing Stripe secret key for region ${region}`);
  }

  return new Stripe(key, {
    apiVersion: '2023-10-16',
  });
}

/**
 * MAIN JOB
 */
export async function runCaptureJob() {
  console.log('CAPTURE JOB STARTED');

  const apiRoot = getApiRoot();
  const processed: string[] = [];

  // Fetch payments
  const paymentsResponse: ClientResponse<{
    results: Payment[];
  }> = await apiRoot
    .payments()
    .get({
      queryArgs: {
        where: 'paymentMethodInfo(paymentInterface="checkout-stripe")',
        limit: 100,
      },
    })
    .execute();

  const payments = paymentsResponse.body.results;

  for (const payment of payments) {
    try {
      const paymentIntentId = payment.interfaceId;
      if (!paymentIntentId) continue;

      //Skip already captured payments (IMPORTANT)
      const alreadyCharged = payment.transactions?.some(
        (tx: any) => tx.type === 'Charge' && tx.state === 'Success'
      );

      if (alreadyCharged) {
        console.log(`Skipping ${payment.id} — already captured`);
        continue;
      }

      // Get order
      const ordersResponse: ClientResponse<{
        results: Order[];
      }> = await apiRoot
        .orders()
        .get({
          queryArgs: {
            where: `paymentInfo(payments(id="${payment.id}"))`,
            limit: 1,
          },
        })
        .execute();

      const order = ordersResponse.body.results[0];
      if (!order) continue;

      // Only M2H orders
      const shippingInfo: any = order.shippingInfo;
      if (shippingInfo?.custom?.fields?.fulfillmentType !== 'm2h') continue;

      // Eligibility: all items must be Shipped OR Cancelled
      const isEligible = order.lineItems.every((li: any) => {
        const status = li?.custom?.fields?.deliveryStatus;
        return status === 'Shipped' || status === 'Cancelled';
      });

      if (!isEligible) continue;

      // Calculate capture amount (ONLY shipped items)
      let captureCentAmount = 0;

      for (const li of order.lineItems) {
        const status = li?.custom?.fields?.deliveryStatus;

        if (status === 'Shipped') {
          captureCentAmount += li.totalPrice.centAmount;
        }
      }

      // Add shipping cost
      if (order.shippingInfo?.price?.centAmount) {
        captureCentAmount += order.shippingInfo.price.centAmount;
      }

      // Nothing to capture
      if (captureCentAmount <= 0) {
        console.log(`Skipping order ${order.id} — nothing to capture`);
        continue;
      }

      // Stripe region
      const region = getRegionFromCurrency(order.totalPrice.currencyCode);
      const stripeClient = getStripeClient(region);

      // Get PaymentIntent
      const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'requires_capture') continue;

      // Ensure we don't exceed capturable amount
      const capturable = paymentIntent.amount_capturable ?? 0;

      if (captureCentAmount > capturable) {
        console.warn(
          `Adjusting capture amount. Requested: ${captureCentAmount}, Capturable: ${capturable}`
        );
        captureCentAmount = capturable;
      }

      if (captureCentAmount <= 0) continue;

      // Capture payment
      const captureResponse = await stripeClient.paymentIntents.capture(
        paymentIntentId,
        {
          amount_to_capture: captureCentAmount,
        }
      );

      // Update commercetools payment
      await apiRoot
        .payments()
        .withId({ ID: payment.id })
        .post({
          body: {
            version: payment.version,
            actions: [
              {
                action: 'addTransaction',
                transaction: {
                  type: 'Charge',
                  amount: {
                    currencyCode: order.totalPrice.currencyCode,
                    centAmount: captureCentAmount,
                  },
                  state: 'Success',
                  interactionId: captureResponse.id,
                },
              },
            ],
          },
        })
        .execute();

      processed.push(order.id);
      console.log(`Captured payment for order ${order.id}`);
    } catch (err) {
      console.error(`Failed processing payment ${payment.id}`, err);
    }
  }

  return {
    processed: processed.length,
    orders: processed,
  };
}