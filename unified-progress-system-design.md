# Unified Progress Bar System Design

## Multi-Stage Progress Architecture

### 1. Progress Bar Component Design

```typescript
// Core progress tracking interface
interface VideoProcessingProgress {
  // Overall progress
  overall: {
    percentage: number;
    stage: ProcessingStage;
    estimatedTimeRemaining: number; // seconds
  };
  
  // Stage-specific progress
  stages: {
    conversion: {
      status: 'pending' | 'active' | 'completed' | 'skipped' | 'failed';
      percentage: number;
      message: string;
    };
    chunking: {
      status: 'pending' | 'active' | 'completed' | 'failed';
      percentage: number;
      currentChunk: number;
      totalChunks: number;
      message: string;
    };
    processing: {
      status: 'pending' | 'active' | 'completed' | 'failed';
      percentage: number;
      chunksProcessed: number;
      totalChunks: number;
      currentChunkProgress: number;
      message: string;
    };
    assembly: {
      status: 'pending' | 'active' | 'completed' | 'failed';
      percentage: number;
      message: string;
    };
  };
  
  // Performance metrics
  metrics: {
    startTime: Date;
    conversionTime?: number;
    chunkingTime?: number;
    processingTime?: number;
    assemblyTime?: number;
    totalTime?: number;
    dataProcessed: number; // bytes
    memoryUsed: number; // bytes
  };
}

type ProcessingStage = 'initializing' | 'converting' | 'chunking' | 'processing' | 'assembling' | 'completed';
```

### 2. React Component Implementation

```tsx
// UnifiedProgressBar.tsx
import React, { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Circle, Loader2, XCircle } from 'lucide-react';

interface UnifiedProgressBarProps {
  progress: VideoProcessingProgress;
  showDetails?: boolean;
  compact?: boolean;
}

export function UnifiedProgressBar({ 
  progress, 
  showDetails = true,
  compact = false 
}: UnifiedProgressBarProps) {
  const stageIcons = {
    pending: <Circle className="w-4 h-4 text-gray-400" />,
    active: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
    completed: <CheckCircle className="w-4 h-4 text-green-500" />,
    skipped: <CheckCircle className="w-4 h-4 text-gray-400" />,
    failed: <XCircle className="w-4 h-4 text-red-500" />
  };

  const stages = [
    { key: 'conversion', label: 'Convert to MP4', optional: true },
    { key: 'chunking', label: 'Chunking Video' },
    { key: 'processing', label: 'Processing with AI' },
    { key: 'assembly', label: 'Assembling Results' }
  ];

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${Math.round(remainingSeconds)}s`;
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">{progress.overall.stage}</span>
          <span className="text-gray-500">
            {Math.round(progress.overall.percentage)}%
          </span>
        </div>
        <Progress value={progress.overall.percentage} className="h-2" />
        {progress.overall.estimatedTimeRemaining > 0 && (
          <p className="text-xs text-gray-500 text-right">
            ~{formatTime(progress.overall.estimatedTimeRemaining)} remaining
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg border">
      {/* Overall Progress */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Processing Video</h3>
          <span className="text-2xl font-bold text-blue-600">
            {Math.round(progress.overall.percentage)}%
          </span>
        </div>
        <Progress value={progress.overall.percentage} className="h-3" />
        {progress.overall.estimatedTimeRemaining > 0 && (
          <p className="text-sm text-gray-600">
            Estimated time remaining: {formatTime(progress.overall.estimatedTimeRemaining)}
          </p>
        )}
      </div>

      {/* Stage Progress */}
      {showDetails && (
        <div className="space-y-4">
          {stages.map((stage, index) => {
            const stageData = progress.stages[stage.key];
            const isOptional = stage.optional && stageData.status === 'skipped';
            
            return (
              <div key={stage.key} className="space-y-2">
                <div className="flex items-center gap-3">
                  {stageIcons[stageData.status]}
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm font-medium ${
                        stageData.status === 'active' ? 'text-blue-600' : 
                        stageData.status === 'completed' ? 'text-green-600' : 
                        'text-gray-600'
                      }`}>
                        {stage.label}
                        {isOptional && ' (skipped - already MP4)'}
                      </span>
                      {stageData.status === 'active' && (
                        <span className="text-xs text-gray-500">
                          {Math.round(stageData.percentage)}%
                        </span>
                      )}
                    </div>
                    
                    {stageData.status === 'active' && (
                      <>
                        <Progress 
                          value={stageData.percentage} 
                          className="h-1.5"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {stageData.message}
                        </p>
                      </>
                    )}
                    
                    {/* Special details for chunking */}
                    {stage.key === 'chunking' && stageData.status === 'active' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Creating chunk {stageData.currentChunk} of {stageData.totalChunks}
                      </p>
                    )}
                    
                    {/* Special details for processing */}
                    {stage.key === 'processing' && stageData.status === 'active' && (
                      <div className="text-xs text-gray-500 mt-1 space-y-1">
                        <p>Processing chunk {stageData.chunksProcessed + 1} of {stageData.totalChunks}</p>
                        <Progress 
                          value={stageData.currentChunkProgress} 
                          className="h-1"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Performance Metrics */}
      {showDetails && progress.metrics.totalTime && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Performance</h4>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            {progress.metrics.conversionTime && (
              <div>Conversion: {formatTime(progress.metrics.conversionTime)}</div>
            )}
            <div>Chunking: {formatTime(progress.metrics.chunkingTime || 0)}</div>
            <div>Processing: {formatTime(progress.metrics.processingTime || 0)}</div>
            <div>Assembly: {formatTime(progress.metrics.assemblyTime || 0)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 3. Progress Manager Hook

```typescript
// useVideoProcessing.ts
import { useState, useCallback, useRef } from 'react';

export function useVideoProcessing() {
  const [progress, setProgress] = useState<VideoProcessingProgress>({
    overall: {
      percentage: 0,
      stage: 'initializing',
      estimatedTimeRemaining: 0
    },
    stages: {
      conversion: {
        status: 'pending',
        percentage: 0,
        message: 'Waiting to start...'
      },
      chunking: {
        status: 'pending',
        percentage: 0,
        currentChunk: 0,
        totalChunks: 0,
        message: 'Waiting to start...'
      },
      processing: {
        status: 'pending',
        percentage: 0,
        chunksProcessed: 0,
        totalChunks: 0,
        currentChunkProgress: 0,
        message: 'Waiting to start...'
      },
      assembly: {
        status: 'pending',
        percentage: 0,
        message: 'Waiting to start...'
      }
    },
    metrics: {
      startTime: new Date(),
      dataProcessed: 0,
      memoryUsed: 0
    }
  });

  const startTimeRef = useRef<{ [key: string]: number }>({});

  const updateStage = useCallback((
    stage: keyof VideoProcessingProgress['stages'],
    updates: Partial<VideoProcessingProgress['stages'][typeof stage]>
  ) => {
    setProgress(prev => {
      const newProgress = { ...prev };
      
      // Update specific stage
      newProgress.stages[stage] = {
        ...newProgress.stages[stage],
        ...updates
      };

      // Calculate overall progress
      const weights = {
        conversion: 0.15, // 15% of total time
        chunking: 0.15,   // 15% of total time
        processing: 0.60, // 60% of total time
        assembly: 0.10    // 10% of total time
      };

      // If conversion is skipped, redistribute weight
      const actualWeights = { ...weights };
      if (newProgress.stages.conversion.status === 'skipped') {
        actualWeights.conversion = 0;
        actualWeights.chunking = 0.20;
        actualWeights.processing = 0.65;
        actualWeights.assembly = 0.15;
      }

      // Calculate weighted progress
      let totalProgress = 0;
      Object.keys(actualWeights).forEach((key) => {
        const stageKey = key as keyof typeof newProgress.stages;
        const weight = actualWeights[stageKey];
        const stageProgress = newProgress.stages[stageKey].percentage || 0;
        totalProgress += weight * stageProgress;
      });

      newProgress.overall.percentage = Math.min(100, totalProgress);

      // Update current stage name
      const activeStage = Object.keys(newProgress.stages).find(
        key => newProgress.stages[key].status === 'active'
      );
      
      if (activeStage) {
        const stageNames = {
          conversion: 'Converting to MP4',
          chunking: 'Creating chunks',
          processing: 'Processing with AI',
          assembly: 'Assembling results'
        };
        newProgress.overall.stage = stageNames[activeStage] || 'Processing';
      }

      // Track timing
      if (updates.status === 'active') {
        startTimeRef.current[stage] = Date.now();
      } else if (updates.status === 'completed' && startTimeRef.current[stage]) {
        const duration = (Date.now() - startTimeRef.current[stage]) / 1000;
        newProgress.metrics[`${stage}Time`] = duration;
      }

      // Estimate remaining time based on current progress rate
      if (totalProgress > 5) { // Only estimate after 5% complete
        const elapsed = (Date.now() - newProgress.metrics.startTime.getTime()) / 1000;
        const rate = totalProgress / elapsed;
        const remaining = (100 - totalProgress) / rate;
        newProgress.overall.estimatedTimeRemaining = Math.max(0, remaining);
      }

      return newProgress;
    });
  }, []);

  const startStage = useCallback((stage: keyof VideoProcessingProgress['stages']) => {
    updateStage(stage, { 
      status: 'active', 
      percentage: 0,
      message: 'Starting...'
    });
  }, [updateStage]);

  const completeStage = useCallback((stage: keyof VideoProcessingProgress['stages']) => {
    updateStage(stage, { 
      status: 'completed', 
      percentage: 100,
      message: 'Complete'
    });
  }, [updateStage]);

  const failStage = useCallback((
    stage: keyof VideoProcessingProgress['stages'], 
    error: string
  ) => {
    updateStage(stage, { 
      status: 'failed', 
      message: error
    });
  }, [updateStage]);

  const skipStage = useCallback((stage: keyof VideoProcessingProgress['stages']) => {
    updateStage(stage, { 
      status: 'skipped', 
      percentage: 100,
      message: 'Skipped'
    });
  }, [updateStage]);

  return {
    progress,
    updateStage,
    startStage,
    completeStage,
    failStage,
    skipStage
  };
}
```

### 4. Integration with Processing Pipeline

```typescript
// video-processor.ts
class VideoProcessor {
  private progressCallback: (update: any) => void;

  async processVideo(file: File) {
    const { 
      updateStage, 
      startStage, 
      completeStage, 
      skipStage 
    } = this.progressHooks;

    try {
      // Stage 1: Conversion (if needed)
      if (!this.isMP4(file)) {
        startStage('conversion');
        const mp4File = await this.convertToMP4(file, (progress) => {
          updateStage('conversion', {
            percentage: progress,
            message: `Converting video... ${Math.round(progress)}%`
          });
        });
        completeStage('conversion');
        file = mp4File;
      } else {
        skipStage('conversion');
      }

      // Stage 2: Chunking
      startStage('chunking');
      const chunks = await this.chunkVideo(file, (current, total) => {
        updateStage('chunking', {
          percentage: (current / total) * 100,
          currentChunk: current,
          totalChunks: total,
          message: `Creating chunk ${current} of ${total}`
        });
      });
      completeStage('chunking');

      // Stage 3: Processing
      startStage('processing');
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        updateStage('processing', {
          percentage: (i / chunks.length) * 100,
          chunksProcessed: i,
          totalChunks: chunks.length,
          currentChunkProgress: 0,
          message: `Processing chunk ${i + 1} of ${chunks.length}`
        });

        const result = await this.processChunkWithGemini(
          chunks[i], 
          (chunkProgress) => {
            updateStage('processing', {
              currentChunkProgress: chunkProgress,
              percentage: ((i + chunkProgress/100) / chunks.length) * 100
            });
          }
        );
        
        results.push(result);
      }
      completeStage('processing');

      // Stage 4: Assembly
      startStage('assembly');
      updateStage('assembly', {
        percentage: 30,
        message: 'Combining results...'
      });
      
      const finalResult = await this.assembleResults(results);
      
      updateStage('assembly', {
        percentage: 80,
        message: 'Finalizing...'
      });
      
      completeStage('assembly');

      return finalResult;

    } catch (error) {
      // Handle errors appropriately
      throw error;
    }
  }
}
```

### 5. Local Storage Strategy (with Vercel migration path)

```typescript
// storage-adapter.ts
interface StorageAdapter {
  saveProgress(projectId: string, progress: VideoProcessingProgress): Promise<void>;
  loadProgress(projectId: string): Promise<VideoProcessingProgress | null>;
  saveResult(projectId: string, result: any): Promise<void>;
  loadResult(projectId: string): Promise<any>;
}

// Local-first implementation
class LocalStorageAdapter implements StorageAdapter {
  async saveProgress(projectId: string, progress: VideoProcessingProgress) {
    const key = `video-progress-${projectId}`;
    localStorage.setItem(key, JSON.stringify(progress));
    
    // Also save to IndexedDB for larger data
    await this.saveToIndexedDB('progress', projectId, progress);
  }

  async loadProgress(projectId: string) {
    const key = `video-progress-${projectId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  async saveResult(projectId: string, result: any) {
    // Results go to IndexedDB (too large for localStorage)
    await this.saveToIndexedDB('results', projectId, result);
  }

  async loadResult(projectId: string) {
    return await this.loadFromIndexedDB('results', projectId);
  }

  private async saveToIndexedDB(store: string, key: string, value: any) {
    // IndexedDB implementation
  }

  private async loadFromIndexedDB(store: string, key: string) {
    // IndexedDB implementation
  }
}

// Future Vercel implementation
class VercelStorageAdapter implements StorageAdapter {
  async saveProgress(projectId: string, progress: VideoProcessingProgress) {
    // Save to local first for immediate access
    localStorage.setItem(`video-progress-${projectId}`, JSON.stringify(progress));
    
    // Then sync to server
    await fetch('/api/projects/progress', {
      method: 'POST',
      body: JSON.stringify({ projectId, progress })
    });
  }

  async loadProgress(projectId: string) {
    // Try local first
    const local = localStorage.getItem(`video-progress-${projectId}`);
    if (local) return JSON.parse(local);
    
    // Fallback to server
    const response = await fetch(`/api/projects/${projectId}/progress`);
    return response.ok ? await response.json() : null;
  }

  // Similar for results...
}

// Factory to switch between adapters
export function getStorageAdapter(mode: 'local' | 'cloud' = 'local'): StorageAdapter {
  return mode === 'local' ? new LocalStorageAdapter() : new VercelStorageAdapter();
}
```

### 6. Mobile-Responsive Progress Display

```tsx
// MobileProgressBar.tsx
export function MobileProgressBar({ progress }: { progress: VideoProcessingProgress }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 md:hidden">
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">
            {progress.overall.stage}
          </span>
          <span className="text-lg font-bold text-blue-600">
            {Math.round(progress.overall.percentage)}%
          </span>
        </div>
        
        <Progress value={progress.overall.percentage} className="h-3" />
        
        {progress.overall.estimatedTimeRemaining > 0 && (
          <p className="text-xs text-gray-500 text-center">
            ~{formatTime(progress.overall.estimatedTimeRemaining)} remaining
          </p>
        )}
        
        {/* Minimized stage indicators */}
        <div className="flex justify-between px-2">
          {['conversion', 'chunking', 'processing', 'assembly'].map(stage => {
            const status = progress.stages[stage].status;
            return (
              <div 
                key={stage}
                className={`w-2 h-2 rounded-full ${
                  status === 'completed' ? 'bg-green-500' :
                  status === 'active' ? 'bg-blue-500 animate-pulse' :
                  status === 'failed' ? 'bg-red-500' :
                  'bg-gray-300'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
```