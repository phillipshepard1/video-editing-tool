'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { 
  HelpCircle, 
  Info, 
  Star, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Zap, 
  Settings,
  Video,
  Scissors,
  Merge,
  Upload,
  Download,
  Eye,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpTooltipProps {
  content: string;
  title?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}

export function HelpTooltip({ content, title, side = 'top', className, children }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('cursor-help', className)}>
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        {title && <p className="font-medium mb-1">{title}</p>}
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const QUALITY_EXPLANATIONS = {
  hd: {
    title: 'HD Render Quality',
    description: 'High definition video with 1080p resolution or higher, using optimal encoding settings for the best visual quality.',
    pros: ['Crystal clear video quality', 'Suitable for professional use', 'Best viewing experience'],
    cons: ['Larger file sizes', 'Longer processing time'],
    icon: Star,
    color: 'text-green-600'
  },
  standard: {
    title: 'Standard Quality',
    description: 'Balanced quality render at 720p resolution with good compression for web viewing.',
    pros: ['Good quality-to-size ratio', 'Faster processing', 'Web-optimized'],
    cons: ['Lower resolution than HD', 'Some quality compromise'],
    icon: CheckCircle,
    color: 'text-blue-600'
  },
  low: {
    title: 'Low Quality',
    description: 'Reduced quality render due to processing constraints or file size limitations.',
    pros: ['Smaller file sizes', 'Faster processing', 'Good for previews'],
    cons: ['Noticeably lower quality', 'Not suitable for final output'],
    icon: AlertTriangle,
    color: 'text-yellow-600'
  },
  premium: {
    title: 'Premium 4K Quality',
    description: 'Ultra-high definition 4K render with premium encoding settings for professional use.',
    pros: ['Maximum video quality', '4K resolution', 'Professional grade'],
    cons: ['Very large file sizes', 'Extended processing time'],
    icon: Shield,
    color: 'text-purple-600'
  }
};

const PROCESSING_STAGES = {
  upload: {
    title: 'Upload Stage',
    description: 'Your video file is being transferred to our processing system.',
    details: 'During upload, the file is securely transferred and prepared for processing. Large files may be chunked for efficient transfer.',
    icon: Upload,
    color: 'text-blue-600'
  },
  conversion: {
    title: 'Format Conversion',
    description: 'Converting your video to an optimal format for processing.',
    details: 'Some video formats need to be converted to MP4 for best processing results. This ensures compatibility and optimal quality.',
    icon: Video,
    color: 'text-yellow-600'
  },
  chunking: {
    title: 'Video Chunking',
    description: 'Large videos are split into smaller segments for efficient processing.',
    details: 'This allows us to process large files more efficiently and provides better progress feedback. Chunks are processed in parallel when possible.',
    icon: Scissors,
    color: 'text-purple-600'
  },
  analysis: {
    title: 'Video Analysis',
    description: 'AI analyzes your video content to identify segments for removal.',
    details: 'Our AI examines the video frame-by-frame to identify filler words, long pauses, and other content you may want to remove.',
    icon: Eye,
    color: 'text-indigo-600'
  },
  processing: {
    title: 'Content Processing',
    description: 'Applying edits and optimizations to your video content.',
    details: 'The identified segments are processed according to your preferences. This includes trimming, transitions, and quality adjustments.',
    icon: Zap,
    color: 'text-orange-600'
  },
  stitching: {
    title: 'Segment Stitching',
    description: 'Combining processed video segments back into a single file.',
    details: 'All processed chunks are seamlessly combined to create your final edited video with smooth transitions.',
    icon: Merge,
    color: 'text-green-600'
  },
  rendering: {
    title: 'Final Rendering',
    description: 'Creating the final optimized video file for download.',
    details: 'The final video is rendered with your chosen quality settings and prepared for download.',
    icon: Download,
    color: 'text-green-600'
  }
};

interface VideoHelpSystemProps {
  className?: string;
}

export function VideoHelpSystem({ className }: VideoHelpSystemProps) {
  const [activeSection, setActiveSection] = useState<'quality' | 'processing'>('quality');

  return (
    <TooltipProvider>
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5" />
            Video Processing Help
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Button
              size="sm"
              variant={activeSection === 'quality' ? 'default' : 'outline'}
              onClick={() => setActiveSection('quality')}
            >
              Quality Levels
            </Button>
            <Button
              size="sm"
              variant={activeSection === 'processing' ? 'default' : 'outline'}
              onClick={() => setActiveSection('processing')}
            >
              Processing Stages
            </Button>
          </div>

          {activeSection === 'quality' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium mb-4">Render Quality Levels</h3>
              {Object.entries(QUALITY_EXPLANATIONS).map(([key, quality]) => {
                const Icon = quality.icon;
                return (
                  <div key={key} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className={cn('w-5 h-5', quality.color)} />
                      <h4 className="font-medium">{quality.title}</h4>
                      <Badge variant="outline" className="text-xs uppercase">
                        {key}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{quality.description}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-green-700 mb-1">Advantages:</p>
                        <ul className="text-xs text-green-600 space-y-1">
                          {quality.pros.map((pro, index) => (
                            <li key={index} className="flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              {pro}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-amber-700 mb-1">Considerations:</p>
                        <ul className="text-xs text-amber-600 space-y-1">
                          {quality.cons.map((con, index) => (
                            <li key={index} className="flex items-center gap-1">
                              <Info className="w-3 h-3" />
                              {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeSection === 'processing' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium mb-4">Processing Stages</h3>
              {Object.entries(PROCESSING_STAGES).map(([key, stage]) => {
                const Icon = stage.icon;
                return (
                  <div key={key} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={cn('w-5 h-5', stage.color)} />
                      <h4 className="font-medium">{stage.title}</h4>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{stage.description}</p>
                    <p className="text-xs text-gray-500">{stage.details}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

// Quality Badge with integrated help
interface QualityBadgeWithHelpProps {
  quality: keyof typeof QUALITY_EXPLANATIONS;
  className?: string;
  retryAction?: () => void;
}

export function QualityBadgeWithHelp({ 
  quality, 
  className, 
  retryAction 
}: QualityBadgeWithHelpProps) {
  const config = QUALITY_EXPLANATIONS[quality];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <HelpTooltip
        title={config.title}
        content={config.description}
        className={className}
      >
        <Badge
          className={cn(
            'flex items-center gap-1 text-xs font-medium border cursor-help',
            quality === 'hd' && 'bg-green-100 text-green-800 border-green-200',
            quality === 'standard' && 'bg-blue-100 text-blue-800 border-blue-200',
            quality === 'low' && 'bg-yellow-100 text-yellow-800 border-yellow-200 cursor-pointer hover:opacity-80',
            quality === 'premium' && 'bg-purple-100 text-purple-800 border-purple-200'
          )}
          onClick={quality === 'low' && retryAction ? retryAction : undefined}
        >
          <Icon className="w-3 h-3" />
          {config.title}
        </Badge>
      </HelpTooltip>
    </TooltipProvider>
  );
}

// Processing stage indicator with help
interface ProcessingStageWithHelpProps {
  stage: keyof typeof PROCESSING_STAGES;
  isActive?: boolean;
  progress?: number;
  className?: string;
}

export function ProcessingStageWithHelp({ 
  stage, 
  isActive = false, 
  progress,
  className 
}: ProcessingStageWithHelpProps) {
  const config = PROCESSING_STAGES[stage];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <HelpTooltip
        title={config.title}
        content={config.details}
        className={className}
      >
        <div className={cn(
          'flex items-center gap-2 p-2 rounded',
          isActive && 'bg-blue-50 border border-blue-200'
        )}>
          <Icon className={cn(
            'w-4 h-4',
            config.color,
            isActive && 'animate-pulse'
          )} />
          <span className={cn(
            'text-sm',
            isActive ? 'font-medium' : 'text-gray-600'
          )}>
            {config.title}
          </span>
          {progress !== undefined && (
            <Badge variant="outline" className="text-xs">
              {Math.round(progress)}%
            </Badge>
          )}
        </div>
      </HelpTooltip>
    </TooltipProvider>
  );
}