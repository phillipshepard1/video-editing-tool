'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, Circle, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { formatTime, formatFileSize } from '@/lib/utils';

export interface ProcessingStage {
  name: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  progress: number;
  message?: string;
  startTime?: Date;
  endTime?: Date;
  error?: string;
}

export interface UnifiedProgressProps {
  overall: {
    percentage: number;
    stage: string;
    estimatedTimeRemaining?: number;
    startTime?: Date;
  };
  stages: {
    conversion?: ProcessingStage;
    compression?: ProcessingStage;
    chunking?: ProcessingStage;
    processing?: ProcessingStage;
    assembly?: ProcessingStage;
    export?: ProcessingStage;
  };
  metrics?: {
    dataProcessed?: number;
    totalData?: number;
    chunksProcessed?: number;
    totalChunks?: number;
    memoryUsed?: number;
  };
  compact?: boolean;
  showDetails?: boolean;
}

export function UnifiedProgress({ 
  overall, 
  stages, 
  metrics,
  compact = false,
  showDetails = true 
}: UnifiedProgressProps) {
  const getStatusIcon = (status: ProcessingStage['status']) => {
    switch (status) {
      case 'pending':
        return <Circle className="w-4 h-4 text-gray-400" />;
      case 'active':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped':
        return <CheckCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ProcessingStage['status']) => {
    switch (status) {
      case 'active':
        return 'text-blue-600';
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'skipped':
        return 'text-gray-400';
      default:
        return 'text-gray-600';
    }
  };

  const stageOrder = ['conversion', 'compression', 'chunking', 'processing', 'assembly', 'export'];
  const activeStages = stageOrder.filter(key => stages[key as keyof typeof stages]);

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">{overall.stage}</span>
          <span className="text-sm text-gray-600">
            {Math.round(overall.percentage)}%
          </span>
        </div>
        <Progress value={overall.percentage} className="h-2" />
        {overall.estimatedTimeRemaining && overall.estimatedTimeRemaining > 0 && (
          <p className="text-xs text-gray-500 text-right">
            ~{formatTime(overall.estimatedTimeRemaining)} remaining
          </p>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* Overall Progress */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Processing Video</h3>
            <span className="text-2xl font-bold text-blue-600">
              {Math.round(overall.percentage)}%
            </span>
          </div>
          
          <Progress value={overall.percentage} className="h-3" />
          
          <div className="flex justify-between text-sm text-gray-600">
            <span>{overall.stage}</span>
            {overall.estimatedTimeRemaining && overall.estimatedTimeRemaining > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(overall.estimatedTimeRemaining)} remaining
              </span>
            )}
          </div>
        </div>

        {/* Stage Details */}
        {showDetails && (
          <div className="space-y-3">
            {activeStages.map((stageKey) => {
              const stage = stages[stageKey as keyof typeof stages];
              if (!stage) return null;

              return (
                <div key={stageKey} className="space-y-2">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(stage.status)}
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span className={`text-sm font-medium capitalize ${getStatusColor(stage.status)}`}>
                          {stage.name || stageKey.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        {stage.status === 'active' && (
                          <span className="text-xs text-gray-500">
                            {Math.round(stage.progress)}%
                          </span>
                        )}
                      </div>
                      
                      {stage.status === 'active' && (
                        <>
                          <Progress 
                            value={stage.progress} 
                            className="h-1.5 mt-1"
                          />
                          {stage.message && (
                            <p className="text-xs text-gray-500 mt-1">
                              {stage.message}
                            </p>
                          )}
                        </>
                      )}
                      
                      {stage.status === 'failed' && stage.error && (
                        <p className="text-xs text-red-500 mt-1">
                          {stage.error}
                        </p>
                      )}
                      
                      {stage.status === 'skipped' && (
                        <p className="text-xs text-gray-400 mt-1">
                          Skipped (not needed)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Metrics */}
        {metrics && showDetails && (
          <div className="pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-xs">
              {metrics.dataProcessed && metrics.totalData && (
                <div>
                  <span className="text-gray-500">Data Processed</span>
                  <p className="font-medium">
                    {formatFileSize(metrics.dataProcessed)} / {formatFileSize(metrics.totalData)}
                  </p>
                </div>
              )}
              
              {metrics.chunksProcessed !== undefined && metrics.totalChunks && (
                <div>
                  <span className="text-gray-500">Chunks</span>
                  <p className="font-medium">
                    {metrics.chunksProcessed} / {metrics.totalChunks}
                  </p>
                </div>
              )}
              
              {metrics.memoryUsed && (
                <div>
                  <span className="text-gray-500">Memory Used</span>
                  <p className="font-medium">
                    {formatFileSize(metrics.memoryUsed)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Memory Warning */}
        {metrics?.memoryUsed && metrics.memoryUsed > 1.5 * 1024 * 1024 * 1024 && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-yellow-800 font-medium">High Memory Usage</p>
              <p className="text-xs text-yellow-700 mt-1">
                Consider closing other tabs to prevent slowdowns
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Minimal progress for mobile or embedded views
export function MinimalProgress({ percentage, message }: { percentage: number; message: string }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-50">
      <div className="max-w-4xl mx-auto space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">{message}</span>
          <span className="text-lg font-bold text-blue-600">
            {Math.round(percentage)}%
          </span>
        </div>
        <Progress value={percentage} className="h-2" />
      </div>
    </div>
  );
}