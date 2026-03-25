import express from 'express';
import { runCaptureJob } from './services/capture.service';

const app = express();

app.get('/health', (req, res) => {
  res.send('OK');
});

app.post('/payment-capture', async (req, res) => {
  try {
    console.log("CAPTURE JOB TRIGGERED");

    const result = await runCaptureJob();

    res.json({
      status: 'success',
      result,
    });
  } catch (error) {
    console.error("CAPTURE JOB FAILED:", error);

    res.status(500).json({
      status: 'error',
      error: String(error),
    });
  }
});

app.listen(8080, () => {
  console.log('Payment Capture Job ready on port 8080');
});