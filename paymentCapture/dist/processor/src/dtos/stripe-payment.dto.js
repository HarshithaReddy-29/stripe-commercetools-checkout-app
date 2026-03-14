"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerResponseSchema = exports.CtPaymentSchema = exports.ConfigElementResponseSchema = exports.CollectBillingAddressOptions = exports.PaymentResponseSchema = exports.PaymentOutcome = exports.PaymentRequestSchema = exports.CreatePaymentMethodSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
const mock_payment_dto_1 = require("./mock-payment.dto");
exports.CreatePaymentMethodSchema = typebox_1.Type.Object({
    type: typebox_1.Type.Union([typebox_1.Type.Enum(mock_payment_dto_1.PaymentMethodType), typebox_1.Type.String()]),
    poNumber: typebox_1.Type.Optional(typebox_1.Type.String()),
    invoiceMemo: typebox_1.Type.Optional(typebox_1.Type.String()),
    confirmationToken: typebox_1.Type.Optional(typebox_1.Type.String()),
});
exports.PaymentRequestSchema = typebox_1.Type.Object({
    paymentMethod: typebox_1.Type.Composite([exports.CreatePaymentMethodSchema]),
    cart: typebox_1.Type.Optional(typebox_1.Type.Object({
        id: typebox_1.Type.String(),
    })),
    paymentIntent: typebox_1.Type.Optional(typebox_1.Type.Object({
        id: typebox_1.Type.String(),
    })),
    paymentOutcome: typebox_1.Type.Optional(mock_payment_dto_1.PaymentOutcomeSchema),
});
var PaymentOutcome;
(function (PaymentOutcome) {
    PaymentOutcome["AUTHORIZED"] = "Authorized";
    PaymentOutcome["REJECTED"] = "Rejected";
    PaymentOutcome["INITIAL"] = "Initial";
})(PaymentOutcome || (exports.PaymentOutcome = PaymentOutcome = {}));
exports.PaymentResponseSchema = typebox_1.Type.Object({
    sClientSecret: typebox_1.Type.String(),
    paymentReference: typebox_1.Type.String(),
    merchantReturnUrl: typebox_1.Type.String(),
    cartId: typebox_1.Type.String(),
    billingAddress: typebox_1.Type.Optional(typebox_1.Type.String()),
});
var CollectBillingAddressOptions;
(function (CollectBillingAddressOptions) {
    CollectBillingAddressOptions["AUTO"] = "auto";
    CollectBillingAddressOptions["NEVER"] = "never";
    CollectBillingAddressOptions["IF_REQUIRED"] = "if_required";
})(CollectBillingAddressOptions || (exports.CollectBillingAddressOptions = CollectBillingAddressOptions = {}));
exports.ConfigElementResponseSchema = typebox_1.Type.Object({
    cartInfo: typebox_1.Type.Object({
        amount: typebox_1.Type.Number(),
        currency: typebox_1.Type.String(),
    }),
    appearance: typebox_1.Type.Optional(typebox_1.Type.String()),
    captureMethod: typebox_1.Type.String(),
    setupFutureUsage: typebox_1.Type.Optional(typebox_1.Type.String()),
    layout: typebox_1.Type.String(),
    collectBillingAddress: typebox_1.Type.Enum(CollectBillingAddressOptions),
});
exports.CtPaymentSchema = typebox_1.Type.Object({
    ctPaymentReference: typebox_1.Type.String(),
});
exports.CustomerResponseSchema = typebox_1.Type.Optional(typebox_1.Type.Object({
    stripeCustomerId: typebox_1.Type.String(),
    ephemeralKey: typebox_1.Type.String(),
    sessionId: typebox_1.Type.String(),
}));
