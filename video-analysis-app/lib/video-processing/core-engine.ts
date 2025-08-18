/**
 * Core Video Processing Engine
 * Orchestrates the complete video processing pipeline with memory management,
 * chunking, error recovery, and progress tracking
 */

import { FFmpegEngine, ProcessingOptions, ProcessingProgress, ChunkInfo } from './ffmpeg-engine';
import { VideoStorage } from './storage-manager';
import { MemoryManager } from './memory-manager';
import { ChunkingStrategy } from './chunking-strategy';

export interface VideoProcessingJob {
  id: string;
  inputFile: File;
  options: ProcessingOptions;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
  progress: number;
  startTime?: number;
  endTime?: number;
  error?: string;
  outputFile?: File;
  chunks?: ChunkInfo[];
  memoryUsage?: number;
}

export interface ProcessingStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  totalMemoryUsed: number;
  currentMemoryUsage: number;
  estimatedTimeRemaining: number;
}

export interface EngineConfig {
  maxConcurrentJobs: number;
  maxMemoryMB: number;
  chunkSizeMB: number;
  enableAutoRecovery: boolean;
  enableProgressPersistence: boolean;
  enableMemoryOptimization: boolean;
  fallbackToServerProcessing: boolean;
}

export class VideoProcessingEngine {
  private ffmpegEngine: FFmpegEngine;
  private storage: VideoStorage;
  private memoryManager: MemoryManager;
  private chunkingStrategy: ChunkingStrategy;
  
  private jobs = new Map<string, VideoProcessingJob>();
  private activeJobs = new Set<string>();
  private config: EngineConfig;
  private isInitialized = false;
  
  private onJobProgress?: (jobId: string, progress: ProcessingProgress) => void;
  private onJobComplete?: (jobId: string, result: File) => void;
  private onJobError?: (jobId: string, error: string) => void;
  private onMemoryWarning?: (usage: number, limit: number) => void;
  
  constructor(config: Partial<EngineConfig> = {}) {
    this.config = {
      maxConcurrentJobs: 2,
      maxMemoryMB: 4096, // 4GB default
      chunkSizeMB: 500,   // 500MB chunks
      enableAutoRecovery: true,
      enableProgressPersistence: true,
      enableMemoryOptimization: true,
      fallbackToServerProcessing: false,
      ...config,
    };
    
    this.memoryManager = new MemoryManager({
      maxMemoryMB: this.config.maxMemoryMB,
      onMemoryWarning: (usage, limit) => {
        if (this.onMemoryWarning) {
          this.onMemoryWarning(usage, limit);
        }
        this.handleMemoryPressure();
      },
    });
    
    this.storage = new VideoStorage();
    this.chunkingStrategy = new ChunkingStrategy();
    
    this.ffmpegEngine = new FFmpegEngine({
      maxMemoryMB: this.config.maxMemoryMB,
      onProgress: (progress) => {
        // Forward progress to active job handlers
        for (const jobId of this.activeJobs) {
          if (this.onJobProgress) {
            this.onJobProgress(jobId, progress);
          }
        }
      },
    });
  }
  
  /**
   * Initialize the processing engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Initialize all components
      await Promise.all([
        this.ffmpegEngine.initialize(),
        this.storage.initialize(),
        this.memoryManager.initialize(),
      ]);
      
      // Restore any previous jobs if persistence is enabled
      if (this.config.enableProgressPersistence) {
        await this.restorePreviousJobs();
      }
      
      this.isInitialized = true;
      console.log('Video processing engine initialized successfully');
      
    } catch (error) {
      throw new Error(`Failed to initialize video processing engine: ${error}`);
    }
  }
  
  /**
   * Add a new video processing job
   */
  async addJob(
    inputFile: File, 
    options: ProcessingOptions = {}
  ): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const jobId = this.generateJobId();
    const job: VideoProcessingJob = {
      id: jobId,
      inputFile,
      options,
      status: 'pending',
      progress: 0,
      startTime: Date.now(),
    };
    
    // Analyze video for optimal chunking strategy
    try {
      const videoInfo = await this.ffmpegEngine.getVideoInfo(inputFile);
      job.chunks = await this.chunkingStrategy.analyzeAndChunk(inputFile, videoInfo, {
        maxChunkSizeMB: this.config.chunkSizeMB,
        memoryLimit: this.config.maxMemoryMB,
      });
    } catch (error) {
      console.warn('Failed to analyze video for chunking, using default strategy:', error);
      job.chunks = await this.chunkingStrategy.createDefaultChunks(inputFile);
    }
    
    this.jobs.set(jobId, job);
    
    // Save job state if persistence is enabled
    if (this.config.enableProgressPersistence) {
      await this.storage.saveJobState(job);
    }
    
    // Start processing if slots available
    this.processNextJob();
    
    return jobId;
  }
  
  /**
   * Get job status and progress
   */
  getJob(jobId: string): VideoProcessingJob | undefined {
    return this.jobs.get(jobId);
  }
  
  /**
   * Get all jobs
   */
  getAllJobs(): VideoProcessingJob[] {
    return Array.from(this.jobs.values());
  }
  
  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    if (job.status === 'processing') {
      // If actively processing, we need to terminate FFmpeg
      await this.ffmpegEngine.terminate();
      await this.ffmpegEngine.initialize(); // Reinitialize for other jobs
    }
    
    job.status = 'failed';
    job.error = 'Job cancelled by user';
    
    this.activeJobs.delete(jobId);
    
    // Clean up storage
    await this.storage.deleteJob(jobId);
    
    // Process next job in queue
    this.processNextJob();
  }
  
  /**
   * Pause a job
   */
  async pauseJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'processing') return;
    
    job.status = 'paused';
    this.activeJobs.delete(jobId);
    
    if (this.config.enableProgressPersistence) {
      await this.storage.saveJobState(job);
    }
  }
  
  /**
   * Resume a paused job
   */
  async resumeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'paused') return;
    
    job.status = 'pending';
    this.processNextJob();
  }
  
  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats {
    const jobs = Array.from(this.jobs.values());
    const completedJobs = jobs.filter(j => j.status === 'completed');
    const failedJobs = jobs.filter(j => j.status === 'failed');
    
    const averageProcessingTime = completedJobs.length > 0
      ? completedJobs.reduce((sum, job) => sum + ((job.endTime || 0) - (job.startTime || 0)), 0) / completedJobs.length
      : 0;
    
    const currentMemoryUsage = this.memoryManager.getCurrentUsage();
    const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'processing');
    const estimatedTimeRemaining = pendingJobs.length * averageProcessingTime;
    
    return {
      totalJobs: jobs.length,
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length,
      averageProcessingTime,
      totalMemoryUsed: jobs.reduce((sum, job) => sum + (job.memoryUsage || 0), 0),
      currentMemoryUsage,
      estimatedTimeRemaining,
    };
  }
  
  /**
   * Set event handlers
   */
  setEventHandlers(handlers: {
    onJobProgress?: (jobId: string, progress: ProcessingProgress) => void;
    onJobComplete?: (jobId: string, result: File) => void;
    onJobError?: (jobId: string, error: string) => void;
    onMemoryWarning?: (usage: number, limit: number) => void;
  }): void {
    this.onJobProgress = handlers.onJobProgress;
    this.onJobComplete = handlers.onJobComplete;
    this.onJobError = handlers.onJobError;
    this.onMemoryWarning = handlers.onMemoryWarning;
  }
  
  /**
   * Clear all completed and failed jobs
   */
  async clearCompletedJobs(): Promise<void> {
    const jobsToRemove = Array.from(this.jobs.entries())
      .filter(([_, job]) => job.status === 'completed' || job.status === 'failed')
      .map(([id, _]) => id);
    
    for (const jobId of jobsToRemove) {
      this.jobs.delete(jobId);
      await this.storage.deleteJob(jobId);
    }
  }
  
  /**
   * Shutdown the engine gracefully
   */
  async shutdown(): Promise<void> {
    // Wait for active jobs to complete or timeout after 30 seconds
    const timeout = 30000;
    const startTime = Date.now();
    
    while (this.activeJobs.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Force terminate any remaining jobs
    if (this.activeJobs.size > 0) {
      console.warn('Force terminating remaining jobs during shutdown');
      await this.ffmpegEngine.terminate();
    }
    
    await this.storage.cleanup();
    this.isInitialized = false;
  }
  
  // Private methods
  
  private async processNextJob(): Promise<void> {
    if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
      return; // Already at capacity
    }
    
    // Find next pending job
    const pendingJob = Array.from(this.jobs.values())
      .find(job => job.status === 'pending');
    
    if (!pendingJob) {
      return; // No pending jobs
    }
    
    // Check memory availability
    if (!this.memoryManager.canAllocate(this.config.chunkSizeMB)) {
      console.warn('Insufficient memory for new job, triggering cleanup');
      await this.handleMemoryPressure();
      return;
    }
    
    this.activeJobs.add(pendingJob.id);
    pendingJob.status = 'processing';
    
    try {
      const result = await this.processJobInternal(pendingJob);
      
      pendingJob.status = 'completed';
      pendingJob.endTime = Date.now();
      pendingJob.outputFile = result;
      pendingJob.progress = 100;
      
      if (this.onJobComplete) {
        this.onJobComplete(pendingJob.id, result);
      }
      
      // Store result if persistence enabled
      if (this.config.enableProgressPersistence) {
        await this.storage.saveProcessedVideo(pendingJob.id, result);
      }
      
    } catch (error) {
      pendingJob.status = 'failed';
      pendingJob.error = error instanceof Error ? error.message : String(error);
      pendingJob.endTime = Date.now();
      
      if (this.onJobError) {
        this.onJobError(pendingJob.id, pendingJob.error);
      }
      
      // Attempt auto-recovery if enabled
      if (this.config.enableAutoRecovery) {
        console.log(`Attempting auto-recovery for job ${pendingJob.id}`);
        setTimeout(() => {
          this.retryJob(pendingJob.id);
        }, 5000); // Retry after 5 seconds
      }
    } finally {
      this.activeJobs.delete(pendingJob.id);
      
      // Update job state
      if (this.config.enableProgressPersistence) {
        await this.storage.saveJobState(pendingJob);
      }
      
      // Process next job
      setTimeout(() => this.processNextJob(), 1000);
    }
  }
  
  private async processJobInternal(job: VideoProcessingJob): Promise<File> {
    const { inputFile, options, chunks } = job;
    
    // Allocate memory for this job
    this.memoryManager.allocate(job.id, this.config.chunkSizeMB);
    
    try {
      if (chunks && chunks.length > 1) {
        // Process in chunks for large files
        console.log(`Processing ${inputFile.name} in ${chunks.length} chunks`);
        
        const processedChunks = await this.ffmpegEngine.processVideoInChunks(
          inputFile,
          chunks,
          options
        );
        
        // Merge chunks back together
        const mergedVideo = await this.ffmpegEngine.mergeVideos(
          processedChunks,
          inputFile.name.replace(/\.[^/.]+$/, '_processed.mp4')
        );
        
        return mergedVideo;
        
      } else {
        // Process as single file
        console.log(`Processing ${inputFile.name} as single file`);
        return await this.ffmpegEngine.processVideo(inputFile, options);
      }
      
    } finally {
      // Release memory allocation
      this.memoryManager.deallocate(job.id);
    }
  }
  
  private async retryJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'failed') return;
    
    console.log(`Retrying job ${jobId}`);
    job.status = 'pending';
    job.error = undefined;
    job.progress = 0;
    
    this.processNextJob();
  }
  
  private async handleMemoryPressure(): Promise<void> {
    console.warn('Handling memory pressure');
    
    // Trigger garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Clear any cached data
    await this.storage.clearCache();
    
    // If still under pressure, pause low-priority jobs
    if (this.memoryManager.getCurrentUsage() > this.config.maxMemoryMB * 0.9) {
      const runningJobs = Array.from(this.jobs.values())
        .filter(job => job.status === 'processing');
      
      if (runningJobs.length > 1) {
        // Pause the last started job
        const lastJob = runningJobs[runningJobs.length - 1];
        await this.pauseJob(lastJob.id);
        console.log(`Paused job ${lastJob.id} due to memory pressure`);
      }
    }
  }
  
  private async restorePreviousJobs(): Promise<void> {
    try {
      const savedJobs = await this.storage.getAllJobs();
      
      for (const job of savedJobs) {
        // Reset processing jobs to pending
        if (job.status === 'processing') {
          job.status = 'pending';
          job.progress = 0;
        }
        
        this.jobs.set(job.id, job);
      }
      
      console.log(`Restored ${savedJobs.length} previous jobs`);
      
    } catch (error) {
      console.warn('Failed to restore previous jobs:', error);
    }
  }
  
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}