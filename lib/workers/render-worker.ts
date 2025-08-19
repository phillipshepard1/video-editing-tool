/**
 * Render Worker
 * Handles video rendering using the Chillin API
 */

import { BaseWorker, WorkerOptions } from './base-worker';
import { ClaimedJob } from '../services/job-queue';
import { ProcessedTimeline } from './assembly-worker';

export interface RenderJobPayload {
  timeline: ProcessedTimeline;
  renderInstructions: {
    cuts: Array<{
      startTime: number;
      endTime: number;
    }>;
    keeps: Array<{
      startTime: number;
      endTime: number;
    }>;
  };
  renderOptions?: {
    quality?: 'low' | 'medium' | 'high' | 'ultra' | 'lossless';
    resolution?: {
      width: number;
      height: number;
    };
    fps?: number;
    format?: string;
  };
}

export class RenderWorker extends BaseWorker {
  constructor(workerId: string, options: Partial<WorkerOptions> = {}) {
    super({
      workerId,
      stage: 'render_video',
      concurrency: 1, // One render job at a time due to API limits
      claimDuration: 120, // 2 hours for long render jobs
      ...options,
    });
  }

  async processJob(job: ClaimedJob): Promise<any> {
    const payload = job.payload as RenderJobPayload;
    
    if (!payload.timeline || !payload.renderInstructions) {
      throw new Error('No timeline or render instructions provided');
    }

    // Log start
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'render_video',
      'Starting video rendering with Chillin API',
      { 
        segmentsToRemove: payload.timeline.segmentsToRemove.length,
        timeReduction: payload.timeline.summary.timeReduction,
        reductionPercentage: payload.timeline.summary.reductionPercentage
      },
      this.options.workerId
    );

    // Update job progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 10,
      stage_progress: { 
        render_video: { 
          stage: 'preparing', 
          progress: 10,
          message: 'Preparing video for rendering...'
        } 
      }
    });

    // Step 1: Get the original video file(s) from storage
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 20,
      stage_progress: { 
        render_video: { 
          stage: 'retrieving', 
          progress: 20,
          message: 'Retrieving original video files...'
        } 
      }
    });

    const videoChunks = await this.storageManager.getStoredChunks(job.job_id);
    if (videoChunks.length === 0) {
      throw new Error('No video chunks found for rendering');
    }

    // Step 2: Create Chillin render job
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 30,
      stage_progress: { 
        render_video: { 
          stage: 'submitting', 
          progress: 30,
          message: 'Submitting render job to Chillin API...'
        } 
      }
    });

    const chillinJob = await this.createChillinRenderJob(job.job_id, videoChunks, payload);

    // Step 3: Monitor render progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 40,
      stage_progress: { 
        render_video: { 
          stage: 'rendering', 
          progress: 40,
          message: 'Video rendering in progress...',
          chillinJobId: chillinJob.id
        } 
      }
    });

    const renderResult = await this.monitorChillinRender(job.job_id, chillinJob.id);

    // Step 4: Complete the job
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 100,
      result_data: {
        render_video: {
          success: true,
          chillinJobId: chillinJob.id,
          outputVideoUrl: renderResult.outputVideoUrl,
          renderStats: renderResult.stats,
          timeline: payload.timeline.summary
        }
      }
    });

    // Log completion
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'render_video',
      'Video rendering completed successfully',
      { 
        chillinJobId: chillinJob.id,
        outputVideoUrl: renderResult.outputVideoUrl,
        renderDuration: renderResult.stats.renderDuration,
        finalDuration: payload.timeline.summary.finalDuration
      },
      this.options.workerId
    );

    // Update job status to completed
    await this.jobQueue.updateJob(job.job_id, {
      status: 'completed',
      progress_percentage: 100,
      completed_at: new Date().toISOString()
    });

    return {
      success: true,
      chillinJobId: chillinJob.id,
      outputVideoUrl: renderResult.outputVideoUrl,
      renderStats: renderResult.stats
    };
  }

  private async createChillinRenderJob(jobId: string, videoChunks: any[], payload: RenderJobPayload): Promise<{ id: string; status: string }> {
    try {
      // Get the job to retrieve the original video URL
      const job = await this.jobQueue.getJob(jobId);
      
      // Try to get the original video URL from job metadata first
      let sourceVideoUrl = job?.metadata?.videoUrl;
      
      // Fall back to chunk URL if no original video URL
      if (!sourceVideoUrl && videoChunks.length > 0) {
        sourceVideoUrl = videoChunks[0]?.storage_url;
      }
      
      if (!sourceVideoUrl) {
        throw new Error('No source video URL found');
      }

      // Prepare render options
      const renderOptions = {
        quality: payload.renderOptions?.quality || 'high',
        resolution_width: payload.renderOptions?.resolution?.width || 1920,
        resolution_height: payload.renderOptions?.resolution?.height || 1080,
        fps: payload.renderOptions?.fps || 30,
        ...payload.renderOptions
      };

      // Convert timeline to Chillin format
      const segmentsToRemove = payload.timeline.segmentsToRemove.map(segment => ({
        start: segment.startTime,
        end: segment.endTime,
        reason: segment.reason || 'automatic'
      }));

      // Create Chillin render job using v1 endpoint
      const response = await fetch(`${process.env.CHILLIN_API_URL}/render/v1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CHILLIN_API_KEY}`
        },
        body: JSON.stringify({
          source_video_url: sourceVideoUrl,
          segments_to_remove: segmentsToRemove,
          segments_to_keep: payload.renderInstructions.keeps,
          quality: renderOptions.quality,
          resolution_width: renderOptions.resolution_width,
          resolution_height: renderOptions.resolution_height,
          fps: renderOptions.fps,
          total_duration_seconds: payload.timeline.summary.originalDuration,
          final_duration_seconds: payload.timeline.summary.finalDuration,
          metadata: {
            job_id: jobId,
            segments_count: segmentsToRemove.length,
            time_reduction: payload.timeline.summary.timeReduction
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chillin API error: ${response.status} - ${errorText}`);
      }

      const chillinJob = await response.json();

      // Store render job info in database
      await this.jobQueue.addLog(
        jobId,
        'info',
        'render_video',
        `Chillin render job created: ${chillinJob.render_id}`,
        { 
          chillinJobId: chillinJob.render_id,
          status: chillinJob.status,
          estimatedDuration: chillinJob.estimated_completion_time
        },
        this.options.workerId
      );

      return {
        id: chillinJob.render_id,
        status: chillinJob.status
      };

    } catch (error) {
      await this.jobQueue.addLog(
        jobId,
        'error',
        'render_video',
        `Failed to create Chillin render job: ${error instanceof Error ? error.message : String(error)}`,
        { error: String(error) },
        this.options.workerId
      );
      throw error;
    }
  }

  private async monitorChillinRender(jobId: string, chillinJobId: string): Promise<{
    outputVideoUrl: string;
    stats: {
      renderDuration: number;
      fileSize: number;
      startTime: string;
      completionTime: string;
    };
  }> {
    const maxAttempts = 360; // 3 hours (30 second intervals)
    let attempts = 0;
    let lastProgress = 0;

    while (attempts < maxAttempts) {
      try {
        // Check render status
        // Use the result endpoint to check status
        const response = await fetch(`${process.env.CHILLIN_API_URL}/render/result`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.CHILLIN_API_KEY}`
          },
          body: JSON.stringify({ render_id: chillinJobId })
        });

        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }

        const status = await response.json();

        // Update progress if it changed
        if (status.progress !== lastProgress) {
          lastProgress = status.progress || 0;
          const overallProgress = Math.max(40, Math.min(95, 40 + (lastProgress * 0.55))); // 40-95%

          await this.jobQueue.updateJob(jobId, {
            progress_percentage: Math.round(overallProgress),
            stage_progress: { 
              render_video: { 
                stage: 'rendering', 
                progress: Math.round(overallProgress),
                message: `Rendering... ${lastProgress}%`,
                chillinProgress: lastProgress,
                estimatedTimeRemaining: status.estimated_time_remaining
              } 
            }
          });

          await this.jobQueue.addLog(
            jobId,
            'info',
            'render_video',
            `Render progress: ${lastProgress}%`,
            { 
              chillinJobId,
              progress: lastProgress,
              estimatedTimeRemaining: status.estimated_time_remaining
            },
            this.options.workerId
          );
        }

        // Check if completed
        if (status.status === 'completed') {
          return {
            outputVideoUrl: status.output_video_url,
            stats: {
              renderDuration: status.render_duration_seconds || 0,
              fileSize: status.output_file_size || 0,
              startTime: status.started_at,
              completionTime: status.completed_at
            }
          };
        }

        // Check if failed
        if (status.status === 'failed') {
          throw new Error(`Chillin render failed: ${status.error_message || 'Unknown error'}`);
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
        attempts++;

      } catch (error) {
        await this.jobQueue.addLog(
          jobId,
          'warn',
          'render_video',
          `Error checking render status (attempt ${attempts + 1}): ${error instanceof Error ? error.message : String(error)}`,
          { chillinJobId, attempt: attempts + 1 },
          this.options.workerId
        );

        // If we've tried many times, fail
        if (attempts > 10) {
          throw new Error(`Render monitoring failed after ${attempts} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute
        attempts++;
      }
    }

    throw new Error(`Render timeout after ${maxAttempts} attempts (${maxAttempts * 30 / 60} minutes)`);
  }
}

export default RenderWorker;