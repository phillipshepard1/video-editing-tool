/**
 * Queue Analysis Worker
 * Simple passthrough worker that queues jobs for Gemini processing
 */

import { BaseWorker, WorkerOptions } from './base-worker';
import { ClaimedJob } from '../services/job-queue';

export class QueueAnalysisWorker extends BaseWorker {
  constructor(workerId: string, options: Partial<WorkerOptions> = {}) {
    super({
      workerId,
      stage: 'queue_analysis',
      concurrency: 5, // Can handle multiple queue operations
      ...options,
    });
  }

  async processJob(job: ClaimedJob): Promise<any> {
    const payload = job.payload;
    
    // Log start
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'queue_analysis',
      'Preparing job for analysis',
      { 
        chunksStored: payload.chunksStored,
        processWholeVideo: payload.processWholeVideo
      },
      this.options.workerId
    );

    // Check if this is a fast processing job (whole video)
    if (payload.processWholeVideo) {
      // Use fast analysis worker
      await this.jobQueue.addLog(
        job.job_id,
        'info',
        'queue_analysis',
        'Routing to FAST analysis (whole video processing)',
        {},
        this.options.workerId
      );
    } else {
      // Use traditional chunk-based analysis
      await this.jobQueue.addLog(
        job.job_id,
        'info',
        'queue_analysis',
        'Routing to chunk-based analysis',
        { chunks: payload.chunksStored },
        this.options.workerId
      );
    }

    // Queue for Gemini processing
    await this.jobQueue.enqueueJob(
      job.job_id,
      'gemini_processing',
      {
        ...payload,
        queuedAt: new Date().toISOString()
      }
    );

    // Update job status
    await this.jobQueue.updateJob(job.job_id, {
      current_stage: 'gemini_processing',
      progress_percentage: 10
    });

    return {
      success: true,
      nextStage: 'gemini_processing',
      processWholeVideo: payload.processWholeVideo
    };
  }
}

export default QueueAnalysisWorker;