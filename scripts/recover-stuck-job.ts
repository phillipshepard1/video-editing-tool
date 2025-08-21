/**
 * Script to recover stuck jobs
 * Run with: tsx scripts/recover-stuck-job.ts [jobId]
 */

import { getJobQueueService } from '../lib/services/job-queue';

async function recoverStuckJob(jobId?: string) {
  const jobQueue = getJobQueueService();
  
  try {
    if (jobId) {
      console.log(`Attempting to recover job: ${jobId}`);
      
      // Get job details
      const job = await jobQueue.getJob(jobId);
      if (!job) {
        console.error('Job not found');
        return;
      }
      
      console.log('Job status:', job.status);
      console.log('Current stage:', job.current_stage);
      console.log('Progress:', job.progress_percentage + '%');
      
      // Check if stuck in gemini_processing
      if (job.status === 'processing' && job.current_stage === 'gemini_processing') {
        console.log('Job appears to be stuck in gemini_processing');
        
        // Find and release queue items
        const supabase = jobQueue['supabase'];
        const { data: queueItems, error } = await supabase
          .from('job_queue')
          .select('*')
          .eq('job_id', jobId);
        
        if (!error && queueItems && queueItems.length > 0) {
          console.log(`Found ${queueItems.length} queue items`);
          
          for (const item of queueItems) {
            console.log(`Releasing claim for queue item: ${item.id}`);
            console.log(`- Stage: ${item.stage}`);
            console.log(`- Worker: ${item.worker_id || 'none'}`);
            console.log(`- Claimed at: ${item.claimed_at || 'never'}`);
            
            if (item.worker_id) {
              // Release with a 3 second delay to allow proper worker to pick it up
              await jobQueue.releaseJobClaim(item.id, 3);
              console.log('✓ Released claim');
            } else {
              console.log('- Not claimed, skipping');
            }
          }
          
          // Add recovery log
          await jobQueue.addLog(
            jobId,
            'info',
            'gemini_processing',
            'Job recovered from stuck state via recovery script',
            { 
              recoveryTime: new Date().toISOString(),
              processWholeVideo: job.processing_options?.processWholeVideo 
            }
          );
          
          console.log('✅ Job recovery complete! The job should be picked up by the correct worker shortly.');
        } else {
          console.log('No queue items found for this job');
        }
      } else {
        console.log('Job does not appear to be stuck');
      }
      
    } else {
      console.log('Recovering all stuck jobs...');
      const recoveredCount = await jobQueue.recoverStuckJobs(10);
      console.log(`Recovered ${recoveredCount} stuck jobs`);
    }
    
  } catch (error) {
    console.error('Error recovering job:', error);
  } finally {
    process.exit(0);
  }
}

// Get job ID from command line arguments
const jobId = process.argv[2];

// Run recovery
console.log('=== Job Recovery Script ===');
if (jobId) {
  console.log(`Target job: ${jobId}`);
} else {
  console.log('No job ID provided, will recover all stuck jobs');
}
console.log('');

recoverStuckJob(jobId);