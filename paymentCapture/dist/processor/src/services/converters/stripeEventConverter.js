"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeEventConverter = void 0;
const stripe_payment_type_1 = require("../types/stripe-payment.type");
const payment_intents_dto_1 = require("../../dtos/operations/payment-intents.dto");
const stripe_client_1 = require("../../clients/stripe.client");
class StripeEventConverter {
    convert(opts) {
        let data, paymentIntentId, paymentMethod;
        if (opts.type.startsWith('payment')) {
            data = opts.data.object;
            paymentIntentId = data.id;
        }
        else {
            data = opts.data.object;
            paymentIntentId = (data.payment_intent || data.id);
            paymentMethod = data.payment_method_details?.type || '';
        }
        return {
            id: this.getCtPaymentId(data),
            pspReference: paymentIntentId,
            paymentMethodInfo: {
                method: paymentMethod,
            },
            pspInteraction: {
                response: JSON.stringify(opts),
            },
            transactions: this.populateTransactions(opts, paymentIntentId),
        };
    }
    populateTransactions(event, paymentIntentId) {
        switch (event.type) {
            case stripe_payment_type_1.StripeEvent.PAYMENT_INTENT__CANCELED:
                return [
                    {
                        type: payment_intents_dto_1.PaymentTransactions.AUTHORIZATION,
                        state: stripe_payment_type_1.PaymentStatus.FAILURE,
                        amount: this.populateAmountCanceled(event),
                        interactionId: paymentIntentId, //Deprecated but kept for backward compatibility
                        interfaceId: paymentIntentId,
                    },
                    {
                        type: payment_intents_dto_1.PaymentTransactions.CANCEL_AUTHORIZATION,
                        state: stripe_payment_type_1.PaymentStatus.SUCCESS,
                        amount: this.populateAmountCanceled(event),
                        interactionId: paymentIntentId, //Deprecated but kept for backward compatibility
                        interfaceId: paymentIntentId,
                    },
                ];
            case stripe_payment_type_1.StripeEvent.PAYMENT_INTENT__SUCCEEDED:
                return [
                    {
                        type: payment_intents_dto_1.PaymentTransactions.CHARGE,
                        state: stripe_payment_type_1.PaymentStatus.SUCCESS,
                        amount: this.populateAmount(event),
                        interactionId: paymentIntentId, //Deprecated but kept for backward compatibility
                        interfaceId: paymentIntentId,
                    },
                ];
            case stripe_payment_type_1.StripeEvent.PAYMENT_INTENT__PAYMENT_FAILED:
                return [
                    {
                        type: payment_intents_dto_1.PaymentTransactions.AUTHORIZATION,
                        state: stripe_payment_type_1.PaymentStatus.FAILURE,
                        amount: this.populateAmount(event),
                        interactionId: paymentIntentId, //Deprecated but kept for backward compatibility
                        interfaceId: paymentIntentId,
                    },
                ];
            case stripe_payment_type_1.StripeEvent.CHARGE__REFUNDED: {
                return [
                    {
                        type: payment_intents_dto_1.PaymentTransactions.REFUND,
                        state: stripe_payment_type_1.PaymentStatus.SUCCESS,
                        amount: this.populateAmount(event),
                        interactionId: paymentIntentId, //Deprecated but kept for backward compatibility
                        interfaceId: paymentIntentId,
                    },
                    {
                        type: payment_intents_dto_1.PaymentTransactions.CHARGE_BACK,
                        state: stripe_payment_type_1.PaymentStatus.SUCCESS,
                        amount: this.populateAmount(event),
                        interactionId: paymentIntentId, //Deprecated but kept for backward compatibility
                        interfaceId: paymentIntentId,
                    },
                ];
            }
            case stripe_payment_type_1.StripeEvent.CHARGE__SUCCEEDED: {
                return [
                    {
                        type: payment_intents_dto_1.PaymentTransactions.AUTHORIZATION,
                        state: stripe_payment_type_1.PaymentStatus.SUCCESS,
                        amount: this.populateAmount(event),
                        interactionId: paymentIntentId, //Deprecated but kept for backward compatibility
                        interfaceId: paymentIntentId,
                    },
                ];
            }
            case stripe_payment_type_1.StripeEvent.CHARGE__UPDATED:
                return [
                    {
                        type: payment_intents_dto_1.PaymentTransactions.CHARGE,
                        state: stripe_payment_type_1.PaymentStatus.SUCCESS,
                        amount: this.populateAmount(event),
                        interactionId: paymentIntentId, //Deprecated but kept for backward compatibility
                        interfaceId: paymentIntentId,
                    },
                ];
            default: {
                const error = `Unsupported event ${event.type}`;
                throw (0, stripe_client_1.wrapStripeError)(new Error(error));
            }
        }
    }
    populateAmount(opts) {
        let data, centAmount;
        if (opts.type.startsWith('payment')) {
            data = opts.data.object;
            centAmount = data.amount_received;
        }
        else {
            data = opts.data.object;
            centAmount = data.amount_refunded;
        }
        return {
            centAmount: centAmount,
            currencyCode: data.currency.toUpperCase(),
        };
    }
    populateAmountCanceled(opts) {
        const data = opts.data.object;
        const currencyCode = data.currency.toUpperCase();
        const centAmount = data.amount;
        return {
            centAmount: centAmount,
            currencyCode: currencyCode,
        };
    }
    getCtPaymentId(event) {
        return event.metadata.ct_payment_id;
    }
}
exports.StripeEventConverter = StripeEventConverter;
