"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configElementRoutes = exports.stripeWebhooksRoutes = exports.paymentRoutes = exports.customerRoutes = void 0;
const stripe_payment_dto_1 = require("../dtos/stripe-payment.dto");
const logger_1 = require("../libs/logger");
const stripe_client_1 = require("../clients/stripe.client");
const typebox_1 = require("@sinclair/typebox");
const config_1 = require("../config/config");
const payment_intents_dto_1 = require("../dtos/operations/payment-intents.dto");
const stripe_payment_type_1 = require("../services/types/stripe-payment.type");
const customerRoutes = async (fastify, opts) => {
    fastify.get('/customer/session', {
        preHandler: [opts.sessionHeaderAuthHook.authenticate()],
        schema: {
            response: {
                200: stripe_payment_dto_1.CustomerResponseSchema,
                204: typebox_1.Type.Null(),
            },
        },
    }, async (_, reply) => {
        const resp = await opts.paymentService.getCustomerSession();
        if (!resp) {
            return reply.status(204).send(null);
        }
        return reply.status(200).send(resp);
    });
};
exports.customerRoutes = customerRoutes;
/**
 * MVP if additional information needs to be included in the payment intent, this method should be supplied with the necessary data.
 *
 */
const paymentRoutes = async (fastify, opts) => {
    fastify.get('/payments', {
        preHandler: [opts.sessionHeaderAuthHook.authenticate()],
        schema: {
            response: {
                200: stripe_payment_dto_1.PaymentResponseSchema,
            },
        },
    }, async (_, reply) => {
        const resp = await opts.paymentService.createPaymentIntentStripe();
        return reply.status(200).send(resp);
    });
    fastify.post('/confirmPayments/:id', {
        preHandler: [opts.sessionHeaderAuthHook.authenticate()],
        schema: {
            params: {
                $id: 'paramsSchema',
                type: 'object',
                properties: {
                    id: typebox_1.Type.String(),
                },
                required: ['id'],
            },
            body: payment_intents_dto_1.PaymentIntentConfirmRequestSchema,
            response: {
                200: payment_intents_dto_1.PaymentIntentResponseSchema,
            },
        },
    }, async (request, reply) => {
        const { id } = request.params; // paymentReference
        try {
            await opts.paymentService.updatePaymentIntentStripeSuccessful(request.body.paymentIntent, id);
            return reply.status(200).send({ outcome: payment_intents_dto_1.PaymentModificationStatus.APPROVED });
        }
        catch (error) {
            return reply.status(400).send({ outcome: payment_intents_dto_1.PaymentModificationStatus.REJECTED, error: JSON.stringify(error) });
        }
    });
};
exports.paymentRoutes = paymentRoutes;
const stripeWebhooksRoutes = async (fastify, opts) => {
    // ---------- US ----------
    fastify.post('/stripe/webhooks/us', {
        preHandler: [opts.stripeHeaderAuthHook.authenticate()],
        config: { rawBody: true },
    }, async (request, reply) => {
        logger_1.log.info("webhooks/us", request, reply);
        return handleStripeWebhook({
            request,
            reply,
            region: 'US',
            signingSecret: (0, config_1.getConfig)().stripeWebhookSigningSecretUS,
            paymentService: opts.paymentService,
        });
    });
    // ---------- CA ----------
    fastify.post('/stripe/webhooks/ca', {
        preHandler: [opts.stripeHeaderAuthHook.authenticate()],
        config: { rawBody: true },
    }, async (request, reply) => {
        return handleStripeWebhook({
            request,
            reply,
            region: 'CA',
            signingSecret: (0, config_1.getConfig)().stripeWebhookSigningSecretCA,
            paymentService: opts.paymentService,
        });
    });
    // ---------- EU ----------
    fastify.post('/stripe/webhooks/eu', {
        preHandler: [opts.stripeHeaderAuthHook.authenticate()],
        config: { rawBody: true },
    }, async (request, reply) => {
        return handleStripeWebhook({
            request,
            reply,
            region: 'EU',
            signingSecret: (0, config_1.getConfig)().stripeWebhookSigningSecretEU,
            paymentService: opts.paymentService,
        });
    });
};
exports.stripeWebhooksRoutes = stripeWebhooksRoutes;
// ---------------------------------------------------------------------
// Shared webhook handler (single source of truth)
// ---------------------------------------------------------------------
async function handleStripeWebhook({ request, reply, region, signingSecret, paymentService, }) {
    const signature = request.headers['stripe-signature'];
    let event;
    try {
        event = (0, stripe_client_1.stripeApi)(region).webhooks.constructEvent(request.rawBody, signature, signingSecret);
    }
    catch (error) {
        const err = error;
        logger_1.log.error({ region, error: err.message });
        return reply.status(400).send(`Webhook Error: ${err.message}`);
    }
    switch (event.type) {
        case stripe_payment_type_1.StripeEvent.PAYMENT_INTENT__SUCCEEDED:
        case stripe_payment_type_1.StripeEvent.CHARGE__SUCCEEDED:
            logger_1.log.info(`Received [${region}]: ${event.type} - ${event.data.object.id}`);
            await paymentService.processStripeEvent(event);
            await paymentService.storePaymentMethod(event);
            break;
        case stripe_payment_type_1.StripeEvent.PAYMENT_INTENT__CANCELED:
        case stripe_payment_type_1.StripeEvent.PAYMENT_INTENT__REQUIRED_ACTION:
        case stripe_payment_type_1.StripeEvent.PAYMENT_INTENT__PAYMENT_FAILED:
            logger_1.log.info(`Received [${region}]: ${event.type} - ${event.data.object.id}`);
            await paymentService.processStripeEvent(event);
            break;
        case stripe_payment_type_1.StripeEvent.CHARGE__REFUNDED:
            if ((0, config_1.getConfig)().stripeEnableMultiOperations) {
                logger_1.log.info(`Processing multirefund [${region}]`);
                await paymentService.processStripeEventRefunded(event);
            }
            else {
                await paymentService.processStripeEvent(event);
            }
            break;
        case stripe_payment_type_1.StripeEvent.CHARGE__UPDATED:
            if ((0, config_1.getConfig)().stripeEnableMultiOperations) {
                logger_1.log.info(`Processing multicapture [${region}]`);
                await paymentService.processStripeEventMultipleCaptured(event);
            }
            break;
        default:
            logger_1.log.info(`Unsupported Stripe event [${region}]: ${event.type}`);
            break;
    }
    return reply.status(200).send();
}
const configElementRoutes = async (fastify, opts) => {
    fastify.get('/config-element/:paymentComponent', {
        preHandler: [opts.sessionHeaderAuthHook.authenticate()],
        schema: {
            params: {
                $id: 'paramsSchema',
                type: 'object',
                properties: {
                    paymentComponent: typebox_1.Type.String(),
                },
                required: ['paymentComponent'],
            },
            response: {
                200: stripe_payment_dto_1.ConfigElementResponseSchema,
            },
        },
    }, async (request, reply) => {
        const { paymentComponent } = request.params;
        const resp = await opts.paymentService.initializeCartPayment(paymentComponent);
        return reply.status(200).send(resp);
    });
    fastify.get('/applePayConfig', async (request, reply) => {
        const resp = opts.paymentService.applePayConfig();
        return reply.status(200).send(resp);
    });
};
exports.configElementRoutes = configElementRoutes;
