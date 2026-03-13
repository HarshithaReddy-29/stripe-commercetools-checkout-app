"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = exports.config = void 0;
const utils_1 = require("../utils");
const getSavedPaymentConfig = () => {
    const config = process.env.STRIPE_SAVED_PAYMENT_METHODS_CONFIG;
    return {
        //default values disabled {"payment_method_save":"disabled"}
        ...(config ? (0, utils_1.parseJSON)(config) : null),
    };
};
exports.config = {
    // Required by Payment SDK
    projectKey: process.env.CTP_PROJECT_KEY || 'payment-integration',
    clientId: process.env.CTP_CLIENT_ID || 'xxx',
    clientSecret: process.env.CTP_CLIENT_SECRET || 'xxx',
    jwksUrl: process.env.CTP_JWKS_URL || 'https://mc-api.us-central1.gcp.commercetools.com/.well-known/jwks.json',
    jwtIssuer: process.env.CTP_JWT_ISSUER || 'https://mc-api.europe-west1.gcp.commercetools.com',
    authUrl: process.env.CTP_AUTH_URL || 'https://mc-api.us-central1.gcp.commercetools.com',
    apiUrl: process.env.CTP_API_URL || ' https://api.us-central1.gcp.commercetools.com',
    sessionUrl: process.env.CTP_SESSION_URL || 'https://session.us-central1.gcp.commercetools.com',
    checkoutUrl: process.env.CTP_CHECKOUT_URL || 'https://checkout.us-central1.gcp.commercetools.com',
    healthCheckTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
    // Required by logger
    loggerLevel: process.env.LOGGER_LEVEL || 'info',
    // Update with specific payment providers config
    mockClientKey: process.env.MOCK_CLIENT_KEY || 'stripe',
    mockEnvironment: process.env.MOCK_ENVIRONMENT || 'TEST',
    // Update with specific payment providers config
    stripeSecretKeyUS: process.env.STRIPE_SECRET_KEY,
    stripeSecretKeyCA: process.env.STRIPE_SECRET_KEY_CA,
    stripeSecretKeyEU: process.env.STRIPE_SECRET_KEY_EU,
    stripeWebhookSigningSecretUS: process.env.STRIPE_WEBHOOK_SIGNING_SECRET,
    stripeWebhookSigningSecretCA: process.env.STRIPE_WEBHOOK_SIGNING_SECRET_CA,
    stripeWebhookSigningSecretEU: process.env.STRIPE_WEBHOOK_SIGNING_SECRET_EU,
    stripeCaptureMethod: process.env.STRIPE_CAPTURE_METHOD || 'automatic',
    stripePaymentElementAppearance: process.env.STRIPE_APPEARANCE_PAYMENT_ELEMENT,
    stripePublishableKeyUS: process.env.STRIPE_PUBLISHABLE_KEY || '',
    stripePublishableKeyCA: process.env.STRIPE_PUBLISHABLE_KEY_CA || '',
    stripePublishableKeyEU: process.env.STRIPE_PUBLISHABLE_KEY_EU || '',
    stripeApplePayWellKnown: process.env.STRIPE_APPLE_PAY_WELL_KNOWN || 'mockWellKnown',
    stripeApiVersion: process.env.STRIPE_API_VERSION || '2025-02-24.acacia',
    stripeSavedPaymentMethodConfig: getSavedPaymentConfig(),
    stripeLayout: process.env.STRIPE_LAYOUT || '{"type":"tabs","defaultCollapsed":false}',
    stripeCollectBillingAddress: process.env.STRIPE_COLLECT_BILLING_ADDRESS || 'auto',
    // Payment Providers config
    paymentInterface: process.env.PAYMENT_INTERFACE || 'checkout-stripe',
    merchantReturnUrl: process.env.MERCHANT_RETURN_URL || '',
    /**
     * Enable multicapture and multirefund support for Stripe payments
     * When enabled, allows:
     * - Multiple partial captures on a single payment (multicapture)
     * - Multiple refunds to be processed on a single charge (multirefund)
     *
     * Default: false (disabled) - Merchants must opt-in to enable these advanced features
     * Note: This feature requires multicapture to be enabled in your Stripe account
     *
     * Environment variable: STRIPE_ENABLE_MULTI_OPERATIONS
     */
    stripeEnableMultiOperations: process.env.STRIPE_ENABLE_MULTI_OPERATIONS === 'true' || false,
};
const getConfig = () => {
    return exports.config;
};
exports.getConfig = getConfig;
