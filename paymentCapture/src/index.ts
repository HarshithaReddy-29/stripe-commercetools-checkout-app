import { runCaptureJob } from './services/capture.service';
 
(async () => {
  try {
    console.log("CAPTURE JOB STARTED");
    const result = await runCaptureJob();   
    console.log("CAPTURE JOB RESULT:", JSON.stringify(result, null, 2));
    console.log("CAPTURE JOB COMPLETED");
    process.exit(0);
  } catch (error) {
    console.error("CAPTURE JOB FAILED", error);
    process. exit(1);
  }
})();