"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeApiError = void 0;
const connect_payments_sdk_1 = require("@commercetools/connect-payments-sdk");
class StripeApiError extends connect_payments_sdk_1.Errorx {
    constructor(errorData, additionalOpts) {
        super({
            code: errorData.code,
            httpErrorStatus: errorData.statusCode,
            message: errorData.message,
            ...additionalOpts,
        });
    }
}
exports.StripeApiError = StripeApiError;
