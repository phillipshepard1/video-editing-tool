'use client';

import { useState, useEffect } from 'react';
import { EnhancedSegment, FilterState, createDefaultFilterState } from '@/lib/types/segments';
import { TakeCluster, ClusterSelection, detectClusters, findOverlappingSegments, resolveSegmentOverlaps } from '@/lib/clustering';
import { ClusterPanel } from './ClusterPanel';
import { EnhancedFilterPanel } from './EnhancedFilterPanel';
import { FinalReviewPanel } from './FinalReviewPanel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';

interface WorkflowManagerProps {
  segments: EnhancedSegment[];
  videoUrl: string | null;
  videoDuration: number;
  onExport: (format: 'edl' | 'fcpxml' | 'premiere', segmentsToRemove: EnhancedSegment[]) => void;
  onNewAnalysis: () => void;
  originalDuration: number;
  videoRef: React.RefObject<HTMLVideoElement>;
  onSegmentSelect: (segment: EnhancedSegment | null) => void;
}

export function WorkflowManagerV2({
  segments,
  videoUrl,
  videoDuration,
  onExport,
  onNewAnalysis,
  originalDuration,
  videoRef,
  onSegmentSelect
}: WorkflowManagerProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [clusters, setClusters] = useState<TakeCluster[]>([]);
  const [clusterSelections, setClusterSelections] = useState<ClusterSelection[]>([]);
  const [visibleSegments, setVisibleSegments] = useState<EnhancedSegment[]>([]);
  const [hiddenSegments, setHiddenSegments] = useState<{ segmentId: string; reason: string }[]>([]);
  const [filterState, setFilterState] = useState<FilterState>(createDefaultFilterState());
  const [finalSegmentsToRemove, setFinalSegmentsToRemove] = useState<EnhancedSegment[]>([]);

  // Detect clusters on mount
  useEffect(() => {
    const detectedClusters = detectClusters(segments);
    setClusters(detectedClusters);
    
    // Initialize cluster selections with defaults
    const defaultSelections = detectedClusters.map(cluster => ({
      clusterId: cluster.id,
      selectedWinner: cluster.winner ? 'gap' : 0,
      removedSegments: cluster.attempts.map(a => a.id),
      keptSegments: []
    }));
    setClusterSelections(defaultSelections);
  }, [segments]);

  // Update visible segments based on cluster selections
  useEffect(() => {
    const { visible, hidden } = findOverlappingSegments(segments, clusterSelections, clusters);
    const { primary, secondary } = resolveSegmentOverlaps(visible);
    
    setVisibleSegments(primary);
    setHiddenSegments([
      ...hidden.map(h => ({ segmentId: h.segmentId, reason: h.reason })),
      ...secondary.map(s => ({ segmentId: s.segmentId, reason: s.reason }))
    ]);
  }, [segments, clusterSelections, clusters]);

  // Calculate final segments to remove
  useEffect(() => {
    const toRemove: EnhancedSegment[] = [];
    
    // Add cluster-removed segments
    for (const selection of clusterSelections) {
      const cluster = clusters.find(c => c.id === selection.clusterId);
      if (cluster) {
        for (const removedId of selection.removedSegments) {
          const segment = cluster.attempts.find(a => a.id === removedId);
          if (segment) toRemove.push(segment);
        }
      }
    }
    
    // Add filtered segments from step 2
    if (filterState) {
      const filteredVisible = visibleSegments.filter(s => {
        // Apply filter logic here
        return true; // Placeholder
      });
      toRemove.push(...filteredVisible);
    }
    
    setFinalSegmentsToRemove(toRemove);
  }, [clusterSelections, clusters, visibleSegments, filterState]);

  const handleClusterSelection = (clusterId: string, selection: ClusterSelection) => {
    setClusterSelections(prev => {
      const updated = prev.filter(s => s.clusterId !== clusterId);
      updated.push(selection);
      return updated;
    });
  };

  const timeRemoved = finalSegmentsToRemove.reduce((sum, s) => sum + s.duration, 0);
  const finalDuration = originalDuration - timeRemoved;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Step Navigation - Matching Screenshot Style */}
      <div className="flex gap-2 mb-6">
        <Button
          onClick={() => setCurrentStep(1)}
          variant={currentStep === 1 ? "default" : "outline"}
          className={`cursor-pointer ${currentStep === 1 ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300'}`}
        >
          Step 1: Clusters
        </Button>
        <ChevronRight className="w-4 h-4 self-center text-gray-500" />
        <Button
          onClick={() => setCurrentStep(2)}
          variant={currentStep === 2 ? "default" : "outline"}
          className={`cursor-pointer ${currentStep === 2 ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300'}`}
        >
          Step 2: Filters
        </Button>
        <ChevronRight className="w-4 h-4 self-center text-gray-500" />
        <Button
          onClick={() => setCurrentStep(3)}
          variant={currentStep === 3 ? "default" : "outline"}
          className={`cursor-pointer ${currentStep === 3 ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300'}`}
        >
          Step 3: Export
        </Button>
      </div>

      {/* Analysis Complete Header - Matching Screenshot */}
      <Card className="bg-white border-gray-200 shadow-xl">
        <div className="p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-900">Analysis Complete</h3>
            <Button
              onClick={onNewAnalysis}
              variant="outline"
              size="sm"
              className="text-gray-900 bg-white hover:bg-gray-50 border-gray-300 cursor-pointer"
            >
              🔄 New Analysis
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Original Duration</p>
              <p className="text-xl font-mono font-bold text-gray-900">{formatTime(originalDuration)}</p>
            </div>
            <div>
              <p className="text-gray-600">Final Duration</p>
              <p className="text-xl font-mono font-bold text-gray-900">{formatTime(finalDuration)}</p>
            </div>
            <div>
              <p className="text-gray-600">Time Removed</p>
              <p className="text-xl font-mono font-bold text-red-600">{formatTime(timeRemoved)}</p>
            </div>
            <div>
              <p className="text-gray-600">Segments Found</p>
              <p className="text-xl font-mono font-bold text-gray-900">{segments.length}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Export Options - Always Visible */}
      {currentStep === 3 ? (
        <Card className="bg-white border-gray-200 shadow-xl">
          <div className="p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Export Options</h3>
            <div className="flex gap-3">
              <Button
                onClick={() => onExport('edl', finalSegmentsToRemove)}
                variant="outline"
                className="flex items-center gap-2 cursor-pointer bg-white hover:bg-gray-50 text-gray-900 border-gray-300"
              >
                📄 Export EDL
              </Button>
              <Button
                onClick={() => onExport('fcpxml', finalSegmentsToRemove)}
                variant="outline"
                className="flex items-center gap-2 cursor-pointer bg-white hover:bg-gray-50 text-gray-900 border-gray-300"
              >
                📄 Export FCPXML
              </Button>
              <Button
                onClick={() => onExport('premiere', finalSegmentsToRemove)}
                variant="outline"
                className="flex items-center gap-2 cursor-pointer bg-white hover:bg-gray-50 text-gray-900 border-gray-300"
              >
                🎬 Export Premiere XML
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="bg-white border-gray-200 shadow-xl">
          <div className="p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Export Options</h3>
            <p className="text-sm text-gray-600">Complete all steps to enable export</p>
          </div>
        </Card>
      )}

      {/* Step Content */}
      {currentStep === 1 && (
        <ClusterPanel
          clusters={clusters}
          clusterSelections={clusterSelections}
          onClusterSelection={handleClusterSelection}
          videoUrl={videoUrl}
          videoRef={videoRef}
          onSegmentSelect={onSegmentSelect}
        />
      )}

      {currentStep === 2 && (
        <EnhancedFilterPanel
          segments={visibleSegments}
          hiddenSegments={hiddenSegments}
          filterState={filterState}
          onFilterChange={setFilterState}
          onBulkAction={(category, action) => {
            console.log('Bulk action:', category, action);
          }}
          videoUrl={videoUrl}
          videoRef={videoRef}
          onSegmentSelect={onSegmentSelect}
          clusterSelections={clusterSelections}
          clusters={clusters}
        />
      )}

      {currentStep === 3 && (
        <FinalReviewPanel
          finalSegmentsToRemove={finalSegmentsToRemove}
          clusters={clusters}
          clusterSelections={clusterSelections}
          originalDuration={originalDuration}
          finalDuration={finalDuration}
          onExport={onExport}
          videoUrl={videoUrl}
          videoRef={videoRef}
        />
      )}
    </div>
  );
}