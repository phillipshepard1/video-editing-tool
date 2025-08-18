'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QualityBadge, RenderQualityIndicator, type QualityLevel } from '@/components/ui/quality-badge';
import { ChunkingProgress, MultiStepProgress, ConversionFeedback, type ProcessingStep } from '@/components/ui/enhanced-progress';
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Play,
  Download,
  RotateCcw,
  Video,
  FileText,
  Zap,
  Upload,
  Scissors,
  Merge
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProcessingStatus = 
  | 'idle' 
  | 'uploading' 
  | 'converting'
  | 'chunking'
  | 'analyzing' 
  | 'processing' 
  | 'stitching'
  | 'rendering' 
  | 'completed' 
  | 'error';

export interface ConversionProgress {
  stage: 'uploading' | 'converting' | 'processing' | 'complete';
  progress: number;
  message: string;
  chunkInfo?: {
    currentChunk: number;
    totalChunks: number;
  };
}

export interface ProcessingInfo {
  status: ProcessingStatus;
  progress: number;
  stage?: string;
  message?: string;
  estimatedTime?: string;
  currentSegment?: number;
  totalSegments?: number;
  currentChunk?: number;
  totalChunks?: number;
  error?: string;
  conversionInfo?: {
    fromFormat: string;
    toFormat: string;
    isConverting: boolean;
  };
  renderQuality?: QualityLevel;
  renderInfo?: {
    renderTime?: string;
    fileSize?: string;
    resolution?: string;
    bitrate?: string;
  };
}

interface EnhancedVideoStatusProps {
  info: ProcessingInfo;
  onRetry?: () => void;
  onCancel?: () => void;
  onQualityRetry?: () => void;
  className?: string;
  showChunkingDetails?: boolean;
  showConversionFeedback?: boolean;
}

const STATUS_CONFIG = {
  idle: { 
    color: 'text-gray-500', 
    bgColor: 'bg-gray-50', 
    icon: Clock,
    label: 'Ready' 
  },
  uploading: { 
    color: 'text-blue-600', 
    bgColor: 'bg-blue-50', 
    icon: Upload,
    label: 'Uploading' 
  },
  converting: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    icon: Video,
    label: 'Converting'
  },
  chunking: {
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    icon: Scissors,
    label: 'Splitting Video'
  },
  analyzing: { 
    color: 'text-purple-600', 
    bgColor: 'bg-purple-50', 
    icon: Video,
    label: 'Analyzing' 
  },
  processing: { 
    color: 'text-orange-600', 
    bgColor: 'bg-orange-50', 
    icon: Zap,
    label: 'Processing' 
  },
  stitching: {
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    icon: Merge,
    label: 'Stitching Segments'
  },
  rendering: { 
    color: 'text-green-600', 
    bgColor: 'bg-green-50', 
    icon: FileText,
    label: 'Rendering' 
  },
  completed: { 
    color: 'text-green-600', 
    bgColor: 'bg-green-50', 
    icon: CheckCircle,
    label: 'Completed' 
  },
  error: { 
    color: 'text-red-600', 
    bgColor: 'bg-red-50', 
    icon: AlertCircle,
    label: 'Error' 
  }
};

export function EnhancedVideoStatus({
  info,
  onRetry,
  onCancel,
  onQualityRetry,
  className,
  showChunkingDetails = true,
  showConversionFeedback = true
}: EnhancedVideoStatusProps) {
  const config = STATUS_CONFIG[info.status];
  const Icon = config.icon;
  const isAnimated = ['uploading', 'converting', 'chunking', 'analyzing', 'processing', 'stitching', 'rendering'].includes(info.status);

  // Enhanced chunking progress for large files
  const shouldShowChunkingProgress = showChunkingDetails && (
    info.status === 'chunking' || 
    info.status === 'processing' || 
    info.status === 'stitching'
  ) && info.currentChunk && info.totalChunks;

  // Conversion feedback for format conversion
  const shouldShowConversionFeedback = showConversionFeedback && 
    info.status === 'converting' && 
    info.conversionInfo;

  return (
    <Card className={cn('w-full', className)}>
      <CardContent className={cn('p-6', config.bgColor)}>
        {/* Header with Quality Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Icon className={cn(
              'w-5 h-5', 
              config.color,
              isAnimated && info.status !== 'stitching' && 'animate-spin'
            )} />
            <h3 className={cn('font-medium', config.color)}>
              {config.label}
            </h3>
            {info.status === 'completed' && info.renderQuality && (
              <QualityBadge 
                quality={info.renderQuality} 
                retryAction={onQualityRetry}
              />
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {info.estimatedTime && (
              <Badge variant="outline" className="text-xs">
                {info.estimatedTime}
              </Badge>
            )}
            {info.progress > 0 && info.status !== 'completed' && (
              <Badge variant="outline" className="text-xs">
                {Math.round(info.progress)}%
              </Badge>
            )}
          </div>
        </div>

        {/* Conversion Feedback */}
        {shouldShowConversionFeedback && (
          <ConversionFeedback
            isConverting={info.conversionInfo!.isConverting}
            fromFormat={info.conversionInfo!.fromFormat}
            toFormat={info.conversionInfo!.toFormat}
            progress={info.progress}
            message={info.message}
            className="mb-4"
          />
        )}

        {/* Enhanced Chunking Progress */}
        {shouldShowChunkingProgress && (
          <ChunkingProgress
            currentStep={1}
            totalSteps={3}
            currentChunk={info.currentChunk!}
            totalChunks={info.totalChunks!}
            progress={info.progress}
            stage={info.status as any}
            message={info.message}
            estimatedTimeRemaining={info.estimatedTime}
            className="mb-4"
          />
        )}

        {/* Standard Progress Bar for non-chunking operations */}
        {!shouldShowChunkingProgress && !shouldShowConversionFeedback && info.progress > 0 && info.status !== 'error' && (
          <Progress value={info.progress} className="mb-4" />
        )}

        {/* Stage Info */}
        {info.stage && !shouldShowChunkingProgress && !shouldShowConversionFeedback && (
          <p className="text-sm font-medium text-gray-700 mb-2">
            {info.stage}
          </p>
        )}

        {/* Message */}
        {info.message && !shouldShowChunkingProgress && !shouldShowConversionFeedback && (
          <p className="text-sm text-gray-600 mb-4">
            {info.message}
          </p>
        )}

        {/* Segment Progress for non-chunking workflows */}
        {!shouldShowChunkingProgress && info.currentSegment && info.totalSegments && (
          <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
            <span>Processing segment {info.currentSegment} of {info.totalSegments}</span>
            <span>{Math.round((info.currentSegment / info.totalSegments) * 100)}%</span>
          </div>
        )}

        {/* Render Quality Details for Completed */}
        {info.status === 'completed' && info.renderQuality && info.renderInfo && (
          <RenderQualityIndicator
            quality={info.renderQuality}
            renderTime={info.renderInfo.renderTime}
            fileSize={info.renderInfo.fileSize}
            resolution={info.renderInfo.resolution}
            bitrate={info.renderInfo.bitrate}
            onRetry={onQualityRetry}
            className="mb-4"
          />
        )}

        {/* Error Message */}
        {info.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{info.error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            {info.status === 'error' && onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            )}
            {info.status === 'completed' && (
              <>
                <Button size="sm">
                  <Play className="w-4 h-4 mr-2" />
                  Preview
                </Button>
                <Button size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </>
            )}
          </div>
          
          {(['uploading', 'converting', 'chunking', 'analyzing', 'processing', 'stitching', 'rendering'].includes(info.status)) && onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}