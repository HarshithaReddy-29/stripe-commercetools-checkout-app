"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const payment_sdk_1 = require("../../payment-sdk");
const stripe_payment_route_1 = require("../../routes/stripe-payment.route");
const stripe_payment_service_1 = require("../../services/stripe-payment.service");
const stripe_header_auth_hook_1 = require("../../libs/fastify/hooks/stripe-header-auth.hook");
async function default_1(server) {
    const stripePaymentService = new stripe_payment_service_1.StripePaymentService({
        ctCartService: payment_sdk_1.paymentSDK.ctCartService,
        ctPaymentService: payment_sdk_1.paymentSDK.ctPaymentService,
        ctOrderService: payment_sdk_1.paymentSDK.ctOrderService,
        ctPaymentMethodService: payment_sdk_1.paymentSDK.ctPaymentMethodService,
        ctRecurringPaymentJobService: payment_sdk_1.paymentSDK.ctRecurringPaymentJobService,
    });
    await server.register(stripe_payment_route_1.customerRoutes, {
        paymentService: stripePaymentService,
        sessionHeaderAuthHook: payment_sdk_1.paymentSDK.sessionHeaderAuthHookFn,
    });
    await server.register(stripe_payment_route_1.paymentRoutes, {
        paymentService: stripePaymentService,
        sessionHeaderAuthHook: payment_sdk_1.paymentSDK.sessionHeaderAuthHookFn,
    });
    const stripeHeaderAuthHook = new stripe_header_auth_hook_1.StripeHeaderAuthHook();
    await server.register(stripe_payment_route_1.stripeWebhooksRoutes, {
        paymentService: stripePaymentService,
        stripeHeaderAuthHook: stripeHeaderAuthHook,
    });
    await server.register(stripe_payment_route_1.configElementRoutes, {
        paymentService: stripePaymentService,
        sessionHeaderAuthHook: payment_sdk_1.paymentSDK.sessionHeaderAuthHookFn,
    });
}
