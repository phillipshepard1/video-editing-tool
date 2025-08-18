/**
 * Comprehensive Error Handling and Recovery Service
 * Handles video processing errors, provides recovery suggestions, and manages retries
 */

export interface ErrorContext {
  operation: string;
  stage: string;
  videoInfo?: {
    name: string;
    size: number;
    format: string;
    duration?: number;
  };
  processingOptions?: any;
  attempt: number;
  maxAttempts: number;
  timestamp: number;
}

export interface ErrorRecoveryAction {
  action: 'retry' | 'convert' | 'chunk' | 'reduce_quality' | 'skip' | 'abort';
  description: string;
  parameters?: Record<string, any>;
  estimatedSuccessRate: number;
  estimatedTime?: string;
}

export interface ProcessingError {
  code: string;
  message: string;
  category: 'validation' | 'conversion' | 'chunking' | 'upload' | 'render' | 'network' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  context: ErrorContext;
  recoveryActions: ErrorRecoveryAction[];
  userMessage: string;
  technicalDetails?: string;
}

export class VideoProcessingErrorHandler {
  private errorHistory: ProcessingError[] = [];
  private maxHistorySize = 100;

  /**
   * Process and categorize errors with recovery suggestions
   */
  handleError(error: Error, context: ErrorContext): ProcessingError {
    const processedError = this.categorizeError(error, context);
    
    // Add to history
    this.errorHistory.unshift(processedError);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.pop();
    }
    
    console.error('Video processing error:', {
      error: processedError,
      context
    });
    
    return processedError;
  }

  /**
   * Categorize error and generate recovery actions
   */
  private categorizeError(error: Error, context: ErrorContext): ProcessingError {
    const errorMessage = error.message.toLowerCase();
    
    // File validation errors
    if (this.isValidationError(errorMessage)) {
      return this.createValidationError(error, context);
    }
    
    // Conversion errors
    if (this.isConversionError(errorMessage)) {
      return this.createConversionError(error, context);
    }
    
    // Chunking errors
    if (this.isChunkingError(errorMessage)) {
      return this.createChunkingError(error, context);
    }
    
    // Upload errors
    if (this.isUploadError(errorMessage)) {
      return this.createUploadError(error, context);
    }
    
    // Render errors
    if (this.isRenderError(errorMessage)) {
      return this.createRenderError(error, context);
    }
    
    // Network errors
    if (this.isNetworkError(errorMessage)) {
      return this.createNetworkError(error, context);
    }
    
    // System errors
    return this.createSystemError(error, context);
  }

  private isValidationError(message: string): boolean {
    return message.includes('invalid') ||
           message.includes('not supported') ||
           message.includes('too large') ||
           message.includes('validation');
  }

  private isConversionError(message: string): boolean {
    return message.includes('conversion') ||
           message.includes('codec') ||
           message.includes('ffmpeg') ||
           message.includes('format');
  }

  private isChunkingError(message: string): boolean {
    return message.includes('chunk') ||
           message.includes('split') ||
           message.includes('segment');
  }

  private isUploadError(message: string): boolean {
    return message.includes('upload') ||
           message.includes('gemini') ||
           message.includes('supabase');
  }

  private isRenderError(message: string): boolean {
    return message.includes('render') ||
           message.includes('chillin');
  }

  private isNetworkError(message: string): boolean {
    return message.includes('network') ||
           message.includes('timeout') ||
           message.includes('connection') ||
           message.includes('fetch');
  }

  private createValidationError(error: Error, context: ErrorContext): ProcessingError {
    const recoveryActions: ErrorRecoveryAction[] = [];
    
    if (error.message.includes('too large')) {
      recoveryActions.push({
        action: 'chunk',
        description: 'Split video into smaller parts',
        estimatedSuccessRate: 0.9,
        estimatedTime: '2-5 minutes'
      });
      
      recoveryActions.push({
        action: 'convert',
        description: 'Convert to lower quality to reduce size',
        parameters: { quality: 'medium' },
        estimatedSuccessRate: 0.8,
        estimatedTime: '3-8 minutes'
      });
    }
    
    if (error.message.includes('not supported')) {
      recoveryActions.push({
        action: 'convert',
        description: 'Convert to MP4 format',
        parameters: { format: 'mp4' },
        estimatedSuccessRate: 0.95,
        estimatedTime: '2-10 minutes'
      });
    }
    
    recoveryActions.push({
      action: 'abort',
      description: 'Cancel upload and try different video',
      estimatedSuccessRate: 1.0
    });
    
    return {
      code: 'VALIDATION_ERROR',
      message: error.message,
      category: 'validation',
      severity: 'medium',
      recoverable: true,
      context,
      recoveryActions,
      userMessage: 'Video file validation failed. The file may be too large, corrupt, or in an unsupported format.',
      technicalDetails: error.stack
    };
  }

  private createConversionError(error: Error, context: ErrorContext): ProcessingError {
    const recoveryActions: ErrorRecoveryAction[] = [];
    
    if (context.attempt < context.maxAttempts) {
      recoveryActions.push({
        action: 'retry',
        description: 'Retry conversion with different settings',
        parameters: { quality: 'low', preset: 'fast' },
        estimatedSuccessRate: 0.7,
        estimatedTime: '1-3 minutes'
      });
    }
    
    recoveryActions.push({
      action: 'reduce_quality',
      description: 'Use lower quality settings',
      parameters: { quality: 'low' },
      estimatedSuccessRate: 0.8,
      estimatedTime: '2-5 minutes'
    });
    
    recoveryActions.push({
      action: 'abort',
      description: 'Cancel and try different video',
      estimatedSuccessRate: 1.0
    });
    
    return {
      code: 'CONVERSION_ERROR',
      message: error.message,
      category: 'conversion',
      severity: 'high',
      recoverable: true,
      context,
      recoveryActions,
      userMessage: 'Video conversion failed. This may be due to complex video format or system limitations.',
      technicalDetails: error.stack
    };
  }

  private createChunkingError(error: Error, context: ErrorContext): ProcessingError {
    const recoveryActions: ErrorRecoveryAction[] = [];
    
    recoveryActions.push({
      action: 'chunk',
      description: 'Try smaller chunk sizes',
      parameters: { chunkSize: 250 }, // 250MB instead of 500MB
      estimatedSuccessRate: 0.8,
      estimatedTime: '3-8 minutes'
    });
    
    if (context.attempt < context.maxAttempts) {
      recoveryActions.push({
        action: 'retry',
        description: 'Retry chunking process',
        estimatedSuccessRate: 0.6,
        estimatedTime: '2-5 minutes'
      });
    }
    
    recoveryActions.push({
      action: 'convert',
      description: 'Convert to lower quality first',
      parameters: { quality: 'medium' },
      estimatedSuccessRate: 0.9,
      estimatedTime: '5-10 minutes'
    });
    
    return {
      code: 'CHUNKING_ERROR',
      message: error.message,
      category: 'chunking',
      severity: 'medium',
      recoverable: true,
      context,
      recoveryActions,
      userMessage: 'Failed to split video into chunks. This may be due to video complexity or system memory limits.',
      technicalDetails: error.stack
    };
  }

  private createUploadError(error: Error, context: ErrorContext): ProcessingError {
    const recoveryActions: ErrorRecoveryAction[] = [];
    
    if (context.attempt < context.maxAttempts) {
      recoveryActions.push({
        action: 'retry',
        description: 'Retry upload',
        estimatedSuccessRate: 0.7,
        estimatedTime: '1-3 minutes'
      });
    }
    
    if (error.message.includes('timeout')) {
      recoveryActions.push({
        action: 'chunk',
        description: 'Split into smaller chunks for faster upload',
        parameters: { chunkSize: 100 },
        estimatedSuccessRate: 0.8,
        estimatedTime: '3-8 minutes'
      });
    }
    
    recoveryActions.push({
      action: 'convert',
      description: 'Reduce video quality to decrease upload time',
      parameters: { quality: 'medium' },
      estimatedSuccessRate: 0.9,
      estimatedTime: '5-10 minutes'
    });
    
    return {
      code: 'UPLOAD_ERROR',
      message: error.message,
      category: 'upload',
      severity: 'high',
      recoverable: true,
      context,
      recoveryActions,
      userMessage: 'Video upload failed. This may be due to network issues or server problems.',
      technicalDetails: error.stack
    };
  }

  private createRenderError(error: Error, context: ErrorContext): ProcessingError {
    const recoveryActions: ErrorRecoveryAction[] = [];
    
    if (context.attempt < context.maxAttempts) {
      recoveryActions.push({
        action: 'retry',
        description: 'Retry render job',
        estimatedSuccessRate: 0.6,
        estimatedTime: '5-15 minutes'
      });
    }
    
    recoveryActions.push({
      action: 'reduce_quality',
      description: 'Use lower render quality',
      parameters: { quality: 'medium' },
      estimatedSuccessRate: 0.8,
      estimatedTime: '3-8 minutes'
    });
    
    return {
      code: 'RENDER_ERROR',
      message: error.message,
      category: 'render',
      severity: 'high',
      recoverable: true,
      context,
      recoveryActions,
      userMessage: 'Video rendering failed. The render service may be busy or the video may be too complex.',
      technicalDetails: error.stack
    };
  }

  private createNetworkError(error: Error, context: ErrorContext): ProcessingError {
    const recoveryActions: ErrorRecoveryAction[] = [];
    
    if (context.attempt < context.maxAttempts) {
      recoveryActions.push({
        action: 'retry',
        description: 'Retry with exponential backoff',
        estimatedSuccessRate: 0.8,
        estimatedTime: '30 seconds to 5 minutes'
      });
    }
    
    return {
      code: 'NETWORK_ERROR',
      message: error.message,
      category: 'network',
      severity: 'medium',
      recoverable: true,
      context,
      recoveryActions,
      userMessage: 'Network error occurred. Please check your internet connection and try again.',
      technicalDetails: error.stack
    };
  }

  private createSystemError(error: Error, context: ErrorContext): ProcessingError {
    const recoveryActions: ErrorRecoveryAction[] = [];
    
    recoveryActions.push({
      action: 'abort',
      description: 'Cancel operation and try again later',
      estimatedSuccessRate: 1.0
    });
    
    return {
      code: 'SYSTEM_ERROR',
      message: error.message,
      category: 'system',
      severity: 'critical',
      recoverable: false,
      context,
      recoveryActions,
      userMessage: 'An unexpected system error occurred. Please try again later or contact support.',
      technicalDetails: error.stack
    };
  }

  /**
   * Get error statistics for monitoring
   */
  getErrorStats(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    recoverySuccessRate: number;
  } {
    const total = this.errorHistory.length;
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let recoverableCount = 0;
    
    for (const error of this.errorHistory) {
      byCategory[error.category] = (byCategory[error.category] || 0) + 1;
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      if (error.recoverable) recoverableCount++;
    }
    
    return {
      total,
      byCategory,
      bySeverity,
      recoverySuccessRate: total > 0 ? recoverableCount / total : 0
    };
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): ProcessingError[] {
    return this.errorHistory.slice(0, limit);
  }
}

// Export singleton instance
let errorHandlerInstance: VideoProcessingErrorHandler | null = null;

export function getErrorHandler(): VideoProcessingErrorHandler {
  if (!errorHandlerInstance) {
    errorHandlerInstance = new VideoProcessingErrorHandler();
  }
  return errorHandlerInstance;
}

// Helper function for creating error context
export function createErrorContext(
  operation: string,
  stage: string,
  videoInfo?: { name: string; size: number; format: string; duration?: number },
  processingOptions?: any,
  attempt: number = 1,
  maxAttempts: number = 3
): ErrorContext {
  return {
    operation,
    stage,
    videoInfo,
    processingOptions,
    attempt,
    maxAttempts,
    timestamp: Date.now()
  };
}
