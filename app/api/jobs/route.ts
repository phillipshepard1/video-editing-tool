/**
 * Jobs API Routes
 * Handles job creation, listing, and management
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';
import { getWorkerManager } from '@/lib/workers/worker-manager';

const jobQueue = getJobQueueService();

/**
 * GET /api/jobs - List jobs for user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');

    let jobs = await jobQueue.getUserJobs(userId || undefined, limit);

    // Filter by status if requested
    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }

    return NextResponse.json({
      success: true,
      jobs,
      count: jobs.length,
    });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch jobs',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs - Create new job
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      userId,
      priority = 'normal',
      processingOptions = {},
      metadata = {},
      videoFile,
    } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      );
    }

    if (!videoFile) {
      return NextResponse.json(
        { success: false, error: 'Video file data is required' },
        { status: 400 }
      );
    }

    // Create the job
    const job = await jobQueue.createJob({
      title,
      description,
      user_id: userId,
      priority,
      processing_options: processingOptions,
      metadata: {
        ...metadata,
        originalFileName: videoFile.name,
        fileSize: videoFile.size,
        fileType: videoFile.type,
      },
    });

    // Enqueue for upload processing
    await jobQueue.enqueueJob(job.id, 'upload', {
      videoFile: {
        name: videoFile.name,
        size: videoFile.size,
        type: videoFile.type,
        arrayBuffer: videoFile.arrayBuffer, // This should be the actual buffer
      },
      processingOptions,
    }, priority);

    // Log job creation
    await jobQueue.addLog(
      job.id,
      'info',
      'upload',
      'Job created and queued for processing',
      {
        title,
        fileSize: videoFile.size,
        priority,
      }
    );

    return NextResponse.json({
      success: true,
      job,
      message: 'Job created and queued for processing',
    });

  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create job',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs - Cleanup old jobs
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysOld = parseInt(searchParams.get('daysOld') || '7');

    const deletedCount = await jobQueue.cleanupOldJobs(daysOld);

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Cleaned up ${deletedCount} old jobs`,
    });

  } catch (error) {
    console.error('Error cleaning up jobs:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to cleanup jobs',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}