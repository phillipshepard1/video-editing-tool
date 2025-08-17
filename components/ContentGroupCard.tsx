'use client';

import React, { useState } from 'react';
import { ContentGroup, Take, TakeSelection } from '@/lib/types/takes';
import { QualityMeter } from './QualityMeter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  RotateCcw, 
  GitCompare, 
  Crown, 
  X, 
  CheckCircle,
  AlertTriangle,
  Clock
} from 'lucide-react';

interface ContentGroupCardProps {
  group: ContentGroup;
  selectedTakeId: string;
  isUserOverride: boolean;
  onTakeSelect: (selection: TakeSelection) => void;
  onPlayTake: (take: Take) => void;
  onCompareTakes: (takeA: Take, takeB: Take) => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

export function ContentGroupCard({
  group,
  selectedTakeId,
  isUserOverride,
  onTakeSelect,
  onPlayTake,
  onCompareTakes,
  videoRef
}: ContentGroupCardProps) {
  const [showAllTakes, setShowAllTakes] = useState(false);
  const selectedTake = group.takes.find(t => t.id === selectedTakeId);
  const bestTake = group.takes.find(t => t.id === group.bestTakeId);
  const removedTakes = group.takes.filter(t => t.id !== selectedTakeId);

  // Format time for display
  const formatTime = (timeStr: string): string => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return timeStr; // Already MM:SS format
    }
    // Convert from seconds if needed
    const totalSeconds = parseFloat(timeStr);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Get content type icon
  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'introduction': return '👋';
      case 'explanation': return '💡';
      case 'conclusion': return '🎯';
      case 'transition': return '🔄';
      case 'key_point': return '⭐';
      default: return '📝';
    }
  };

  // Handle take selection
  const handleTakeSelection = (takeId: string, reason?: string) => {
    onTakeSelect({
      groupId: group.id,
      selectedTakeId: takeId,
      isUserOverride: takeId !== group.bestTakeId,
      reason
    });
  };

  // Handle reset to AI recommendation
  const handleResetToAI = () => {
    handleTakeSelection(group.bestTakeId, 'Reset to AI recommendation');
  };

  const takesToShow = showAllTakes ? group.takes : group.takes.slice(0, 3);

  return (
    <Card className="p-4 space-y-4 bg-white border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{getContentTypeIcon(group.contentType)}</span>
            <h3 className="font-semibold text-gray-900">{group.name}</h3>
            <Badge 
              variant="outline" 
              className="text-xs bg-blue-50 text-blue-700 border-blue-200"
            >
              {group.takes.length} takes
            </Badge>
          </div>
          <p className="text-sm text-gray-600 mb-2">{group.description}</p>
          
          {/* Time Range */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(group.timeRange.start)} - {formatTime(group.timeRange.end)}
            </div>
            <QualityMeter 
              score={group.averageQuality} 
              size="sm" 
              showScore={true}
            />
          </div>
        </div>

        {/* User Override Indicator */}
        {isUserOverride && (
          <div className="flex items-center gap-2">
            <Badge className="bg-orange-100 text-orange-800 border-orange-200">
              User Choice
            </Badge>
            <Button
              onClick={handleResetToAI}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset to AI
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Selected Take (Kept) */}
      {selectedTake && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="font-medium text-green-700">KEPT</span>
            {selectedTake.id === group.bestTakeId && (
              <Crown className="w-4 h-4 text-yellow-500" title="AI Recommended" />
            )}
          </div>
          
          <TakeRow
            take={selectedTake}
            isSelected={true}
            isAIRecommended={selectedTake.id === group.bestTakeId}
            onPlay={() => onPlayTake(selectedTake)}
            onSelect={() => {}} // Already selected
            showSelectButton={false}
          />
          
          {/* AI Reasoning for selection */}
          {selectedTake.id === group.bestTakeId && (
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-sm font-medium text-blue-900 mb-1">AI Reasoning:</p>
                  <p className="text-sm text-blue-800">{group.reasoning}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Removed Takes */}
      {removedTakes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <X className="w-4 h-4 text-red-600" />
              <span className="font-medium text-red-700">
                REMOVED ({removedTakes.length})
              </span>
            </div>
            
            {/* Show All Toggle */}
            {group.takes.length > 3 && (
              <Button
                onClick={() => setShowAllTakes(!showAllTakes)}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                {showAllTakes ? 'Show Less' : `Show All ${group.takes.length}`}
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {removedTakes.slice(0, showAllTakes ? undefined : 2).map((take) => (
              <TakeRow
                key={take.id}
                take={take}
                isSelected={false}
                isAIRecommended={take.id === group.bestTakeId}
                onPlay={() => onPlayTake(take)}
                onSelect={() => handleTakeSelection(take.id, 'User manually selected alternative take')}
                onCompareWithSelected={selectedTake ? () => onCompareTakes(selectedTake, take) : undefined}
                showSelectButton={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Group Actions */}
      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          Confidence: {Math.round(group.confidence * 100)}%
        </div>
        
        <div className="flex gap-2">
          {selectedTake && removedTakes.length > 0 && (
            <Button
              onClick={() => onCompareTakes(selectedTake, bestTake || removedTakes[0])}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              <GitCompare className="w-3 h-3 mr-1" />
              Compare
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// Individual Take Row Component
interface TakeRowProps {
  take: Take;
  isSelected: boolean;
  isAIRecommended: boolean;
  onPlay: () => void;
  onSelect: () => void;
  onCompareWithSelected?: () => void;
  showSelectButton: boolean;
}

function TakeRow({
  take,
  isSelected,
  isAIRecommended,
  onPlay,
  onSelect,
  onCompareWithSelected,
  showSelectButton
}: TakeRowProps) {
  const formatTime = (timeStr: string): string => {
    const parts = timeStr.split(':');
    if (parts.length === 2) return timeStr;
    const totalSeconds = parseFloat(timeStr);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`p-3 rounded-lg border ${
      isSelected 
        ? 'bg-green-50 border-green-200' 
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Time and Quality */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-gray-600 font-mono">
              {formatTime(take.startTime)} - {formatTime(take.endTime)}
            </span>
            <QualityMeter 
              score={take.qualityScore} 
              size="sm"
              issues={take.issues}
              qualities={take.qualities}
            />
            {isAIRecommended && (
              <Crown className="w-3 h-3 text-yellow-500" title="AI Recommended" />
            )}
          </div>

          {/* Transcript Preview */}
          {take.transcript && (
            <p className="text-sm text-gray-700 mb-2 line-clamp-2">
              "{take.transcript}"
            </p>
          )}

          {/* Issues and Qualities */}
          <div className="flex flex-wrap gap-1">
            {take.issues.slice(0, 2).map((issue, index) => (
              <Badge
                key={index}
                variant="outline"
                className={`text-xs ${
                  issue.severity === 'high'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : issue.severity === 'medium'
                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                }`}
              >
                <AlertTriangle className="w-2 h-2 mr-1" />
                {issue.type.replace('_', ' ')}
              </Badge>
            ))}
            
            {take.qualities.slice(0, 2).map((quality, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs bg-green-50 text-green-700 border-green-200"
              >
                ✓ {quality.type.replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          <Button
            onClick={onPlay}
            size="sm"
            variant="outline"
            className="text-xs px-2"
          >
            <Play className="w-3 h-3" />
          </Button>
          
          {showSelectButton && (
            <Button
              onClick={onSelect}
              size="sm"
              variant="outline"
              className="text-xs px-2 border-green-300 text-green-700 hover:bg-green-50"
            >
              Keep
            </Button>
          )}
          
          {onCompareWithSelected && (
            <Button
              onClick={onCompareWithSelected}
              size="sm"
              variant="outline"
              className="text-xs px-2"
            >
              <GitCompare className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}