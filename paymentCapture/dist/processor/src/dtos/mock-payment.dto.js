"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRequestSchema = exports.PaymentOutcomeSchema = exports.PaymentResponseSchema = exports.PaymentMethodType = exports.PaymentOutcome = void 0;
const typebox_1 = require("@sinclair/typebox");
var PaymentOutcome;
(function (PaymentOutcome) {
    PaymentOutcome["AUTHORIZED"] = "Authorized";
    PaymentOutcome["REJECTED"] = "Rejected";
})(PaymentOutcome || (exports.PaymentOutcome = PaymentOutcome = {}));
var PaymentMethodType;
(function (PaymentMethodType) {
    PaymentMethodType["CARD"] = "card";
    PaymentMethodType["INVOICE"] = "invoice";
    PaymentMethodType["PURCHASE_ORDER"] = "purchaseorder";
    PaymentMethodType["PAYMENT"] = "payment";
})(PaymentMethodType || (exports.PaymentMethodType = PaymentMethodType = {}));
exports.PaymentResponseSchema = typebox_1.Type.Object({
    paymentReference: typebox_1.Type.String(),
});
exports.PaymentOutcomeSchema = typebox_1.Type.Enum(PaymentOutcome);
exports.PaymentRequestSchema = typebox_1.Type.Object({
    paymentMethod: typebox_1.Type.Object({
        type: typebox_1.Type.Enum(PaymentMethodType),
        poNumber: typebox_1.Type.Optional(typebox_1.Type.String()),
        invoiceMemo: typebox_1.Type.Optional(typebox_1.Type.String()),
    }),
    paymentOutcome: exports.PaymentOutcomeSchema,
});
