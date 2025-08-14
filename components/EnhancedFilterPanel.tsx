'use client';

import { EnhancedSegment, FilterState, SegmentCategory } from '@/lib/types/segments';
import { TakeCluster, ClusterSelection } from '@/lib/clustering';
import { FilterPanel } from './FilterPanel';
import { SegmentCard } from './SegmentCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';

interface EnhancedFilterPanelProps {
  segments: EnhancedSegment[];
  hiddenSegments: { segmentId: string; reason: string }[];
  filterState: FilterState;
  onFilterChange: (newState: FilterState) => void;
  onBulkAction: (category: SegmentCategory, action: 'keep' | 'remove') => void;
  videoUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  onSegmentSelect: (segment: EnhancedSegment | null) => void;
  clusterSelections: ClusterSelection[];
  clusters: TakeCluster[];
}

export function EnhancedFilterPanel({
  segments,
  hiddenSegments,
  filterState,
  onFilterChange,
  onBulkAction,
  videoUrl,
  videoRef,
  onSegmentSelect,
  clusterSelections,
  clusters
}: EnhancedFilterPanelProps) {
  // Filter segments based on current filter state
  const visibleSegments = segments.filter(segment => {
    // Apply filter logic based on filterState
    if (!filterState[segment.category]) return false;
    if (filterState.showOnlyHighSeverity && segment.severity !== 'high') return false;
    if (segment.confidence < filterState.minConfidence) return false;
    return true;
  });

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left Panel - Filter Controls */}
      <div className="col-span-3">
        <FilterPanel
          segments={segments}
          filterState={filterState}
          onFilterChange={onFilterChange}
          onBulkAction={onBulkAction}
        />
        
        {/* Already Cut Section */}
        {hiddenSegments.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">Already Cut (via clusters)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {hiddenSegments.map((hidden) => (
                  <div key={hidden.segmentId} className="text-xs text-gray-500">
                    <span className="text-red-400">✂️</span> {hidden.reason}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Center - Segments List */}
      <div className="col-span-5">
        <Card>
          <CardHeader>
            <CardTitle>
              Segments to Review ({visibleSegments.length} of {segments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {visibleSegments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Info className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No segments match current filters</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={() => onFilterChange(createDefaultFilterState())}
                  >
                    Reset Filters
                  </Button>
                </div>
              ) : (
                visibleSegments.map((segment, index) => (
                  <SegmentCard
                    key={segment.id}
                    segment={segment}
                    index={index}
                    isSelected={false}
                    onSelect={() => onSegmentSelect(segment)}
                    onOverrideChange={() => {}}
                  />
                ))
              )}
            </div>
            
            {hiddenSegments.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800">
                  <strong>{hiddenSegments.length} segments</strong> already handled by cluster selections
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right - Video Preview */}
      <div className="col-span-4">
        <Card>
          <CardHeader>
            <CardTitle>Video Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {videoUrl ? (
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full"
                  controls
                />
              </div>
            ) : (
              <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                No video loaded
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function createDefaultFilterState(): FilterState {
  return {
    bad_take: true,
    pause: true,
    false_start: true,
    filler_words: true,
    technical: true,
    redundant: false,
    tangent: false,
    low_energy: false,
    long_explanation: false,
    weak_transition: false,
    showOnlyHighSeverity: false,
    minConfidence: 0.7
  };
}