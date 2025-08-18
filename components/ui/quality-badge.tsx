'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Star, 
  AlertTriangle, 
  CheckCircle, 
  Zap, 
  Clock, 
  HelpCircle,
  Shield,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type QualityLevel = 'hd' | 'standard' | 'low' | 'processing' | 'failed' | 'premium';

interface QualityBadgeProps {
  quality: QualityLevel;
  className?: string;
  showTooltip?: boolean;
  retryAction?: () => void;
}

const QUALITY_CONFIG = {
  hd: {
    label: 'HD Render',
    icon: Star,
    className: 'bg-green-100 text-green-800 border-green-200',
    tooltip: 'High definition render (1080p or higher) with optimal quality settings'
  },
  standard: {
    label: 'Standard',
    icon: CheckCircle,
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    tooltip: 'Standard quality render (720p) with good compression balance'
  },
  low: {
    label: 'Low Quality - Retry?',
    icon: AlertTriangle,
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    tooltip: 'Lower quality render due to processing constraints. Click to retry with higher settings.'
  },
  processing: {
    label: 'Processing',
    icon: Clock,
    className: 'bg-gray-100 text-gray-800 border-gray-200 animate-pulse',
    tooltip: 'Video is currently being processed. Quality will be determined upon completion.'
  },
  failed: {
    label: 'Failed - Retry',
    icon: AlertTriangle,
    className: 'bg-red-100 text-red-800 border-red-200',
    tooltip: 'Render failed. Click to retry the rendering process.'
  },
  premium: {
    label: 'Premium 4K',
    icon: Sparkles,
    className: 'bg-purple-100 text-purple-800 border-purple-200',
    tooltip: 'Ultra-high quality 4K render with premium encoding settings'
  }
};

export function QualityBadge({ 
  quality, 
  className, 
  showTooltip = true, 
  retryAction 
}: QualityBadgeProps) {
  const config = QUALITY_CONFIG[quality];
  const Icon = config.icon;
  
  const badge = (
    <Badge
      className={cn(
        'flex items-center gap-1 text-xs font-medium border cursor-default',
        config.className,
        (quality === 'low' || quality === 'failed') && retryAction && 'cursor-pointer hover:opacity-80',
        className
      )}
      onClick={(quality === 'low' || quality === 'failed') && retryAction ? retryAction : undefined}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{config.tooltip}</p>
        {(quality === 'low' || quality === 'failed') && retryAction && (
          <p className="text-xs text-gray-400 mt-1">Click to retry</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

interface RenderQualityIndicatorProps {
  quality: QualityLevel;
  renderTime?: string;
  fileSize?: string;
  resolution?: string;
  bitrate?: string;
  className?: string;
  onRetry?: () => void;
}

export function RenderQualityIndicator({
  quality,
  renderTime,
  fileSize,
  resolution,
  bitrate,
  className,
  onRetry
}: RenderQualityIndicatorProps) {
  const config = QUALITY_CONFIG[quality];
  
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <QualityBadge 
        quality={quality} 
        retryAction={onRetry}
        showTooltip={true}
      />
      
      {(renderTime || fileSize || resolution || bitrate) && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
          {resolution && (
            <div className="flex items-center gap-1">
              <Shield className="w-3 h-3" />
              <span>{resolution}</span>
            </div>
          )}
          {fileSize && (
            <div className="flex items-center gap-1">
              <HelpCircle className="w-3 h-3" />
              <span>{fileSize}</span>
            </div>
          )}
          {renderTime && (
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              <span>{renderTime}</span>
            </div>
          )}
          {bitrate && (
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              <span>{bitrate}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}