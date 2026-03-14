"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const processor_1 = require("@gmsb/processor");
async function run() {
    console.log('Running payment capture job');
    const paymentService = new processor_1.StripePaymentService({
        ctCartService: processor_1.paymentSDK.ctCartService,
        ctPaymentService: processor_1.paymentSDK.ctPaymentService,
        ctOrderService: processor_1.paymentSDK.ctOrderService,
        ctPaymentMethodService: processor_1.paymentSDK.ctPaymentMethodService,
        ctRecurringPaymentJobService: processor_1.paymentSDK.ctRecurringPaymentJobService,
    });
    await paymentService.runDailyCaptureJob();
}
run().catch((err) => {
    console.error('Payment capture job failed', err);
    process.exit(1);
});
