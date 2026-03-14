"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractPaymentService = void 0;
const connect_payments_sdk_1 = require("@commercetools/connect-payments-sdk");
const logger_1 = require("../libs/logger");
class AbstractPaymentService {
    constructor(ctCartService, ctPaymentService, ctOrderService, ctPaymentMethodService, ctRecurringPaymentJobService) {
        this.ctCartService = ctCartService;
        this.ctPaymentService = ctPaymentService;
        this.ctOrderService = ctOrderService;
        this.ctPaymentMethodService = ctPaymentMethodService;
        this.ctRecurringPaymentJobService = ctRecurringPaymentJobService;
    }
    /**
     * Modify payment
     *
     * @remarks
     * This method is used to execute Capture/Cancel/Refund payment in external PSPs and update composable commerce. The actual invocation to PSPs should be implemented in subclasses
     * MVP - capture/refund the total of the order
     *
     * @param opts - input for payment modification including payment ID, action and payment amount
     * @returns Promise with outcome of payment modification after invocation to PSPs
     */
    async modifyPayment(opts, region = 'US') {
        const ctPayment = await this.ctPaymentService.getPayment({
            id: opts.paymentId,
        });
        const request = opts.data.actions[0];
        logger_1.log.info(`Payment modification ${request.action} start.`);
        switch (request.action) {
            case 'cancelPayment': {
                return await this.cancelPayment({ payment: ctPayment, merchantReference: request.merchantReference }, region);
            }
            case 'capturePayment': {
                return await this.capturePayment({
                    payment: ctPayment,
                    merchantReference: request.merchantReference,
                    amount: request.amount,
                }, region);
            }
            case 'refundPayment': {
                return await this.refundPayment({
                    amount: request.amount,
                    payment: ctPayment,
                    merchantReference: request.merchantReference,
                }, region);
            }
            case 'reversePayment': {
                return await this.reversePayment({
                    payment: ctPayment,
                    merchantReference: request.merchantReference,
                }, region);
            }
            default: {
                throw new connect_payments_sdk_1.ErrorInvalidOperation(`Operation not supported.`);
            }
        }
    }
}
exports.AbstractPaymentService = AbstractPaymentService;
