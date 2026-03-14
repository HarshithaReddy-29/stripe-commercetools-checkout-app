"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeHeaderAuthHook = void 0;
const connect_payments_sdk_1 = require("@commercetools/connect-payments-sdk");
class StripeHeaderAuthHook {
    authenticate() {
        return async (request) => {
            if (request.headers['stripe-signature']) {
                return;
            }
            throw new connect_payments_sdk_1.ErrorAuthErrorResponse('Stripe signature is not valid');
        };
    }
}
exports.StripeHeaderAuthHook = StripeHeaderAuthHook;
