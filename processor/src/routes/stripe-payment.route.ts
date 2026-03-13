import Stripe from 'stripe';
import { SessionHeaderAuthenticationHook } from '@commercetools/connect-payments-sdk';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  ConfigElementResponseSchema,
  ConfigElementResponseSchemaDTO,
  CustomerResponseSchema,
  CustomerResponseSchemaDTO,
  PaymentResponseSchema,
  PaymentResponseSchemaDTO,
} from '../dtos/stripe-payment.dto';
import { log } from '../libs/logger';
import { stripeApi } from '../clients/stripe.client';
import { StripePaymentService } from '../services/stripe-payment.service';
import { StripeHeaderAuthHook } from '../libs/fastify/hooks/stripe-header-auth.hook';
import { Type } from '@sinclair/typebox';
import { getConfig } from '../config/config';
import {
  PaymentIntenConfirmRequestSchemaDTO,
  PaymentIntentConfirmRequestSchema,
  PaymentIntentConfirmResponseSchemaDTO,
  PaymentIntentResponseSchema,
  PaymentModificationStatus,
} from '../dtos/operations/payment-intents.dto';
import { StripeEvent } from '../services/types/stripe-payment.type';

type PaymentRoutesOptions = {
  paymentService: StripePaymentService;
  sessionHeaderAuthHook: SessionHeaderAuthenticationHook;
};

type StripeRoutesOptions = {
  paymentService: StripePaymentService;
  stripeHeaderAuthHook: StripeHeaderAuthHook;
};

export const customerRoutes = async (fastify: FastifyInstance, opts: FastifyPluginOptions & PaymentRoutesOptions) => {
  fastify.get<{ Reply: CustomerResponseSchemaDTO }>(
    '/customer/session',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        response: {
          200: CustomerResponseSchema,
          204: Type.Null(),
        },
      },
    },
    async (_, reply) => {
      const resp = await opts.paymentService.getCustomerSession();
      if (!resp) {
        return reply.status(204).send(null as any);
      }
      return reply.status(200).send(resp);
    },
  );
};

/**
 * MVP if additional information needs to be included in the payment intent, this method should be supplied with the necessary data.
 *
 */
export const paymentRoutes = async (fastify: FastifyInstance, opts: FastifyPluginOptions & PaymentRoutesOptions) => {
  fastify.get<{ Reply: PaymentResponseSchemaDTO }>(
    '/payments',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        response: {
          200: PaymentResponseSchema,
        },
      },
    },
    async (_, reply) => {
      const resp = await opts.paymentService.createPaymentIntentStripe();
      return reply.status(200).send(resp);
    },
  );
  fastify.post<{
    Body: PaymentIntenConfirmRequestSchemaDTO;
    Reply: PaymentIntentConfirmResponseSchemaDTO;
    Params: { id: string };
  }>(
    '/confirmPayments/:id',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        params: {
          $id: 'paramsSchema',
          type: 'object',
          properties: {
            id: Type.String(),
          },
          required: ['id'],
        },
        body: PaymentIntentConfirmRequestSchema,
        response: {
          200: PaymentIntentResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params; // paymentReference
      try {
        await opts.paymentService.updatePaymentIntentStripeSuccessful(request.body.paymentIntent, id);

        return reply.status(200).send({ outcome: PaymentModificationStatus.APPROVED });
      } catch (error) {
        return reply.status(400).send({ outcome: PaymentModificationStatus.REJECTED, error: JSON.stringify(error) });
      }
    },
  );
};

export const stripeWebhooksRoutes = async (
  fastify: FastifyInstance,
  opts: StripeRoutesOptions
) => {
  // ---------- US ----------
  fastify.post<{ Body: string }>(
    '/stripe/webhooks/us',
    {
      preHandler: [opts.stripeHeaderAuthHook.authenticate()],
      config: { rawBody: true },
    },
    async (request, reply) => {
      log.info("webhooks/us",request,reply)
      return handleStripeWebhook({
        request,
        reply,
        region: 'US',
        signingSecret: getConfig().stripeWebhookSigningSecretUS,
        paymentService: opts.paymentService,
      });
    }
  );
 
  // ---------- CA ----------
  fastify.post<{ Body: string }>(
    '/stripe/webhooks/ca',
    {
      preHandler: [opts.stripeHeaderAuthHook.authenticate()],
      config: { rawBody: true },
    },
    async (request, reply) => {
      return handleStripeWebhook({
        request,
        reply,
        region: 'CA',
        signingSecret: getConfig().stripeWebhookSigningSecretCA,
        paymentService: opts.paymentService,
      });
    }
  );
 
  // ---------- EU ----------
  fastify.post<{ Body: string }>(
    '/stripe/webhooks/eu',
    {
      preHandler: [opts.stripeHeaderAuthHook.authenticate()],
      config: { rawBody: true },
    },
    async (request, reply) => {
      return handleStripeWebhook({
        request,
        reply,
        region: 'EU',
        signingSecret: getConfig().stripeWebhookSigningSecretEU,
        paymentService: opts.paymentService,
      });
    }
  );
};
 
// ---------------------------------------------------------------------
// Shared webhook handler (single source of truth)
// ---------------------------------------------------------------------
async function handleStripeWebhook({
  request,
  reply,
  region,
  signingSecret,
  paymentService,
}: {
  request: any;
  reply: any;
  region: 'US' | 'CA' | 'EU';
  signingSecret: string;
  paymentService: any;
}) {
  const signature = request.headers['stripe-signature'] as string;
  let event: Stripe.Event;
 
  try {
    event = stripeApi(region).webhooks.constructEvent(
      request.rawBody as string,
      signature,
      signingSecret
    );
  } catch (error) {
    const err = error as Error;
    log.error({ region, error: err.message });
    return reply.status(400).send(`Webhook Error: ${err.message}`);
  }
 
  switch (event.type) {
    case StripeEvent.PAYMENT_INTENT__SUCCEEDED:
    case StripeEvent.CHARGE__SUCCEEDED:
      log.info(`Received [${region}]: ${event.type} - ${event.data.object.id}`);
      await paymentService.processStripeEvent(event);
      await paymentService.storePaymentMethod(event);
      break;
 
    case StripeEvent.PAYMENT_INTENT__CANCELED:
    case StripeEvent.PAYMENT_INTENT__REQUIRED_ACTION:
    case StripeEvent.PAYMENT_INTENT__PAYMENT_FAILED:
      log.info(`Received [${region}]: ${event.type} - ${event.data.object.id}`);
      await paymentService.processStripeEvent(event);
      break;
 
    case StripeEvent.CHARGE__REFUNDED:
      if (getConfig().stripeEnableMultiOperations) {
        log.info(`Processing multirefund [${region}]`);
        await paymentService.processStripeEventRefunded(event);
      } else {
        await paymentService.processStripeEvent(event);
      }
      break;
 
    case StripeEvent.CHARGE__UPDATED:
      if (getConfig().stripeEnableMultiOperations) {
        log.info(`Processing multicapture [${region}]`);
        await paymentService.processStripeEventMultipleCaptured(event);
      }
      break;
 
    default:
      log.info(`Unsupported Stripe event [${region}]: ${event.type}`);
      break;
  }
 
  return reply.status(200).send();
}

export const configElementRoutes = async (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions & PaymentRoutesOptions,
) => {
  fastify.get<{ Reply: ConfigElementResponseSchemaDTO; Params: { paymentComponent: string } }>(
    '/config-element/:paymentComponent',
    {
      preHandler: [opts.sessionHeaderAuthHook.authenticate()],
      schema: {
        params: {
          $id: 'paramsSchema',
          type: 'object',
          properties: {
            paymentComponent: Type.String(),
          },
          required: ['paymentComponent'],
        },
        response: {
          200: ConfigElementResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { paymentComponent } = request.params;
      const resp = await opts.paymentService.initializeCartPayment(paymentComponent);

      return reply.status(200).send(resp);
    },
  );
  fastify.get<{ Reply: string }>('/applePayConfig', async (request, reply) => {
    const resp = opts.paymentService.applePayConfig();
    return reply.status(200).send(resp);
  });
};
