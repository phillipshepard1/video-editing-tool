'use client';

import React, { useState } from 'react';
import { ContentGroup, Take, TakeSelection, ComparisonData } from '@/lib/types/takes';
import { ContentGroupCard } from './ContentGroupCard';
import { SideBySideComparison } from './SideBySideComparison';
import { QualityMeter } from './QualityMeter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  BarChart3, 
  TrendingUp, 
  GitCompare,
  Crown,
  AlertTriangle,
  CheckCircle,
  Clock,
  RotateCcw
} from 'lucide-react';

interface ContentGroupsPanelProps {
  contentGroups: ContentGroup[];
  takeSelections: TakeSelection[];
  onTakeSelection: (selection: TakeSelection) => void;
  videoUrl: string | null;
  videoRef?: React.RefObject<HTMLVideoElement>;
  onSegmentSelect: (segment: any | null) => void;
}

export function ContentGroupsPanel({
  contentGroups,
  takeSelections,
  onTakeSelection,
  videoUrl,
  videoRef,
  onSegmentSelect
}: ContentGroupsPanelProps) {
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'time' | 'quality' | 'overrides'>('time');

  // Calculate statistics
  const totalTakes = contentGroups.reduce((sum, group) => sum + group.takes.length, 0);
  const userOverrides = takeSelections.filter(s => s.isUserOverride).length;
  const averageQuality = contentGroups.reduce((sum, group) => sum + group.averageQuality, 0) / (contentGroups.length || 1);
  
  // Calculate quality improvement from AI recommendations
  const qualityImprovement = contentGroups.reduce((sum, group) => {
    const bestTake = group.takes.find(t => t.id === group.bestTakeId);
    const averageTakeQuality = group.takes.reduce((s, t) => s + t.qualityScore, 0) / group.takes.length;
    return sum + ((bestTake?.qualityScore || 0) - averageTakeQuality);
  }, 0) / (contentGroups.length || 1);

  // Handle take playback with refined boundaries
  const handlePlayTake = (take: Take) => {
    if (!videoRef?.current) return;
    
    // Parse time to seconds
    const parseTime = (timeStr: string): number => {
      const parts = timeStr.split(':');
      if (parts.length === 2) {
        const [minutes, seconds] = parts;
        return parseInt(minutes) * 60 + parseFloat(seconds);
      }
      return parseFloat(timeStr);
    };

    // Use refined boundaries if available (speechStart), otherwise use segment boundaries
    const refinedTake = take as any;
    const startTimeStr = refinedTake.speechStart || refinedTake.refinedStartTime || take.startTime;
    const endTimeStr = refinedTake.speechEnd || refinedTake.refinedEndTime || take.endTime;
    
    const startTime = parseTime(startTimeStr);
    videoRef.current.currentTime = startTime;
    videoRef.current.play();
    
    // Notify parent about segment selection for timeline sync with refined boundaries
    const segmentStartTime = refinedTake.speechStart || refinedTake.refinedStartTime || take.startTime;
    const segmentEndTime = refinedTake.speechEnd || refinedTake.refinedEndTime || take.endTime;
    
    onSegmentSelect({
      id: take.id,
      startTime: segmentStartTime,
      endTime: segmentEndTime,
      duration: refinedTake.speechDuration || take.duration,
      originalStartTime: take.startTime,
      originalEndTime: take.endTime,
      wasRefined: refinedTake.wasRefined || false,
      leadingSilence: refinedTake.leadingSilence,
      trailingSilence: refinedTake.trailingSilence
    });
  };

  // Handle take comparison
  const handleCompareTakes = (takeA: Take, takeB: Take) => {
    const group = contentGroups.find(g => g.takes.some(t => t.id === takeA.id || t.id === takeB.id));
    if (!group) return;

    setComparison({
      takeA,
      takeB,
      groupId: group.id,
      groupName: group.name
    });
    setIsComparisonOpen(true);
  };

  // Reset all to AI recommendations
  const handleResetAllToAI = () => {
    contentGroups.forEach(group => {
      onTakeSelection({
        groupId: group.id,
        selectedTakeId: group.bestTakeId,
        isUserOverride: false,
        reason: 'Reset all to AI recommendations'
      });
    });
  };

  // Get current selection for a group
  const getSelectionForGroup = (groupId: string): TakeSelection | undefined => {
    return takeSelections.find(s => s.groupId === groupId);
  };

  // Sort groups
  const sortedGroups = [...contentGroups].sort((a, b) => {
    switch (sortBy) {
      case 'quality':
        return b.averageQuality - a.averageQuality;
      case 'overrides':
        const aHasOverride = getSelectionForGroup(a.id)?.isUserOverride || false;
        const bHasOverride = getSelectionForGroup(b.id)?.isUserOverride || false;
        if (aHasOverride && !bHasOverride) return -1;
        if (!aHasOverride && bHasOverride) return 1;
        return 0;
      default: // time
        const parseTime = (timeStr: string): number => {
          const parts = timeStr.split(':');
          if (parts.length === 2) {
            const [minutes, seconds] = parts;
            return parseInt(minutes) * 60 + parseFloat(seconds);
          }
          return parseFloat(timeStr);
        };
        return parseTime(a.timeRange.start) - parseTime(b.timeRange.start);
    }
  });

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header with Statistics */}
      <Card className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-purple-600" />
              Content Groups - Take Analysis
            </h2>
            <p className="text-sm text-gray-600">
              AI identified {contentGroups.length} content groups with multiple takes
            </p>
          </div>
          
          {userOverrides > 0 && (
            <Button
              onClick={handleResetAllToAI}
              variant="outline"
              size="sm"
              className="text-orange-700 border-orange-300 hover:bg-orange-50"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset All to AI
            </Button>
          )}
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-gray-600">Total Takes</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{totalTakes}</p>
          </div>
          
          <div className="bg-white p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-sm text-gray-600">Avg Quality</span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-gray-900">{averageQuality.toFixed(1)}</p>
              <QualityMeter score={averageQuality} size="sm" showScore={false} />
            </div>
          </div>
          
          <div className="bg-white p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-4 h-4 text-yellow-600" />
              <span className="text-sm text-gray-600">AI Improvement</span>
            </div>
            <p className="text-xl font-bold text-green-600">+{qualityImprovement.toFixed(1)}</p>
          </div>
          
          <div className="bg-white p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <span className="text-sm text-gray-600">User Overrides</span>
            </div>
            <p className="text-xl font-bold text-orange-600">{userOverrides}</p>
          </div>
        </div>
      </Card>

      {/* Sorting and Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Sort by:</span>
          <div className="flex gap-1">
            <Button
              onClick={() => setSortBy('time')}
              size="sm"
              variant={sortBy === 'time' ? 'default' : 'outline'}
              className="text-xs"
            >
              <Clock className="w-3 h-3 mr-1" />
              Time
            </Button>
            <Button
              onClick={() => setSortBy('quality')}
              size="sm"
              variant={sortBy === 'quality' ? 'default' : 'outline'}
              className="text-xs"
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              Quality
            </Button>
            <Button
              onClick={() => setSortBy('overrides')}
              size="sm"
              variant={sortBy === 'overrides' ? 'default' : 'outline'}
              className="text-xs"
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              Overrides
            </Button>
          </div>
        </div>
        
        <Badge variant="outline" className="text-xs bg-gray-50">
          {contentGroups.length} groups found
        </Badge>
      </div>

      {/* Content Groups */}
      {sortedGroups.length === 0 ? (
        <Card className="p-8 text-center">
          <GitCompare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Content Groups Found</h3>
          <p className="text-gray-600">
            The AI didn't detect any multiple takes or repeated content in this video.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedGroups.map((group) => {
            const selection = getSelectionForGroup(group.id);
            const selectedTakeId = selection?.selectedTakeId || group.bestTakeId;
            const isUserOverride = selection?.isUserOverride || false;

            return (
              <ContentGroupCard
                key={group.id}
                group={group}
                selectedTakeId={selectedTakeId}
                isUserOverride={isUserOverride}
                onTakeSelect={onTakeSelection}
                onPlayTake={handlePlayTake}
                onCompareTakes={handleCompareTakes}
                videoRef={videoRef}
              />
            );
          })}
        </div>
      )}

      {/* Quality Summary */}
      {contentGroups.length > 0 && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <h3 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Quality Impact Summary
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-blue-800 font-medium">AI Recommendations</p>
              <p className="text-blue-700">
                Selected the best take in {contentGroups.length - userOverrides} out of {contentGroups.length} groups
              </p>
            </div>
            
            <div>
              <p className="text-blue-800 font-medium">Quality Improvement</p>
              <p className="text-blue-700">
                Average improvement of +{qualityImprovement.toFixed(1)} points per group
              </p>
            </div>
            
            <div>
              <p className="text-blue-800 font-medium">User Customization</p>
              <p className="text-blue-700">
                {userOverrides > 0 
                  ? `${userOverrides} user override(s) applied`
                  : 'Using all AI recommendations'
                }
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Comparison Modal */}
      <SideBySideComparison
        comparison={comparison}
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        onSelectTake={onTakeSelection}
        videoUrl={videoUrl}
        videoRef={videoRef}
      />
    </div>
  );
}