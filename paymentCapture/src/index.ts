import { runCaptureJob } from './services/capture.service';

async function run() {
  console.log('Running payment capture job');
  const result = await runCaptureJob();
  console.log('Capture job completed:', result);
}

run().catch((err) => {
  console.error('Payment capture job failed', err);
  process.exit(1);
});