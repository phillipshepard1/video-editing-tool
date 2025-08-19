/**
 * Job Retry API
 * Handles retrying failed jobs with recovery strategies
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';
import { getErrorHandler, createErrorContext } from '@/lib/services/error-handler';

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const jobQueue = getJobQueueService();
  const errorHandler = getErrorHandler();
  
  try {
    const { jobId } = params;
    const body = await request.json();
    const { recoveryAction, parameters } = body;

    // Get current job
    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'failed' && job.status !== 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'Job is not in a retryable state' },
        { status: 400 }
      );
    }

    // Create error context for recovery
    const context = createErrorContext(
      'job_retry',
      job.current_stage,
      {
        name: job.metadata?.originalFileName || 'unknown',
        size: job.metadata?.fileSize || 0,
        format: job.metadata?.fileType || 'unknown'
      },
      job.processing_options,
      job.retry_count + 1,
      job.max_retries
    );

    // Apply recovery action
    let updatedJobOptions = { ...job.processing_options };
    let restartStage = job.current_stage;
    let recoveryMessage = 'Job queued for retry';

    switch (recoveryAction) {
      case 'retry':
        // Simple retry - keep same options
        recoveryMessage = 'Job queued for retry with same settings';
        break;

      case 'convert':
        // Apply conversion parameters
        if (parameters?.quality) {
          updatedJobOptions.quality = parameters.quality;
        }
        if (parameters?.format) {
          updatedJobOptions.targetFormat = parameters.format;
        }
        restartStage = 'upload'; // Restart from upload to apply conversion
        recoveryMessage = `Job queued for retry with conversion (${parameters?.quality || 'default'} quality)`;
        break;

      case 'chunk':
        // Apply chunking parameters
        if (parameters?.chunkSize) {
          updatedJobOptions.chunkSize = parameters.chunkSize;
          updatedJobOptions.needsChunking = true;
        }
        restartStage = 'upload'; // Restart from upload to apply chunking
        recoveryMessage = `Job queued for retry with chunking (${parameters?.chunkSize || 500}MB chunks)`;
        break;

      case 'reduce_quality':
        // Reduce quality settings
        updatedJobOptions.quality = parameters?.quality || 'low';
        if (parameters?.resolution) {
          updatedJobOptions.resolution = parameters.resolution;
        }
        restartStage = 'upload';
        recoveryMessage = `Job queued for retry with reduced quality (${updatedJobOptions.quality})`;
        break;

      case 'skip':
        // Skip problematic stage if possible
        const stageOrder: { [key: string]: string } = {
          'upload': 'split_chunks',
          'split_chunks': 'store_chunks',
          'store_chunks': 'queue_analysis',
          'queue_analysis': 'gemini_processing',
          'gemini_processing': 'assemble_timeline',
          'assemble_timeline': 'render_video'
        };
        
        const nextStage = stageOrder[job.current_stage];
        if (nextStage) {
          restartStage = nextStage as any;
          recoveryMessage = `Job queued to skip ${job.current_stage} and continue from ${nextStage}`;
        } else {
          return NextResponse.json(
            { success: false, error: 'Cannot skip this stage' },
            { status: 400 }
          );
        }
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid recovery action' },
          { status: 400 }
        );
    }

    // Update job for retry
    await jobQueue.updateJob(jobId, {
      status: 'pending',
      current_stage: restartStage,
      progress_percentage: 0,
      stage_progress: {},
      processing_options: updatedJobOptions,
      retry_count: job.retry_count + 1,
      last_error: null,
      started_at: null,
      completed_at: null
    });

    // Clear any existing queue entries for this job
    await jobQueue.cancelJob(jobId);

    // Re-queue the job at the appropriate stage
    let queuePayload: any = {};
    
    if (restartStage === 'upload') {
      // For upload restart, we need the original file data
      // This would need to be stored in the job metadata
      queuePayload = {
        videoFile: job.metadata?.originalFileData || {},
        processingOptions: updatedJobOptions
      };
    } else {
      // For other stages, use existing job data
      queuePayload = {
        ...job.result_data,
        recoveryAction,
        recoveryParameters: parameters
      };
    }

    await jobQueue.enqueueJob(jobId, restartStage, queuePayload, job.priority);

    // Log recovery attempt
    await jobQueue.addLog(
      jobId,
      'info',
      restartStage,
      `Job retry initiated: ${recoveryAction}`,
      {
        recoveryAction,
        parameters,
        previousAttempts: job.retry_count,
        restartStage,
        updatedOptions: updatedJobOptions
      }
    );

    return NextResponse.json({
      success: true,
      message: recoveryMessage,
      job: {
        id: jobId,
        status: 'pending',
        current_stage: restartStage,
        retry_count: job.retry_count + 1,
        processing_options: updatedJobOptions
      },
      recoveryAction,
      parameters
    });

  } catch (error) {
    console.error('Job retry error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to retry job',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const jobQueue = getJobQueueService();
  const errorHandler = getErrorHandler();
  
  try {
    const { jobId } = params;

    // Get current job
    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Get recent error logs for this job
    const logs = await jobQueue.getJobLogs(jobId, 50);
    const errorLogs = logs.filter(log => log.level === 'error');

    // Generate recovery suggestions based on the last error
    let recoverySuggestions = [];
    
    if (job.last_error && job.status === 'failed') {
      const context = createErrorContext(
        'job_analysis',
        job.current_stage,
        {
          name: job.metadata?.originalFileName || 'unknown',
          size: job.metadata?.fileSize || 0,
          format: job.metadata?.fileType || 'unknown'
        },
        job.processing_options,
        job.retry_count,
        job.max_retries
      );

      const processedError = errorHandler.handleError(new Error(job.last_error), context);
      recoverySuggestions = processedError.recoveryActions;
    }

    return NextResponse.json({
      success: true,
      job: {
        id: jobId,
        status: job.status,
        current_stage: job.current_stage,
        retry_count: job.retry_count,
        max_retries: job.max_retries,
        last_error: job.last_error,
        canRetry: job.retry_count < job.max_retries && (job.status === 'failed' || job.status === 'cancelled')
      },
      recoverySuggestions,
      recentErrors: errorLogs.slice(0, 5),
      errorStats: errorHandler.getErrorStats()
    });

  } catch (error) {
    console.error('Error getting retry info:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get retry information',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}