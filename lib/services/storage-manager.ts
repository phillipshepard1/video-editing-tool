/**
 * Storage Manager Service
 * Handles video chunk storage in Supabase with resumable uploads and management
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getJobQueueService, VideoChunk } from './job-queue';

export interface ChunkUploadProgress {
  chunkIndex: number;
  progress: number; // 0-100
  speed: number; // bytes per second
  uploaded: boolean;
  error?: string;
}

export interface UploadProgress {
  totalChunks: number;
  uploadedChunks: number;
  overallProgress: number; // 0-100
  chunks: ChunkUploadProgress[];
  currentSpeed: number;
  estimatedTimeRemaining: number;
}

export interface ChunkUploadOptions {
  chunkSize?: number; // MB, default 10MB
  maxConcurrentUploads?: number; // default 3
  retryAttempts?: number; // default 3
  retryDelay?: number; // seconds, default 2
}

export interface StoredChunk {
  chunkIndex: number;
  fileName: string;
  storagePath: string;
  signedUrl: string;
  size: number;
  uploaded: boolean;
}

export class StorageManager {
  private supabase: SupabaseClient;
  private jobQueueService;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase = createClient(
      supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey || serviceKey!
    );
    this.jobQueueService = getJobQueueService();
  }

  /**
   * Split file into chunks and prepare for upload
   */
  private async createChunks(
    file: File,
    chunkSize: number = 10 * 1024 * 1024 // 10MB default
  ): Promise<{ chunk: Blob; index: number; start: number; end: number }[]> {
    const chunks: { chunk: Blob; index: number; start: number; end: number }[] = [];
    const totalChunks = Math.ceil(file.size / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      chunks.push({
        chunk,
        index: i,
        start,
        end,
      });
    }

    return chunks;
  }

  /**
   * Generate storage path for chunk
   */
  private generateChunkPath(jobId: string, chunkIndex: number, fileName: string): string {
    const fileExtension = fileName.split('.').pop() || 'mp4';
    return `jobs/${jobId}/chunks/chunk_${chunkIndex.toString().padStart(3, '0')}.${fileExtension}`;
  }

  /**
   * Upload single chunk with retry logic
   */
  private async uploadChunk(
    chunk: Blob,
    storagePath: string,
    retryAttempts: number = 3,
    retryDelay: number = 2000
  ): Promise<{ success: boolean; error?: string; size: number }> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const { data, error } = await this.supabase.storage
          .from('video-chunks')
          .upload(storagePath, chunk, {
            cacheControl: '3600',
            upsert: true, // Allow overwrite for retry scenarios
          });

        if (error) {
          throw new Error(error.message);
        }

        return { success: true, size: chunk.size };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Upload failed';
        
        if (attempt < retryAttempts - 1) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
        }
      }
    }

    return { success: false, error: lastError, size: chunk.size };
  }

  /**
   * Upload video file as chunks with progress tracking
   */
  async uploadVideoChunks(
    jobId: string,
    file: File,
    options: ChunkUploadOptions = {},
    onProgress?: (progress: UploadProgress) => void
  ): Promise<StoredChunk[]> {
    const {
      chunkSize = 10 * 1024 * 1024, // 10MB
      maxConcurrentUploads = 3,
      retryAttempts = 3,
      retryDelay = 2,
    } = options;

    // Create chunks
    const chunks = await this.createChunks(file, chunkSize);
    const storedChunks: StoredChunk[] = [];
    
    // Initialize progress tracking
    const progress: UploadProgress = {
      totalChunks: chunks.length,
      uploadedChunks: 0,
      overallProgress: 0,
      chunks: chunks.map(chunk => ({
        chunkIndex: chunk.index,
        progress: 0,
        speed: 0,
        uploaded: false,
      })),
      currentSpeed: 0,
      estimatedTimeRemaining: 0,
    };

    // Track timing for speed calculation
    const startTime = Date.now();
    let totalBytesUploaded = 0;

    // Upload chunks with concurrency control
    const uploadPromises: Promise<void>[] = [];
    const semaphore = new Array(maxConcurrentUploads).fill(null);
    let chunkIndex = 0;

    const uploadNextChunk = async (): Promise<void> => {
      if (chunkIndex >= chunks.length) return;

      const currentChunkIndex = chunkIndex++;
      const currentChunk = chunks[currentChunkIndex];
      const storagePath = this.generateChunkPath(jobId, currentChunk.index, file.name);

      try {
        const chunkProgress = progress.chunks[currentChunk.index];
        chunkProgress.progress = 0;
        onProgress?.(progress);

        // Upload chunk
        const result = await this.uploadChunk(
          currentChunk.chunk,
          storagePath,
          retryAttempts,
          retryDelay * 1000
        );

        if (result.success) {
          // Generate signed URL for access
          const { data: signedUrlData } = await this.supabase.storage
            .from('video-chunks')
            .createSignedUrl(storagePath, 3600 * 24); // 24 hours

          const storedChunk: StoredChunk = {
            chunkIndex: currentChunk.index,
            fileName: `chunk_${currentChunk.index}.${file.name.split('.').pop()}`,
            storagePath,
            signedUrl: signedUrlData?.signedUrl || '',
            size: result.size,
            uploaded: true,
          };

          storedChunks[currentChunk.index] = storedChunk;

          // Update progress
          chunkProgress.uploaded = true;
          chunkProgress.progress = 100;
          progress.uploadedChunks++;
          totalBytesUploaded += result.size;

          // Calculate speed and ETA
          const elapsed = Date.now() - startTime;
          progress.currentSpeed = totalBytesUploaded / (elapsed / 1000);
          const remainingBytes = file.size - totalBytesUploaded;
          progress.estimatedTimeRemaining = remainingBytes / progress.currentSpeed;
          progress.overallProgress = Math.round((progress.uploadedChunks / progress.totalChunks) * 100);

          // Store chunk info in database
          await this.jobQueueService.addVideoChunks(jobId, [{
            chunk_index: currentChunk.index,
            chunk_name: storedChunk.fileName,
            storage_path: storagePath,
            storage_url: storedChunk.signedUrl,
            start_time: (currentChunk.start / file.size) * (file.size / 1000), // Rough estimate
            end_time: (currentChunk.end / file.size) * (file.size / 1000),
            duration: ((currentChunk.end - currentChunk.start) / file.size) * (file.size / 1000),
            file_size: result.size,
            uploaded: true,
            processed: false,
          }]);

        } else {
          chunkProgress.error = result.error;
          throw new Error(result.error || 'Upload failed');
        }

        onProgress?.(progress);
      } catch (error) {
        const chunkProgress = progress.chunks[currentChunk.index];
        chunkProgress.error = error instanceof Error ? error.message : 'Upload failed';
        onProgress?.(progress);
        throw error;
      }

      // Upload next chunk
      await uploadNextChunk();
    };

    // Start concurrent uploads
    for (let i = 0; i < Math.min(maxConcurrentUploads, chunks.length); i++) {
      uploadPromises.push(uploadNextChunk());
    }

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);

    // Ensure chunks are in correct order
    storedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return storedChunks;
  }

  /**
   * Get stored chunks for a job
   */
  async getStoredChunks(jobId: string): Promise<VideoChunk[]> {
    return await this.jobQueueService.getVideoChunks(jobId);
  }

  /**
   * Refresh signed URLs for chunks
   */
  async refreshChunkUrls(jobId: string, expirationHours: number = 24): Promise<VideoChunk[]> {
    const chunks = await this.getStoredChunks(jobId);
    const updatedChunks: VideoChunk[] = [];

    for (const chunk of chunks) {
      try {
        const { data: signedUrlData } = await this.supabase.storage
          .from('videos')  // Use 'videos' bucket consistently
          .createSignedUrl(chunk.storage_path, expirationHours * 3600);

        const updatedChunk = await this.jobQueueService.updateVideoChunk(chunk.id, {
          storage_url: signedUrlData?.signedUrl || chunk.storage_url,
        });

        updatedChunks.push(updatedChunk);
      } catch (error) {
        console.error(`Failed to refresh URL for chunk ${chunk.chunk_index}:`, error);
        updatedChunks.push(chunk);
      }
    }

    return updatedChunks;
  }

  /**
   * Delete chunks for a job
   */
  async deleteJobChunks(jobId: string): Promise<void> {
    const chunks = await this.getStoredChunks(jobId);
    
    // Delete from storage
    const pathsToDelete = chunks.map(chunk => chunk.storage_path);
    if (pathsToDelete.length > 0) {
      const { error } = await this.supabase.storage
        .from('video-chunks')
        .remove(pathsToDelete);

      if (error) {
        console.error('Failed to delete chunks from storage:', error);
      }
    }

    // Delete from database is handled by CASCADE in schema
  }

  /**
   * Resume incomplete upload
   */
  async resumeUpload(
    jobId: string,
    file: File,
    options: ChunkUploadOptions = {},
    onProgress?: (progress: UploadProgress) => void
  ): Promise<StoredChunk[]> {
    // Get existing chunks
    const existingChunks = await this.getStoredChunks(jobId);
    const uploadedChunkIndexes = new Set(
      existingChunks.filter(c => c.uploaded).map(c => c.chunk_index)
    );

    // Create all chunks
    const allChunks = await this.createChunks(file, options.chunkSize);
    
    // Filter out already uploaded chunks
    const remainingChunks = allChunks.filter(chunk => !uploadedChunkIndexes.has(chunk.index));

    if (remainingChunks.length === 0) {
      // All chunks already uploaded
      return existingChunks.map(chunk => ({
        chunkIndex: chunk.chunk_index,
        fileName: chunk.chunk_name,
        storagePath: chunk.storage_path,
        signedUrl: chunk.storage_url || '',
        size: chunk.file_size,
        uploaded: chunk.uploaded,
      }));
    }

    // Upload remaining chunks
    const tempFile = new File(
      remainingChunks.map(c => c.chunk), 
      file.name, 
      { type: file.type }
    );

    return await this.uploadVideoChunks(jobId, tempFile, options, onProgress);
  }

  /**
   * Validate chunk integrity
   */
  async validateChunks(jobId: string): Promise<{ valid: boolean; issues: string[] }> {
    const chunks = await this.getStoredChunks(jobId);
    const issues: string[] = [];

    if (chunks.length === 0) {
      issues.push('No chunks found');
      return { valid: false, issues };
    }

    // Check for missing chunks
    const maxIndex = Math.max(...chunks.map(c => c.chunk_index));
    for (let i = 0; i <= maxIndex; i++) {
      const chunk = chunks.find(c => c.chunk_index === i);
      if (!chunk) {
        issues.push(`Missing chunk ${i}`);
      } else if (!chunk.uploaded) {
        issues.push(`Chunk ${i} not uploaded`);
      }
    }

    // Check storage URLs
    const expiredUrls = chunks.filter(c => {
      if (!c.storage_url) return true;
      // Simple check - in production you might want more sophisticated validation
      return false;
    });

    if (expiredUrls.length > 0) {
      issues.push(`${expiredUrls.length} chunks have expired URLs`);
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Get total storage usage for a job
   */
  async getJobStorageUsage(jobId: string): Promise<{ totalSize: number; chunkCount: number }> {
    const chunks = await this.getStoredChunks(jobId);
    
    return {
      totalSize: chunks.reduce((total, chunk) => total + chunk.file_size, 0),
      chunkCount: chunks.length,
    };
  }

  /**
   * Clean up old/expired chunks
   */
  async cleanupExpiredChunks(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
    
    // Find chunks from old completed/failed jobs
    const { data: expiredChunks, error } = await this.supabase
      .from('video_chunks')
      .select('storage_path')
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      throw new Error(`Failed to find expired chunks: ${error.message}`);
    }

    if (!expiredChunks || expiredChunks.length === 0) {
      return 0;
    }

    // Delete from storage
    const pathsToDelete = expiredChunks.map(chunk => chunk.storage_path);
    const { error: deleteError } = await this.supabase.storage
      .from('video-chunks')
      .remove(pathsToDelete);

    if (deleteError) {
      console.error('Failed to delete expired chunks:', deleteError);
      return 0;
    }

    return pathsToDelete.length;
  }
}

// Singleton instance
let storageManagerInstance: StorageManager | null = null;

export function getStorageManager(): StorageManager {
  if (!storageManagerInstance) {
    storageManagerInstance = new StorageManager();
  }
  return storageManagerInstance;
}

export default StorageManager;