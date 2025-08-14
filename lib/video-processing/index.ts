/**
 * Video Processing Pipeline - Main Entry Point
 * Exports all video processing components and utilities
 */

// Core Components
export { VideoProcessingEngine } from './core-engine';
export { FFmpegEngine } from './ffmpeg-engine';
export { VideoStorage } from './storage-manager';
export { MemoryManager } from './memory-manager';
export { ChunkingStrategy } from './chunking-strategy';
export { ProgressTracker } from './progress-tracker';
export { VideoExporter } from './video-exporter';
export { ErrorRecoveryManager } from './error-recovery';

// Types and Interfaces
export type {
  VideoProcessingJob,
  ProcessingStats,
  EngineConfig,
} from './core-engine';

export type {
  ProcessingOptions,
  ProcessingProgress,
  ChunkInfo,
} from './ffmpeg-engine';

export type {
  MemoryAllocation,
  MemoryStats,
  MemoryConfig,
} from './memory-manager';

export type {
  VideoInfo,
  ChunkingOptions,
  ComplexityAnalysis,
} from './chunking-strategy';

export type {
  ProgressSnapshot,
  ProgressConfig,
  ProgressEventType,
  ProgressEvent,
  StageInfo,
  SubStageInfo,
} from './progress-tracker';

export type {
  ExportOptions,
  ExportJob,
  QualityPreset,
} from './video-exporter';

export type {
  ErrorInfo,
  ErrorType,
  RecoveryAction,
  RecoveryStrategy,
  CrashDetectionConfig,
  RecoverySession,
} from './error-recovery';

export type {
  StorageStats,
} from './storage-manager';

// Utility Functions and Constants
export const DEFAULT_ENGINE_CONFIG = {
  maxConcurrentJobs: 2,
  maxMemoryMB: 4096,
  chunkSizeMB: 500,
  enableAutoRecovery: true,
  enableProgressPersistence: true,
  enableMemoryOptimization: true,
  fallbackToServerProcessing: false,
};

export const DEFAULT_MEMORY_CONFIG = {
  maxMemoryMB: 4096,
  warningThresholdPercent: 70,
  criticalThresholdPercent: 90,
  gcThresholdPercent: 80,
  monitoringIntervalMs: 2000,
};

export const DEFAULT_PROGRESS_CONFIG = {
  updateIntervalMs: 1000,
  memoryHistoryLength: 60,
  enableDetailedLogging: true,
  enablePerformanceMetrics: true,
  autoSaveProgress: true,
};

// Quality Presets
export const QUALITY_PRESETS = {
  lossless: {
    quality: 'lossless' as const,
    preserveOriginalQuality: true,
    crf: 0,
    preset: 'veryslow' as const,
    videoBitrate: '50M',
    audioBitrate: '1411k',
  },
  high: {
    quality: 'high' as const,
    preserveOriginalQuality: false,
    crf: 18,
    preset: 'slow' as const,
    videoBitrate: '8M',
    audioBitrate: '320k',
  },
  medium: {
    quality: 'medium' as const,
    preserveOriginalQuality: false,
    crf: 23,
    preset: 'medium' as const,
    videoBitrate: '4M',
    audioBitrate: '192k',
  },
  low: {
    quality: 'low' as const,
    preserveOriginalQuality: false,
    crf: 28,
    preset: 'fast' as const,
    videoBitrate: '1M',
    audioBitrate: '128k',
  },
};

// Browser Compatibility Check
export function checkBrowserCompatibility(): {
  compatible: boolean;
  features: {
    webAssembly: boolean;
    sharedArrayBuffer: boolean;
    indexedDB: boolean;
    worker: boolean;
    performanceMemory: boolean;
  };
  issues: string[];
} {
  const features = {
    webAssembly: typeof WebAssembly !== 'undefined',
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined',
    worker: typeof Worker !== 'undefined',
    performanceMemory: 'memory' in performance,
  };

  const issues: string[] = [];
  
  if (!features.webAssembly) {
    issues.push('WebAssembly not supported - video processing will not work');
  }
  
  if (!features.indexedDB) {
    issues.push('IndexedDB not supported - progress saving will not work');
  }
  
  if (!features.worker) {
    issues.push('Web Workers not supported - background processing limited');
  }
  
  if (!features.sharedArrayBuffer) {
    issues.push('SharedArrayBuffer not available - performance may be reduced');
  }
  
  if (!features.performanceMemory) {
    issues.push('Performance Memory API not available - memory monitoring limited');
  }

  const compatible = features.webAssembly && features.indexedDB;

  return {
    compatible,
    features,
    issues,
  };
}

// Main Video Processing Manager
export class VideoProcessingManager {
  private engine: VideoProcessingEngine;
  private memoryManager: MemoryManager;
  private progressTracker: ProgressTracker;
  private storage: VideoStorage;
  private errorRecovery: ErrorRecoveryManager;
  private initialized = false;

  constructor(config: Partial<EngineConfig> = {}) {
    const finalConfig = { ...DEFAULT_ENGINE_CONFIG, ...config };
    
    this.memoryManager = new MemoryManager({
      ...DEFAULT_MEMORY_CONFIG,
      maxMemoryMB: finalConfig.maxMemoryMB,
    });
    
    this.progressTracker = new ProgressTracker(DEFAULT_PROGRESS_CONFIG);
    this.storage = new VideoStorage();
    
    this.engine = new VideoProcessingEngine(finalConfig);
    
    this.errorRecovery = new ErrorRecoveryManager(
      this.storage,
      this.memoryManager,
      this.progressTracker,
      {
        enableAutoSave: finalConfig.enableProgressPersistence,
        enablePreventiveActions: finalConfig.enableMemoryOptimization,
      }
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check browser compatibility
    const compatibility = checkBrowserCompatibility();
    if (!compatibility.compatible) {
      throw new Error(`Browser not compatible: ${compatibility.issues.join(', ')}`);
    }

    try {
      // Initialize all components
      await Promise.all([
        this.memoryManager.initialize(),
        this.progressTracker,
        this.storage.initialize(),
        this.errorRecovery.initialize(),
      ]);

      await this.engine.initialize();

      this.initialized = true;
      console.log('Video Processing Manager initialized successfully');
      
    } catch (error) {
      throw new Error(`Failed to initialize Video Processing Manager: ${error}`);
    }
  }

  async processVideo(
    inputFile: File,
    options: ProcessingOptions = {}
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      return await this.engine.addJob(inputFile, options);
    } catch (error) {
      // Handle error through recovery system
      await this.errorRecovery.handleError(
        error instanceof Error ? error : new Error(String(error)),
        'processing-timeout',
        'high'
      );
      throw error;
    }
  }

  getJob(jobId: string) {
    return this.engine.getJob(jobId);
  }

  getStats() {
    return this.engine.getStats();
  }

  getMemoryStats() {
    return this.memoryManager.getStats();
  }

  getProgress(jobId: string) {
    return this.progressTracker.getProgress(jobId);
  }

  async checkSystemHealth() {
    return await this.errorRecovery.checkSystemHealth();
  }

  setEventHandlers(handlers: {
    onJobProgress?: (jobId: string, progress: ProcessingProgress) => void;
    onJobComplete?: (jobId: string, result: File) => void;
    onJobError?: (jobId: string, error: string) => void;
    onMemoryWarning?: (usage: number, limit: number) => void;
  }) {
    this.engine.setEventHandlers(handlers);
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    await Promise.all([
      this.engine.shutdown(),
      this.errorRecovery.shutdown(),
      this.storage.cleanup(),
    ]);

    this.memoryManager.shutdown();
    this.progressTracker.shutdown();

    this.initialized = false;
  }
}

// Export default instance for convenience
let defaultManager: VideoProcessingManager | null = null;

export function getDefaultManager(config?: Partial<EngineConfig>): VideoProcessingManager {
  if (!defaultManager) {
    defaultManager = new VideoProcessingManager(config);
  }
  return defaultManager;
}

export async function initializeVideoProcessing(config?: Partial<EngineConfig>): Promise<VideoProcessingManager> {
  const manager = getDefaultManager(config);
  await manager.initialize();
  return manager;
}