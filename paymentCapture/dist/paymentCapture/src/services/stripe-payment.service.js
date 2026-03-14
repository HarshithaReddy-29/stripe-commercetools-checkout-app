"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripePaymentService = void 0;
const connect_payments_sdk_1 = require("@commercetools/connect-payments-sdk");
const cart_client_1 = require("./commerce-tools/cart-client");
const payment_intents_dto_1 = require("../dtos/operations/payment-intents.dto");
const package_json_1 = __importDefault(require("../../package.json"));
const constants_1 = require("../constants");
const order_client_1 = require("./commerce-tools/order-client");
const abstract_payment_service_1 = require("./abstract-payment.service");
const config_1 = require("../config/config");
const payment_sdk_1 = require("../payment-sdk");
const stripe_payment_type_1 = require("./types/stripe-payment.type");
const stripe_payment_dto_1 = require("../dtos/stripe-payment.dto");
const context_1 = require("../libs/fastify/context/context");
const stripe_client_1 = require("../clients/stripe.client");
const logger_1 = require("../libs/logger");
const crypto_1 = __importDefault(require("crypto"));
const stripeEventConverter_1 = require("./converters/stripeEventConverter");
const custom_types_1 = require("../custom-types/custom-types");
const customTypeHelper_1 = require("../services/commerce-tools/customTypeHelper");
const utils_1 = require("../utils");
const customerClient_1 = require("../services/commerce-tools/customerClient");
class StripePaymentService extends abstract_payment_service_1.AbstractPaymentService {
    constructor(opts) {
        super(opts.ctCartService, opts.ctPaymentService, opts.ctOrderService, opts.ctPaymentMethodService, opts.ctRecurringPaymentJobService);
        this.stripeEventConverter = new stripeEventConverter_1.StripeEventConverter();
    }
    /**
     * Get configurations
     *
     * @remarks
     * Implementation to provide mocking configuration information
     *
     * @returns Promise with mocking object containing configuration information
     */
    async config(region = 'US') {
        const config = (0, config_1.getConfig)();
        const publishableKey = region === 'CA'
            ? config.stripePublishableKeyCA
            : region === 'EU'
                ? config.stripePublishableKeyEU
                : config.stripePublishableKeyUS;
        return {
            environment: config.mockEnvironment,
            publishableKey,
            //paymentInterface: config.paymentInterface,
            //merchantReturnUrl: config.merchantReturnUrl,
        };
    }
    /**
     * Get status
     *
     * @remarks
     * Implementation to provide mocking status of external systems
     *
     * @returns Promise with mocking data containing a list of status from different external systems
     */
    async status() {
        const handler = await (0, connect_payments_sdk_1.statusHandler)({
            timeout: (0, config_1.getConfig)().healthCheckTimeout,
            log: payment_sdk_1.appLogger,
            checks: [
                (0, connect_payments_sdk_1.healthCheckCommercetoolsPermissions)({
                    requiredPermissions: [
                        'manage_payments',
                        'view_sessions',
                        'view_api_clients',
                        'manage_orders',
                        'introspect_oauth_tokens',
                        'manage_checkout_payment_intents',
                        'manage_types',
                        'manage_payment_methods',
                        'manage_recurring_payment_jobs',
                    ],
                    ctAuthorizationService: payment_sdk_1.paymentSDK.ctAuthorizationService,
                    projectKey: (0, config_1.getConfig)().projectKey,
                }),
                async () => {
                    try {
                        const paymentMethods = await (0, stripe_client_1.stripeApi)().paymentMethods.list({
                            limit: 3,
                        });
                        return {
                            name: 'Stripe Status check',
                            status: 'UP',
                            message: 'Stripe api is working',
                            details: {
                                paymentMethods,
                            },
                        };
                    }
                    catch (e) {
                        return {
                            name: 'Stripe Status check',
                            status: 'DOWN',
                            message: 'The mock paymentAPI is down for some reason. Please check the logs for more details.',
                            details: {
                                error: e,
                            },
                        };
                    }
                },
            ],
            metadataFn: async () => ({
                name: package_json_1.default.name,
                description: package_json_1.default.description,
                '@commercetools/connect-payments-sdk': package_json_1.default.dependencies['@commercetools/connect-payments-sdk'],
                stripe: package_json_1.default.dependencies['stripe'],
            }),
        })();
        return handler.body;
    }
    /**
     * Get supported payment components
     *
     * @remarks
     * Implementation to provide the mocking payment components supported by the processor.
     *
     * @returns Promise with mocking data containing a list of supported payment components
     */
    async getSupportedPaymentComponents() {
        return {
            dropins: [{ type: 'embedded' }],
            components: [],
            express: [{ type: 'applepay' }, { type: 'googlepay' }],
        };
    }
    /**
     * Capture payment in Stripe, supporting multicapture (multiple partial captures).
     *
     * @remarks
     * Supports capturing the total or a partial amount multiple times, as allowed by Stripe.
     * Partial captures are only allowed when STRIPE_ENABLE_MULTI_OPERATIONS is enabled.
     *
     * @param {CapturePaymentRequest} request - Information about the ct payment and the amount.
     * @returns Promise with data containing operation status and PSP reference
     */
    async capturePayment(request) {
        try {
            const config = (0, config_1.getConfig)();
            const paymentIntentId = request.payment.interfaceId;
            const amountToBeCaptured = request.amount.centAmount;
            const stripePaymentIntent = await (0, stripe_client_1.stripeApi)().paymentIntents.retrieve(paymentIntentId);
            if (!request.payment.amountPlanned.centAmount) {
                throw new Error('Payment amount is not set');
            }
            const cartTotalAmount = request.payment.amountPlanned.centAmount;
            const isPartialCapture = stripePaymentIntent.amount_received + amountToBeCaptured < cartTotalAmount;
            // Check if partial capture is attempted without multicapture enabled
            if (isPartialCapture && !config.stripeEnableMultiOperations) {
                logger_1.log.error('Partial capture attempted without STRIPE_ENABLE_MULTI_OPERATIONS enabled', {
                    paymentId: paymentIntentId,
                    amountToBeCaptured,
                    amountReceived: stripePaymentIntent.amount_received,
                    cartTotalAmount,
                });
                throw new Error('Partial captures require STRIPE_ENABLE_MULTI_OPERATIONS=true and multicapture support in your Stripe account');
            }
            const response = await (0, stripe_client_1.stripeApi)().paymentIntents.capture(paymentIntentId, {
                amount_to_capture: amountToBeCaptured,
                ...(isPartialCapture &&
                    config.stripeEnableMultiOperations && {
                    final_capture: false,
                }),
            });
            logger_1.log.info(`Payment modification completed.`, {
                paymentId: paymentIntentId,
                action: payment_intents_dto_1.PaymentTransactions.CHARGE,
                result: payment_intents_dto_1.PaymentModificationStatus.APPROVED,
                trackingId: response.id,
                isPartialCapture: isPartialCapture,
                multiOperationsEnabled: config.stripeEnableMultiOperations,
            });
            return {
                outcome: payment_intents_dto_1.PaymentModificationStatus.APPROVED,
                pspReference: response.id,
            };
        }
        catch (error) {
            logger_1.log.error('Error capturing payment in Stripe', { error });
            return {
                outcome: payment_intents_dto_1.PaymentModificationStatus.REJECTED,
                pspReference: request.payment.interfaceId,
            };
        }
    }
    /**
     * Cancel payment in Stripe.
     *
     * @param {CancelPaymentRequest} request - contains amount and {@link https://docs.commercetools.com/api/projects/payments | Payment } defined in composable commerce
     * @returns Promise with mocking data containing operation status and PSP reference
     */
    async cancelPayment(request) {
        try {
            const paymentIntentId = request.payment.interfaceId;
            const response = await (0, stripe_client_1.stripeApi)().paymentIntents.cancel(paymentIntentId);
            logger_1.log.info(`Payment modification completed.`, {
                paymentId: paymentIntentId,
                action: payment_intents_dto_1.PaymentTransactions.CANCEL_AUTHORIZATION,
                result: payment_intents_dto_1.PaymentModificationStatus.APPROVED,
                trackingId: response.id,
            });
            return { outcome: payment_intents_dto_1.PaymentModificationStatus.APPROVED, pspReference: response.id };
        }
        catch (error) {
            logger_1.log.error('Error canceling payment in Stripe', { error });
            return {
                outcome: payment_intents_dto_1.PaymentModificationStatus.REJECTED,
                pspReference: request.payment.interfaceId,
            };
        }
    }
    /**
     * Refund payment in Stripe.
     *
     * @remarks
     * Creates a refund in Stripe. When STRIPE_ENABLE_MULTI_OPERATIONS is disabled,
     * webhook-based refund tracking may be limited. Enable the feature flag for
     * full multirefund support.
     *
     * @param {RefundPaymentRequest} request - contains amount and {@link https://docs.commercetools.com/api/projects/payments | Payment } defined in composable commerce
     * @returns Promise with mocking data containing operation status and PSP reference
     */
    async refundPayment(request) {
        try {
            const config = (0, config_1.getConfig)();
            const paymentIntentId = request.payment.interfaceId;
            const amount = request.amount.centAmount;
            // Check if there are existing successful refunds
            const existingRefunds = this.ctPaymentService.hasTransactionInState({
                payment: request.payment,
                transactionType: 'Refund',
                states: ['Success'],
            });
            // Warn if multiple refunds attempted without feature enabled
            if (existingRefunds && !config.stripeEnableMultiOperations) {
                logger_1.log.warn('Multiple refunds attempted without STRIPE_ENABLE_MULTI_OPERATIONS enabled', {
                    paymentId: request.payment.id,
                    paymentIntentId,
                    amount,
                    note: 'Webhook-based refund tracking may not work properly. Consider enabling STRIPE_ENABLE_MULTI_OPERATIONS.',
                });
            }
            const response = await (0, stripe_client_1.stripeApi)().refunds.create({
                payment_intent: paymentIntentId,
                amount: amount,
            });
            logger_1.log.info(`Payment modification completed.`, {
                paymentId: request.payment.id,
                action: payment_intents_dto_1.PaymentTransactions.REFUND,
                result: payment_intents_dto_1.PaymentModificationStatus.APPROVED,
                trackingId: response.id,
                multiOperationsEnabled: config.stripeEnableMultiOperations,
                isMultipleRefund: existingRefunds,
            });
            return { outcome: payment_intents_dto_1.PaymentModificationStatus.RECEIVED, pspReference: response.id };
        }
        catch (error) {
            logger_1.log.error('Error refunding payment in Stripe', { error });
            return {
                outcome: payment_intents_dto_1.PaymentModificationStatus.REJECTED,
                pspReference: request.payment.interfaceId,
            };
        }
    }
    /**
     * Reverse payment
     *
     * @remarks
     * Abstract method to execute payment reversals in support of automated reversals to be triggered by checkout api. The actual invocation to PSPs should be implemented in subclasses
     *
     * @param request
     * @returns Promise with outcome containing operation status and PSP reference
     */
    async reversePayment(request) {
        const hasCharge = this.ctPaymentService.hasTransactionInState({
            payment: request.payment,
            transactionType: 'Charge',
            states: ['Success'],
        });
        const hasRefund = this.ctPaymentService.hasTransactionInState({
            payment: request.payment,
            transactionType: 'Refund',
            states: ['Success', 'Pending'],
        });
        const hasCancelAuthorization = this.ctPaymentService.hasTransactionInState({
            payment: request.payment,
            transactionType: 'CancelAuthorization',
            states: ['Success', 'Pending'],
        });
        const wasPaymentReverted = hasRefund || hasCancelAuthorization;
        if (hasCharge && !wasPaymentReverted) {
            return this.refundPayment({
                payment: request.payment,
                merchantReference: request.merchantReference,
                amount: request.payment.amountPlanned,
            });
        }
        const hasAuthorization = this.ctPaymentService.hasTransactionInState({
            payment: request.payment,
            transactionType: 'Authorization',
            states: ['Success'],
        });
        if (hasAuthorization && !wasPaymentReverted) {
            return this.cancelPayment({ payment: request.payment });
        }
        throw new connect_payments_sdk_1.ErrorInvalidOperation('There is no successful payment transaction to reverse.');
    }
    /**
     * Validates if the customer exists in Stripe and creates a new customer if it does not exist, to create a session
     * for the Stripe customer.
     * @returns Promise with the stripeCustomerId, ephemeralKey and sessionId.
     */
    async getCustomerSession() {
        try {
            const cart = await this.ctCartService.getCart({ id: (0, context_1.getCartIdFromContext)() });
            const ctCustomerId = cart.customerId;
            if (!ctCustomerId) {
                logger_1.log.warn('Cart does not have a customerId - Skipping customer creation');
                return;
            }
            const customer = await this.getCtCustomer(ctCustomerId);
            if (!customer) {
                logger_1.log.info('Customer not found - Skipping Stripe Customer creation');
                return;
            }
            const stripeCustomerId = await this.retrieveOrCreateStripeCustomerId(cart, customer);
            if (!stripeCustomerId) {
                throw 'Failed to get stripe customer id.';
            }
            const ephemeralKey = await this.createEphemeralKey(stripeCustomerId);
            if (!ephemeralKey) {
                throw 'Failed to create ephemeral key.';
            }
            const session = await this.createSession(stripeCustomerId, cart);
            if (!session) {
                throw 'Failed to create session.';
            }
            return {
                stripeCustomerId,
                ephemeralKey: ephemeralKey,
                sessionId: session.client_secret,
            };
        }
        catch (error) {
            throw (0, stripe_client_1.wrapStripeError)(error);
        }
    }
    /**
     * Creates a payment intent using the Stripe API and create commercetools payment with Initial transaction.
     *
     * @return Promise<PaymentResponseSchemaDTO> A Promise that resolves to a PaymentResponseSchemaDTO object containing the client secret and payment reference.
     */
    async createPaymentIntentStripe(options) {
        try {
            const config = (0, config_1.getConfig)();
            const ctCart = await this.ctCartService.getCart({
                id: (0, context_1.getCartIdFromContext)(),
            });
            const customer = await this.getCtCustomer(ctCart.customerId);
            const amountPlanned = {
                centAmount: ctCart.totalPrice.centAmount,
                currencyCode: ctCart.totalPrice.currencyCode
            };
            const shippingAddress = this.getStripeCustomerAddress(ctCart.shippingAddress, customer?.addresses[0]);
            const stripeCustomerId = customer?.custom?.fields?.[custom_types_1.stripeCustomerIdFieldName];
            const setupFutureUsage = this.getSetupFutureUsage(ctCart);
            const merchantReturnUrl = (0, context_1.getMerchantReturnUrlFromContext)() || config.merchantReturnUrl;
            const taxCalculationReferences = ctCart.custom?.fields?.[constants_1.CT_CUSTOM_FIELD_TAX_CALCULATIONS];
            const taxCalculationCount = taxCalculationReferences?.length ?? 0;
            const hasSingleTaxCalculation = taxCalculationCount === 1;
            const hasTaxCalculations = taxCalculationCount > 0;
            const paymentMethodOptions = {
                card: {
                //...(config.stripeEnableMultiOperations && {
                //request_multicapture: 'if_available',
                //}),
                },
                ...(options?.paymentMethodOptions ?? {}),
            };
            let paymentIntent;
            try {
                paymentIntent = await (0, stripe_client_1.stripeApi)().paymentIntents.create({
                    ...(stripeCustomerId && {
                        customer: stripeCustomerId,
                        setup_future_usage: setupFutureUsage,
                    }),
                    amount: amountPlanned.centAmount,
                    currency: amountPlanned.currencyCode,
                    automatic_payment_methods: {
                        enabled: true,
                    },
                    capture_method: config.stripeCaptureMethod,
                    metadata: {
                        cart_id: ctCart.id,
                        ct_project_key: config.projectKey,
                        ...(ctCart.customerId && {
                            ct_customer_id: ctCart.customerId,
                        }),
                    },
                    payment_method_options: paymentMethodOptions,
                    ...(hasSingleTaxCalculation && {
                        hooks: {
                            inputs: {
                                tax: {
                                    calculation: taxCalculationReferences[0],
                                },
                            },
                        },
                    }),
                    // keep shipping optional as in reference
                    /*...(config.stripeCollectBillingAddress === 'auto' && {
                      shipping: shippingAddress,
                    }),*/
                }, {
                    idempotencyKey: crypto_1.default.randomUUID(),
                });
            }
            catch (e) {
                throw (0, stripe_client_1.wrapStripeError)(e);
            }
            logger_1.log.info(`Stripe PaymentIntent created.`, {
                ctCartId: ctCart.id,
                stripePaymentIntentId: paymentIntent.id,
                ...(hasTaxCalculations && {
                    hasTaxCalculations,
                    taxCalculationCount,
                }),
                ...(options?.paymentMethodOptions && {
                    frontendPaymentMethodOptions: Object.keys(options.paymentMethodOptions),
                }),
            });
            const ctPayment = await this.ctPaymentService.createPayment({
                amountPlanned,
                checkoutTransactionItemId: (0, context_1.getCheckoutTransactionItemIdFromContext)(),
                paymentMethodInfo: {
                    paymentInterface: config.paymentInterface,
                },
                ...(ctCart.customerId && {
                    customer: {
                        typeId: 'customer',
                        id: ctCart.customerId,
                    },
                }),
                ...(!ctCart.customerId &&
                    ctCart.anonymousId && {
                    anonymousId: ctCart.anonymousId,
                }),
                transactions: [
                    {
                        type: payment_intents_dto_1.PaymentTransactions.AUTHORIZATION,
                        amount: amountPlanned,
                        state: this.convertPaymentResultCode(stripe_payment_dto_1.PaymentOutcome.INITIAL),
                        interactionId: paymentIntent.id,
                    },
                ],
            });
            await this.ctCartService.addPayment({
                resource: {
                    id: ctCart.id,
                    version: ctCart.version,
                },
                paymentId: ctPayment.id,
            });
            // ---------------------------------------------
            // Back-patch Stripe metadata with CT payment id
            // ---------------------------------------------
            try {
                await (0, stripe_client_1.stripeApi)().paymentIntents.update(paymentIntent.id, {
                    metadata: {
                        ct_payment_id: ctPayment.id,
                    },
                }, { idempotencyKey: crypto_1.default.randomUUID() });
            }
            catch (e) {
                throw (0, stripe_client_1.wrapStripeError)(e);
            }
            return {
                cartId: ctCart.id,
                sClientSecret: paymentIntent.client_secret ?? '',
                paymentReference: ctPayment.id,
                merchantReturnUrl,
                ...(config.stripeCollectBillingAddress !== 'auto' && {
                    billingAddress: this.getBillingAddress(ctCart),
                }),
            };
        }
        catch (error) {
            throw (0, stripe_client_1.wrapStripeError)(error);
        }
    }
    /**
     * Update the PaymentIntent in Stripe to mark the Authorization in commercetools as successful.
     *
     * @param {string} paymentIntentId - The Intent id created in Stripe.
     * @param {string} paymentReference - The identifier of the payment associated with the PaymentIntent in Stripe.
     * @return {Promise<void>} - A Promise that resolves when the PaymentIntent is successfully updated.
     */
    async updatePaymentIntentStripeSuccessful(paymentIntentId, paymentReference) {
        const ctCart = await this.ctCartService.getCart({
            id: (0, context_1.getCartIdFromContext)(),
        });
        const ctPayment = await this.ctPaymentService.getPayment({
            id: paymentReference,
        });
        const amountPlanned = ctPayment.amountPlanned;
        logger_1.log.info(`log for updatePaymentIntentStripeSuccessful`, ctCart, ctPayment);
        logger_1.log.info(`PaymentIntent confirmed.`, {
            ctCartId: ctCart.id,
            stripePaymentIntentId: ctPayment.interfaceId,
            amountPlanned: JSON.stringify(amountPlanned),
        });
        await this.ctPaymentService.updatePayment({
            id: ctPayment.id,
            pspReference: paymentIntentId,
            transaction: {
                interactionId: paymentIntentId,
                type: payment_intents_dto_1.PaymentTransactions.AUTHORIZATION,
                amount: amountPlanned,
                state: this.convertPaymentResultCode(stripe_payment_dto_1.PaymentOutcome.AUTHORIZED),
            },
        });
        logger_1.log.info(`update payment - updatePaymentIntentStripeSuccessful`, ctPayment);
    }
    /**
     * Return the Stripe payment configuration and the cart amount planed information.
     *
     * @param {string} opts - Options for initializing the cart payment.
     * @return {Promise<ConfigElementResponseSchemaDTO>} Returns a promise that resolves with the cart information, appearance, and capture method.
     */
    async initializeCartPayment(opts) {
        const { stripeCaptureMethod, stripePaymentElementAppearance, stripeLayout, stripeCollectBillingAddress } = (0, config_1.getConfig)();
        const ctCart = await this.ctCartService.getCart({ id: (0, context_1.getCartIdFromContext)() });
        const amountPlanned = await this.ctCartService.getPaymentAmount({ cart: ctCart });
        const appearance = stripePaymentElementAppearance;
        const setupFutureUsage = this.getSetupFutureUsage(ctCart);
        logger_1.log.info(`Cart and Stripe.Element ${opts} config retrieved.`, {
            cartId: ctCart.id,
            cartInfo: {
                amount: amountPlanned.centAmount,
                currency: amountPlanned.currencyCode,
            },
            stripeElementAppearance: appearance,
            stripeCaptureMethod: stripeCaptureMethod,
            stripeSetupFutureUsage: setupFutureUsage,
            layout: stripeLayout,
            collectBillingAddress: stripeCollectBillingAddress,
        });
        return {
            cartInfo: {
                amount: amountPlanned.centAmount,
                currency: amountPlanned.currencyCode,
            },
            appearance: appearance,
            captureMethod: stripeCaptureMethod,
            setupFutureUsage: setupFutureUsage,
            layout: stripeLayout,
            collectBillingAddress: stripeCollectBillingAddress,
        };
    }
    /**
     * Return the Stripe payment configuration and the cart amount planed information.
     *
     * @return {Promise<ConfigElementResponseSchemaDTO>} Returns a promise that resolves with the cart information, appearance, and capture method.
     */
    applePayConfig() {
        return (0, config_1.getConfig)().stripeApplePayWellKnown;
    }
    convertPaymentResultCode(resultCode) {
        switch (resultCode) {
            case stripe_payment_dto_1.PaymentOutcome.AUTHORIZED:
                return 'Success';
            case stripe_payment_dto_1.PaymentOutcome.REJECTED:
                return 'Failure';
            default:
                return 'Initial';
        }
    }
    async runDailyCaptureJob() {
        console.log("CAPTURE JOB STARTED");
        const processed = [];
        const paymentsToCheck = []; // populated by caller or scheduled job context
        for (const payment of paymentsToCheck) {
            const paymentIntentId = payment.interfaceId;
            // Skip if not a Stripe payment
            if (!paymentIntentId)
                continue;
            const order = await this.ctOrderService.getOrderByPaymentId({
                paymentId: payment.id
            });
            if (!order)
                continue;
            const shippingInfo = order.shippingInfo;
            // Only capture Mail-to-Home orders
            if (shippingInfo?.custom?.fields?.fulfillmentType !== 'm2h')
                continue;
            const allShipped = order.lineItems.every((li) => li.custom?.fields?.deliveryStatus === 'Shipped');
            if (!allShipped)
                continue;
            const region = this.getRegionFromCurrency(order.totalPrice.currencyCode);
            const stripePi = await (0, stripe_client_1.stripeApi)(region)
                .paymentIntents.retrieve(paymentIntentId);
            if (stripePi.status !== 'requires_capture')
                continue;
            const captureResponse = await (0, stripe_client_1.stripeApi)(region)
                .paymentIntents.capture(paymentIntentId);
            await this.ctPaymentService.updatePayment({
                id: payment.id,
                transaction: {
                    type: 'Charge',
                    amount: {
                        currencyCode: order.totalPrice.currencyCode,
                        centAmount: order.totalPrice.centAmount
                    },
                    state: 'Success',
                    interactionId: captureResponse.id
                }
            });
            processed.push(order.id);
        }
        return {
            processed: processed.length,
            orders: processed
        };
    }
    getRegionFromCurrency(currency) {
        if (currency === 'usd')
            return 'US';
        if (currency === 'cad')
            return 'CA';
        return 'EU';
    }
    /**
     * Processes a Stripe event and updates the corresponding payment in commercetools.
     *
     * Handles standard payment events as well as multicapture scenarios for payment intents
     * with manual capture and multicapture enabled. In multicapture cases, updates the transaction
     * data with the correct balance transaction information from Stripe.
     *
     * @param {Stripe.Event} event - The Stripe event object to process.
     * @returns {Promise<void>} - Resolves when the payment has been updated.
     */
    async processStripeEvent(event) {
        logger_1.log.info('Processing notification', { event: JSON.stringify(event.id) });
        try {
            const updateData = this.stripeEventConverter.convert(event);
            let paymentMethodType = 'card';
            let paymentMethodName = 'Card';
            let cardDetails = {};
            const stripeObject = event.data.object;
            if (stripeObject.payment_method) {
                const paymentMethod = await (0, stripe_client_1.stripeApi)().paymentMethods.retrieve(stripeObject.payment_method);
                if (paymentMethod.type === 'card') {
                    paymentMethodType = 'card';
                    paymentMethodName = paymentMethod.card?.brand ?? 'Card';
                    cardDetails = {
                        brand: paymentMethod.card?.brand,
                        last4: paymentMethod.card?.last4,
                        expMonth: paymentMethod.card?.exp_month,
                        expYear: paymentMethod.card?.exp_year,
                    };
                    const wallet = paymentMethod.card?.wallet?.type;
                    if (wallet === 'apple_pay') {
                        paymentMethodType = 'applepay';
                        paymentMethodName = 'Apple Pay';
                    }
                    if (wallet === 'google_pay') {
                        paymentMethodType = 'googlepay';
                        paymentMethodName = 'Google Pay';
                    }
                }
            }
            // multicapture logic
            if (event.type.startsWith('payment')) {
                const pi = event.data.object;
                if (pi.capture_method === 'manual' &&
                    pi.payment_method_options?.card?.request_multicapture === 'if_available' &&
                    typeof pi.latest_charge === 'string') {
                    const balanceTransactions = await (0, stripe_client_1.stripeApi)().balanceTransactions.list({
                        source: pi.latest_charge,
                        limit: 10,
                    });
                    if (balanceTransactions.data.length > 1) {
                        updateData.transactions.forEach((tx) => {
                            tx.interactionId = balanceTransactions.data[0].id;
                            tx.amount = {
                                centAmount: balanceTransactions.data[0].amount,
                                currencyCode: balanceTransactions.data[0].currency.toUpperCase(),
                            };
                        });
                    }
                }
            }
            for (const tx of updateData.transactions) {
                logger_1.log.info('processStripeEvent', updateData);
                const updatedPayment = await this.ctPaymentService.updatePayment({
                    id: updateData.id,
                    paymentMethod: paymentMethodType,
                    paymentMethodInfo: {
                        method: paymentMethodType,
                        name: {
                            'en-US': cardDetails.brand
                                ? `${cardDetails.brand} ****${cardDetails.last4}`
                                : paymentMethodName,
                        },
                    },
                    customFields: {
                        type: {
                            key: 'payment-details',
                            typeId: 'type',
                        },
                        fields: {
                            cardBrand: cardDetails.brand,
                            last4: cardDetails.last4,
                            expMonth: cardDetails.expMonth,
                            expYear: cardDetails.expYear,
                        },
                    },
                    transaction: tx,
                });
                logger_1.log.info('Payment updated after processing the notification', {
                    paymentId: updatedPayment.id,
                    version: updatedPayment.version,
                    pspReference: updateData.pspReference,
                    paymentMethod: paymentMethodType,
                    transaction: JSON.stringify(tx),
                });
            }
        }
        catch (e) {
            logger_1.log.error('Error processing notification', { error: e });
            return;
        }
    }
    /**
     * Stores a payment method in commercetools when a customer opts to save it.
     *
     * This method is called from webhook handlers (payment_intent.succeeded or charge.succeeded)
     * to save payment methods that customers have chosen to reuse. It performs idempotent storage,
     * meaning it can be safely called multiple times for the same payment method without creating duplicates.
     *
     * The method:
     * 1. Extracts payment method and customer data from the webhook event
     * 2. Retrieves the payment method from Stripe to verify it's attached to a customer
     * 3. Saves the payment method to commercetools if it doesn't already exist
     * 4. Updates the payment record with the payment method token reference
     * 5. Creates a recurring payment job if the payment is linked to a recurring cart
     *
     * @param event - The Stripe webhook event (PAYMENT_INTENT__SUCCEEDED or CHARGE__SUCCEEDED)
     * @returns Promise that resolves when the payment method has been stored, or immediately if skipped
     */
    async storePaymentMethod(event) {
        logger_1.log.info('Storing payment method if opted-in by customer', { event: JSON.stringify(event.id) });
        try {
            const eventData = this.extractPaymentMethodDataFromEvent(event);
            if (!eventData) {
                logger_1.log.info('No payment method or customer ID found in event metadata, skipping storage.', {
                    eventId: event.id,
                });
                return;
            }
            const { stripePaymentMethodId, ctCustomerId, ctPaymentId } = eventData;
            const paymentMethod = await (0, stripe_client_1.stripeApi)().paymentMethods.retrieve(stripePaymentMethodId);
            if (!paymentMethod.customer) {
                logger_1.log.info('Stripe payment method not attached to a customer, skipping storage', {
                    paymentMethodId: stripePaymentMethodId,
                });
                return;
            }
            const ctPaymentMethod = await this.savePaymentMethodIfNew(paymentMethod, ctCustomerId);
            if (ctPaymentId) {
                await this.updatePaymentWithToken(ctPaymentId, paymentMethod);
                logger_1.log.info('Updated payment with stored payment method token', {
                    paymentId: ctPaymentId,
                    paymentMethodId: ctPaymentMethod.id,
                });
                // Create a recurring payment job for the stored payment method if the payment is linked to a recurring cart
                const recurringPaymentJob = await this.ctRecurringPaymentJobService.createRecurringPaymentJobIfApplicable({
                    originPayment: {
                        id: ctPaymentId,
                        typeId: 'payment',
                    },
                    paymentMethod: {
                        id: ctPaymentMethod.id,
                        typeId: 'payment-method',
                    },
                });
                if (recurringPaymentJob) {
                    logger_1.log.info('Created recurring payment job for stored payment method', {
                        recurringPaymentJobId: recurringPaymentJob.id,
                        paymentMethodId: ctPaymentMethod.id,
                    });
                }
            }
        }
        catch (e) {
            logger_1.log.error('Error storing payment method in commercetools', { error: e, eventId: event.id });
            return;
        }
    }
    async processStripeEventRefunded(event) {
        logger_1.log.info('Processing notification', { event: JSON.stringify(event.id) });
        try {
            const updateData = this.stripeEventConverter.convert(event);
            const charge = event.data.object;
            const refunds = await (0, stripe_client_1.stripeApi)().refunds.list({
                charge: charge.id,
                created: {
                    gte: charge.created,
                },
                limit: 2,
            });
            const refund = refunds.data[0];
            if (!refund) {
                logger_1.log.warn('No refund found for charge', { chargeId: charge.id });
                return;
            }
            updateData.pspReference = refund.id;
            updateData.transactions.forEach((tx) => {
                tx.interactionId = refund.id;
                tx.amount = {
                    centAmount: refund.amount,
                    currencyCode: refund.currency.toUpperCase(),
                };
            });
            for (const tx of updateData.transactions) {
                const updatedPayment = await this.ctPaymentService.updatePayment({
                    ...updateData,
                    transaction: tx,
                });
                logger_1.log.info('Payment updated after processing the notification', {
                    paymentId: updatedPayment.id,
                    version: updatedPayment.version,
                    pspReference: updateData.pspReference,
                    paymentMethod: updateData.paymentMethod,
                    transaction: JSON.stringify(tx),
                });
            }
        }
        catch (e) {
            logger_1.log.error('Error processing notification', { error: e });
            return;
        }
    }
    async processStripeEventMultipleCaptured(event) {
        logger_1.log.info('Processing notification', { event: JSON.stringify(event.id) });
        try {
            const updateData = this.stripeEventConverter.convert(event);
            const charge = event.data.object;
            if (charge.captured) {
                logger_1.log.warn('Charge is already captured', { chargeId: charge.id });
                return;
            }
            const previousAttributes = event.data.previous_attributes;
            if (!(charge.amount_captured > previousAttributes.amount_captured)) {
                logger_1.log.warn('The amount captured do not change from the previous charge', { chargeId: charge.id });
                return;
            }
            updateData.pspReference = charge.balance_transaction;
            updateData.transactions.forEach((tx) => {
                tx.interactionId = charge.balance_transaction;
                tx.amount = {
                    centAmount: charge.amount_captured - previousAttributes.amount_captured,
                    currencyCode: charge.currency.toUpperCase(),
                };
            });
            for (const tx of updateData.transactions) {
                const updatedPayment = await this.ctPaymentService.updatePayment({
                    ...updateData,
                    transaction: tx,
                });
                logger_1.log.info('Payment updated after processing the notification', {
                    paymentId: updatedPayment.id,
                    version: updatedPayment.version,
                    pspReference: updateData.pspReference,
                    paymentMethod: updateData.paymentMethod,
                    transaction: JSON.stringify(tx),
                });
            }
        }
        catch (e) {
            logger_1.log.error('Error processing notification', { error: e });
            return;
        }
    }
    async retrieveOrCreateStripeCustomerId(cart, customer) {
        const savedCustomerId = customer?.custom?.fields?.[custom_types_1.stripeCustomerIdFieldName];
        if (savedCustomerId) {
            const isValid = await this.validateStripeCustomerId(savedCustomerId, customer.id);
            if (isValid) {
                logger_1.log.info('Customer has a valid Stripe Customer ID saved.', { stripeCustomerId: savedCustomerId });
                return savedCustomerId;
            }
        }
        const existingCustomer = await this.findStripeCustomer(customer.id);
        if (existingCustomer) {
            await this.saveStripeCustomerId(existingCustomer?.id, customer);
            return existingCustomer.id;
        }
        const newCustomer = await this.createStripeCustomer(cart, customer);
        if (newCustomer) {
            await this.saveStripeCustomerId(newCustomer?.id, customer);
            return newCustomer.id;
        }
        else {
            throw 'Failed to create stripe customer.';
        }
    }
    async validateStripeCustomerId(stripeCustomerId, ctCustomerId) {
        try {
            const customer = await (0, stripe_client_1.stripeApi)().customers.retrieve(stripeCustomerId);
            return Boolean(customer && !customer.deleted && customer?.metadata?.ct_customer_id === ctCustomerId);
        }
        catch (e) {
            logger_1.log.warn('Error validating Stripe customer ID', { error: e });
            return false;
        }
    }
    async findStripeCustomer(ctCustomerId) {
        try {
            if (!(0, utils_1.isValidUUID)(ctCustomerId)) {
                logger_1.log.warn('Invalid ctCustomerId: Not a valid UUID:', { ctCustomerId });
                throw 'Invalid ctCustomerId: Not a valid UUID';
            }
            const query = `metadata['ct_customer_id']:'${ctCustomerId}'`;
            const customer = await (0, stripe_client_1.stripeApi)().customers.search({ query });
            return customer.data[0];
        }
        catch (e) {
            logger_1.log.warn(`Error finding Stripe customer for ctCustomerId: ${ctCustomerId}`, { error: e });
            return undefined;
        }
    }
    async createStripeCustomer(cart, customer) {
        const shippingAddress = this.getStripeCustomerAddress(customer.addresses[0], cart.shippingAddress);
        const email = cart.customerEmail || customer.email || cart.shippingAddress?.email;
        return await (0, stripe_client_1.stripeApi)().customers.create({
            email,
            name: `${customer.firstName} ${customer.lastName}`.trim() || shippingAddress?.name,
            phone: shippingAddress?.phone,
            metadata: {
                ...(cart.customerId ? { ct_customer_id: customer.id } : null),
            },
            ...(shippingAddress?.address ? { address: shippingAddress.address } : null),
        });
    }
    async saveStripeCustomerId(stripeCustomerId, customer) {
        /*
          TODO: commercetools insights on how to integrate the Stripe accountId into commercetools:
          We have plans to support recurring payments and saved payment methods in the next quarters.
          Not sure if you can wait until that so your implementation would be aligned with ours.
        */
        const fields = {
            [custom_types_1.stripeCustomerIdFieldName]: stripeCustomerId,
        };
        const { id, version, custom } = customer;
        const updateFieldActions = await (0, customTypeHelper_1.getCustomFieldUpdateActions)({
            fields,
            customFields: custom,
            customType: custom_types_1.stripeCustomerIdCustomType,
        });
        await (0, customerClient_1.updateCustomerById)({ id, version, actions: updateFieldActions });
        logger_1.log.info(`Stripe Customer ID "${stripeCustomerId}" saved to customer "${id}".`);
    }
    async createSession(stripeCustomerId, cart) {
        const paymentConfig = (0, config_1.getConfig)().stripeSavedPaymentMethodConfig;
        const session = await (0, stripe_client_1.stripeApi)().customerSessions.create({
            customer: stripeCustomerId,
            components: {
                payment_element: {
                    enabled: true,
                    features: {
                        ...paymentConfig,
                        ...(this.ctCartService.isRecurringCart(cart) && {
                            payment_method_save: 'enabled',
                            payment_method_save_usage: 'off_session',
                        }),
                    },
                },
            },
        });
        return session;
    }
    async createEphemeralKey(stripeCustomerId) {
        const config = (0, config_1.getConfig)();
        const stripe = (0, stripe_client_1.stripeApi)();
        const res = await stripe.ephemeralKeys.create({ customer: stripeCustomerId }, { apiVersion: config.stripeApiVersion });
        return res?.secret;
    }
    async getCtCustomer(ctCustomerId) {
        return await payment_sdk_1.paymentSDK.ctAPI.client
            .customers()
            .withId({ ID: ctCustomerId })
            .get()
            .execute()
            .then((response) => response.body)
            .catch((err) => {
            logger_1.log.warn(`Customer not found ${ctCustomerId}`, { error: err });
            return;
        });
    }
    getStripeCustomerAddress(prioritizedAddress, fallbackAddress) {
        if (!prioritizedAddress && !fallbackAddress) {
            return undefined;
        }
        const getField = (field) => {
            const value = prioritizedAddress?.[field] ?? fallbackAddress?.[field];
            return typeof value === 'string' ? value : '';
        };
        return {
            name: `${getField('firstName')} ${getField('lastName')}`.trim(),
            phone: getField('phone') || getField('mobile'),
            address: {
                line1: `${getField('streetNumber')} ${getField('streetName')}`.trim(),
                line2: getField('additionalStreetInfo'),
                city: getField('city'),
                postal_code: getField('postalCode'),
                state: getField('state'),
                country: getField('country'),
            },
        };
    }
    getBillingAddress(cart) {
        const prioritizedAddress = cart.billingAddress ?? cart.shippingAddress;
        if (!prioritizedAddress) {
            return undefined;
        }
        const getField = (field) => {
            const value = prioritizedAddress?.[field];
            return typeof value === 'string' ? value : '';
        };
        return JSON.stringify({
            name: `${getField('firstName')} ${getField('lastName')}`.trim(),
            phone: getField('phone') || getField('mobile'),
            email: cart.customerEmail ?? '',
            address: {
                line1: `${getField('streetNumber')} ${getField('streetName')}`.trim(),
                line2: getField('additionalStreetInfo'),
                city: getField('city'),
                postal_code: getField('postalCode'),
                state: getField('state'),
                country: getField('country'),
            },
        });
    }
    /**
     * Extracts payment method and customer data from Stripe webhook events.
     *
     * Supports both PAYMENT_INTENT__SUCCEEDED and CHARGE__SUCCEEDED events,
     * extracting the payment method ID, commercetools customer ID, and payment ID
     * from the event metadata.
     *
     * @param event - The Stripe webhook event
     * @returns Object containing extracted IDs, or null if required data is missing
     */
    extractPaymentMethodDataFromEvent(event) {
        let stripePaymentMethod = null;
        let ctCustomerId = null;
        let ctPaymentId = null;
        if (event.type === stripe_payment_type_1.StripeEvent.PAYMENT_INTENT__SUCCEEDED) {
            const paymentIntent = event.data.object;
            stripePaymentMethod = paymentIntent.payment_method;
            ctCustomerId = paymentIntent.metadata?.ct_customer_id;
            ctPaymentId = paymentIntent.metadata?.ct_payment_id;
        }
        else if (event.type === stripe_payment_type_1.StripeEvent.CHARGE__SUCCEEDED) {
            const charge = event.data.object;
            stripePaymentMethod = charge.payment_method;
            ctCustomerId = charge.metadata?.ct_customer_id;
            ctPaymentId = charge.metadata?.ct_payment_id;
        }
        if (!stripePaymentMethod || !ctCustomerId) {
            return null;
        }
        return {
            stripePaymentMethodId: stripePaymentMethod,
            ctCustomerId,
            ctPaymentId,
        };
    }
    /**
     * Saves a Stripe payment method to commercetools if it doesn't already exist.
     *
     * Checks if the payment method token already exists for the customer to avoid
     * duplicates. This implements idempotent behavior - if called multiple times
     * with the same payment method, it will only be saved once.
     *
     * @param paymentMethod - The Stripe PaymentMethod object to save
     * @param ctCustomerId - The commercetools customer ID
     */
    async savePaymentMethodIfNew(paymentMethod, ctCustomerId) {
        try {
            const existingPaymentMethod = await this.ctPaymentMethodService.getByTokenValue({
                customerId: ctCustomerId,
                paymentInterface: (0, config_1.getConfig)().paymentInterface,
                tokenValue: paymentMethod.id,
            });
            if (existingPaymentMethod) {
                logger_1.log.info('Payment method already stored for customer', {
                    ctCustomerId,
                    stripePaymentMethod: paymentMethod.id,
                });
                return existingPaymentMethod;
            }
        }
        catch (error) {
            if (error instanceof connect_payments_sdk_1.ErrorResourceNotFound) {
                logger_1.log.debug('Payment method does not exist, will create new one', {
                    ctCustomerId,
                    stripePaymentMethod: paymentMethod.id,
                });
            }
            else {
                throw error;
            }
        }
        const ctPaymentMethod = await this.ctPaymentMethodService.save({
            customerId: ctCustomerId,
            paymentInterface: (0, config_1.getConfig)().paymentInterface,
            token: paymentMethod.id,
            method: paymentMethod.type,
        });
        logger_1.log.info('Stored payment method for customer', {
            ctCustomerId,
            ctPaymentMethod: ctPaymentMethod.id,
            stripePaymentMethod: paymentMethod.id,
        });
        return ctPaymentMethod;
    }
    /**
     * Updates a commercetools payment with the saved payment method token.
     *
     * This associates the payment with the stored payment method, creating a
     * reference between the payment transaction and the reusable payment method.
     *
     * @param ctPaymentId - The commercetools payment ID to update
     * @param paymentMethod - The Stripe payment method to associate
     */
    async updatePaymentWithToken(ctPaymentId, paymentMethod) {
        const ctPayment = await this.ctPaymentService.updatePayment({
            id: ctPaymentId,
            paymentMethodInfo: {
                token: {
                    value: paymentMethod.id,
                },
            },
        });
        logger_1.log.info('Updated commercetools payment with stored payment method token', {
            ctPaymentId: ctPayment.id,
        });
    }
    getSetupFutureUsage(cart) {
        if (this.ctCartService.isRecurringCart(cart)) {
            return 'off_session';
        }
        return config_1.config.stripeSavedPaymentMethodConfig?.payment_method_save_usage;
    }
    async createOrder({ cart, subscriptionId, paymentIntentId }) {
        const order = await (0, order_client_1.createOrderFromCart)(cart);
        logger_1.log.info('Order created successfully', {
            ctOrderId: order.id,
            ctCartId: cart.id,
            stripeSubscriptionId: subscriptionId,
        });
        /* If using Stripe Test Clock, wait for 9 seconds to allow clock advancement in test environments.
          This helps ensure Stripe's test clock events are processed before updating the subscription.
          Uncomment this line for testing purposes when using Stripe Test Clock.
          await new Promise((resolve) => setTimeout(resolve, 5000));
          */
        if (paymentIntentId && paymentIntentId.startsWith('pi_')) {
            await (0, stripe_client_1.stripeApi)().paymentIntents.update(paymentIntentId, { metadata: { [constants_1.METADATA_ORDER_ID_FIELD]: order.id } }, { idempotencyKey: crypto_1.default.randomUUID() });
        }
        /* If using Stripe Test Clock, wait for 9 seconds to allow clock advancement in test environments.
          This helps ensure Stripe's test clock events are processed before updating the subscription.
          Uncomment this line for testing purposes when using Stripe Test Clock.
          await new Promise((resolve) => setTimeout(resolve, 000));
          */
        if (subscriptionId) {
            await (0, stripe_client_1.stripeApi)().subscriptions.update(subscriptionId, { metadata: { [constants_1.METADATA_ORDER_ID_FIELD]: order.id } }, { idempotencyKey: crypto_1.default.randomUUID() });
        }
    }
    async addPaymentToOrder(subscriptionPaymentId, paymentId) {
        try {
            const order = await this.ctOrderService.getOrderByPaymentId({ paymentId: subscriptionPaymentId });
            await (0, order_client_1.addOrderPayment)(order, paymentId);
        }
        catch (error) {
            logger_1.log.error('Error adding payment to order', { error });
        }
    }
    async updateCartAddress(charge, ctCart) {
        if (!charge) {
            return ctCart;
        }
        const addressData = this.validateAndGetStripeAddress(charge, ctCart);
        if (!addressData) {
            return ctCart;
        }
        const { address, addressSource } = addressData;
        const wasFrozen = (0, cart_client_1.isCartFrozen)(ctCart);
        const cartToUpdate = await this.unfreezeCartIfNeeded(ctCart, wasFrozen);
        // Stripe has complete address → update the cart
        const actions = [
            {
                action: 'setShippingAddress',
                address: {
                    key: addressSource?.name ?? undefined,
                    country: address.country,
                    city: address.city ?? undefined,
                    postalCode: address.postal_code ?? undefined,
                    state: address.state ?? undefined,
                    streetName: address.line1 ?? undefined,
                    streetNumber: address.line2 ?? undefined,
                },
            },
        ];
        const updatedCart = await (0, cart_client_1.updateCartById)(cartToUpdate, actions);
        return await this.refreezeCartIfNeeded(updatedCart, wasFrozen);
    }
    /**
     * Validates and extracts a complete Stripe address from charge data.
     * Returns null if no valid address is found or if cart already has an address.
     * @param charge - The Stripe charge containing address information
     * @param ctCart - The commercetools cart to check for existing address
     * @returns Address data if valid, null otherwise
     */
    validateAndGetStripeAddress(charge, ctCart) {
        const { billing_details, shipping } = charge;
        // Prioritize shipping over billing_details
        const addressSource = shipping || billing_details;
        const address = addressSource?.address;
        // Verify if Stripe has a complete and valid address
        const hasCompleteStripeAddress = !!(address?.country &&
            address?.state &&
            address?.city &&
            address?.postal_code &&
            address?.line1);
        // If Stripe does not have a complete address, keep the cart's address
        if (!hasCompleteStripeAddress) {
            // If the cart already has an address, do not overwrite it with incomplete data
            if (ctCart.shippingAddress?.country) {
                return null;
            }
            // If the cart also does not have an address, do nothing (avoid using mocks)
            return null;
        }
        return { address, addressSource };
    }
    /**
     * Unfreezes a cart if it was frozen, allowing address updates.
     * @param ctCart - The cart to unfreeze if needed
     * @param wasFrozen - Whether the cart was frozen
     * @returns The unfrozen cart or original cart if unfreeze fails
     */
    async unfreezeCartIfNeeded(ctCart, wasFrozen) {
        if (!wasFrozen) {
            return ctCart;
        }
        try {
            const unfrozenCart = await (0, cart_client_1.unfreezeCart)(ctCart);
            logger_1.log.info(`Cart temporarily unfrozen for address update from successful payment.`, {
                ctCartId: unfrozenCart.id,
            });
            return unfrozenCart;
        }
        catch (error) {
            logger_1.log.error(`Error unfreezing cart for address update.`, {
                error,
                ctCartId: ctCart.id,
            });
            // If unfreeze fails, try to update anyway (might work if cart was already unfrozen)
            return ctCart;
        }
    }
    /**
     * Re-freezes a cart if it was frozen before, restoring its frozen state.
     * @param updatedCart - The cart that was updated
     * @param wasFrozen - Whether the cart was frozen before the update
     * @returns The re-frozen cart or updated cart if refreeze fails
     */
    async refreezeCartIfNeeded(updatedCart, wasFrozen) {
        if (!wasFrozen) {
            return updatedCart;
        }
        try {
            const reFrozenCart = await (0, cart_client_1.freezeCart)(updatedCart);
            logger_1.log.info(`Cart re-frozen after address update from successful payment.`, {
                ctCartId: reFrozenCart.id,
            });
            return reFrozenCart;
        }
        catch (error) {
            logger_1.log.error(`Error re-freezing cart after address update.`, {
                error,
                ctCartId: updatedCart.id,
            });
            // Return updated cart even if re-freeze fails
            return updatedCart;
        }
    }
}
exports.StripePaymentService = StripePaymentService;
