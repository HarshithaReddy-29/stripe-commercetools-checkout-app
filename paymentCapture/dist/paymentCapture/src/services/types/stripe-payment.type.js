"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentStatus = exports.StripeEvent = void 0;
var StripeEvent;
(function (StripeEvent) {
    StripeEvent["PAYMENT_INTENT__SUCCEEDED"] = "payment_intent.succeeded";
    StripeEvent["PAYMENT_INTENT__CANCELED"] = "payment_intent.canceled";
    StripeEvent["PAYMENT_INTENT__REQUIRED_ACTION"] = "payment_intent.requires_action";
    StripeEvent["PAYMENT_INTENT__PAYMENT_FAILED"] = "payment_intent.payment_failed";
    StripeEvent["CHARGE__REFUNDED"] = "charge.refunded";
    StripeEvent["CHARGE__SUCCEEDED"] = "charge.succeeded";
    StripeEvent["CHARGE__UPDATED"] = "charge.updated";
})(StripeEvent || (exports.StripeEvent = StripeEvent = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["FAILURE"] = "Failure";
    PaymentStatus["SUCCESS"] = "Success";
    PaymentStatus["PENDING"] = "Pending";
    PaymentStatus["INITIAL"] = "Initial";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
