/**
 * Error Recovery and Browser Crash Prevention System
 * Handles errors gracefully, prevents crashes, and provides recovery mechanisms
 */

import { VideoStorage } from './storage-manager';
import { MemoryManager } from './memory-manager';
import { ProgressTracker, ProgressSnapshot } from './progress-tracker';

export interface ErrorInfo {
  id: string;
  type: ErrorType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  stack?: string;
  timestamp: number;
  jobId?: string;
  context?: Record<string, any>;
  recoveryAction?: RecoveryAction;
  recovered: boolean;
  retryCount: number;
}

export type ErrorType = 
  | 'memory-overflow'
  | 'ffmpeg-crash'
  | 'file-corruption'
  | 'network-failure'
  | 'storage-quota'
  | 'browser-compatibility'
  | 'processing-timeout'
  | 'invalid-format'
  | 'permission-denied'
  | 'unknown';

export type RecoveryAction =
  | 'retry'
  | 'reduce-quality'
  | 'split-chunks'
  | 'clear-memory'
  | 'fallback-mode'
  | 'reload-engine'
  | 'save-progress'
  | 'manual-intervention';

export interface RecoveryStrategy {
  errorType: ErrorType;
  actions: RecoveryAction[];
  maxRetries: number;
  retryDelay: number; // milliseconds
  fallbackStrategy?: RecoveryStrategy;
}

export interface CrashDetectionConfig {
  memoryThresholdMB: number;
  timeoutThresholdMs: number;
  heartbeatIntervalMs: number;
  enableAutoSave: boolean;
  enablePreventiveActions: boolean;
}

export interface RecoverySession {
  sessionId: string;
  startTime: number;
  lastActivity: number;
  activeJobs: string[];
  savedProgress: Map<string, ProgressSnapshot>;
  recoveryAttempts: number;
  crashed: boolean;
}

export class ErrorRecoveryManager {
  private storage: VideoStorage;
  private memoryManager: MemoryManager;
  private progressTracker: ProgressTracker;
  
  private errors = new Map<string, ErrorInfo>();
  private recoveryStrategies = new Map<ErrorType, RecoveryStrategy>();
  private config: CrashDetectionConfig;
  
  private currentSession: RecoverySession;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private preventiveMeasuresActive = false;
  
  private onErrorHandler?: (error: ErrorInfo) => void;
  private onRecoveryHandler?: (error: ErrorInfo, success: boolean) => void;
  private onCrashDetectedHandler?: (session: RecoverySession) => void;
  
  constructor(
    storage: VideoStorage,
    memoryManager: MemoryManager,
    progressTracker: ProgressTracker,
    config: Partial<CrashDetectionConfig> = {}
  ) {
    this.storage = storage;
    this.memoryManager = memoryManager;
    this.progressTracker = progressTracker;
    
    this.config = {
      memoryThresholdMB: 3000, // 3GB
      timeoutThresholdMs: 300000, // 5 minutes
      heartbeatIntervalMs: 5000, // 5 seconds
      enableAutoSave: true,
      enablePreventiveActions: true,
      ...config,
    };
    
    this.currentSession = this.createNewSession();
    this.initializeRecoveryStrategies();
    this.startCrashDetection();
    
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
  }
  
  /**
   * Initialize the recovery manager
   */
  async initialize(): Promise<void> {
    try {
      // Check for previous session recovery
      await this.checkForPreviousSession();
      
      // Save current session
      await this.saveCurrentSession();
      
      console.log('Error recovery manager initialized');
      
    } catch (error) {
      console.error('Failed to initialize error recovery manager:', error);
    }
  }
  
  /**
   * Handle an error with automatic recovery attempts
   */
  async handleError(
    error: Error | string,
    type: ErrorType,
    severity: ErrorInfo['severity'] = 'medium',
    jobId?: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    const errorInfo: ErrorInfo = {
      id: this.generateErrorId(),
      type,
      severity,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: Date.now(),
      jobId,
      context,
      recovered: false,
      retryCount: 0,
    };
    
    this.errors.set(errorInfo.id, errorInfo);
    
    if (this.onErrorHandler) {
      this.onErrorHandler(errorInfo);
    }
    
    console.error(`Error detected [${type}]:`, errorInfo.message);
    
    // Attempt recovery
    const recovered = await this.attemptRecovery(errorInfo);
    
    if (this.onRecoveryHandler) {
      this.onRecoveryHandler(errorInfo, recovered);
    }
    
    return recovered;
  }
  
  /**
   * Check system health and prevent crashes
   */
  async checkSystemHealth(): Promise<{
    healthy: boolean;
    warnings: string[];
    actions: RecoveryAction[];
  }> {
    const warnings: string[] = [];
    const actions: RecoveryAction[] = [];
    
    // Check memory usage
    const memoryStats = this.memoryManager.getStats();
    if (memoryStats.currentUsageMB > this.config.memoryThresholdMB) {
      warnings.push(`High memory usage: ${memoryStats.currentUsageMB}MB`);
      actions.push('clear-memory');
      
      if (memoryStats.warningLevel === 'critical') {
        actions.push('save-progress');
      }
    }
    
    // Check for long-running operations
    const activeJobs = this.progressTracker.getAllProgress();
    const longRunningJobs = activeJobs.filter(job => 
      Date.now() - job.startTime > this.config.timeoutThresholdMs
    );
    
    if (longRunningJobs.length > 0) {
      warnings.push(`${longRunningJobs.length} long-running jobs detected`);
      actions.push('split-chunks');
    }
    
    // Check storage quota
    try {
      const storageStats = await this.storage.getStorageStats();
      if (storageStats.quotaUsed > 85) {
        warnings.push(`Storage quota almost full: ${storageStats.quotaUsed}%`);
        actions.push('save-progress');
      }
    } catch (error) {
      warnings.push('Failed to check storage quota');
    }
    
    const healthy = warnings.length === 0;
    
    // Take preventive actions if enabled
    if (!healthy && this.config.enablePreventiveActions) {
      await this.takePreventiveActions(actions);
    }
    
    return { healthy, warnings, actions };
  }
  
  /**
   * Force save all progress to prevent data loss
   */
  async saveAllProgress(): Promise<void> {
    try {
      const activeJobs = this.progressTracker.getAllProgress();
      
      for (const job of activeJobs) {
        this.currentSession.savedProgress.set(job.jobId, job);
      }
      
      await this.saveCurrentSession();
      console.log(`Saved progress for ${activeJobs.length} jobs`);
      
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  }
  
  /**
   * Recover from a previous session
   */
  async recoverFromSession(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await this.storage.getSetting(`recovery_session_${sessionId}`);
      if (!sessionData) {
        console.warn(`No recovery data found for session ${sessionId}`);
        return false;
      }
      
      const session: RecoverySession = sessionData;
      
      console.log(`Recovering from session ${sessionId} with ${session.activeJobs.length} jobs`);
      
      // Restore progress for each job
      let recoveredJobs = 0;
      for (const [jobId, progress] of session.savedProgress) {
        try {
          // Re-initialize job progress tracking
          this.progressTracker.initializeJob(jobId, progress.stages.map(stage => ({
            id: stage.id,
            name: stage.name,
            description: stage.description,
          })));
          
          // Restore progress state
          for (const stage of progress.stages) {
            if (stage.status === 'completed') {
              this.progressTracker.completeStage(jobId, stage.id);
            } else if (stage.status === 'active') {
              this.progressTracker.startStage(jobId, stage.id);
              this.progressTracker.updateStageProgress(jobId, stage.id, stage.progress);
            }
          }
          
          recoveredJobs++;
          
        } catch (error) {
          console.error(`Failed to recover job ${jobId}:`, error);
        }
      }
      
      console.log(`Successfully recovered ${recoveredJobs} out of ${session.activeJobs.length} jobs`);
      
      // Clean up old session data
      await this.storage.setSetting(`recovery_session_${sessionId}`, null);
      
      return recoveredJobs > 0;
      
    } catch (error) {
      console.error('Failed to recover from session:', error);
      return false;
    }
  }
  
  /**
   * Get error history
   */
  getErrorHistory(): ErrorInfo[] {
    return Array.from(this.errors.values()).sort((a, b) => b.timestamp - a.timestamp);
  }
  
  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    totalErrors: number;
    recoveredErrors: number;
    recoveryRate: number;
    errorsByType: Record<ErrorType, number>;
    errorsBySeverity: Record<ErrorInfo['severity'], number>;
  } {
    const errors = Array.from(this.errors.values());
    const totalErrors = errors.length;
    const recoveredErrors = errors.filter(e => e.recovered).length;
    const recoveryRate = totalErrors > 0 ? (recoveredErrors / totalErrors) * 100 : 0;
    
    const errorsByType: Record<ErrorType, number> = {} as any;
    const errorsBySeverity: Record<ErrorInfo['severity'], number> = {} as any;
    
    for (const error of errors) {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    }
    
    return {
      totalErrors,
      recoveredErrors,
      recoveryRate,
      errorsByType,
      errorsBySeverity,
    };
  }
  
  /**
   * Set event handlers
   */
  setEventHandlers(handlers: {
    onError?: (error: ErrorInfo) => void;
    onRecovery?: (error: ErrorInfo, success: boolean) => void;
    onCrashDetected?: (session: RecoverySession) => void;
  }): void {
    this.onErrorHandler = handlers.onError;
    this.onRecoveryHandler = handlers.onRecovery;
    this.onCrashDetectedHandler = handlers.onCrashDetected;
  }
  
  /**
   * Shutdown the recovery manager
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Save final progress
    await this.saveAllProgress();
    
    // Clean up session
    this.currentSession.crashed = false;
    await this.saveCurrentSession();
    
    console.log('Error recovery manager shutdown');
  }
  
  // Private methods
  
  private async attemptRecovery(errorInfo: ErrorInfo): Promise<boolean> {
    const strategy = this.recoveryStrategies.get(errorInfo.type);
    if (!strategy) {
      console.warn(`No recovery strategy for error type: ${errorInfo.type}`);
      return false;
    }
    
    errorInfo.recoveryAction = strategy.actions[0];
    
    for (let attempt = 0; attempt < strategy.maxRetries; attempt++) {
      errorInfo.retryCount = attempt + 1;
      
      console.log(`Recovery attempt ${attempt + 1}/${strategy.maxRetries} for ${errorInfo.type}`);
      
      try {
        const success = await this.executeRecoveryAction(errorInfo, strategy.actions[attempt] || strategy.actions[0]);
        
        if (success) {
          errorInfo.recovered = true;
          console.log(`Successfully recovered from ${errorInfo.type}`);
          return true;
        }
        
        // Wait before next attempt
        if (attempt < strategy.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, strategy.retryDelay));
        }
        
      } catch (recoveryError) {
        console.error(`Recovery attempt ${attempt + 1} failed:`, recoveryError);
      }
    }
    
    // Try fallback strategy if available
    if (strategy.fallbackStrategy) {
      console.log(`Trying fallback strategy for ${errorInfo.type}`);
      return this.attemptRecoveryWithStrategy(errorInfo, strategy.fallbackStrategy);
    }
    
    console.error(`Failed to recover from ${errorInfo.type} after ${strategy.maxRetries} attempts`);
    return false;
  }
  
  private async attemptRecoveryWithStrategy(errorInfo: ErrorInfo, strategy: RecoveryStrategy): Promise<boolean> {
    for (let attempt = 0; attempt < strategy.maxRetries; attempt++) {
      try {
        const success = await this.executeRecoveryAction(errorInfo, strategy.actions[attempt] || strategy.actions[0]);
        if (success) {
          errorInfo.recovered = true;
          return true;
        }
        
        if (attempt < strategy.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, strategy.retryDelay));
        }
        
      } catch (error) {
        console.error(`Fallback recovery attempt ${attempt + 1} failed:`, error);
      }
    }
    
    return false;
  }
  
  private async executeRecoveryAction(errorInfo: ErrorInfo, action: RecoveryAction): Promise<boolean> {
    switch (action) {
      case 'retry':
        // Simply return true to indicate retry should be attempted
        return true;
        
      case 'clear-memory':
        this.memoryManager.forceGarbageCollection();
        this.memoryManager.clearAllocations();
        return true;
        
      case 'reduce-quality':
        // This would need to be handled by the calling code
        console.log('Suggesting quality reduction for recovery');
        return true;
        
      case 'split-chunks':
        // This would need to be handled by the calling code
        console.log('Suggesting chunk splitting for recovery');
        return true;
        
      case 'save-progress':
        await this.saveAllProgress();
        return true;
        
      case 'reload-engine':
        // This would need to be coordinated with the main engine
        console.log('Requesting engine reload for recovery');
        return true;
        
      case 'fallback-mode':
        // Enable fallback processing mode
        console.log('Enabling fallback processing mode');
        return true;
        
      case 'manual-intervention':
        // Requires user action
        console.log('Manual intervention required for recovery');
        return false;
        
      default:
        console.warn(`Unknown recovery action: ${action}`);
        return false;
    }
  }
  
  private async takePreventiveActions(actions: RecoveryAction[]): Promise<void> {
    if (this.preventiveMeasuresActive) return;
    
    this.preventiveMeasuresActive = true;
    
    try {
      for (const action of actions) {
        console.log(`Taking preventive action: ${action}`);
        await this.executeRecoveryAction({} as ErrorInfo, action);
      }
    } finally {
      this.preventiveMeasuresActive = false;
    }
  }
  
  private startCrashDetection(): void {
    this.heartbeatInterval = setInterval(async () => {
      this.currentSession.lastActivity = Date.now();
      
      // Check system health
      const health = await this.checkSystemHealth();
      
      if (!health.healthy && health.warnings.length > 0) {
        console.warn('System health warnings:', health.warnings);
      }
      
      // Update session periodically
      if (this.config.enableAutoSave) {
        await this.saveCurrentSession();
      }
      
    }, this.config.heartbeatIntervalMs);
  }
  
  private async checkForPreviousSession(): Promise<void> {
    try {
      const lastSessionId = await this.storage.getSetting('last_recovery_session');
      if (!lastSessionId) return;
      
      const sessionData = await this.storage.getSetting(`recovery_session_${lastSessionId}`);
      if (!sessionData) return;
      
      const session: RecoverySession = sessionData;
      
      // Check if session crashed (no proper shutdown)
      const timeSinceLastActivity = Date.now() - session.lastActivity;
      if (timeSinceLastActivity > this.config.heartbeatIntervalMs * 3) {
        console.warn(`Detected potential crash from session ${lastSessionId}`);
        session.crashed = true;
        
        if (this.onCrashDetectedHandler) {
          this.onCrashDetectedHandler(session);
        }
        
        // Offer recovery
        if (session.activeJobs.length > 0) {
          console.log(`Found ${session.activeJobs.length} jobs that may need recovery`);
        }
      }
      
    } catch (error) {
      console.error('Failed to check for previous session:', error);
    }
  }
  
  private createNewSession(): RecoverySession {
    return {
      sessionId: this.generateSessionId(),
      startTime: Date.now(),
      lastActivity: Date.now(),
      activeJobs: [],
      savedProgress: new Map(),
      recoveryAttempts: 0,
      crashed: false,
    };
  }
  
  private async saveCurrentSession(): Promise<void> {
    try {
      // Convert Map to object for storage
      const sessionData = {
        ...this.currentSession,
        savedProgress: Object.fromEntries(this.currentSession.savedProgress),
      };
      
      await this.storage.setSetting(`recovery_session_${this.currentSession.sessionId}`, sessionData);
      await this.storage.setSetting('last_recovery_session', this.currentSession.sessionId);
      
    } catch (error) {
      console.error('Failed to save current session:', error);
    }
  }
  
  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        this.handleError(
          event.reason,
          'unknown',
          'high',
          undefined,
          { type: 'unhandled-promise-rejection' }
        );
      });
      
      // Handle general errors
      window.addEventListener('error', (event) => {
        this.handleError(
          event.error || event.message,
          'unknown',
          'medium',
          undefined,
          { 
            type: 'general-error',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          }
        );
      });
    }
  }
  
  private initializeRecoveryStrategies(): void {
    // Memory overflow recovery
    this.recoveryStrategies.set('memory-overflow', {
      errorType: 'memory-overflow',
      actions: ['clear-memory', 'split-chunks', 'reduce-quality'],
      maxRetries: 3,
      retryDelay: 2000,
      fallbackStrategy: {
        errorType: 'memory-overflow',
        actions: ['save-progress', 'reload-engine'],
        maxRetries: 1,
        retryDelay: 5000,
      },
    });
    
    // FFmpeg crash recovery
    this.recoveryStrategies.set('ffmpeg-crash', {
      errorType: 'ffmpeg-crash',
      actions: ['reload-engine', 'reduce-quality', 'split-chunks'],
      maxRetries: 2,
      retryDelay: 3000,
      fallbackStrategy: {
        errorType: 'ffmpeg-crash',
        actions: ['fallback-mode'],
        maxRetries: 1,
        retryDelay: 1000,
      },
    });
    
    // File corruption recovery
    this.recoveryStrategies.set('file-corruption', {
      errorType: 'file-corruption',
      actions: ['retry', 'fallback-mode'],
      maxRetries: 2,
      retryDelay: 1000,
    });
    
    // Network failure recovery
    this.recoveryStrategies.set('network-failure', {
      errorType: 'network-failure',
      actions: ['retry', 'save-progress'],
      maxRetries: 5,
      retryDelay: 2000,
    });
    
    // Storage quota recovery
    this.recoveryStrategies.set('storage-quota', {
      errorType: 'storage-quota',
      actions: ['save-progress', 'clear-memory'],
      maxRetries: 1,
      retryDelay: 1000,
    });
    
    // Processing timeout recovery
    this.recoveryStrategies.set('processing-timeout', {
      errorType: 'processing-timeout',
      actions: ['split-chunks', 'reduce-quality', 'clear-memory'],
      maxRetries: 3,
      retryDelay: 1000,
    });
    
    // Browser compatibility recovery
    this.recoveryStrategies.set('browser-compatibility', {
      errorType: 'browser-compatibility',
      actions: ['fallback-mode', 'manual-intervention'],
      maxRetries: 1,
      retryDelay: 0,
    });
  }
  
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}