"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const payment_sdk_1 = require("../payment-sdk");
const stripe_payment_service_1 = require("../services/stripe-payment.service");
const paymentService = new stripe_payment_service_1.StripePaymentService({
    ctCartService: payment_sdk_1.paymentSDK.ctCartService,
    ctPaymentService: payment_sdk_1.paymentSDK.ctPaymentService,
    ctOrderService: payment_sdk_1.paymentSDK.ctOrderService,
    ctPaymentMethodService: payment_sdk_1.paymentSDK.ctPaymentMethodService,
    ctRecurringPaymentJobService: payment_sdk_1.paymentSDK.ctRecurringPaymentJobService,
});
exports.app = {
    services: {
        paymentService,
    },
};
