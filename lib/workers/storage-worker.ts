/**
 * Storage Worker
 * Handles storing video chunks in Supabase storage
 */

import { BaseWorker, WorkerOptions } from './base-worker';
import { ClaimedJob } from '../services/job-queue';

export interface StorageJobPayload {
  chunks?: Array<{
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
  singleFile?: {
    name: string;
    size: number;
    type: string;
    arrayBuffer: ArrayBuffer;
  };
}

export class StorageWorker extends BaseWorker {
  constructor(workerId: string, options: Partial<WorkerOptions> = {}) {
    super({
      workerId,
      stage: 'store_chunks',
      concurrency: 3, // Can handle multiple storage operations
      ...options,
    });
  }

  async processJob(job: ClaimedJob): Promise<any> {
    const payload = job.payload as StorageJobPayload;
    
    if (!payload.chunks && !payload.singleFile) {
      throw new Error('No chunks or single file provided in job payload');
    }

    // Log start
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'store_chunks',
      payload.chunks ? 
        `Starting storage of ${payload.chunks.length} video chunks` :
        'Starting storage of single video file',
      { 
        chunkCount: payload.chunks?.length || 1,
        totalSize: payload.chunks?.reduce((sum, c) => sum + c.size, 0) || payload.singleFile?.size || 0
      },
      this.options.workerId
    );

    // Update job progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 10,
      stage_progress: { 
        store_chunks: { 
          stage: 'preparing', 
          progress: 10,
          message: 'Preparing for storage...'
        } 
      }
    });

    let storedChunks;

    if (payload.chunks) {
      // Handle multiple chunks
      storedChunks = await this.storeVideoChunks(job.job_id, payload.chunks);
    } else if (payload.singleFile) {
      // Handle single file
      storedChunks = await this.storeSingleFile(job.job_id, payload.singleFile);
    }

    // Log completion
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'store_chunks',
      'Video storage completed successfully',
      { 
        storedChunks: storedChunks?.length || 0,
        totalSize: storedChunks?.reduce((sum, c) => sum + c.size, 0) || 0
      },
      this.options.workerId
    );

    // Update job with storage results
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 100,
      result_data: {
        store_chunks: {
          success: true,
          storedChunks: storedChunks?.length || 0,
          totalSize: storedChunks?.reduce((sum, c) => sum + c.size, 0) || 0
        }
      }
    });

    // Queue for analysis
    await this.jobQueue.enqueueJob(job.job_id, 'queue_analysis', {
      chunksStored: storedChunks?.length || 0,
      readyForAnalysis: true
    });

    // Complete storage stage
    await this.jobQueue.updateJob(job.job_id, {
      current_stage: 'queue_analysis'
    });

    return {
      success: true,
      storedChunks: storedChunks?.length || 0,
      nextStage: 'queue_analysis'
    };
  }

  private async storeVideoChunks(jobId: string, chunks: StorageJobPayload['chunks']): Promise<any[]> {
    if (!chunks) return [];

    const results = [];
    let completedChunks = 0;

    // Set up progress tracking
    const updateProgress = async (completed: number, total: number) => {
      const progress = Math.round((completed / total) * 80) + 10; // 10-90%
      await this.jobQueue.updateJob(jobId, {
        progress_percentage: progress,
        stage_progress: {
          store_chunks: {
            stage: 'uploading',
            progress,
            message: `Uploaded ${completed}/${total} chunks`,
            completed,
            total
          }
        }
      }).catch(err => console.error('Failed to update progress:', err));
    };

    // Convert chunks back to Files and upload
    for (const chunk of chunks) {
      try {
        // Convert ArrayBuffer back to File
        const file = new File(
          [chunk.fileData.arrayBuffer],
          chunk.fileData.name,
          { type: chunk.fileData.type }
        );

        // Upload with progress tracking
        const storedChunks = await this.storageManager.uploadVideoChunks(
          jobId,
          file,
          {
            chunkSize: 10 * 1024 * 1024, // 10MB chunks
            maxConcurrentUploads: 2,
          },
          (progress) => {
            // This progress is for the current chunk
            const overallProgress = Math.round(
              ((completedChunks + (progress.overallProgress / 100)) / chunks.length) * 80
            ) + 10;
            
            this.jobQueue.updateJob(jobId, {
              progress_percentage: overallProgress,
              stage_progress: {
                store_chunks: {
                  stage: 'uploading',
                  progress: overallProgress,
                  message: `Uploading chunk ${chunk.index + 1}/${chunks.length}`,
                  chunkProgress: progress
                }
              }
            }).catch(err => console.error('Failed to update progress:', err));
          }
        );

        results.push(...storedChunks);
        completedChunks++;
        
        await updateProgress(completedChunks, chunks.length);

        await this.jobQueue.addLog(
          jobId,
          'info',
          'store_chunks',
          `Chunk ${chunk.index} stored successfully`,
          { chunkIndex: chunk.index, chunkSize: chunk.size },
          this.options.workerId
        );

      } catch (error) {
        await this.jobQueue.addLog(
          jobId,
          'error',
          'store_chunks',
          `Failed to store chunk ${chunk.index}: ${error instanceof Error ? error.message : String(error)}`,
          { chunkIndex: chunk.index, error: String(error) },
          this.options.workerId
        );
        throw error;
      }
    }

    return results;
  }

  private async storeSingleFile(jobId: string, fileData: StorageJobPayload['singleFile']): Promise<any[]> {
    if (!fileData) return [];

    // Convert ArrayBuffer back to File
    const file = new File(
      [fileData.arrayBuffer],
      fileData.name,
      { type: fileData.type }
    );

    // Upload as single chunk with progress tracking
    const storedChunks = await this.storageManager.uploadVideoChunks(
      jobId,
      file,
      {
        chunkSize: Math.max(file.size, 10 * 1024 * 1024), // Use file size or minimum 10MB
        maxConcurrentUploads: 1,
      },
      (progress) => {
        const overallProgress = Math.round(progress.overallProgress * 0.8) + 10; // 10-90%
        
        this.jobQueue.updateJob(jobId, {
          progress_percentage: overallProgress,
          stage_progress: {
            store_chunks: {
              stage: 'uploading',
              progress: overallProgress,
              message: `Uploading video file...`,
              uploadProgress: progress
            }
          }
        }).catch(err => console.error('Failed to update progress:', err));
      }
    );

    await this.jobQueue.addLog(
      jobId,
      'info',
      'store_chunks',
      'Single video file stored successfully',
      { fileName: fileData.name, fileSize: fileData.size },
      this.options.workerId
    );

    return storedChunks;
  }
}

export default StorageWorker;