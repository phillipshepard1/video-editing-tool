/**
 * Individual Job API Routes
 * Handles specific job operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';
import { getStorageManager } from '@/lib/services/storage-manager';

const jobQueue = getJobQueueService();
const storageManager = getStorageManager();

/**
 * GET /api/jobs/[jobId] - Get job details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;

    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Get additional job details
    const [chunks, logs] = await Promise.all([
      jobQueue.getVideoChunks(jobId),
      jobQueue.getJobLogs(jobId, 50),
    ]);

    // Extract download URL if job is completed
    let downloadUrl = null;
    let renderStats = null;
    
    if (job.status === 'completed' && job.result_data) {
      // Check for render_video result
      if (job.result_data.render_video) {
        downloadUrl = job.result_data.render_video.outputVideoUrl;
        renderStats = job.result_data.render_video.renderStats;
      }
      // Also check for direct outputUrl (in case of different structure)
      else if (job.result_data.outputUrl) {
        downloadUrl = job.result_data.outputUrl;
      }
    }

    return NextResponse.json({
      success: true,
      job: {
        ...job,
        downloadUrl,
        renderStats
      },
      chunks: chunks.length,
      recentLogs: logs.slice(0, 10), // Just recent logs for overview
      hasChunks: chunks.length > 0,
      isComplete: job.status === 'completed',
      isFailed: job.status === 'failed',
      canDownload: !!downloadUrl
    });

  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch job',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/jobs/[jobId] - Update job
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    const updates = await request.json();

    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Only allow certain fields to be updated
    const allowedUpdates = {
      title: updates.title,
      description: updates.description,
      priority: updates.priority,
      processing_options: updates.processing_options,
      metadata: updates.metadata,
    };

    // Remove undefined values
    Object.keys(allowedUpdates).forEach(key => {
      if (allowedUpdates[key as keyof typeof allowedUpdates] === undefined) {
        delete allowedUpdates[key as keyof typeof allowedUpdates];
      }
    });

    const updatedJob = await jobQueue.updateJob(jobId, allowedUpdates);

    return NextResponse.json({
      success: true,
      job: updatedJob,
    });

  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update job',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/[jobId] - Cancel/delete job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;

    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Cancel the job
    await jobQueue.cancelJob(jobId);

    // Clean up associated chunks
    try {
      await storageManager.deleteJobChunks(jobId);
    } catch (error) {
      console.warn('Error cleaning up chunks:', error);
      // Don't fail the whole operation
    }

    // Log cancellation
    await jobQueue.addLog(
      jobId,
      'info',
      job.current_stage,
      'Job cancelled by user',
      { previousStatus: job.status }
    );

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully',
    });

  } catch (error) {
    console.error('Error cancelling job:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to cancel job',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}