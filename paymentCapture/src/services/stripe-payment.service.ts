import Stripe from 'stripe';
import {
  Address,
  Cart,
  Customer,
  ErrorInvalidOperation,
  ErrorResourceNotFound,
  healthCheckCommercetoolsPermissions,
  PaymentMethod,
  statusHandler,
} from '@commercetools/connect-payments-sdk';
import {
  CancelPaymentRequest,
  CapturePaymentRequest,
  ConfigResponse,
  PaymentProviderModificationResponse,
  RefundPaymentRequest,
  ReversePaymentRequest,
  StatusResponse,
} from './types/operation.type';
import { updateCartById, freezeCart, unfreezeCart, isCartFrozen } from './commerce-tools/cart-client';
import { SupportedPaymentComponentsSchemaDTO } from '../dtos/operations/payment-componets.dto';
import { PaymentModificationStatus, PaymentTransactions } from '../dtos/operations/payment-intents.dto';
import packageJSON from '../../package.json';
import { METADATA_ORDER_ID_FIELD, CT_CUSTOM_FIELD_TAX_CALCULATIONS } from '../constants';
import { addOrderPayment, createOrderFromCart } from './commerce-tools/order-client';
import { AbstractPaymentService } from './abstract-payment.service';
import { config, getConfig } from '../config/config';
import { appLogger, paymentSDK } from '../payment-sdk';
import { CaptureMethod, StripeEvent, StripePaymentServiceOptions, CreateOrderProps } from './types/stripe-payment.type';
import {
  CollectBillingAddressOptions,
  ConfigElementResponseSchemaDTO,
  CustomerResponseSchemaDTO,
  PaymentOutcome,
  PaymentResponseSchemaDTO,
} from '../dtos/stripe-payment.dto';
import {
  getCartIdFromContext,
  getCheckoutTransactionItemIdFromContext,
  getMerchantReturnUrlFromContext,
} from '../libs/fastify/context/context';
import { stripeApi, wrapStripeError } from '../clients/stripe.client';
import { log } from '../libs/logger';
import crypto from 'crypto';
import { StripeEventConverter } from './converters/stripeEventConverter';
import { stripeCustomerIdCustomType, stripeCustomerIdFieldName } from '../custom-types/custom-types';
import { getCustomFieldUpdateActions } from '../services/commerce-tools/customTypeHelper';
import { isValidUUID } from '../utils';
import { updateCustomerById } from '../services/commerce-tools/customerClient';
import { CartUpdateAction } from '@commercetools/platform-sdk';

export class StripePaymentService extends AbstractPaymentService {
  private stripeEventConverter: StripeEventConverter;

  constructor(opts: StripePaymentServiceOptions) {
    super(
      opts.ctCartService,
      opts.ctPaymentService,
      opts.ctOrderService,
      opts.ctPaymentMethodService,
      opts.ctRecurringPaymentJobService,
    );
    this.stripeEventConverter = new StripeEventConverter();
  }

  /**
   * Get configurations
   *
   * @remarks
   * Implementation to provide mocking configuration information
   *
   * @returns Promise with mocking object containing configuration information
   */
  public async config(region: 'US' | 'CA' | 'EU' = 'US'): Promise<ConfigResponse> {
    const config = getConfig();

    const publishableKey =
      region === 'CA'
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
  public async status(): Promise<StatusResponse> {
    const handler = await statusHandler({
      timeout: getConfig().healthCheckTimeout,
      log: appLogger,
      checks: [
        healthCheckCommercetoolsPermissions({
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
          ctAuthorizationService: paymentSDK.ctAuthorizationService,
          projectKey: getConfig().projectKey,
        }),
        async () => {
          try {
            const paymentMethods = await stripeApi().paymentMethods.list({
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
          } catch (e) {
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
        name: packageJSON.name,
        description: packageJSON.description,
        '@commercetools/connect-payments-sdk': packageJSON.dependencies['@commercetools/connect-payments-sdk'],
        stripe: packageJSON.dependencies['stripe'],
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
  public async getSupportedPaymentComponents(): Promise<SupportedPaymentComponentsSchemaDTO> {
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
  public async capturePayment(request: CapturePaymentRequest): Promise<PaymentProviderModificationResponse> {
    try {
      const config = getConfig();
      const paymentIntentId = request.payment.interfaceId as string;
      const amountToBeCaptured = request.amount.centAmount;
      const stripePaymentIntent: Stripe.PaymentIntent = await stripeApi().paymentIntents.retrieve(paymentIntentId);

      if (!request.payment.amountPlanned.centAmount) {
        throw new Error('Payment amount is not set');
      }

      const cartTotalAmount = request.payment.amountPlanned.centAmount;
      const isPartialCapture = stripePaymentIntent.amount_received + amountToBeCaptured < cartTotalAmount;

      // Check if partial capture is attempted without multicapture enabled
      if (isPartialCapture && !config.stripeEnableMultiOperations) {
        log.error('Partial capture attempted without STRIPE_ENABLE_MULTI_OPERATIONS enabled', {
          paymentId: paymentIntentId,
          amountToBeCaptured,
          amountReceived: stripePaymentIntent.amount_received,
          cartTotalAmount,
        });
        throw new Error(
          'Partial captures require STRIPE_ENABLE_MULTI_OPERATIONS=true and multicapture support in your Stripe account',
        );
      }

      const response = await stripeApi().paymentIntents.capture(paymentIntentId, {
        amount_to_capture: amountToBeCaptured,
        ...(isPartialCapture &&
          config.stripeEnableMultiOperations && {
          final_capture: false,
        }),
      });

      log.info(`Payment modification completed.`, {
        paymentId: paymentIntentId,
        action: PaymentTransactions.CHARGE,
        result: PaymentModificationStatus.APPROVED,
        trackingId: response.id,
        isPartialCapture: isPartialCapture,
        multiOperationsEnabled: config.stripeEnableMultiOperations,
      });

      return {
        outcome: PaymentModificationStatus.APPROVED,
        pspReference: response.id,
      };
    } catch (error) {
      log.error('Error capturing payment in Stripe', { error });
      return {
        outcome: PaymentModificationStatus.REJECTED,
        pspReference: request.payment.interfaceId as string,
      };
    }
  }

  /**
   * Cancel payment in Stripe.
   *
   * @param {CancelPaymentRequest} request - contains amount and {@link https://docs.commercetools.com/api/projects/payments | Payment } defined in composable commerce
   * @returns Promise with mocking data containing operation status and PSP reference
   */
  public async cancelPayment(request: CancelPaymentRequest): Promise<PaymentProviderModificationResponse> {
    try {
      const paymentIntentId = request.payment.interfaceId as string;
      const response = await stripeApi().paymentIntents.cancel(paymentIntentId);

      log.info(`Payment modification completed.`, {
        paymentId: paymentIntentId,
        action: PaymentTransactions.CANCEL_AUTHORIZATION,
        result: PaymentModificationStatus.APPROVED,
        trackingId: response.id,
      });

      return { outcome: PaymentModificationStatus.APPROVED, pspReference: response.id };
    } catch (error) {
      log.error('Error canceling payment in Stripe', { error });
      return {
        outcome: PaymentModificationStatus.REJECTED,
        pspReference: request.payment.interfaceId as string,
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
  public async refundPayment(request: RefundPaymentRequest): Promise<PaymentProviderModificationResponse> {
    try {
      const config = getConfig();
      const paymentIntentId = request.payment.interfaceId as string;
      const amount = request.amount.centAmount;

      // Check if there are existing successful refunds
      const existingRefunds = this.ctPaymentService.hasTransactionInState({
        payment: request.payment,
        transactionType: 'Refund',
        states: ['Success'],
      });

      // Warn if multiple refunds attempted without feature enabled
      if (existingRefunds && !config.stripeEnableMultiOperations) {
        log.warn('Multiple refunds attempted without STRIPE_ENABLE_MULTI_OPERATIONS enabled', {
          paymentId: request.payment.id,
          paymentIntentId,
          amount,
          note: 'Webhook-based refund tracking may not work properly. Consider enabling STRIPE_ENABLE_MULTI_OPERATIONS.',
        });
      }

      const response = await stripeApi().refunds.create({
        payment_intent: paymentIntentId,
        amount: amount,
      });

      log.info(`Payment modification completed.`, {
        paymentId: request.payment.id,
        action: PaymentTransactions.REFUND,
        result: PaymentModificationStatus.APPROVED,
        trackingId: response.id,
        multiOperationsEnabled: config.stripeEnableMultiOperations,
        isMultipleRefund: existingRefunds,
      });

      return { outcome: PaymentModificationStatus.RECEIVED, pspReference: response.id };
    } catch (error) {
      log.error('Error refunding payment in Stripe', { error });
      return {
        outcome: PaymentModificationStatus.REJECTED,
        pspReference: request.payment.interfaceId as string,
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
  public async reversePayment(request: ReversePaymentRequest): Promise<PaymentProviderModificationResponse> {
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

    throw new ErrorInvalidOperation('There is no successful payment transaction to reverse.');
  }

  /**
   * Validates if the customer exists in Stripe and creates a new customer if it does not exist, to create a session
   * for the Stripe customer.
   * @returns Promise with the stripeCustomerId, ephemeralKey and sessionId.
   */
  public async getCustomerSession(): Promise<CustomerResponseSchemaDTO | undefined> {
    try {
      const cart = await this.ctCartService.getCart({ id: getCartIdFromContext() });
      const ctCustomerId = cart.customerId;
      if (!ctCustomerId) {
        log.warn('Cart does not have a customerId - Skipping customer creation');
        return;
      }

      const customer = await this.getCtCustomer(ctCustomerId);
      if (!customer) {
        log.info('Customer not found - Skipping Stripe Customer creation');
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
    } catch (error) {
      throw wrapStripeError(error);
    }
  }

  /**
   * Creates a payment intent using the Stripe API and create commercetools payment with Initial transaction.
   *
   * @return Promise<PaymentResponseSchemaDTO> A Promise that resolves to a PaymentResponseSchemaDTO object containing the client secret and payment reference.
   */
  public async createPaymentIntentStripe(
    options?: {
      paymentMethodOptions?: Record<string, Record<string, unknown>>;
    }
  ): Promise<PaymentResponseSchemaDTO> {
    try {
      const config = getConfig();

      const ctCart = await this.ctCartService.getCart({
        id: getCartIdFromContext(),
      });

      const customer = await this.getCtCustomer(ctCart.customerId!);

      const amountPlanned = {
        centAmount: ctCart.totalPrice.centAmount,
        currencyCode: ctCart.totalPrice.currencyCode
      };

      const shippingAddress = this.getStripeCustomerAddress(
        ctCart.shippingAddress,
        (customer as any)?.addresses[0],
      );

      const stripeCustomerId =
        (customer as any)?.custom?.fields?.[stripeCustomerIdFieldName];

      const setupFutureUsage = this.getSetupFutureUsage(ctCart);

      const merchantReturnUrl =
        getMerchantReturnUrlFromContext() || config.merchantReturnUrl;
      const taxCalculationReferences =
        ctCart.custom?.fields?.[CT_CUSTOM_FIELD_TAX_CALCULATIONS] as
        | string[]
        | undefined;

      const taxCalculationCount = taxCalculationReferences?.length ?? 0;
      const hasSingleTaxCalculation = taxCalculationCount === 1;
      const hasTaxCalculations = taxCalculationCount > 0;
      const paymentMethodOptions: Record<string, Record<string, unknown>> = {
        card: {
          //...(config.stripeEnableMultiOperations && {
          //request_multicapture: 'if_available',
          //}),
        },
        ...(options?.paymentMethodOptions ?? {}),
      };

      let paymentIntent!: Stripe.PaymentIntent;

      try {
        paymentIntent = await stripeApi().paymentIntents.create(
          {
            ...(stripeCustomerId && {
              customer: stripeCustomerId,
              setup_future_usage: setupFutureUsage,
            }),
            amount: amountPlanned.centAmount,
            currency: amountPlanned.currencyCode,
            automatic_payment_methods: {
              enabled: true,
            },
            capture_method: config.stripeCaptureMethod as CaptureMethod,
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
                    calculation: taxCalculationReferences![0],
                  },
                },
              },
            }),

            // keep shipping optional as in reference
            /*...(config.stripeCollectBillingAddress === 'auto' && {
              shipping: shippingAddress,
            }),*/
          },
          {
            idempotencyKey: crypto.randomUUID(),
          },
        );
      } catch (e) {
        throw wrapStripeError(e);
      }

      log.info(`Stripe PaymentIntent created.`, {
        ctCartId: ctCart.id,
        stripePaymentIntentId: paymentIntent.id,
        ...(hasTaxCalculations && {
          hasTaxCalculations,
          taxCalculationCount,
        }),
        ...(options?.paymentMethodOptions && {
          frontendPaymentMethodOptions: Object.keys(
            options.paymentMethodOptions,
          ),
        }),
      });
      const ctPayment = await this.ctPaymentService.createPayment({
        amountPlanned,
        checkoutTransactionItemId: getCheckoutTransactionItemIdFromContext(),
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
            type: PaymentTransactions.AUTHORIZATION,
            amount: amountPlanned,
            state: this.convertPaymentResultCode(
              PaymentOutcome.INITIAL as PaymentOutcome,
            ),
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
        await stripeApi().paymentIntents.update(
          paymentIntent.id,
          {
            metadata: {
              ct_payment_id: ctPayment.id,
            },
          },
          { idempotencyKey: crypto.randomUUID() },
        );
      } catch (e) {
        throw wrapStripeError(e);
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
    } catch (error) {
      throw wrapStripeError(error);
    }
  }

  /**
   * Update the PaymentIntent in Stripe to mark the Authorization in commercetools as successful.
   *
   * @param {string} paymentIntentId - The Intent id created in Stripe.
   * @param {string} paymentReference - The identifier of the payment associated with the PaymentIntent in Stripe.
   * @return {Promise<void>} - A Promise that resolves when the PaymentIntent is successfully updated.
   */
  public async updatePaymentIntentStripeSuccessful(paymentIntentId: string, paymentReference: string): Promise<void> {
    const ctCart = await this.ctCartService.getCart({
      id: getCartIdFromContext(),
    });


    const ctPayment = await this.ctPaymentService.getPayment({
      id: paymentReference,
    });
    const amountPlanned = ctPayment.amountPlanned;
    log.info(`log for updatePaymentIntentStripeSuccessful`, ctCart, ctPayment)

    log.info(`PaymentIntent confirmed.`, {
      ctCartId: ctCart.id,
      stripePaymentIntentId: ctPayment.interfaceId,
      amountPlanned: JSON.stringify(amountPlanned),
    });

    await this.ctPaymentService.updatePayment({
      id: ctPayment.id,
      pspReference: paymentIntentId,
      transaction: {
        interactionId: paymentIntentId,
        type: PaymentTransactions.AUTHORIZATION,
        amount: amountPlanned,
        state: this.convertPaymentResultCode(PaymentOutcome.AUTHORIZED as PaymentOutcome),
      },
    });
    log.info(`update payment - updatePaymentIntentStripeSuccessful`, ctPayment)

  }

  /**
   * Return the Stripe payment configuration and the cart amount planed information.
   *
   * @param {string} opts - Options for initializing the cart payment.
   * @return {Promise<ConfigElementResponseSchemaDTO>} Returns a promise that resolves with the cart information, appearance, and capture method.
   */
  public async initializeCartPayment(opts: string): Promise<ConfigElementResponseSchemaDTO> {
    const { stripeCaptureMethod, stripePaymentElementAppearance, stripeLayout, stripeCollectBillingAddress } =
      getConfig();
    const ctCart = await this.ctCartService.getCart({ id: getCartIdFromContext() });
    const amountPlanned = await this.ctCartService.getPaymentAmount({ cart: ctCart });
    const appearance = stripePaymentElementAppearance;
    const setupFutureUsage = this.getSetupFutureUsage(ctCart);

    log.info(`Cart and Stripe.Element ${opts} config retrieved.`, {
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
      collectBillingAddress: stripeCollectBillingAddress as CollectBillingAddressOptions,
    };
  }

  /**
   * Return the Stripe payment configuration and the cart amount planed information.
   *
   * @return {Promise<ConfigElementResponseSchemaDTO>} Returns a promise that resolves with the cart information, appearance, and capture method.
   */
  public applePayConfig(): string {
    return getConfig().stripeApplePayWellKnown;
  }

  private convertPaymentResultCode(resultCode: PaymentOutcome): string {
    switch (resultCode) {
      case PaymentOutcome.AUTHORIZED:
        return 'Success';
      case PaymentOutcome.REJECTED:
        return 'Failure';
      default:
        return 'Initial';
    }
  }
  public async runDailyCaptureJob() {
    console.log("CAPTURE JOB STARTED");
    const processed: string[] = [];

    const paymentsToCheck: any[] = []; // populated by caller or scheduled job context

    for (const payment of paymentsToCheck) {

      const paymentIntentId = payment.interfaceId;

      // Skip if not a Stripe payment
      if (!paymentIntentId) continue;

      const order = await this.ctOrderService.getOrderByPaymentId({
        paymentId: payment.id
      });

      if (!order) continue;

      const shippingInfo = order.shippingInfo as any;

      // Only capture Mail-to-Home orders
      if (shippingInfo?.custom?.fields?.fulfillmentType !== 'm2h') continue;

      const allShipped = order.lineItems.every(
        (li: any) => li.custom?.fields?.deliveryStatus === 'Shipped'
      );

      if (!allShipped) continue;

      const region = this.getRegionFromCurrency(order.totalPrice.currencyCode);

      const stripePi = await stripeApi(region)
        .paymentIntents.retrieve(paymentIntentId);

      if (stripePi.status !== 'requires_capture') continue;

      const captureResponse = await stripeApi(region)
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
  private getRegionFromCurrency(currency: string): 'US' | 'CA' | 'EU' {
    if (currency === 'usd') return 'US';
    if (currency === 'cad') return 'CA';
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
  public async processStripeEvent(event: Stripe.Event): Promise<void> {
    log.info('Processing notification', { event: JSON.stringify(event.id) });

    try {
      const updateData = this.stripeEventConverter.convert(event);

      let paymentMethodType = 'card';
      let paymentMethodName = 'Card';
      let cardDetails: any = {};

      const stripeObject = event.data.object as any;

      if (stripeObject.payment_method) {
        const paymentMethod = await stripeApi().paymentMethods.retrieve(
          stripeObject.payment_method as string
        );

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
        const pi = event.data.object as Stripe.PaymentIntent;

        if (
          pi.capture_method === 'manual' &&
          pi.payment_method_options?.card?.request_multicapture === 'if_available' &&
          typeof pi.latest_charge === 'string'
        ) {
          const balanceTransactions = await stripeApi().balanceTransactions.list({
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

        log.info('processStripeEvent', updateData)
        const updatedPayment = await this.ctPaymentService.updatePayment({
          id: updateData.id,

          paymentMethod: paymentMethodType,

          paymentMethodInfo: {
            method: paymentMethodType,
            name: {
              'en-US':
                cardDetails.brand
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

        log.info('Payment updated after processing the notification', {
          paymentId: updatedPayment.id,
          version: updatedPayment.version,
          pspReference: updateData.pspReference,
          paymentMethod: paymentMethodType,
          transaction: JSON.stringify(tx),
        });
      }
    } catch (e) {
      log.error('Error processing notification', { error: e });
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
  public async storePaymentMethod(event: Stripe.Event): Promise<void> {
    log.info('Storing payment method if opted-in by customer', { event: JSON.stringify(event.id) });

    try {
      const eventData = this.extractPaymentMethodDataFromEvent(event);
      if (!eventData) {
        log.info('No payment method or customer ID found in event metadata, skipping storage.', {
          eventId: event.id,
        });
        return;
      }

      const { stripePaymentMethodId, ctCustomerId, ctPaymentId } = eventData;
      const paymentMethod = await stripeApi().paymentMethods.retrieve(stripePaymentMethodId);

      if (!paymentMethod.customer) {
        log.info('Stripe payment method not attached to a customer, skipping storage', {
          paymentMethodId: stripePaymentMethodId,
        });
        return;
      }

      const ctPaymentMethod = await this.savePaymentMethodIfNew(paymentMethod, ctCustomerId);

      if (ctPaymentId) {
        await this.updatePaymentWithToken(ctPaymentId, paymentMethod);
        log.info('Updated payment with stored payment method token', {
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
          log.info('Created recurring payment job for stored payment method', {
            recurringPaymentJobId: recurringPaymentJob.id,
            paymentMethodId: ctPaymentMethod.id,
          });
        }
      }
    } catch (e) {
      log.error('Error storing payment method in commercetools', { error: e, eventId: event.id });
      return;
    }
  }

  public async processStripeEventRefunded(event: Stripe.Event): Promise<void> {
    log.info('Processing notification', { event: JSON.stringify(event.id) });
    try {
      const updateData = this.stripeEventConverter.convert(event);
      const charge = event.data.object as Stripe.Charge;
      const refunds = await stripeApi().refunds.list({
        charge: charge.id,
        created: {
          gte: charge.created,
        },
        limit: 2,
      });

      const refund = refunds.data[0];
      if (!refund) {
        log.warn('No refund found for charge', { chargeId: charge.id });
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

        log.info('Payment updated after processing the notification', {
          paymentId: updatedPayment.id,
          version: updatedPayment.version,
          pspReference: updateData.pspReference,
          paymentMethod: updateData.paymentMethod,
          transaction: JSON.stringify(tx),
        });
      }
    } catch (e) {
      log.error('Error processing notification', { error: e });
      return;
    }
  }

  public async processStripeEventMultipleCaptured(event: Stripe.Event): Promise<void> {
    log.info('Processing notification', { event: JSON.stringify(event.id) });
    try {
      const updateData = this.stripeEventConverter.convert(event);
      const charge = event.data.object as Stripe.Charge;
      if (charge.captured) {
        log.warn('Charge is already captured', { chargeId: charge.id });
        return;
      }

      const previousAttributes = event.data.previous_attributes as Stripe.Charge;
      if (!(charge.amount_captured > previousAttributes.amount_captured)) {
        log.warn('The amount captured do not change from the previous charge', { chargeId: charge.id });
        return;
      }

      updateData.pspReference = charge.balance_transaction as string;
      updateData.transactions.forEach((tx) => {
        tx.interactionId = charge.balance_transaction as string;
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

        log.info('Payment updated after processing the notification', {
          paymentId: updatedPayment.id,
          version: updatedPayment.version,
          pspReference: updateData.pspReference,
          paymentMethod: updateData.paymentMethod,
          transaction: JSON.stringify(tx),
        });
      }
    } catch (e) {
      log.error('Error processing notification', { error: e });
      return;
    }
  }

  public async retrieveOrCreateStripeCustomerId(cart: Cart, customer: Customer): Promise<string | undefined> {
    const savedCustomerId = customer?.custom?.fields?.[stripeCustomerIdFieldName];
    if (savedCustomerId) {
      const isValid = await this.validateStripeCustomerId(savedCustomerId, customer.id);
      if (isValid) {
        log.info('Customer has a valid Stripe Customer ID saved.', { stripeCustomerId: savedCustomerId });
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
    } else {
      throw 'Failed to create stripe customer.';
    }
  }

  public async validateStripeCustomerId(stripeCustomerId: string, ctCustomerId: string): Promise<boolean> {
    try {
      const customer = await stripeApi().customers.retrieve(stripeCustomerId);
      return Boolean(customer && !customer.deleted && (customer as any)?.metadata?.ct_customer_id === ctCustomerId);
    } catch (e) {
      log.warn('Error validating Stripe customer ID', { error: e });
      return false;
    }
  }

  public async findStripeCustomer(ctCustomerId: string): Promise<Stripe.Customer | undefined> {
    try {
      if (!isValidUUID(ctCustomerId)) {
        log.warn('Invalid ctCustomerId: Not a valid UUID:', { ctCustomerId });
        throw 'Invalid ctCustomerId: Not a valid UUID';
      }
      const query = `metadata['ct_customer_id']:'${ctCustomerId}'`;
      const customer = await stripeApi().customers.search({ query });

      return customer.data[0];
    } catch (e) {
      log.warn(`Error finding Stripe customer for ctCustomerId: ${ctCustomerId}`, { error: e });
      return undefined;
    }
  }

  public async createStripeCustomer(cart: Cart, customer: Customer): Promise<Stripe.Customer | undefined> {
    const shippingAddress = this.getStripeCustomerAddress(customer.addresses[0], cart.shippingAddress);
    const email = cart.customerEmail || customer.email || cart.shippingAddress?.email;
    return await stripeApi().customers.create({
      email,
      name: `${customer.firstName} ${customer.lastName}`.trim() || shippingAddress?.name,
      phone: shippingAddress?.phone,
      metadata: {
        ...(cart.customerId ? { ct_customer_id: customer.id } : null),
      },
      ...(shippingAddress?.address ? { address: shippingAddress.address } : null),
    });
  }

  public async saveStripeCustomerId(stripeCustomerId: string, customer: Customer): Promise<void> {
    /*
      TODO: commercetools insights on how to integrate the Stripe accountId into commercetools:
      We have plans to support recurring payments and saved payment methods in the next quarters.
      Not sure if you can wait until that so your implementation would be aligned with ours.
    */
    const fields: Record<string, string> = {
      [stripeCustomerIdFieldName]: stripeCustomerId,
    };
    const { id, version, custom } = customer;
    const updateFieldActions = await getCustomFieldUpdateActions({
      fields,
      customFields: custom,
      customType: stripeCustomerIdCustomType,
    });
    await updateCustomerById({ id, version, actions: updateFieldActions });
    log.info(`Stripe Customer ID "${stripeCustomerId}" saved to customer "${id}".`);
  }

  public async createSession(stripeCustomerId: string, cart: Cart): Promise<Stripe.CustomerSession | undefined> {
    const paymentConfig = getConfig().stripeSavedPaymentMethodConfig;
    const session = await stripeApi().customerSessions.create({
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

  public async createEphemeralKey(stripeCustomerId: string) {
    const config = getConfig();
    const stripe = stripeApi();
    const res = await stripe.ephemeralKeys.create(
      { customer: stripeCustomerId },
      { apiVersion: config.stripeApiVersion },
    );
    return res?.secret;
  }

  public async getCtCustomer(ctCustomerId: string): Promise<Customer | void> {
    return await paymentSDK.ctAPI.client
      .customers()
      .withId({ ID: ctCustomerId })
      .get()
      .execute()
      .then((response) => response.body)
      .catch((err) => {
        log.warn(`Customer not found ${ctCustomerId}`, { error: err });
        return;
      });
  }

  public getStripeCustomerAddress(prioritizedAddress: Address | undefined, fallbackAddress: Address | undefined) {
    if (!prioritizedAddress && !fallbackAddress) {
      return undefined;
    }

    const getField = (field: keyof Address): string => {
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

  public getBillingAddress(cart: Cart) {
    const prioritizedAddress = cart.billingAddress ?? cart.shippingAddress;
    if (!prioritizedAddress) {
      return undefined;
    }

    const getField = (field: keyof Address): string | null => {
      const value = prioritizedAddress?.[field as keyof typeof prioritizedAddress];
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
  private extractPaymentMethodDataFromEvent(event: Stripe.Event): {
    stripePaymentMethodId: string;
    ctCustomerId: string;
    ctPaymentId: string | null;
  } | null {
    let stripePaymentMethod: string | Stripe.PaymentMethod | null = null;
    let ctCustomerId: string | null = null;
    let ctPaymentId: string | null = null;

    if (event.type === StripeEvent.PAYMENT_INTENT__SUCCEEDED) {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      stripePaymentMethod = paymentIntent.payment_method;
      ctCustomerId = paymentIntent.metadata?.ct_customer_id;
      ctPaymentId = paymentIntent.metadata?.ct_payment_id;
    } else if (event.type === StripeEvent.CHARGE__SUCCEEDED) {
      const charge = event.data.object as Stripe.Charge;
      stripePaymentMethod = charge.payment_method;
      ctCustomerId = charge.metadata?.ct_customer_id;
      ctPaymentId = charge.metadata?.ct_payment_id;
    }

    if (!stripePaymentMethod || !ctCustomerId) {
      return null;
    }

    return {
      stripePaymentMethodId: stripePaymentMethod as string,
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
  private async savePaymentMethodIfNew(
    paymentMethod: Stripe.PaymentMethod,
    ctCustomerId: string,
  ): Promise<PaymentMethod> {
    try {
      const existingPaymentMethod = await this.ctPaymentMethodService.getByTokenValue({
        customerId: ctCustomerId,
        paymentInterface: getConfig().paymentInterface,
        tokenValue: paymentMethod.id,
      });

      if (existingPaymentMethod) {
        log.info('Payment method already stored for customer', {
          ctCustomerId,
          stripePaymentMethod: paymentMethod.id,
        });
        return existingPaymentMethod;
      }
    } catch (error) {
      if (error instanceof ErrorResourceNotFound) {
        log.debug('Payment method does not exist, will create new one', {
          ctCustomerId,
          stripePaymentMethod: paymentMethod.id,
        });
      } else {
        throw error;
      }
    }

    const ctPaymentMethod = await this.ctPaymentMethodService.save({
      customerId: ctCustomerId,
      paymentInterface: getConfig().paymentInterface,
      token: paymentMethod.id,
      method: paymentMethod.type,
    });

    log.info('Stored payment method for customer', {
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
  private async updatePaymentWithToken(ctPaymentId: string, paymentMethod: Stripe.PaymentMethod): Promise<void> {
    const ctPayment = await this.ctPaymentService.updatePayment({
      id: ctPaymentId,
      paymentMethodInfo: {
        token: {
          value: paymentMethod.id,
        },
      },
    });

    log.info('Updated commercetools payment with stored payment method token', {
      ctPaymentId: ctPayment.id,
    });
  }

  private getSetupFutureUsage(cart: Cart): Stripe.PaymentIntentCreateParams.SetupFutureUsage | undefined {
    if (this.ctCartService.isRecurringCart(cart)) {
      return 'off_session';
    }

    return config.stripeSavedPaymentMethodConfig?.payment_method_save_usage;
  }
  public async createOrder({ cart, subscriptionId, paymentIntentId }: CreateOrderProps) {
    const order = await createOrderFromCart(cart);
    log.info('Order created successfully', {
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
      await stripeApi().paymentIntents.update(
        paymentIntentId,
        { metadata: { [METADATA_ORDER_ID_FIELD]: order.id } },
        { idempotencyKey: crypto.randomUUID() },
      );
    }
    /* If using Stripe Test Clock, wait for 9 seconds to allow clock advancement in test environments.
      This helps ensure Stripe's test clock events are processed before updating the subscription.
      Uncomment this line for testing purposes when using Stripe Test Clock.
      await new Promise((resolve) => setTimeout(resolve, 000));
      */

    if (subscriptionId) {
      await stripeApi().subscriptions.update(
        subscriptionId,
        { metadata: { [METADATA_ORDER_ID_FIELD]: order.id } },
        { idempotencyKey: crypto.randomUUID() },
      );
    }
  }

  public async addPaymentToOrder(subscriptionPaymentId: string, paymentId: string) {
    try {
      const order = await this.ctOrderService.getOrderByPaymentId({ paymentId: subscriptionPaymentId });
      await addOrderPayment(order, paymentId);
    } catch (error) {
      log.error('Error adding payment to order', { error });
    }
  }

  public async updateCartAddress(charge: Stripe.Charge, ctCart: Cart): Promise<Cart> {
    if (!charge) {
      return ctCart;
    }

    const addressData = this.validateAndGetStripeAddress(charge, ctCart);
    if (!addressData) {
      return ctCart;
    }

    const { address, addressSource } = addressData;
    const wasFrozen = isCartFrozen(ctCart);

    const cartToUpdate = await this.unfreezeCartIfNeeded(ctCart, wasFrozen);

    // Stripe has complete address → update the cart
    const actions: CartUpdateAction[] = [
      {
        action: 'setShippingAddress',
        address: {
          key: addressSource?.name ?? undefined,
          country: address.country!,
          city: address.city ?? undefined,
          postalCode: address.postal_code ?? undefined,
          state: address.state ?? undefined,
          streetName: address.line1 ?? undefined,
          streetNumber: address.line2 ?? undefined,
        },
      },
    ];

    const updatedCart = await updateCartById(cartToUpdate, actions);

    return await this.refreezeCartIfNeeded(updatedCart, wasFrozen);
  }

  /**
   * Validates and extracts a complete Stripe address from charge data.
   * Returns null if no valid address is found or if cart already has an address.
   * @param charge - The Stripe charge containing address information
   * @param ctCart - The commercetools cart to check for existing address
   * @returns Address data if valid, null otherwise
   */
  private validateAndGetStripeAddress(
    charge: Stripe.Charge,
    ctCart: Cart,
  ): { address: Stripe.Address; addressSource: Stripe.Charge.Shipping | Stripe.Charge.BillingDetails | null } | null {
    const { billing_details, shipping } = charge;

    // Prioritize shipping over billing_details
    const addressSource = shipping || billing_details;
    const address = addressSource?.address;

    // Verify if Stripe has a complete and valid address
    const hasCompleteStripeAddress = !!(
      address?.country &&
      address?.state &&
      address?.city &&
      address?.postal_code &&
      address?.line1
    );

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
  private async unfreezeCartIfNeeded(ctCart: Cart, wasFrozen: boolean): Promise<Cart> {
    if (!wasFrozen) {
      return ctCart;
    }

    try {
      const unfrozenCart = await unfreezeCart(ctCart);
      log.info(`Cart temporarily unfrozen for address update from successful payment.`, {
        ctCartId: unfrozenCart.id,
      });
      return unfrozenCart;
    } catch (error) {
      log.error(`Error unfreezing cart for address update.`, {
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
  private async refreezeCartIfNeeded(updatedCart: Cart, wasFrozen: boolean): Promise<Cart> {
    if (!wasFrozen) {
      return updatedCart;
    }

    try {
      const reFrozenCart = await freezeCart(updatedCart);
      log.info(`Cart re-frozen after address update from successful payment.`, {
        ctCartId: reFrozenCart.id,
      });
      return reFrozenCart;
    } catch (error) {
      log.error(`Error re-freezing cart after address update.`, {
        error,
        ctCartId: updatedCart.id,
      });
      // Return updated cart even if re-freeze fails
      return updatedCart;
    }
  }
}
