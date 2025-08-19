/**
 * Chunk Worker
 * Handles splitting of large videos into smaller chunks for processing
 */

import { BaseWorker, WorkerOptions } from './base-worker';
import { ClaimedJob } from '../services/job-queue';
import { getVideoProcessor } from '../services/video-processor';

export interface ChunkJobPayload {
  chunks: Array<{
    index: number;
    startTime: number;
    endTime: number;
    duration: number;
    size: number;
    fileData: {
      name: string;
      size: number;
      type: string;
      arrayBuffer: ArrayBuffer;
    };
  }>;
  originalFile: {
    name: string;
    size: number;
    type: string;
  };
}

export class ChunkWorker extends BaseWorker {
  constructor(workerId: string, options: Partial<WorkerOptions> = {}) {
    super({
      workerId,
      stage: 'split_chunks',
      concurrency: 1, // Process one chunking job at a time (CPU intensive)
      ...options,
    });
  }

  async processJob(job: ClaimedJob): Promise<any> {
    const payload = job.payload as ChunkJobPayload;
    
    if (!payload.chunks || payload.chunks.length === 0) {
      throw new Error('No chunks provided in job payload');
    }

    // Log start
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'split_chunks',
      `Processing ${payload.chunks.length} video chunks`,
      { 
        originalFileName: payload.originalFile.name,
        chunkCount: payload.chunks.length,
        totalSize: payload.originalFile.size
      },
      this.options.workerId
    );

    // Update job progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 10,
      stage_progress: { 
        split_chunks: { 
          stage: 'preparing', 
          progress: 10,
          message: `Processing ${payload.chunks.length} chunks...`,
          totalChunks: payload.chunks.length
        } 
      }
    });

    // Process chunks and prepare them for storage
    const processedChunks = [];
    
    for (let i = 0; i < payload.chunks.length; i++) {
      const chunk = payload.chunks[i];
      
      // Update progress
      const chunkProgress = 10 + Math.round((i / payload.chunks.length) * 80);
      await this.jobQueue.updateJob(job.job_id, {
        progress_percentage: chunkProgress,
        stage_progress: { 
          split_chunks: { 
            stage: 'processing', 
            progress: chunkProgress,
            message: `Processing chunk ${i + 1} of ${payload.chunks.length}`,
            currentChunk: i + 1,
            totalChunks: payload.chunks.length
          } 
        }
      });

      // Log chunk processing
      await this.jobQueue.addLog(
        job.job_id,
        'info',
        'split_chunks',
        `Processing chunk ${i + 1}/${payload.chunks.length}: ${chunk.startTime}s - ${chunk.endTime}s`,
        { 
          chunkIndex: chunk.index,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          duration: chunk.duration,
          size: chunk.size
        },
        this.options.workerId
      );

      // Convert ArrayBuffer back to File for processing
      const chunkFile = new File(
        [chunk.fileData.arrayBuffer],
        chunk.fileData.name,
        { type: chunk.fileData.type }
      );

      // Store chunk info for next stage
      processedChunks.push({
        index: chunk.index,
        name: chunkFile.name,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        duration: chunk.duration,
        size: chunkFile.size,
        // Convert back to transferable format
        fileData: {
          name: chunkFile.name,
          size: chunkFile.size,
          type: chunkFile.type,
          arrayBuffer: chunk.fileData.arrayBuffer // Pass through the existing ArrayBuffer
        }
      });
    }

    // Log completion
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'split_chunks',
      `Chunk processing completed successfully`,
      {
        processedChunks: processedChunks.length,
        totalSize: processedChunks.reduce((sum, chunk) => sum + chunk.size, 0)
      },
      this.options.workerId
    );

    // Queue for chunk storage
    await this.jobQueue.enqueueJob(job.job_id, 'store_chunks', {
      chunks: processedChunks,
      originalFile: payload.originalFile,
      processingComplete: true
    });

    // Complete split stage
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 100,
      current_stage: 'store_chunks',
      result_data: {
        split_chunks: {
          success: true,
          chunkCount: processedChunks.length,
          totalSize: processedChunks.reduce((sum, chunk) => sum + chunk.size, 0),
          avgChunkSize: processedChunks.reduce((sum, chunk) => sum + chunk.size, 0) / processedChunks.length
        }
      }
    });

    return {
      success: true,
      processedChunks: processedChunks.length,
      nextStage: 'store_chunks'
    };
  }
}

export default ChunkWorker;