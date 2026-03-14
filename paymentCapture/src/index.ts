import { StripePaymentService, paymentSDK } from '@gmsb/processor';
 
async function run() {
  console.log('Running payment capture job');
 
const paymentService = new StripePaymentService({
  ctCartService: paymentSDK.ctCartService,
  ctPaymentService: paymentSDK.ctPaymentService,
  ctOrderService: paymentSDK.ctOrderService,
  ctPaymentMethodService: paymentSDK.ctPaymentMethodService,
  ctRecurringPaymentJobService: paymentSDK.ctRecurringPaymentJobService,
});
 
  await paymentService.runDailyCaptureJob();
}
 
run().catch((err) => {
  console.error('Payment capture job failed', err);
  process.exit(1);
});