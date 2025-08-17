'use client';

import { useState, useEffect } from 'react';
import { EnhancedSegment, FilterState, createDefaultFilterState } from '@/lib/types/segments';
import { TakeCluster, ClusterSelection, detectClusters, findOverlappingSegments, resolveSegmentOverlaps } from '@/lib/clustering';
import { ClusterPanel } from './ClusterPanel';
import { FilterPanel } from './FilterPanel';
import { EnhancedFilterPanel } from './EnhancedFilterPanel';
import { FinalReviewPanel } from './FinalReviewPanel';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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

export function WorkflowManager({
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

  const handleNextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const timeRemoved = finalSegmentsToRemove.reduce((sum, s) => sum + s.duration, 0);
  const finalDuration = originalDuration - timeRemoved;

  return (
    <div className="w-full">
      {/* Step Indicator */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                    step < currentStep
                      ? 'bg-blue-500 text-white'
                      : step === currentStep
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {step}
                </div>
                {step < 3 && (
                  <div
                    className={`w-24 h-0.5 mx-2 transition-colors ${
                      step < currentStep ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="text-sm text-gray-600">
            {currentStep === 1 && 'Handle Repeated Takes'}
            {currentStep === 2 && 'Fine-tune Edits'}
            {currentStep === 3 && 'Final Review & Export'}
          </div>
        </div>
      </div>

      {/* Analysis Stats */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-gray-600 text-sm">Analysis Complete</span>
            <Button
              onClick={onNewAnalysis}
              variant="outline"
              size="sm"
              className="text-cyan-600 hover:bg-cyan-50"
            >
              🔄 New Analysis
            </Button>
          </div>
          <div className="flex space-x-6 text-sm">
            <div>
              <span className="text-gray-500">Original Duration</span>
              <span className="font-mono font-bold ml-2">
                {Math.floor(originalDuration / 60)}:{(originalDuration % 60).toFixed(0).padStart(2, '0')}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Final Duration</span>
              <span className="font-mono font-bold ml-2">
                {Math.floor(finalDuration / 60)}:{(finalDuration % 60).toFixed(0).padStart(2, '0')}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Time Removed</span>
              <span className="font-mono font-bold ml-2 text-red-500">
                {Math.floor(timeRemoved / 60)}:{(timeRemoved % 60).toFixed(0).padStart(2, '0')}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Segments Found</span>
              <span className="font-mono font-bold ml-2">{segments.length}</span>
            </div>
          </div>
        </div>
      </div>

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
            // Handle bulk actions for category
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

      {/* Navigation */}
      <div className="flex justify-between items-center mt-6 pt-4 border-t">
        <Button
          onClick={handlePreviousStep}
          disabled={currentStep === 1}
          variant="outline"
          className="flex items-center"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous Step
        </Button>
        <div className="text-sm text-gray-500">
          Step {currentStep} of 3
        </div>
        <Button
          onClick={handleNextStep}
          disabled={currentStep === 3}
          className="flex items-center bg-green-500 hover:bg-green-600"
        >
          Next Step
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}