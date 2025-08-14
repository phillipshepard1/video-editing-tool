import { EnhancedSegment, SegmentCategory } from '@/lib/types/segments';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Eye, Check, X, Clock, MessageSquare, AlertTriangle } from 'lucide-react';

interface SegmentCardProps {
  segment: EnhancedSegment;
  onKeep: () => void;
  onRemove: () => void;
  onPreview: () => void;
  isSelected?: boolean;
}

const CATEGORY_STYLES = {
  [SegmentCategory.BAD_TAKE]: {
    badge: 'destructive' as const,
    icon: '🔄',
    label: 'Bad Take'
  },
  [SegmentCategory.PAUSE]: {
    badge: 'warning' as const,
    icon: '⏸️',
    label: 'Pause'
  },
  [SegmentCategory.FALSE_START]: {
    badge: 'warning' as const,
    icon: '🔁',
    label: 'False Start'
  },
  [SegmentCategory.FILLER_WORDS]: {
    badge: 'secondary' as const,
    icon: '💬',
    label: 'Filler Words'
  },
  [SegmentCategory.TECHNICAL]: {
    badge: 'destructive' as const,
    icon: '⚠️',
    label: 'Technical'
  },
  [SegmentCategory.REDUNDANT]: {
    badge: 'default' as const,
    icon: '♻️',
    label: 'Redundant'
  },
  [SegmentCategory.TANGENT]: {
    badge: 'default' as const,
    icon: '↗️',
    label: 'Tangent'
  },
  [SegmentCategory.LOW_ENERGY]: {
    badge: 'default' as const,
    icon: '📉',
    label: 'Low Energy'
  },
  [SegmentCategory.LONG_EXPLANATION]: {
    badge: 'default' as const,
    icon: '📝',
    label: 'Long'
  },
  [SegmentCategory.WEAK_TRANSITION]: {
    badge: 'default' as const,
    icon: '🔀',
    label: 'Weak Transition'
  }
};

export function SegmentCard({ segment, onKeep, onRemove, onPreview, isSelected = false }: SegmentCardProps) {
  // Handle legacy format - map old categories to new enum values
  const mapLegacyCategory = (category: string): SegmentCategory => {
    if (category === 'pause') return SegmentCategory.PAUSE;
    if (category === 'filler') return SegmentCategory.FILLER_WORDS;
    if (category === 'redundant') return SegmentCategory.REDUNDANT;
    if (category === 'off-topic') return SegmentCategory.TANGENT;
    if (category === 'technical') return SegmentCategory.TECHNICAL;
    
    // Try to match enum value or default to TECHNICAL
    return (Object.values(SegmentCategory).includes(category as SegmentCategory)) 
      ? category as SegmentCategory 
      : SegmentCategory.TECHNICAL;
  };
  
  const displayCategory = segment.category ? mapLegacyCategory(segment.category) : SegmentCategory.TECHNICAL;
  const style = CATEGORY_STYLES[displayCategory];
  
  return (
    <Card className={`overflow-hidden transition-all duration-200 group ${
      isSelected 
        ? 'shadow-lg border-gray-700 bg-gray-100/30' 
        : 'hover:shadow-lg'
    }`}>
      <CardContent className="p-0">
        <div className="p-3 space-y-2">
          {/* Header with time and badges */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={style.badge} className="gap-1">
                <span>{style.icon}</span>
                <span>{style.label}</span>
              </Badge>
              
              {segment.severity && (
                <Badge 
                  variant={
                    segment.severity === 'high' ? 'destructive' : 
                    segment.severity === 'medium' ? 'warning' : 
                    'secondary'
                  }
                  className="text-xs"
                >
                  {segment.severity.toUpperCase()}
                </Badge>
              )}
              
              <Badge variant="outline" className="gap-1">
                <span className="text-xs">{(segment.confidence * 100).toFixed(0)}%</span>
              </Badge>
            </div>
            
            <div className="text-right">
              <div className="flex items-center gap-1 text-sm font-mono">
                <Clock className="h-3 w-3" />
                <span>{segment.startTime} - {segment.endTime}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {segment.duration}s duration
              </p>
            </div>
          </div>
          
          {/* Reason */}
          <div className="space-y-2">
            <p className="text-sm leading-relaxed">{segment.reason}</p>
          </div>
          
          {/* Transcript Preview */}
          {segment.transcript && (
            <div className="bg-muted/50 rounded-lg p-3 border">
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground italic flex-1">
                  "{segment.transcript}..."
                </p>
              </div>
            </div>
          )}
          
          {/* Alternative Segment (for bad takes) */}
          {segment.alternativeSegment && (
            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-200 dark:border-green-900">
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">
                    Better version available
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    {segment.alternativeSegment.startTime} - {segment.alternativeSegment.endTime}
                  </p>
                  {segment.alternativeSegment.reason && (
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                      {segment.alternativeSegment.reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Context Note */}
          {segment.contextNote && (
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-400 flex-1">
                  <span className="font-medium">Consider:</span> {segment.contextNote}
                </p>
              </div>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="border-t bg-muted/30 p-2">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onPreview}
              className="flex-1 gap-2"
            >
              <Eye className="h-4 w-4" />
              Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onKeep}
              className="flex-1 gap-2 text-green-600 hover:text-green-700 hover:bg-green-50"
            >
              <Check className="h-4 w-4" />
              Keep
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="flex-1 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}