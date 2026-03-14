"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapStripeError = exports.stripeApi = void 0;
const stripe_1 = __importDefault(require("stripe"));
const config_1 = require("../config/config");
const stripe_api_error_1 = require("../errors/stripe-api.error");
const logger_1 = require("../libs/logger");
const stripeApi = (region = 'US') => {
    const config = (0, config_1.getConfig)();
    const secretKey = region === 'CA'
        ? config.stripeSecretKeyCA
        : region === 'EU'
            ? config.stripeSecretKeyEU
            : config.stripeSecretKeyUS;
    return new stripe_1.default(secretKey, {
        apiVersion: config.stripeApiVersion,
        appInfo: {
            name: 'Stripe app for Commercetools Connect',
            version: '1.0.0',
            url: process.env.CONNECT_SERVICE_URL ?? 'https://example.com',
            partner_id: 'pp_partner_c0mmercet00lsc0NNect',
        },
    });
};
exports.stripeApi = stripeApi;
const wrapStripeError = (e) => {
    if (e?.raw) {
        const errorData = JSON.parse(JSON.stringify(e.raw));
        return new stripe_api_error_1.StripeApiError(errorData, { cause: e });
    }
    logger_1.log.error('Unexpected error calling Stripe API:', e);
    return e;
};
exports.wrapStripeError = wrapStripeError;
