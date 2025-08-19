/**
 * Base Worker Class
 * Foundation for all processing stage workers
 */

import { getJobQueueService, JobQueueService, ProcessingStage, ClaimedJob } from '../services/job-queue';
import { getStorageManager, StorageManager } from '../services/storage-manager';

export interface WorkerOptions {
  workerId: string;
  stage: ProcessingStage;
  concurrency?: number; // How many jobs to process concurrently
  pollInterval?: number; // How often to check for new jobs (ms)
  claimDuration?: number; // How long to claim jobs for (minutes)
  maxRetries?: number; // Max retries per job
  retryDelay?: number; // Delay between retries (minutes)
}

export interface WorkerStats {
  workerId: string;
  stage: ProcessingStage;
  status: 'idle' | 'busy' | 'error' | 'stopped';
  jobsProcessed: number;
  jobsFailed: number;
  activeJobs: number;
  lastActivity: Date;
  uptime: number;
  errors: string[];
}

export abstract class BaseWorker {
  protected jobQueue: JobQueueService;
  protected storageManager: StorageManager;
  protected options: Required<WorkerOptions>;
  protected isRunning: boolean = false;
  protected stats: WorkerStats;
  protected activeJobs: Map<string, ClaimedJob> = new Map();
  private pollTimer?: NodeJS.Timeout;
  private startTime: Date = new Date();

  constructor(options: WorkerOptions) {
    this.options = {
      concurrency: 1,
      pollInterval: 5000, // 5 seconds
      claimDuration: 30, // 30 minutes
      maxRetries: 3,
      retryDelay: 5, // 5 minutes
      ...options,
    };

    this.jobQueue = getJobQueueService();
    this.storageManager = getStorageManager();

    this.stats = {
      workerId: this.options.workerId,
      stage: this.options.stage,
      status: 'idle',
      jobsProcessed: 0,
      jobsFailed: 0,
      activeJobs: 0,
      lastActivity: new Date(),
      uptime: 0,
      errors: [],
    };
  }

  /**
   * Abstract method - must be implemented by specific workers
   */
  abstract processJob(job: ClaimedJob): Promise<any>;

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error(`Worker ${this.options.workerId} is already running`);
    }

    this.isRunning = true;
    this.startTime = new Date();
    console.log(`Starting worker ${this.options.workerId} for stage ${this.options.stage}`);

    // Start polling for jobs
    this.pollForJobs();
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    console.log(`Stopping worker ${this.options.workerId}`);
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    // Wait for active jobs to complete or timeout
    const timeout = 30000; // 30 seconds
    const start = Date.now();

    while (this.activeJobs.size > 0 && (Date.now() - start) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.activeJobs.size > 0) {
      console.warn(`Worker ${this.options.workerId} stopped with ${this.activeJobs.size} active jobs`);
      
      // Release remaining job claims
      for (const [queueId] of this.activeJobs) {
        try {
          await this.jobQueue.releaseJobClaim(queueId);
        } catch (error) {
          console.error(`Failed to release claim for job ${queueId}:`, error);
        }
      }
      
      this.activeJobs.clear();
    }

    this.stats.status = 'stopped';
  }

  /**
   * Poll for available jobs
   */
  private pollForJobs(): void {
    if (!this.isRunning) return;

    this.pollTimer = setTimeout(async () => {
      try {
        // Check if we can handle more jobs
        if (this.activeJobs.size < this.options.concurrency) {
          await this.claimAndProcessJob();
        }

        this.updateStats();
      } catch (error) {
        this.handleError(error, 'Error in poll cycle');
      }

      // Schedule next poll
      this.pollForJobs();
    }, this.options.pollInterval);
  }

  /**
   * Claim and process a single job
   */
  private async claimAndProcessJob(): Promise<void> {
    try {
      // Try to claim a job
      const claimedJob = await this.jobQueue.claimNextJob(
        this.options.stage,
        this.options.workerId
      );

      if (!claimedJob) {
        // No jobs available
        this.stats.status = 'idle';
        return;
      }

      this.stats.status = 'busy';
      this.stats.activeJobs = this.activeJobs.size + 1;
      this.activeJobs.set(claimedJob.queue_id, claimedJob);

      // Log job start
      await this.jobQueue.addLog(
        claimedJob.job_id,
        'info',
        this.options.stage,
        `Worker ${this.options.workerId} started processing job`,
        { queueId: claimedJob.queue_id },
        this.options.workerId
      );

      // Process the job asynchronously
      this.processJobAsync(claimedJob);

    } catch (error) {
      this.handleError(error, 'Error claiming job');
    }
  }

  /**
   * Process job asynchronously
   */
  private async processJobAsync(claimedJob: ClaimedJob): Promise<void> {
    try {
      // Update job status to processing
      await this.jobQueue.updateJob(claimedJob.job_id, {
        status: 'processing',
        current_stage: this.options.stage,
      });

      // Process the job using the concrete implementation
      const result = await this.processJob(claimedJob);

      // Job completed successfully
      await this.jobQueue.completeJobStage(claimedJob.queue_id, result);
      
      await this.jobQueue.addLog(
        claimedJob.job_id,
        'info',
        this.options.stage,
        `Worker ${this.options.workerId} completed job successfully`,
        { result },
        this.options.workerId
      );

      this.stats.jobsProcessed++;
      this.stats.lastActivity = new Date();

    } catch (error) {
      // Job failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await this.jobQueue.failJobStage(
        claimedJob.queue_id,
        errorMessage,
        this.options.retryDelay
      );

      await this.jobQueue.addLog(
        claimedJob.job_id,
        'error',
        this.options.stage,
        `Worker ${this.options.workerId} failed to process job: ${errorMessage}`,
        { error: errorMessage },
        this.options.workerId
      );

      this.stats.jobsFailed++;
      this.handleError(error, `Error processing job ${claimedJob.job_id}`);
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(claimedJob.queue_id);
      this.stats.activeJobs = this.activeJobs.size;
      
      if (this.activeJobs.size === 0) {
        this.stats.status = 'idle';
      }
    }
  }

  /**
   * Handle errors
   */
  protected handleError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = `${context}: ${errorMessage}`;
    
    console.error(`Worker ${this.options.workerId}:`, fullMessage);
    
    this.stats.errors.push(fullMessage);
    if (this.stats.errors.length > 100) {
      this.stats.errors = this.stats.errors.slice(-50); // Keep last 50 errors
    }
    
    this.stats.status = 'error';
    this.stats.lastActivity = new Date();
  }

  /**
   * Update worker statistics
   */
  private updateStats(): void {
    this.stats.uptime = Date.now() - this.startTime.getTime();
    this.stats.activeJobs = this.activeJobs.size;
    
    if (this.activeJobs.size === 0 && this.stats.status === 'busy') {
      this.stats.status = 'idle';
    }
  }

  /**
   * Get worker statistics
   */
  getStats(): WorkerStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Check if worker is healthy
   */
  isHealthy(): boolean {
    return this.isRunning && this.stats.status !== 'error';
  }

  /**
   * Get worker status
   */
  getStatus(): {
    workerId: string;
    stage: ProcessingStage;
    running: boolean;
    healthy: boolean;
    stats: WorkerStats;
  } {
    return {
      workerId: this.options.workerId,
      stage: this.options.stage,
      running: this.isRunning,
      healthy: this.isHealthy(),
      stats: this.getStats(),
    };
  }
}

export default BaseWorker;