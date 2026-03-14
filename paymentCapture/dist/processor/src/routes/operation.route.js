"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationsRoute = void 0;
const typebox_1 = require("@sinclair/typebox");
const config_dto_1 = require("../dtos/operations/config.dto");
const payment_componets_dto_1 = require("../dtos/operations/payment-componets.dto");
const payment_intents_dto_1 = require("../dtos/operations/payment-intents.dto");
const status_dto_1 = require("../dtos/operations/status.dto");
const config_1 = require("../config/config");
const operationsRoute = async (fastify, opts) => {
    fastify.get('/config', {
        //preHandler: [opts.sessionHeaderAuthHook.authenticate()],
        schema: {
            response: {
                200: config_dto_1.ConfigResponseSchema,
            },
        },
    }, async (_, reply) => {
        const config = await opts.paymentService.config();
        reply.code(200).send(config);
    });
    fastify.post('/jobs/capture-payments', async (req, reply) => {
        try {
            console.log("CAPTURE JOB TRIGGERED");
            const paymentService = opts.paymentService;
            const result = await paymentService.runDailyCaptureJob();
            return reply.send(result);
        }
        catch (err) {
            console.error("CAPTURE JOB ERROR:", err);
            const error = err;
            return reply.status(500).send({
                message: error.message,
            });
        }
    });
    fastify.get('/status', {
        preHandler: [opts.jwtAuthHook.authenticate()],
        schema: {
            response: {
                200: status_dto_1.StatusResponseSchema,
            },
        },
    }, async (_, reply) => {
        const status = await opts.paymentService.status();
        reply.code(200).send(status);
    });
    fastify.get('/payment-components', {
        preHandler: [opts.jwtAuthHook.authenticate()],
        schema: {
            response: {
                200: payment_componets_dto_1.SupportedPaymentComponentsSchema,
            },
        },
    }, async (_, reply) => {
        const result = await opts.paymentService.getSupportedPaymentComponents();
        reply.code(200).send(result);
    });
    fastify.get("/stripe-publishable-keys", async () => {
        const config = (0, config_1.getConfig)();
        return {
            publishableKeyUS: config.stripePublishableKeyUS,
            publishableKeyCA: config.stripePublishableKeyCA,
            publishableKeyEU: config.stripePublishableKeyEU,
        };
    });
    fastify.post('/payment-intents/:id', {
        preHandler: [
            opts.oauth2AuthHook.authenticate(),
            opts.authorizationHook.authorize('manage_project', 'manage_checkout_payment_intents'),
        ],
        schema: {
            params: {
                $id: 'paramsSchema',
                type: 'object',
                properties: {
                    id: typebox_1.Type.String(),
                },
                required: ['id'],
            },
            body: payment_intents_dto_1.PaymentIntentRequestSchema,
            response: {
                200: payment_intents_dto_1.PaymentIntentResponseSchema,
            },
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const resp = await opts.paymentService.modifyPayment({
            paymentId: id,
            data: request.body,
        });
        return reply.status(200).send(resp);
    });
};
exports.operationsRoute = operationsRoute;
