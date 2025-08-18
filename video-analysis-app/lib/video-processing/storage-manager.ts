/**
 * IndexedDB Storage Manager for Video Processing
 * Handles persistent storage of jobs, progress, and processed videos
 */

import { openDB, deleteDB, DBSchema, IDBPDatabase } from 'idb';
import { VideoProcessingJob } from './core-engine';

interface VideoStorageSchema extends DBSchema {
  jobs: {
    key: string;
    value: {
      id: string;
      inputFileData: ArrayBuffer;
      inputFileName: string;
      inputFileType: string;
      options: any;
      status: string;
      progress: number;
      startTime?: number;
      endTime?: number;
      error?: string;
      chunks?: any[];
      memoryUsage?: number;
      metadata?: any;
    };
  };
  processedVideos: {
    key: string;
    value: {
      jobId: string;
      videoData: ArrayBuffer;
      fileName: string;
      fileType: string;
      size: number;
      timestamp: number;
      metadata?: any;
    };
  };
  cache: {
    key: string;
    value: {
      key: string;
      data: ArrayBuffer;
      timestamp: number;
      size: number;
      type: string;
    };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: any;
      timestamp: number;
    };
  };
}

export interface StorageStats {
  totalJobs: number;
  totalProcessedVideos: number;
  totalCacheEntries: number;
  totalStorageUsed: number; // in bytes
  availableStorage: number; // in bytes
  quotaUsed: number; // percentage 0-100
}

export class VideoStorage {
  private db: IDBPDatabase<VideoStorageSchema> | null = null;
  private readonly dbName = 'VideoProcessingStorage';
  private readonly dbVersion = 1;
  private readonly maxStorageUsage = 0.8; // Use max 80% of available storage
  
  /**
   * Initialize the storage system
   */
  async initialize(): Promise<void> {
    try {
      this.db = await openDB<VideoStorageSchema>(this.dbName, this.dbVersion, {
        upgrade(db) {
          // Jobs store
          if (!db.objectStoreNames.contains('jobs')) {
            const jobsStore = db.createObjectStore('jobs', { keyPath: 'id' });
            jobsStore.createIndex('status', 'status');
            jobsStore.createIndex('timestamp', 'startTime');
          }
          
          // Processed videos store
          if (!db.objectStoreNames.contains('processedVideos')) {
            const videosStore = db.createObjectStore('processedVideos', { keyPath: 'jobId' });
            videosStore.createIndex('timestamp', 'timestamp');
            videosStore.createIndex('size', 'size');
          }
          
          // Cache store for temporary data
          if (!db.objectStoreNames.contains('cache')) {
            const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
            cacheStore.createIndex('timestamp', 'timestamp');
            cacheStore.createIndex('size', 'size');
          }
          
          // Settings store
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        },
      });
      
      console.log('Video storage initialized successfully');
      
      // Check storage quota and clean up if necessary
      await this.checkStorageQuota();
      
    } catch (error) {
      throw new Error(`Failed to initialize storage: ${error}`);
    }
  }
  
  /**
   * Save job state to storage
   */
  async saveJobState(job: VideoProcessingJob): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      // Convert File to ArrayBuffer for storage
      const inputFileData = await job.inputFile.arrayBuffer();
      
      const storageJob = {
        id: job.id,
        inputFileData,
        inputFileName: job.inputFile.name,
        inputFileType: job.inputFile.type,
        options: job.options,
        status: job.status,
        progress: job.progress,
        startTime: job.startTime,
        endTime: job.endTime,
        error: job.error,
        chunks: job.chunks,
        memoryUsage: job.memoryUsage,
        metadata: {
          originalSize: job.inputFile.size,
          lastModified: job.inputFile.lastModified,
        },
      };
      
      await this.db.put('jobs', storageJob);
      
    } catch (error) {
      console.error('Failed to save job state:', error);
      throw error;
    }
  }
  
  /**
   * Load job state from storage
   */
  async loadJobState(jobId: string): Promise<VideoProcessingJob | null> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      const storageJob = await this.db.get('jobs', jobId);
      if (!storageJob) return null;
      
      // Reconstruct File object
      const inputFile = new File(
        [storageJob.inputFileData],
        storageJob.inputFileName,
        { type: storageJob.inputFileType }
      );
      
      return {
        id: storageJob.id,
        inputFile,
        options: storageJob.options,
        status: storageJob.status as any,
        progress: storageJob.progress,
        startTime: storageJob.startTime,
        endTime: storageJob.endTime,
        error: storageJob.error,
        chunks: storageJob.chunks,
        memoryUsage: storageJob.memoryUsage,
      };
      
    } catch (error) {
      console.error('Failed to load job state:', error);
      return null;
    }
  }
  
  /**
   * Get all jobs from storage
   */
  async getAllJobs(): Promise<VideoProcessingJob[]> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      const storageJobs = await this.db.getAll('jobs');
      const jobs: VideoProcessingJob[] = [];
      
      for (const storageJob of storageJobs) {
        const inputFile = new File(
          [storageJob.inputFileData],
          storageJob.inputFileName,
          { type: storageJob.inputFileType }
        );
        
        jobs.push({
          id: storageJob.id,
          inputFile,
          options: storageJob.options,
          status: storageJob.status as any,
          progress: storageJob.progress,
          startTime: storageJob.startTime,
          endTime: storageJob.endTime,
          error: storageJob.error,
          chunks: storageJob.chunks,
          memoryUsage: storageJob.memoryUsage,
        });
      }
      
      return jobs;
      
    } catch (error) {
      console.error('Failed to get all jobs:', error);
      return [];
    }
  }
  
  /**
   * Delete job from storage
   */
  async deleteJob(jobId: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      // Delete job and associated processed video
      await Promise.all([
        this.db.delete('jobs', jobId),
        this.db.delete('processedVideos', jobId),
      ]);
      
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  }
  
  /**
   * Save processed video to storage
   */
  async saveProcessedVideo(jobId: string, videoFile: File): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      // Check if we have enough storage space
      const stats = await this.getStorageStats();
      const videoSize = videoFile.size;
      
      if (stats.quotaUsed > this.maxStorageUsage * 100) {
        console.warn('Storage quota exceeded, cleaning up old files');
        await this.cleanupOldFiles();
      }
      
      const videoData = await videoFile.arrayBuffer();
      
      const storageVideo = {
        jobId,
        videoData,
        fileName: videoFile.name,
        fileType: videoFile.type,
        size: videoFile.size,
        timestamp: Date.now(),
        metadata: {
          originalName: videoFile.name,
          lastModified: videoFile.lastModified || Date.now(),
        },
      };
      
      await this.db.put('processedVideos', storageVideo);
      
    } catch (error) {
      console.error('Failed to save processed video:', error);
      throw error;
    }
  }
  
  /**
   * Load processed video from storage
   */
  async loadProcessedVideo(jobId: string): Promise<File | null> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      const storageVideo = await this.db.get('processedVideos', jobId);
      if (!storageVideo) return null;
      
      return new File(
        [storageVideo.videoData],
        storageVideo.fileName,
        { type: storageVideo.fileType }
      );
      
    } catch (error) {
      console.error('Failed to load processed video:', error);
      return null;
    }
  }
  
  /**
   * Store data in cache
   */
  async setCache(key: string, data: ArrayBuffer, type: string = 'binary'): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      const cacheEntry = {
        key,
        data,
        timestamp: Date.now(),
        size: data.byteLength,
        type,
      };
      
      await this.db.put('cache', cacheEntry);
      
    } catch (error) {
      console.error('Failed to set cache:', error);
    }
  }
  
  /**
   * Get data from cache
   */
  async getCache(key: string): Promise<ArrayBuffer | null> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      const cacheEntry = await this.db.get('cache', key);
      return cacheEntry ? cacheEntry.data : null;
      
    } catch (error) {
      console.error('Failed to get cache:', error);
      return null;
    }
  }
  
  /**
   * Clear all cache entries
   */
  async clearCache(): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      await this.db.clear('cache');
      console.log('Cache cleared successfully');
      
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }
  
  /**
   * Set application setting
   */
  async setSetting(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      await this.db.put('settings', {
        key,
        value,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      console.error('Failed to set setting:', error);
    }
  }
  
  /**
   * Get application setting
   */
  async getSetting(key: string, defaultValue: any = null): Promise<any> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      const setting = await this.db.get('settings', key);
      return setting ? setting.value : defaultValue;
      
    } catch (error) {
      console.error('Failed to get setting:', error);
      return defaultValue;
    }
  }
  
  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      const [jobs, videos, cache] = await Promise.all([
        this.db.count('jobs'),
        this.db.count('processedVideos'),
        this.db.count('cache'),
      ]);
      
      // Calculate total storage used
      let totalStorageUsed = 0;
      
      // Sum job storage
      const allJobs = await this.db.getAll('jobs');
      totalStorageUsed += allJobs.reduce((sum, job) => sum + job.inputFileData.byteLength, 0);
      
      // Sum video storage
      const allVideos = await this.db.getAll('processedVideos');
      totalStorageUsed += allVideos.reduce((sum, video) => sum + video.videoData.byteLength, 0);
      
      // Sum cache storage
      const allCache = await this.db.getAll('cache');
      totalStorageUsed += allCache.reduce((sum, cache) => sum + cache.data.byteLength, 0);
      
      // Get quota information
      const quota = await navigator.storage.estimate();
      const availableStorage = quota.quota || 0;
      const quotaUsed = availableStorage > 0 ? (totalStorageUsed / availableStorage) * 100 : 0;
      
      return {
        totalJobs: jobs,
        totalProcessedVideos: videos,
        totalCacheEntries: cache,
        totalStorageUsed,
        availableStorage,
        quotaUsed,
      };
      
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return {
        totalJobs: 0,
        totalProcessedVideos: 0,
        totalCacheEntries: 0,
        totalStorageUsed: 0,
        availableStorage: 0,
        quotaUsed: 0,
      };
    }
  }
  
  /**
   * Export all data for backup
   */
  async exportData(): Promise<Blob> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      const data = {
        jobs: await this.db.getAll('jobs'),
        processedVideos: await this.db.getAll('processedVideos'),
        settings: await this.db.getAll('settings'),
        timestamp: Date.now(),
        version: this.dbVersion,
      };
      
      return new Blob([JSON.stringify(data)], { type: 'application/json' });
      
    } catch (error) {
      throw new Error(`Failed to export data: ${error}`);
    }
  }
  
  /**
   * Import data from backup
   */
  async importData(dataBlob: Blob): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    
    try {
      const text = await dataBlob.text();
      const data = JSON.parse(text);
      
      // Validate data structure
      if (!data.jobs || !data.settings || !data.version) {
        throw new Error('Invalid backup data format');
      }
      
      // Clear existing data
      await Promise.all([
        this.db.clear('jobs'),
        this.db.clear('processedVideos'),
        this.db.clear('settings'),
      ]);
      
      // Import new data
      const tx = this.db.transaction(['jobs', 'processedVideos', 'settings'], 'readwrite');
      
      for (const job of data.jobs) {
        await tx.objectStore('jobs').put(job);
      }
      
      for (const video of data.processedVideos || []) {
        await tx.objectStore('processedVideos').put(video);
      }
      
      for (const setting of data.settings) {
        await tx.objectStore('settings').put(setting);
      }
      
      await tx.done;
      
      console.log('Data imported successfully');
      
    } catch (error) {
      throw new Error(`Failed to import data: ${error}`);
    }
  }
  
  /**
   * Clean up the storage system
   */
  async cleanup(): Promise<void> {
    if (!this.db) return;
    
    try {
      await this.cleanupOldFiles();
      this.db.close();
      this.db = null;
      
    } catch (error) {
      console.error('Failed to cleanup storage:', error);
    }
  }
  
  /**
   * Delete the entire database
   */
  async deleteDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    
    try {
      await deleteDB(this.dbName);
      console.log('Database deleted successfully');
      
    } catch (error) {
      throw new Error(`Failed to delete database: ${error}`);
    }
  }
  
  // Private methods
  
  private async checkStorageQuota(): Promise<void> {
    try {
      const stats = await this.getStorageStats();
      
      if (stats.quotaUsed > this.maxStorageUsage * 100) {
        console.warn(`Storage usage at ${stats.quotaUsed.toFixed(1)}%, cleaning up old files`);
        await this.cleanupOldFiles();
      }
      
    } catch (error) {
      console.error('Failed to check storage quota:', error);
    }
  }
  
  private async cleanupOldFiles(): Promise<void> {
    if (!this.db) return;
    
    try {
      // Clean up old cache entries (older than 24 hours)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const oldCacheEntries = await this.db.getAllFromIndex('cache', 'timestamp', IDBKeyRange.upperBound(oneDayAgo));
      
      for (const entry of oldCacheEntries) {
        await this.db.delete('cache', entry.key);
      }
      
      // Clean up old completed jobs (older than 7 days)
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const allJobs = await this.db.getAll('jobs');
      
      for (const job of allJobs) {
        if (job.status === 'completed' && job.endTime && job.endTime < oneWeekAgo) {
          await this.deleteJob(job.id);
        }
      }
      
      // Clean up old processed videos (older than 30 days) if storage is still tight
      const stats = await this.getStorageStats();
      if (stats.quotaUsed > this.maxStorageUsage * 100) {
        const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const oldVideos = await this.db.getAllFromIndex('processedVideos', 'timestamp', IDBKeyRange.upperBound(oneMonthAgo));
        
        for (const video of oldVideos) {
          await this.db.delete('processedVideos', video.jobId);
        }
      }
      
      console.log('Old files cleaned up successfully');
      
    } catch (error) {
      console.error('Failed to cleanup old files:', error);
    }
  }
}