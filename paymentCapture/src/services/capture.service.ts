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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

function getRegionFromCurrency(currency: string): 'US' | 'CA' | 'EU' {
  const normalized = currency.toUpperCase();
  if (normalized === 'USD') return 'US';
  if (normalized === 'CAD') return 'CA';
  return 'EU';
}

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

export async function runCaptureJob() {
  console.log('CAPTURE JOB STARTED');

  const apiRoot = getApiRoot();
  const processed: string[] = [];

  const paymentsResponse: ClientResponse<{
    limit: number;
    offset: number;
    count: number;
    total?: number;
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

      const ordersResponse: ClientResponse<{
        limit: number;
        offset: number;
        count: number;
        total?: number;
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

      const shippingInfo: any = order.shippingInfo;
      if (shippingInfo?.custom?.fields?.fulfillmentType !== 'm2h') continue;

      const allShipped = order.lineItems.every(
        (li: any) => li?.custom?.fields?.deliveryStatus === 'Shipped'
      );
      if (!allShipped) continue;

      const region = getRegionFromCurrency(order.totalPrice.currencyCode);
      const stripeClient = getStripeClient(region);

      const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== 'requires_capture') continue;

      const captureResponse = await stripeClient.paymentIntents.capture(paymentIntentId);

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
                    centAmount: order.totalPrice.centAmount,
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