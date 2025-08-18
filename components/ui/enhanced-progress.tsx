'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  Scissors, 
  Merge, 
  Video, 
  CheckCircle, 
  Loader2, 
  AlertCircle,
  Clock,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProcessingStep {
  id: string;
  label: string;
  description?: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  progress?: number;
}

export interface ChunkingProgressProps {
  currentStep: number;
  totalSteps: number;
  currentChunk?: number;
  totalChunks?: number;
  progress: number;
  stage: 'upload' | 'chunking' | 'processing' | 'stitching' | 'complete' | 'error';
  message?: string;
  estimatedTimeRemaining?: string;
  showChunkDetails?: boolean;
  className?: string;
}

const STAGE_CONFIG = {
  upload: {
    icon: Upload,
    label: 'Uploading',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  chunking: {
    icon: Scissors,
    label: 'Splitting Video',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  },
  processing: {
    icon: Video,
    label: 'Processing',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50'
  },
  stitching: {
    icon: Merge,
    label: 'Stitching Segments',
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  },
  complete: {
    icon: CheckCircle,
    label: 'Complete',
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  },
  error: {
    icon: AlertCircle,
    label: 'Error',
    color: 'text-red-600',
    bgColor: 'bg-red-50'
  }
};

export function ChunkingProgress({
  currentStep,
  totalSteps,
  currentChunk,
  totalChunks,
  progress,
  stage,
  message,
  estimatedTimeRemaining,
  showChunkDetails = true,
  className
}: ChunkingProgressProps) {
  const config = STAGE_CONFIG[stage];
  const Icon = config.icon;

  return (
    <div className={cn('p-4 rounded-lg border', config.bgColor, className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {stage === 'processing' || stage === 'upload' ? (
            <Loader2 className={cn('w-4 h-4 animate-spin', config.color)} />
          ) : (
            <Icon className={cn('w-4 h-4', config.color)} />
          )}
          <span className={cn('font-medium', config.color)}>{config.label}</span>
          {currentStep && totalSteps && (
            <Badge variant="outline" className="text-xs">
              Step {currentStep}/{totalSteps}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>{Math.round(progress)}%</span>
          {estimatedTimeRemaining && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{estimatedTimeRemaining}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <Progress value={progress} className="mb-3" />

      {/* Message */}
      {message && (
        <p className="text-sm text-gray-700 mb-2">{message}</p>
      )}

      {/* Chunk Details */}
      {showChunkDetails && currentChunk && totalChunks && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Processing chunk {currentChunk} of {totalChunks}</span>
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            <span>{Math.round((currentChunk / totalChunks) * 100)}% of chunks</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface MultiStepProgressProps {
  steps: ProcessingStep[];
  className?: string;
}

export function MultiStepProgress({ steps, className }: MultiStepProgressProps) {
  const getStepIcon = (step: ProcessingStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'active':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStepColor = (step: ProcessingStep) => {
    switch (step.status) {
      case 'completed':
        return 'text-green-600';
      case 'active':
        return 'text-blue-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-start gap-3">
          {/* Step Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {getStepIcon(step)}
          </div>
          
          {/* Step Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('font-medium text-sm', getStepColor(step))}>
                {step.label}
              </span>
              {step.status === 'active' && step.progress !== undefined && (
                <Badge variant="outline" className="text-xs">
                  {Math.round(step.progress)}%
                </Badge>
              )}
            </div>
            
            {step.description && (
              <p className="text-xs text-gray-600 mt-1">{step.description}</p>
            )}
            
            {step.status === 'active' && step.progress !== undefined && (
              <Progress value={step.progress} className="mt-2 h-1" />
            )}
          </div>
          
          {/* Connector Line */}
          {index < steps.length - 1 && (
            <div className="absolute left-5 mt-6 w-px h-6 bg-gray-200" 
                 style={{ transform: 'translateX(-50%)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

interface ConversionFeedbackProps {
  isConverting: boolean;
  fromFormat: string;
  toFormat: string;
  progress: number;
  message?: string;
  className?: string;
}

export function ConversionFeedback({
  isConverting,
  fromFormat,
  toFormat,
  progress,
  message,
  className
}: ConversionFeedbackProps) {
  return (
    <div className={cn('p-4 bg-yellow-50 border border-yellow-200 rounded-lg', className)}>
      <div className="flex items-center gap-2 mb-3">
        {isConverting ? (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-600" />
        ) : (
          <Video className="w-4 h-4 text-yellow-600" />
        )}
        <span className="font-medium text-yellow-800">
          Converting {fromFormat} to {toFormat}
        </span>
        <Badge variant="outline" className="text-xs">
          {Math.round(progress)}%
        </Badge>
      </div>
      
      <Progress value={progress} className="mb-2" />
      
      <p className="text-sm text-yellow-700">
        {message || `Converting your ${fromFormat} file to ${toFormat} for optimal processing...`}
      </p>
      
      <p className="text-xs text-yellow-600 mt-1">
        This ensures the best quality and fastest processing time.
      </p>
    </div>
  );
}