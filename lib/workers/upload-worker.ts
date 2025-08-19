/**
 * Upload Worker
 * Handles video upload and initial processing
 */

import { BaseWorker, WorkerOptions } from './base-worker';
import { ClaimedJob } from '../services/job-queue';
import { getVideoProcessor } from '../services/video-processor';

export interface UploadJobPayload {
  videoFile: {
    name: string;
    size: number;
    type: string;
    arrayBuffer: ArrayBuffer;
  };
  processingOptions?: {
    quality?: 'low' | 'medium' | 'high' | 'lossless';
    maxSizeBytes?: number;
    chunkSize?: number;
  };
}

export class UploadWorker extends BaseWorker {
  constructor(workerId: string, options: Partial<WorkerOptions> = {}) {
    super({
      workerId,
      stage: 'upload',
      concurrency: 2, // Can handle 2 uploads at once
      ...options,
    });
  }

  async processJob(job: ClaimedJob): Promise<any> {
    const payload = job.payload as UploadJobPayload;
    
    if (!payload.videoFile) {
      throw new Error('No video file provided in job payload');
    }

    // Log start
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'upload',
      `Starting video upload processing for ${payload.videoFile.name}`,
      { fileSize: payload.videoFile.size, fileType: payload.videoFile.type },
      this.options.workerId
    );

    // Update job progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 10,
      stage_progress: { upload: { stage: 'validation', progress: 10 } }
    });

    // Convert ArrayBuffer back to File
    const file = new File(
      [payload.videoFile.arrayBuffer],
      payload.videoFile.name,
      { type: payload.videoFile.type }
    );

    // Initialize video processor
    const processor = getVideoProcessor();
    
    // Set up progress callback
    processor.setProgressCallback((progress) => {
      let overallProgress = 10; // Base progress
      
      switch (progress.stage) {
        case 'validation':
          overallProgress = 10 + (progress.progress * 0.1);
          break;
        case 'conversion':
          overallProgress = 20 + (progress.progress * 0.3);
          break;
        case 'chunking':
          overallProgress = 50 + (progress.progress * 0.4);
          break;
        case 'complete':
          overallProgress = 90;
          break;
      }

      // Update job progress (fire-and-forget)
      this.jobQueue.updateJob(job.job_id, {
        progress_percentage: Math.round(overallProgress),
        stage_progress: {
          upload: {
            stage: progress.stage,
            progress: Math.round(overallProgress),
            message: progress.message,
            chunkIndex: progress.chunkIndex,
            totalChunks: progress.totalChunks
          }
        }
      }).catch(err => console.error('Failed to update progress:', err));
    });

    // Process the video
    const processingResult = await processor.processVideo(file, payload.processingOptions || {});

    if (!processingResult.success) {
      throw new Error(processingResult.error || 'Video processing failed');
    }

    // Log processing completion
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'upload',
      'Video processing completed successfully',
      {
        originalFormat: processingResult.originalFormat,
        targetFormat: processingResult.targetFormat,
        totalSize: processingResult.totalSize,
        geminiCompatible: processingResult.geminiCompatible,
        chunks: processingResult.chunks?.length || 0
      },
      this.options.workerId
    );

    // Update job with processing results
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 90,
      result_data: {
        upload: {
          success: true,
          originalFormat: processingResult.originalFormat,
          targetFormat: processingResult.targetFormat,
          totalSize: processingResult.totalSize,
          geminiCompatible: processingResult.geminiCompatible,
          hasChunks: !!processingResult.chunks,
          chunkCount: processingResult.chunks?.length || 0
        }
      }
    });

    // If video was chunked, queue for chunk storage
    if (processingResult.chunks && processingResult.chunks.length > 0) {
      // Process chunks with arrayBuffer conversion
      const processedChunks = await Promise.all(
        processingResult.chunks.map(async chunk => ({
          index: chunk.index,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          duration: chunk.duration,
          size: chunk.size,
          // Convert File to transferable format
          fileData: {
            name: chunk.file.name,
            size: chunk.file.size,
            type: chunk.file.type,
            arrayBuffer: await chunk.file.arrayBuffer()
          }
        }))
      );
      
      // Queue next stage: split_chunks
      await this.jobQueue.enqueueJob(job.job_id, 'split_chunks', {
        chunks: processedChunks,
        originalFile: {
          name: file.name,
          size: file.size,
          type: file.type
        }
      });
    } else {
      // Single file - queue for direct storage
      const fileToProcess = processingResult.convertedFile || file;
      const fileArrayBuffer = await fileToProcess.arrayBuffer();
      
      await this.jobQueue.enqueueJob(job.job_id, 'store_chunks', {
        singleFile: {
          name: fileToProcess.name,
          size: fileToProcess.size,
          type: fileToProcess.type,
          arrayBuffer: fileArrayBuffer
        }
      });
    }

    // Complete upload stage
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 100,
      current_stage: processingResult.chunks ? 'split_chunks' : 'store_chunks'
    });

    return {
      success: true,
      processingResult,
      nextStage: processingResult.chunks ? 'split_chunks' : 'store_chunks'
    };
  }
}

export default UploadWorker;