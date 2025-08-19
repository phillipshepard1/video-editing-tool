/**
 * Worker Manager
 * Orchestrates and manages all background workers
 */

import { BaseWorker } from './base-worker';
import { UploadWorker } from './upload-worker';
import { ChunkWorker } from './chunk-worker';
import { StorageWorker } from './storage-worker';
import { AnalysisWorker } from './analysis-worker';
import { AssemblyWorker } from './assembly-worker';
import { RenderWorker } from './render-worker';
import { ProcessingStage } from '../services/job-queue';

export interface WorkerManagerOptions {
  workers?: {
    upload?: number;
    split_chunks?: number;
    store_chunks?: number;
    queue_analysis?: number;
    gemini_processing?: number;
    assemble_timeline?: number;
    render_video?: number;
  };
  autoStart?: boolean;
}

export interface WorkerStatus {
  workerId: string;
  stage: ProcessingStage;
  running: boolean;
  healthy: boolean;
  stats: any;
}

export interface SystemHealth {
  totalWorkers: number;
  runningWorkers: number;
  healthyWorkers: number;
  workersByStage: Record<ProcessingStage, number>;
  systemUptime: number;
  lastHealthCheck: Date;
}

export class WorkerManager {
  private workers: Map<string, BaseWorker> = new Map();
  private startTime: Date = new Date();
  private healthCheckInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(private options: WorkerManagerOptions = {}) {
    // Set default worker counts
    const defaultCounts = {
      upload: 2,
      split_chunks: 1, // CPU intensive, one at a time
      store_chunks: 3,
      queue_analysis: 1, // Simple queue stage
      gemini_processing: 2,
      assemble_timeline: 1, // Timeline assembly
      render_video: 1, // Chillin API rendering
    };

    this.options.workers = { ...defaultCounts, ...this.options.workers };
  }

  /**
   * Initialize and start all workers
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Worker Manager is already running');
    }

    console.log('Starting Worker Manager...');
    this.startTime = new Date();

    // Create and start workers for each stage
    await this.createWorkers();

    // Start health monitoring
    this.startHealthMonitoring();

    this.isRunning = true;
    console.log(`Worker Manager started with ${this.workers.size} workers`);
  }

  /**
   * Stop all workers
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('Stopping Worker Manager...');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Stop all workers
    const stopPromises = Array.from(this.workers.values()).map(worker => 
      worker.stop().catch(error => {
        console.error(`Error stopping worker:`, error);
      })
    );

    await Promise.all(stopPromises);

    this.workers.clear();
    this.isRunning = false;
    console.log('Worker Manager stopped');
  }

  /**
   * Create workers for each processing stage
   */
  private async createWorkers(): Promise<void> {
    const workerCounts = this.options.workers!;

    // Upload workers
    for (let i = 0; i < workerCounts.upload!; i++) {
      const workerId = `upload-worker-${i + 1}`;
      const worker = new UploadWorker(workerId);
      this.workers.set(workerId, worker);
      
      if (this.options.autoStart !== false) {
        await worker.start();
      }
    }

    // Split chunks workers
    for (let i = 0; i < workerCounts.split_chunks!; i++) {
      const workerId = `chunk-worker-${i + 1}`;
      const worker = new ChunkWorker(workerId);
      this.workers.set(workerId, worker);
      
      if (this.options.autoStart !== false) {
        await worker.start();
      }
    }

    // Storage workers
    for (let i = 0; i < workerCounts.store_chunks!; i++) {
      const workerId = `storage-worker-${i + 1}`;
      const worker = new StorageWorker(workerId);
      this.workers.set(workerId, worker);
      
      if (this.options.autoStart !== false) {
        await worker.start();
      }
    }

    // Queue analysis workers (simple passthrough workers)
    for (let i = 0; i < workerCounts.queue_analysis!; i++) {
      const workerId = `queue-analysis-worker-${i + 1}`;
      const worker = new QueueAnalysisWorker(workerId);
      this.workers.set(workerId, worker);
      
      if (this.options.autoStart !== false) {
        await worker.start();
      }
    }

    // Gemini processing workers
    for (let i = 0; i < workerCounts.gemini_processing!; i++) {
      const workerId = `analysis-worker-${i + 1}`;
      const worker = new AnalysisWorker(workerId);
      this.workers.set(workerId, worker);
      
      if (this.options.autoStart !== false) {
        await worker.start();
      }
    }

    // Assembly workers
    for (let i = 0; i < workerCounts.assemble_timeline!; i++) {
      const workerId = `assembly-worker-${i + 1}`;
      const worker = new AssemblyWorker(workerId);
      this.workers.set(workerId, worker);
      
      if (this.options.autoStart !== false) {
        await worker.start();
      }
    }

    // Render workers
    for (let i = 0; i < workerCounts.render_video!; i++) {
      const workerId = `render-worker-${i + 1}`;
      const worker = new RenderWorker(workerId);
      this.workers.set(workerId, worker);
      
      if (this.options.autoStart !== false) {
        await worker.start();
      }
    }
  }

  /**
   * Get status of all workers
   */
  getWorkerStatuses(): WorkerStatus[] {
    return Array.from(this.workers.values()).map(worker => worker.getStatus());
  }

  /**
   * Get system health information
   */
  getSystemHealth(): SystemHealth {
    const statuses = this.getWorkerStatuses();
    const runningWorkers = statuses.filter(s => s.running).length;
    const healthyWorkers = statuses.filter(s => s.healthy).length;

    const workersByStage: Record<ProcessingStage, number> = {
      upload: 0,
      split_chunks: 0,
      store_chunks: 0,
      queue_analysis: 0,
      gemini_processing: 0,
      assemble_timeline: 0,
      render_video: 0,
    };

    statuses.forEach(status => {
      workersByStage[status.stage]++;
    });

    return {
      totalWorkers: this.workers.size,
      runningWorkers,
      healthyWorkers,
      workersByStage,
      systemUptime: Date.now() - this.startTime.getTime(),
      lastHealthCheck: new Date(),
    };
  }

  /**
   * Get worker by ID
   */
  getWorker(workerId: string): BaseWorker | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Restart a specific worker
   */
  async restartWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    console.log(`Restarting worker ${workerId}`);
    await worker.stop();
    await worker.start();
  }

  /**
   * Add additional worker to a stage
   */
  async addWorker(stage: ProcessingStage): Promise<string> {
    const existingCount = this.getWorkerStatuses().filter(s => s.stage === stage).length;
    const workerId = `${stage}-worker-${existingCount + 1}`;

    let worker: BaseWorker;

    switch (stage) {
      case 'upload':
        worker = new UploadWorker(workerId);
        break;
      case 'split_chunks':
        worker = new ChunkWorker(workerId);
        break;
      case 'store_chunks':
        worker = new StorageWorker(workerId);
        break;
      case 'queue_analysis':
        worker = new QueueAnalysisWorker(workerId);
        break;
      case 'gemini_processing':
        worker = new AnalysisWorker(workerId);
        break;
      case 'assemble_timeline':
        worker = new AssemblyWorker(workerId);
        break;
      case 'render_video':
        worker = new RenderWorker(workerId);
        break;
      default:
        throw new Error(`Worker type for stage ${stage} not implemented yet`);
    }

    this.workers.set(workerId, worker);
    
    if (this.isRunning) {
      await worker.start();
    }

    return workerId;
  }

  /**
   * Remove worker
   */
  async removeWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    console.log(`Removing worker ${workerId}`);
    await worker.stop();
    this.workers.delete(workerId);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Perform health check on all workers
   */
  private performHealthCheck(): void {
    const health = this.getSystemHealth();
    
    if (health.healthyWorkers < health.totalWorkers) {
      console.warn(`Health check: ${health.healthyWorkers}/${health.totalWorkers} workers healthy`);
    }

    // Log worker stats periodically
    if (Math.floor(Date.now() / 300000) % 10 === 0) { // Every 5 minutes, log every 50 minutes
      this.logWorkerStats();
    }
  }

  /**
   * Log worker statistics
   */
  private logWorkerStats(): void {
    console.log('=== Worker Manager Statistics ===');
    const health = this.getSystemHealth();
    console.log(`System Uptime: ${Math.floor(health.systemUptime / 1000 / 60)} minutes`);
    console.log(`Workers: ${health.runningWorkers}/${health.totalWorkers} running, ${health.healthyWorkers} healthy`);
    
    Object.entries(health.workersByStage).forEach(([stage, count]) => {
      if (count > 0) {
        console.log(`  ${stage}: ${count} workers`);
      }
    });

    // Log individual worker stats
    this.getWorkerStatuses().forEach(status => {
      if (status.running) {
        console.log(`  ${status.workerId}: processed ${status.stats.jobsProcessed}, failed ${status.stats.jobsFailed}, active ${status.stats.activeJobs}`);
      }
    });
  }

  /**
   * Check if system is healthy
   */
  isHealthy(): boolean {
    const health = this.getSystemHealth();
    return health.healthyWorkers >= Math.ceil(health.totalWorkers * 0.8); // 80% healthy threshold
  }

  /**
   * Get detailed worker information
   */
  getWorkerDetails(workerId: string): any {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return null;
    }

    return {
      ...worker.getStatus(),
      options: (worker as any).options,
    };
  }
}

/**
 * Simple Queue Analysis Worker
 * Just passes jobs to the next stage
 */
class QueueAnalysisWorker extends BaseWorker {
  constructor(workerId: string, options: any = {}) {
    super({
      workerId,
      stage: 'queue_analysis',
      concurrency: 5, // Can handle many simple operations
      ...options,
    });
  }

  async processJob(job: any): Promise<any> {
    // Log start
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'queue_analysis',
      'Queuing job for Gemini analysis',
      { chunksStored: job.payload.chunksStored },
      this.options.workerId
    );

    // Simple delay to simulate some processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update job progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 50,
      stage_progress: { 
        queue_analysis: { 
          stage: 'queuing', 
          progress: 50,
          message: 'Preparing for analysis...'
        } 
      }
    });

    // Queue for Gemini processing
    await this.jobQueue.enqueueJob(job.job_id, 'gemini_processing', {
      chunksStored: job.payload.chunksStored,
      readyForAnalysis: true
    });

    // Complete stage
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 100,
      current_stage: 'gemini_processing'
    });

    return {
      success: true,
      nextStage: 'gemini_processing'
    };
  }
}

// Singleton instance
let workerManagerInstance: WorkerManager | null = null;

export function getWorkerManager(options?: WorkerManagerOptions): WorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new WorkerManager(options);
  }
  return workerManagerInstance;
}

export default WorkerManager;