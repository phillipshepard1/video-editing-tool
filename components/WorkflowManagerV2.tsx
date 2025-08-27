'use client';

import { useState, useEffect, useMemo } from 'react';
import { EnhancedSegment, FilterState, createDefaultFilterState } from '@/lib/types/segments';
import { TakeCluster, ClusterSelection, detectClusters, findOverlappingSegments, resolveSegmentOverlaps } from '@/lib/clustering';
import { ContentGroup, TakeSelection, EnhancedAnalysisResult } from '@/lib/types/takes';
import { ClusterPanel } from './ClusterPanel';
import { EnhancedFilterPanel } from './EnhancedFilterPanel';
import { FinalReviewPanel } from './FinalReviewPanel';
import { ContentGroupsPanel } from './ContentGroupsPanel';
import { ClusterTimeline } from './timeline/ClusterTimeline';
import { SilenceTimeline } from './timeline/SilenceTimeline';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ChevronRight, Save, BookmarkPlus, GitCompare, Users, Film, VolumeX, Layers, CheckCircle } from 'lucide-react';
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
  const [clusters, setClusters] = useState<TakeCluster[]>([]);
  const [clusterSelections, setClusterSelections] = useState<ClusterSelection[]>([]);
  const [visibleSegments, setVisibleSegments] = useState<EnhancedSegment[]>([]);
  const [hiddenSegments, setHiddenSegments] = useState<{ segmentId: string; reason: string }[]>([]);
  const [filterState, setFilterState] = useState<FilterState>(createDefaultFilterState());
  const [finalSegmentsToRemove, setFinalSegmentsToRemove] = useState<EnhancedSegment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  
  // Timeline View state (always enabled now)
  const [timelineStage, setTimelineStage] = useState<'clusters' | 'silence' | 'final'>('clusters');
  const [takeSelections, setTakeSelections] = useState<TakeSelection[]>([]);
  const [contentGroups, setContentGroups] = useState<ContentGroup[]>([]);
  const [silenceSegments, setSilenceSegments] = useState<any[]>([]);

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

    // Initialize silence segments from enhanced analysis
    if (enhancedAnalysis?.segments) {
      const silenceSegs = enhancedAnalysis.segments.filter(seg => seg.category === 'silence');
      setSilenceSegments(silenceSegs);
    }
  }, [enhancedAnalysis]);

  // Detect clusters only on initial mount
  const [clustersInitialized, setClustersInitialized] = useState(false);
  
  useEffect(() => {
    // Only run once when segments are first loaded
    if (segments.length > 0 && !clustersInitialized) {
      console.log('WorkflowManagerV2 received segments:', segments);
      console.log('Segment count:', segments.length);
      console.log('First segment category:', segments[0].category);
      console.log('Segments with false_start:', segments.filter(s => s.category === 'false_start').length);
      
      const detectedClusters = detectClusters(segments);
      console.log('Detected clusters:', detectedClusters);
      setClusters(detectedClusters);
      
      // Initialize cluster selections with defaults
      const defaultSelections: ClusterSelection[] = detectedClusters.map(cluster => ({
        clusterId: cluster.id,
        selectedWinner: (cluster.winner ? 'gap' : 0) as 'gap' | number,
        removedSegments: cluster.attempts.map(a => a.id),
        keptSegments: []
      }));
      setClusterSelections(defaultSelections);
      setClustersInitialized(true);
    }
  }, [segments, clustersInitialized]);

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
    
    if (contentGroups.length > 0) {
      // Enhanced workflow: calculate segments based on take selections
      for (const group of contentGroups) {
        const selection = takeSelections.find(s => s.groupId === group.id);
        const selectedTakeId = selection?.selectedTakeId || group.bestTakeId;
        
        // Add all takes except the selected one as segments to remove
        const removedTakes = group.takes.filter(take => take.id !== selectedTakeId);
        for (const take of removedTakes) {
          // Convert take to segment format
          toRemove.push({
            id: take.id,
            selected: true,
            startTime: take.startTime,
            endTime: take.endTime,
            duration: take.duration,
            reason: `Removed take (quality: ${take.qualityScore}/10)`,
            confidence: take.confidence,
            category: 'redundant',
            transcript: take.transcript
          } as EnhancedSegment);
        }
      }
      
      // Note: Silence segments are added separately in handleSilenceDecisions
      // They will be combined with cluster decisions in the final review
    } else {
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
    }
    
    setFinalSegmentsToRemove(toRemove);
  }, [clusterSelections, clusters, visibleSegments, filterState, contentGroups, takeSelections]);

  const handleClusterSelection = (clusterId: string, selection: ClusterSelection) => {
    console.log('handleClusterSelection called:', clusterId, selection);
    setClusterSelections(prev => {
      const updated = prev.filter(s => s.clusterId !== clusterId);
      updated.push(selection);
      console.log('Updated cluster selections:', updated);
      return updated;
    });
    toast.success('Cluster selection updated');
  };

  // Handle take selection in groups view
  const handleTakeSelection = (selection: TakeSelection) => {
    setTakeSelections(prev => {
      const updated = prev.filter(s => s.groupId !== selection.groupId);
      updated.push(selection);
      return updated;
    });
  };

  // Handle cluster timeline decisions
  const handleClusterDecision = (clusterId: string, takeId: string, decision: 'approve' | 'reject') => {
    const selection: TakeSelection = {
      groupId: clusterId,
      selectedTakeId: takeId,
      isUserOverride: true,
      reason: decision === 'approve' ? 'User approved' : 'User rejected'
    };
    handleTakeSelection(selection);
  };

  // Handle progress to silence timeline
  const handleProgressToSilence = () => {
    console.log('Progress to silence timeline requested');
    setTimelineStage('silence');
    toast.success('Moving to silence detection stage');
  };

  // Handle silence decisions and implement priority system
  const handleSilenceDecisions = (segments: any[]) => {
    setSilenceSegments(segments);
    
    // Convert silence segments to removal format
    const silenceSegmentsToRemove = segments
      .filter(s => s.shouldRemove)
      .map(s => ({
        id: s.id,
        selected: true,
        startTime: s.startTime.toString(),
        endTime: s.endTime.toString(),
        duration: s.duration,
        reason: `Silence (${s.decibels || -40}dB)`,
        confidence: s.confidence,
        category: 'pause' as const,
        priority: 'silence' // Lower priority than cluster decisions
      } as EnhancedSegment & { priority: string }));
    
    // Get approved cluster segments (higher priority)
    const clusterSegmentsToKeep: { startTime: number; endTime: number }[] = [];
    
    if (contentGroups.length > 0) {
      contentGroups.forEach(group => {
        const selection = takeSelections.find(s => s.groupId === group.id);
        const selectedTakeId = selection?.selectedTakeId || group.bestTakeId;
        const selectedTake = group.takes.find(take => take.id === selectedTakeId);
        
        if (selectedTake) {
          // Parse time strings to numbers for comparison
          const parseTime = (timeStr: string): number => {
            const parts = timeStr.split(':');
            if (parts.length === 2) {
              return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
            }
            return parseFloat(timeStr) || 0;
          };
          
          clusterSegmentsToKeep.push({
            startTime: parseTime(selectedTake.startTime),
            endTime: parseTime(selectedTake.endTime)
          });
        }
      });
    }
    
    // Filter out silence segments that overlap with approved cluster segments
    const filteredSilenceSegments = silenceSegmentsToRemove.filter(silenceSegment => {
      const silenceStart = parseFloat(silenceSegment.startTime);
      const silenceEnd = parseFloat(silenceSegment.endTime);
      
      // Check if silence overlaps with any approved cluster segment
      const overlapsWithCluster = clusterSegmentsToKeep.some(clusterSegment => {
        return !(silenceEnd <= clusterSegment.startTime || silenceStart >= clusterSegment.endTime);
      });
      
      return !overlapsWithCluster; // Keep silence segment only if it doesn't overlap with cluster
    });
    
    // Update final segments: cluster decisions + non-overlapping silence segments
    setFinalSegmentsToRemove(prev => {
      // Remove old silence segments and add new filtered ones
      const withoutSilence = prev.filter(seg => seg.category !== 'pause');
      return [...withoutSilence, ...filteredSilenceSegments];
    });
  };

  // Handle progress to final review
  const handleProgressToFinal = () => {
    setTimelineStage('final');
    toast.success('Moving to final review');
  };

  // Handle back to clusters
  const handleBackToClusters = () => {
    setTimelineStage('clusters');
  };

  // Convert traditional clusters to content groups for timeline compatibility
  const getTimelineCompatibleGroups = useMemo(() => {
    if (contentGroups.length > 0) {
      return contentGroups; // Use enhanced groups if available
    }
    
    // Convert traditional clusters to content groups format
    return clusters.map((cluster, index) => ({
      id: cluster.id,
      name: `Cluster ${index + 1}`,
      description: cluster.name || `${cluster.attempts.length} segments found`,
      contentType: 'general' as const,
      timeRange: {
        start: cluster.timeRange.start,
        end: cluster.timeRange.end
      },
      averageQuality: 7, // Default quality
      confidence: 0.8,
      bestTakeId: cluster.attempts[0]?.id || '', // First segment as default
      reasoning: 'Converted from traditional cluster analysis',
      takes: cluster.attempts.map((attempt, attemptIndex) => ({
        id: attempt.id,
        startTime: attempt.startTime.toString(),
        endTime: attempt.endTime.toString(),
        duration: attempt.duration,
        qualityScore: attemptIndex === 0 ? 8 : 6, // First take gets higher score
        confidence: 0.8,
        transcript: attempt.reason || 'No transcript available',
        issues: [],
        qualities: [
          { type: 'clear_delivery' as const, description: 'Segment from analysis' }
        ]
      }))
    }));
  }, [contentGroups, clusters]);

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
          currentStep: timelineStage,
          originalDuration
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSavedSessionId(data.sessionId); // Store the session ID
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
      {/* Save Session Header */}
      <Card className="p-4 bg-white border-gray-200 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">Video Analysis Editor</h2>
            {originalFilename && (
              <span className="text-sm text-gray-500">• {originalFilename}</span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowSaveDialog(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white"
              disabled={isSaving}
            >
              <BookmarkPlus className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Session'}
            </Button>
          </div>
        </div>
      </Card>

      {/* View Mode Toggle - Only show when not in timeline mode */}




      {/* Timeline Content - Always Visible */}
        <>
          {/* Timeline stage indicator */}
          {timelineStage !== 'final' && (
            <Card className="p-4 bg-white border-gray-200 shadow-sm mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                    timelineStage === 'clusters' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <Layers className="w-4 h-4" />
                    <span className="text-sm font-medium">1. Cluster Timeline</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                    timelineStage === 'silence' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <VolumeX className="w-4 h-4" />
                    <span className="text-sm font-medium">2. Silence Timeline</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-500`}>
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">3. Final Review</span>
                  </div>
                </div>
              </div>
            </Card>
          )}
          
          {/* Stage content */}
          {timelineStage === 'clusters' && (
            <div className="h-[calc(100vh-200px)] min-h-[600px]">
              <ClusterTimeline
                contentGroups={getTimelineCompatibleGroups}
                videoUrl={supabaseUrl || videoUrl}
                videoDuration={videoDuration}
                onClusterDecision={handleClusterDecision}
                onProgressToSilence={handleProgressToSilence}
                originalFilename={originalFilename}
              />
            </div>
          )}
          
          {timelineStage === 'silence' && (
            <div className="h-[calc(100vh-200px)] min-h-[600px]">
              <SilenceTimeline
                videoUrl={supabaseUrl || videoUrl}
                videoDuration={videoDuration}
                onSilenceDecisions={handleSilenceDecisions}
                onProgressToFinal={handleProgressToFinal}
                onBack={handleBackToClusters}
                originalFilename={originalFilename}
                initialSilenceSegments={silenceSegments}
              />
            </div>
          )}
          
          {timelineStage === 'final' && (
            <FinalReviewPanel
              sessionId={savedSessionId || undefined}
              finalSegmentsToRemove={finalSegmentsToRemove}
              clusters={clusters}
              clusterSelections={clusterSelections}
              originalDuration={originalDuration}
              finalDuration={originalDuration - finalSegmentsToRemove.reduce((sum, s) => sum + s.duration, 0)}
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