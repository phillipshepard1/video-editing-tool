/**
 * Unified Progress Tracking System
 * Provides comprehensive progress monitoring with memory tracking,
 * time estimates, and detailed stage information
 */

import { MemoryStats } from './memory-manager';

export interface StageInfo {
  id: string;
  name: string;
  description: string;
  progress: number; // 0-100
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  error?: string;
  subStages?: SubStageInfo[];
}

export interface SubStageInfo {
  id: string;
  name: string;
  progress: number;
  status: 'pending' | 'active' | 'completed' | 'failed';
  details?: string;
}

export interface ProgressSnapshot {
  jobId: string;
  overallProgress: number; // 0-100
  currentStage: string;
  stages: StageInfo[];
  
  // Timing information
  startTime: number;
  elapsedTime: number;
  estimatedTotalTime: number;
  estimatedTimeRemaining: number;
  
  // Memory information
  memoryStats: MemoryStats;
  memoryHistory: Array<{ timestamp: number; usageMB: number }>;
  
  // Processing information
  processingSpeed: number; // processing time / real time ratio
  throughput: number; // MB/s
  
  // Quality metrics
  averageQuality: number; // 0-1
  errorCount: number;
  warningCount: number;
  
  // Status
  isPaused: boolean;
  canPause: boolean;
  canCancel: boolean;
}

export interface ProgressConfig {
  updateIntervalMs: number;
  memoryHistoryLength: number;
  enableDetailedLogging: boolean;
  enablePerformanceMetrics: boolean;
  autoSaveProgress: boolean;
}

export type ProgressEventType = 
  | 'stage-started'
  | 'stage-completed'
  | 'stage-failed'
  | 'progress-updated'
  | 'memory-warning'
  | 'performance-issue'
  | 'job-paused'
  | 'job-resumed'
  | 'job-cancelled'
  | 'job-completed'
  | 'job-failed';

export interface ProgressEvent {
  type: ProgressEventType;
  jobId: string;
  timestamp: number;
  data: any;
}

export class ProgressTracker {
  private jobs = new Map<string, ProgressSnapshot>();
  private config: ProgressConfig;
  private updateInterval: NodeJS.Timeout | null = null;
  
  private eventHandlers = new Map<ProgressEventType, Set<(event: ProgressEvent) => void>>();
  
  constructor(config: Partial<ProgressConfig> = {}) {
    this.config = {
      updateIntervalMs: 1000, // Update every second
      memoryHistoryLength: 60, // Keep 60 samples (1 minute at 1s intervals)
      enableDetailedLogging: true,
      enablePerformanceMetrics: true,
      autoSaveProgress: true,
      ...config,
    };
    
    this.startProgressUpdates();
  }
  
  /**
   * Initialize progress tracking for a new job
   */
  initializeJob(
    jobId: string,
    stages: Array<{ id: string; name: string; description: string; subStages?: Array<{ id: string; name: string }> }>
  ): void {
    const now = Date.now();
    
    const progressStages: StageInfo[] = stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      description: stage.description,
      progress: 0,
      status: 'pending',
      subStages: stage.subStages?.map(sub => ({
        id: sub.id,
        name: sub.name,
        progress: 0,
        status: 'pending',
      })),
    }));
    
    const snapshot: ProgressSnapshot = {
      jobId,
      overallProgress: 0,
      currentStage: stages[0]?.id || '',
      stages: progressStages,
      startTime: now,
      elapsedTime: 0,
      estimatedTotalTime: 0,
      estimatedTimeRemaining: 0,
      memoryStats: {
        currentUsageMB: 0,
        maxUsageMB: 0,
        availableMB: 0,
        allocations: [],
        gcRecommended: false,
        warningLevel: 'none',
      },
      memoryHistory: [],
      processingSpeed: 1.0,
      throughput: 0,
      averageQuality: 1.0,
      errorCount: 0,
      warningCount: 0,
      isPaused: false,
      canPause: true,
      canCancel: true,
    };
    
    this.jobs.set(jobId, snapshot);
    
    if (this.config.enableDetailedLogging) {
      console.log(`Progress tracking initialized for job ${jobId} with ${stages.length} stages`);
    }
  }
  
  /**
   * Start a specific stage
   */
  startStage(jobId: string, stageId: string): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    const stage = snapshot.stages.find(s => s.id === stageId);
    if (!stage) return;
    
    // Mark previous stages as completed if they aren't already
    const stageIndex = snapshot.stages.findIndex(s => s.id === stageId);
    for (let i = 0; i < stageIndex; i++) {
      if (snapshot.stages[i].status === 'pending') {
        snapshot.stages[i].status = 'skipped';
      }
    }
    
    stage.status = 'active';
    stage.startTime = Date.now();
    stage.progress = 0;
    snapshot.currentStage = stageId;
    
    this.emitEvent('stage-started', jobId, { stageId, stageName: stage.name });
    
    if (this.config.enableDetailedLogging) {
      console.log(`Started stage: ${stage.name} for job ${jobId}`);
    }
  }
  
  /**
   * Update stage progress
   */
  updateStageProgress(
    jobId: string, 
    stageId: string, 
    progress: number, 
    details?: { subStageId?: string; subStageProgress?: number; message?: string }
  ): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    const stage = snapshot.stages.find(s => s.id === stageId);
    if (!stage) return;
    
    stage.progress = Math.max(0, Math.min(100, progress));
    
    // Update sub-stage if specified
    if (details?.subStageId && stage.subStages) {
      const subStage = stage.subStages.find(s => s.id === details.subStageId);
      if (subStage) {
        subStage.progress = Math.max(0, Math.min(100, details.subStageProgress || progress));
        subStage.status = progress >= 100 ? 'completed' : 'active';
        subStage.details = details.message;
      }
    }
    
    // Update overall progress
    this.updateOverallProgress(snapshot);
    
    this.emitEvent('progress-updated', jobId, { 
      stageId, 
      progress: stage.progress,
      overallProgress: snapshot.overallProgress,
      details 
    });
  }
  
  /**
   * Complete a stage
   */
  completeStage(jobId: string, stageId: string): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    const stage = snapshot.stages.find(s => s.id === stageId);
    if (!stage) return;
    
    stage.status = 'completed';
    stage.progress = 100;
    stage.endTime = Date.now();
    
    // Mark all sub-stages as completed
    if (stage.subStages) {
      stage.subStages.forEach(subStage => {
        subStage.status = 'completed';
        subStage.progress = 100;
      });
    }
    
    this.updateOverallProgress(snapshot);
    this.updateTimeEstimates(snapshot);
    
    this.emitEvent('stage-completed', jobId, { stageId, stageName: stage.name });
    
    if (this.config.enableDetailedLogging) {
      const duration = stage.endTime - (stage.startTime || stage.endTime);
      console.log(`Completed stage: ${stage.name} for job ${jobId} (${duration}ms)`);
    }
  }
  
  /**
   * Mark a stage as failed
   */
  failStage(jobId: string, stageId: string, error: string): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    const stage = snapshot.stages.find(s => s.id === stageId);
    if (!stage) return;
    
    stage.status = 'failed';
    stage.error = error;
    stage.endTime = Date.now();
    snapshot.errorCount++;
    
    this.emitEvent('stage-failed', jobId, { stageId, stageName: stage.name, error });
    
    if (this.config.enableDetailedLogging) {
      console.error(`Stage failed: ${stage.name} for job ${jobId} - ${error}`);
    }
  }
  
  /**
   * Update memory statistics
   */
  updateMemoryStats(jobId: string, memoryStats: MemoryStats): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    snapshot.memoryStats = memoryStats;
    
    // Add to memory history
    snapshot.memoryHistory.push({
      timestamp: Date.now(),
      usageMB: memoryStats.currentUsageMB,
    });
    
    // Trim history to configured length
    if (snapshot.memoryHistory.length > this.config.memoryHistoryLength) {
      snapshot.memoryHistory = snapshot.memoryHistory.slice(-this.config.memoryHistoryLength);
    }
    
    // Check for memory warnings
    if (memoryStats.warningLevel === 'high' || memoryStats.warningLevel === 'critical') {
      this.emitEvent('memory-warning', jobId, { 
        warningLevel: memoryStats.warningLevel,
        currentUsage: memoryStats.currentUsageMB,
        maxUsage: memoryStats.maxUsageMB 
      });
    }
  }
  
  /**
   * Update processing metrics
   */
  updateProcessingMetrics(
    jobId: string,
    metrics: {
      processingSpeed?: number;
      throughput?: number;
      quality?: number;
    }
  ): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    if (metrics.processingSpeed !== undefined) {
      snapshot.processingSpeed = metrics.processingSpeed;
    }
    
    if (metrics.throughput !== undefined) {
      snapshot.throughput = metrics.throughput;
    }
    
    if (metrics.quality !== undefined) {
      // Update running average of quality
      snapshot.averageQuality = (snapshot.averageQuality + metrics.quality) / 2;
    }
    
    // Check for performance issues
    if (metrics.processingSpeed && metrics.processingSpeed < 0.5) {
      this.emitEvent('performance-issue', jobId, {
        type: 'slow-processing',
        processingSpeed: metrics.processingSpeed,
      });
    }
  }
  
  /**
   * Pause job tracking
   */
  pauseJob(jobId: string): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    snapshot.isPaused = true;
    this.emitEvent('job-paused', jobId, {});
  }
  
  /**
   * Resume job tracking
   */
  resumeJob(jobId: string): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    snapshot.isPaused = false;
    this.emitEvent('job-resumed', jobId, {});
  }
  
  /**
   * Complete job tracking
   */
  completeJob(jobId: string): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    // Mark any remaining stages as completed
    snapshot.stages.forEach(stage => {
      if (stage.status === 'pending' || stage.status === 'active') {
        stage.status = 'completed';
        stage.progress = 100;
        stage.endTime = Date.now();
      }
    });
    
    snapshot.overallProgress = 100;
    
    this.emitEvent('job-completed', jobId, {
      elapsedTime: snapshot.elapsedTime,
      averageQuality: snapshot.averageQuality,
      errorCount: snapshot.errorCount,
    });
    
    if (this.config.enableDetailedLogging) {
      console.log(`Job completed: ${jobId} (${snapshot.elapsedTime}ms)`);
    }
  }
  
  /**
   * Fail job tracking
   */
  failJob(jobId: string, error: string): void {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot) return;
    
    snapshot.errorCount++;
    
    this.emitEvent('job-failed', jobId, { error });
    
    if (this.config.enableDetailedLogging) {
      console.error(`Job failed: ${jobId} - ${error}`);
    }
  }
  
  /**
   * Get current progress snapshot
   */
  getProgress(jobId: string): ProgressSnapshot | null {
    return this.jobs.get(jobId) || null;
  }
  
  /**
   * Get all job progress snapshots
   */
  getAllProgress(): ProgressSnapshot[] {
    return Array.from(this.jobs.values());
  }
  
  /**
   * Remove job tracking
   */
  removeJob(jobId: string): void {
    this.jobs.delete(jobId);
  }
  
  /**
   * Clear all job tracking
   */
  clearAll(): void {
    this.jobs.clear();
  }
  
  /**
   * Add event listener
   */
  addEventListener(type: ProgressEventType, handler: (event: ProgressEvent) => void): void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler);
  }
  
  /**
   * Remove event listener
   */
  removeEventListener(type: ProgressEventType, handler: (event: ProgressEvent) => void): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }
  
  /**
   * Shutdown progress tracking
   */
  shutdown(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.jobs.clear();
    this.eventHandlers.clear();
  }
  
  // Private methods
  
  private updateOverallProgress(snapshot: ProgressSnapshot): void {
    if (snapshot.stages.length === 0) {
      snapshot.overallProgress = 0;
      return;
    }
    
    const totalProgress = snapshot.stages.reduce((sum, stage) => sum + stage.progress, 0);
    snapshot.overallProgress = totalProgress / snapshot.stages.length;
  }
  
  private updateTimeEstimates(snapshot: ProgressSnapshot): void {
    const now = Date.now();
    snapshot.elapsedTime = now - snapshot.startTime;
    
    // Calculate estimated total time based on completed stages
    const completedStages = snapshot.stages.filter(s => s.status === 'completed');
    
    if (completedStages.length > 0 && snapshot.overallProgress > 0) {
      const avgTimePerPercent = snapshot.elapsedTime / snapshot.overallProgress;
      snapshot.estimatedTotalTime = avgTimePerPercent * 100;
      snapshot.estimatedTimeRemaining = Math.max(0, snapshot.estimatedTotalTime - snapshot.elapsedTime);
    }
  }
  
  private startProgressUpdates(): void {
    this.updateInterval = setInterval(() => {
      for (const snapshot of this.jobs.values()) {
        if (!snapshot.isPaused) {
          this.updateTimeEstimates(snapshot);
        }
      }
    }, this.config.updateIntervalMs);
  }
  
  private emitEvent(type: ProgressEventType, jobId: string, data: any): void {
    const event: ProgressEvent = {
      type,
      jobId,
      timestamp: Date.now(),
      data,
    };
    
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in progress event handler for ${type}:`, error);
        }
      });
    }
  }
}