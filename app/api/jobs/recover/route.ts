/**
 * Job Recovery API
 * Recovers stuck jobs that are claimed but not being processed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';

const jobQueue = getJobQueueService();

/**
 * POST /api/jobs/recover - Recover stuck jobs
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, stuckMinutes = 10 } = body;

    if (jobId) {
      // Recover specific job
      const job = await jobQueue.getJob(jobId);
      
      if (!job) {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }

      // Check if job is actually stuck
      if (job.status === 'processing' && !job.completed_at) {
        // Find and release the queue item for this job
        const { data: queueItems, error } = await jobQueue['supabase']
          .from('job_queue')
          .select('*')
          .eq('job_id', jobId)
          .not('worker_id', 'is', null);

        if (!error && queueItems && queueItems.length > 0) {
          for (const item of queueItems) {
            await jobQueue.releaseJobClaim(item.id, 5);
          }

          await jobQueue.addLog(
            jobId,
            'warn',
            job.current_stage,
            'Job manually recovered from stuck state',
            { recoveredBy: 'manual_recovery' }
          );

          return NextResponse.json({
            success: true,
            message: `Job ${jobId} recovered successfully`,
            jobsRecovered: 1
          });
        }
      }

      return NextResponse.json({
        success: false,
        error: 'Job is not stuck or already completed'
      });

    } else {
      // Recover all stuck jobs
      const recoveredCount = await jobQueue.recoverStuckJobs(stuckMinutes);

      return NextResponse.json({
        success: true,
        message: `Recovered ${recoveredCount} stuck jobs`,
        jobsRecovered: recoveredCount
      });
    }

  } catch (error) {
    console.error('Error recovering jobs:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to recover jobs',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/jobs/recover - Check for stuck jobs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stuckMinutes = parseInt(searchParams.get('stuckMinutes') || '10');

    const cutoffTime = new Date(Date.now() - (stuckMinutes * 60 * 1000));

    // Find potentially stuck jobs
    const { data: stuckJobs, error } = await jobQueue['supabase']
      .from('job_queue')
      .select('id, job_id, stage, worker_id, claimed_at, claim_expires_at')
      .not('worker_id', 'is', null)
      .or(`claim_expires_at.lt.${new Date().toISOString()},claimed_at.lt.${cutoffTime.toISOString()}`);

    if (error) {
      throw new Error(`Failed to find stuck jobs: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      stuckJobs: stuckJobs || [],
      count: stuckJobs?.length || 0,
      message: `Found ${stuckJobs?.length || 0} potentially stuck jobs`
    });

  } catch (error) {
    console.error('Error checking stuck jobs:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check stuck jobs',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}