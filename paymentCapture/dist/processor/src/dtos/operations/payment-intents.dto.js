"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentTransactions = exports.PaymentIntentResponseSchema = exports.PaymentModificationStatus = exports.PaymentIntentConfirmRequestSchema = exports.PaymentIntentRequestSchema = exports.ActionReversePaymentSchema = exports.ActionCancelPaymentSchema = exports.ActionRefundPaymentSchema = exports.ActionCapturePaymentSchema = exports.AmountSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
exports.AmountSchema = typebox_1.Type.Object({
    centAmount: typebox_1.Type.Integer(),
    currencyCode: typebox_1.Type.String(),
});
exports.ActionCapturePaymentSchema = typebox_1.Type.Composite([
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('capturePayment'),
    }),
    typebox_1.Type.Object({
        amount: exports.AmountSchema,
        merchantReference: typebox_1.Type.Optional(typebox_1.Type.String()),
    }),
]);
exports.ActionRefundPaymentSchema = typebox_1.Type.Composite([
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('refundPayment'),
    }),
    typebox_1.Type.Object({
        amount: exports.AmountSchema,
        merchantReference: typebox_1.Type.Optional(typebox_1.Type.String()),
    }),
]);
exports.ActionCancelPaymentSchema = typebox_1.Type.Composite([
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('cancelPayment'),
        merchantReference: typebox_1.Type.Optional(typebox_1.Type.String()),
    }),
]);
exports.ActionReversePaymentSchema = typebox_1.Type.Composite([
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('reversePayment'),
        merchantReference: typebox_1.Type.Optional(typebox_1.Type.String()),
    }),
]);
/**
 * Payment intent request schema.
 *
 * Example:
 * {
 *  "actions": [
 *   {
 *    "action": "capturePayment",
 *    "amount": {
 *      "centAmount": 100,
 *      "currencyCode": "EUR"
 *    }
 *  ]
 * }
 */
exports.PaymentIntentRequestSchema = typebox_1.Type.Object({
    actions: typebox_1.Type.Array(typebox_1.Type.Union([
        exports.ActionCapturePaymentSchema,
        exports.ActionRefundPaymentSchema,
        exports.ActionCancelPaymentSchema,
        exports.ActionReversePaymentSchema,
    ]), {
        maxItems: 1,
    }),
    merchantReference: typebox_1.Type.Optional(typebox_1.Type.String()),
});
exports.PaymentIntentConfirmRequestSchema = typebox_1.Type.Object({
    paymentIntent: typebox_1.Type.String(),
    confirmationToken: typebox_1.Type.Optional(typebox_1.Type.String()),
});
var PaymentModificationStatus;
(function (PaymentModificationStatus) {
    PaymentModificationStatus["APPROVED"] = "approved";
    PaymentModificationStatus["REJECTED"] = "rejected";
    PaymentModificationStatus["RECEIVED"] = "received";
})(PaymentModificationStatus || (exports.PaymentModificationStatus = PaymentModificationStatus = {}));
const PaymentModificationSchema = typebox_1.Type.Enum(PaymentModificationStatus);
exports.PaymentIntentResponseSchema = typebox_1.Type.Object({
    outcome: PaymentModificationSchema,
    error: typebox_1.Type.Optional(typebox_1.Type.String()),
});
var PaymentTransactions;
(function (PaymentTransactions) {
    PaymentTransactions["AUTHORIZATION"] = "Authorization";
    PaymentTransactions["CANCEL_AUTHORIZATION"] = "CancelAuthorization";
    PaymentTransactions["CHARGE"] = "Charge";
    PaymentTransactions["CHARGE_BACK"] = "Chargeback";
    PaymentTransactions["REFUND"] = "Refund";
    PaymentTransactions["REVERSE"] = "Reverse";
})(PaymentTransactions || (exports.PaymentTransactions = PaymentTransactions = {}));
