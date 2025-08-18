'use client';

import { useState, useEffect } from 'react';
import { EnhancedSegment, FilterState, createDefaultFilterState } from '@/lib/types/segments';
import { TakeCluster, ClusterSelection, detectClusters, findOverlappingSegments, resolveSegmentOverlaps } from '@/lib/clustering';
import { ContentGroup, TakeSelection, EnhancedAnalysisResult } from '@/lib/types/takes';
import { ClusterPanel } from './ClusterPanel';
import { EnhancedFilterPanel } from './EnhancedFilterPanel';
import { FinalReviewPanel } from './FinalReviewPanel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronRight, Save, BookmarkPlus } from 'lucide-react';
import toast from 'react-hot-toast';

interface WorkflowManagerProps {
  segments: EnhancedSegment[];
  videoUrl: string | null;
  videoDuration: number;
  onExport: (format: 'edl' | 'fcpxml' | 'premiere', segmentsToRemove: EnhancedSegment[]) => void;
  onNewAnalysis: () => void;
  originalDuration: number;
  videoRef: React.RefObject<HTMLVideoElement>;
  onSegmentSelect: (segment: EnhancedSegment | null) => void;
  originalFilename?: string;
  enhancedAnalysis?: EnhancedAnalysisResult | null; // Optional enhanced analysis with take groups
  supabaseUrl?: string;  // Pre-uploaded Supabase URL
}

export function WorkflowManagerV2({
  segments,
  videoUrl,
  videoDuration,
  onExport,
  onNewAnalysis,
  originalDuration,
  videoRef,
  onSegmentSelect,
  originalFilename,
  enhancedAnalysis,
  supabaseUrl
}: WorkflowManagerProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [clusters, setClusters] = useState<TakeCluster[]>([]);
  const [clusterSelections, setClusterSelections] = useState<ClusterSelection[]>([]);
  const [visibleSegments, setVisibleSegments] = useState<EnhancedSegment[]>([]);
  const [hiddenSegments, setHiddenSegments] = useState<{ segmentId: string; reason: string }[]>([]);
  const [filterState, setFilterState] = useState<FilterState>(createDefaultFilterState());
  const [finalSegmentsToRemove, setFinalSegmentsToRemove] = useState<EnhancedSegment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sessionName, setSessionName] = useState('');
  
  // Take selections state (kept for compatibility but not used in UI)
  const [takeSelections, setTakeSelections] = useState<TakeSelection[]>([]);
  const [contentGroups, setContentGroups] = useState<ContentGroup[]>([]);

  // Initialize enhanced analysis and content groups
  useEffect(() => {
    if (enhancedAnalysis?.contentGroups) {
      setContentGroups(enhancedAnalysis.contentGroups);
      
      // Initialize take selections with AI recommendations
      const initialSelections = enhancedAnalysis.contentGroups.map(group => ({
        groupId: group.id,
        selectedTakeId: group.bestTakeId,
        isUserOverride: false,
        reason: 'AI recommendation'
      }));
      setTakeSelections(initialSelections);
    }
  }, [enhancedAnalysis]);

  // Detect clusters on mount
  useEffect(() => {
    console.log('WorkflowManagerV2 received segments:', segments);
    console.log('Segment count:', segments.length);
    if (segments.length > 0) {
      console.log('First segment category:', segments[0].category);
      console.log('Segments with false_start:', segments.filter(s => s.category === 'false_start').length);
    }
    const detectedClusters = detectClusters(segments);
    console.log('Detected clusters:', detectedClusters);
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
    
    // Traditional workflow: use cluster and filter logic
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
  }, [clusterSelections, clusters, visibleSegments, filterState, contentGroups, takeSelections]);

  const handleClusterSelection = (clusterId: string, selection: ClusterSelection) => {
    setClusterSelections(prev => {
      const updated = prev.filter(s => s.clusterId !== clusterId);
      updated.push(selection);
      return updated;
    });
  };

  // Handle take selection in groups view
  const handleTakeSelection = (selection: TakeSelection) => {
    setTakeSelections(prev => {
      const updated = prev.filter(s => s.groupId !== selection.groupId);
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

  const handleSaveSession = async () => {
    if (!sessionName.trim()) {
      toast.error('Please enter a session name');
      return;
    }

    if (!videoUrl || !originalFilename) {
      toast.error('Missing video information');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionName: sessionName.trim(),
          originalFilename,
          videoUrl,
          videoDuration,
          segments,
          clusters,
          clusterSelections,
          filterState,
          currentStep,
          originalDuration
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Session saved successfully!');
        setShowSaveDialog(false);
        setSessionName('');
      } else {
        toast.error(data.error || 'Failed to save session');
      }
    } catch (error) {
      console.error('Error saving session:', error);
      toast.error('Failed to save session');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* Step Navigation - Matching Screenshot Style */}
      {
        <div className="flex gap-2 mb-6">
          <Button
            onClick={() => setCurrentStep(1)}
            variant={currentStep === 1 ? "default" : "outline"}
            className={`cursor-pointer font-medium ${currentStep === 1 ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}`}
          >
            Step 1: Clusters
          </Button>
          <ChevronRight className="w-4 h-4 self-center text-gray-400" />
          <Button
            onClick={() => setCurrentStep(2)}
            variant={currentStep === 2 ? "default" : "outline"}
            className={`cursor-pointer font-medium ${currentStep === 2 ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}`}
          >
            Step 2: Filters
          </Button>
          <ChevronRight className="w-4 h-4 self-center text-gray-400" />
          <Button
            onClick={() => setCurrentStep(3)}
            variant={currentStep === 3 ? "default" : "outline"}
            className={`cursor-pointer font-medium ${currentStep === 3 ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}`}
          >
            Step 3: Export
          </Button>
        </div>
      }

      {/* Analysis Complete Header - Matching Screenshot */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <div className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Analysis Complete</h3>
            <Button
              onClick={onNewAnalysis}
              variant="outline"
              size="sm"
              className="text-gray-700 bg-white hover:bg-gray-50 border-gray-300 cursor-pointer font-medium"
            >
              🔄 New Analysis
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Original Duration</p>
              <p className="text-2xl font-mono font-bold text-gray-900">{formatTime(originalDuration)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Final Duration</p>
              <p className="text-2xl font-mono font-bold text-gray-900">{formatTime(finalDuration)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Time Removed</p>
              <p className="text-2xl font-mono font-bold text-red-600">{formatTime(timeRemoved)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Segments Found</p>
              <p className="text-2xl font-mono font-bold text-gray-900">{segments.length}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Export Options - Always Visible */}
      {currentStep === 3 ? (
        <Card className="bg-white border-gray-200 shadow-sm">
          <div className="p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Export & Save Options</h3>
            <div className="space-y-3">
              {/* Save Session Button */}
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-2 cursor-pointer bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white"
                  disabled={isSaving}
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save Session'}
                </Button>
              </div>
              
              {/* Export Buttons */}
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
          </div>
        </Card>
      ) : (
        <Card className="bg-white border-gray-200 shadow-sm">
          <div className="p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Export Options</h3>
            <p className="text-sm text-gray-500">Complete all steps to enable export</p>
          </div>
        </Card>
      )}

      {/* Step Content */}
      <>
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
              videoDuration={videoDuration}
              supabaseUrl={supabaseUrl}
            />
          )}
        </>

      {/* Save Session Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="bg-white w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <BookmarkPlus className="w-6 h-6 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900">Save Analysis Session</h3>
              </div>
              
              <p className="text-gray-600 text-sm mb-4">
                Save your current analysis to resume later. All segments, clusters, and filter settings will be preserved.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="sessionName" className="block text-sm font-medium text-gray-700 mb-2">
                    Session Name
                  </label>
                  <input
                    id="sessionName"
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder={`${originalFilename?.replace(/\.[^/.]+$/, '') || 'Video'} Analysis`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    disabled={isSaving}
                  />
                </div>
                
                <div className="flex justify-between gap-3">
                  <Button
                    onClick={() => {
                      setShowSaveDialog(false);
                      setSessionName('');
                    }}
                    variant="outline"
                    className="flex-1"
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveSession}
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                    disabled={isSaving || !sessionName.trim()}
                  >
                    {isSaving ? 'Saving...' : 'Save Session'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}