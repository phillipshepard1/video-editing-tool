'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ContentGroup, Take, TakeSelection, EnhancedAnalysisResult } from '@/lib/types/takes';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Crown, 
  Play, 
  ChevronRight,
  Clock,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Bug,
  Copy
} from 'lucide-react';

// Timeline segment for visualization
interface TimelineSegment {
  id: string;
  takeId: string;
  clusterId: string;
  startTime: number;
  endTime: number;
  duration: number;
  color: string;
  qualityScore: number;
  isRecommended: boolean;
  decision: 'pending' | 'approved' | 'rejected';
  take: Take;
}

interface ClusterDecision {
  clusterId: string;
  selectedTakeId: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: number;
}

interface ClusterTimelineProps {
  contentGroups: ContentGroup[];
  videoUrl: string | null;
  videoDuration: number;
  onClusterDecision: (clusterId: string, takeId: string, decision: 'approve' | 'reject') => void;
  onProgressToSilence: () => void;
  originalFilename?: string;
}

// Color system: Red for unselected takes, Green for selected winner
const TAKE_COLORS = {
  unselected: 'rgba(245, 101, 101, 0.8)', // Red - needs user selection
  selected: 'rgba(34, 197, 94, 0.8)',     // Green - user's choice
  pending: 'rgba(156, 163, 175, 0.6)'     // Gray - no decision yet
};

export function ClusterTimeline({
  contentGroups,
  videoUrl,
  videoDuration,
  onClusterDecision,
  onProgressToSilence,
  originalFilename
}: ClusterTimelineProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<TimelineSegment | null>(null);
  const [decisions, setDecisions] = useState<Map<string, ClusterDecision>>(new Map());
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  
  // Debug logging
  useEffect(() => {
    console.log('[ClusterTimeline] Received contentGroups:', contentGroups);
    console.log('[ClusterTimeline] Content groups count:', contentGroups.length);
    if (contentGroups.length > 0) {
      console.log('[ClusterTimeline] First group:', contentGroups[0]);
    }
  }, [contentGroups]);

  // Parse time string to seconds
  const parseTimeToSeconds = useCallback((timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      // MM:SS format
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 3) {
      // HH:MM:SS format
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return parseFloat(timeStr) || 0;
  }, []);

  // Create timeline segments from content groups
  const timelineSegments = useMemo(() => {
    const segments: TimelineSegment[] = [];
    
    contentGroups.forEach((group, groupIndex) => {
      // Check if group has an approved decision
      const approvedTakeId = group.takes.find(take => 
        decisions.get(take.id)?.status === 'approved'
      )?.id;
      
      group.takes.forEach(take => {
        const decision = decisions.get(take.id);
        // Enhanced color logic: 
        // - Green for approved take
        // - Red for other takes in the same group once one is approved
        // - Gray for pending decisions
        let color = TAKE_COLORS.pending; // Default gray
        
        if (decision?.status === 'approved') {
          color = TAKE_COLORS.selected; // Green for approved
        } else if (approvedTakeId && take.id !== approvedTakeId) {
          color = TAKE_COLORS.unselected; // Red for rejected (other takes in group)
        } else if (decision?.status === 'rejected') {
          color = TAKE_COLORS.unselected; // Red for explicitly rejected
        }
        
        segments.push({
          id: `${group.id}-${take.id}`,
          takeId: take.id,
          clusterId: group.id,
          startTime: parseTimeToSeconds(take.startTime),
          endTime: parseTimeToSeconds(take.endTime),
          duration: take.duration,
          color,
          qualityScore: take.qualityScore,
          isRecommended: take.id === group.bestTakeId,
          decision: decision?.status || 'pending',
          take
        });
      });
    });
    
    // Sort by start time
    return segments.sort((a, b) => a.startTime - b.startTime);
  }, [contentGroups, decisions, parseTimeToSeconds]);

  // Handle segment click - jump to position AND select
  const handleSegmentClick = useCallback((segment: TimelineSegment) => {
    setSelectedSegment(segment);
    setSelectedCluster(segment.clusterId);
    
    // Jump to video position immediately
    if (videoRef.current) {
      videoRef.current.currentTime = segment.startTime;
    }
  }, []);

  // Handle cluster decision
  const handleDecision = useCallback((takeId: string, decision: 'approve' | 'reject') => {
    const segment = timelineSegments.find(s => s.takeId === takeId);
    if (!segment) return;
    
    setDecisions(prev => {
      const newDecisions = new Map(prev);
      
      if (decision === 'approve') {
        // When approving a take, mark all other takes in the group as rejected
        const group = contentGroups.find(g => g.id === segment.clusterId);
        if (group) {
          group.takes.forEach(take => {
            if (take.id === takeId) {
              // Approve the selected take
              newDecisions.set(take.id, {
                clusterId: segment.clusterId,
                selectedTakeId: takeId,
                status: 'approved',
                timestamp: Date.now()
              });
            } else {
              // Mark other takes as rejected
              newDecisions.set(take.id, {
                clusterId: segment.clusterId,
                selectedTakeId: takeId, // Still reference the approved take
                status: 'rejected',
                timestamp: Date.now()
              });
            }
          });
        }
      } else {
        // Just mark this take as rejected
        newDecisions.set(takeId, {
          clusterId: segment.clusterId,
          selectedTakeId: takeId,
          status: 'rejected',
          timestamp: Date.now()
        });
      }
      
      return newDecisions;
    });
    
    onClusterDecision(segment.clusterId, takeId, decision);
  }, [timelineSegments, contentGroups, onClusterDecision]);

  // Check if all clusters have decisions (or if there are no clusters)
  const canProgressToSilence = useMemo(() => {
    // If no clusters, can always progress
    if (contentGroups.length === 0) return true;
    
    // Otherwise, check if all clusters have decisions
    return contentGroups.every(group => 
      group.takes.some(take => 
        decisions.get(take.id)?.status === 'approved'
      )
    );
  }, [contentGroups, decisions]);

  // Get current cluster for decision panel
  const currentCluster = useMemo(() => {
    if (!selectedCluster) return null;
    return contentGroups.find(g => g.id === selectedCluster);
  }, [selectedCluster, contentGroups]);

  // Video time update handler
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  // Format time display
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Generate debug information
  const generateDebugInfo = useCallback(() => {
    const debugData = contentGroups.map(group => ({
      id: group.id,
      name: group.name,
      timeRange: group.timeRange,
      timeRangeParsed: {
        start: parseTimeToSeconds(group.timeRange.start),
        end: parseTimeToSeconds(group.timeRange.end)
      },
      takes: group.takes.map(take => ({
        id: take.id,
        startTime: take.startTime,
        endTime: take.endTime,
        parsed: {
          start: parseTimeToSeconds(take.startTime),
          end: parseTimeToSeconds(take.endTime)
        }
      }))
    }));

    const debugString = JSON.stringify({
      videoDuration,
      contentGroups: debugData
    }, null, 2);

    navigator.clipboard.writeText(debugString);
    alert('Debug info copied to clipboard!');
  }, [contentGroups, videoDuration, parseTimeToSeconds]);

  // Calculate progress stats
  const progressStats = useMemo(() => {
    const totalClusters = contentGroups.length;
    const decidedClusters = contentGroups.filter(group =>
      group.takes.some(take => decisions.get(take.id)?.status === 'approved')
    ).length;
    
    return {
      totalClusters,
      decidedClusters,
      percentage: totalClusters > 0 ? Math.round((decidedClusters / totalClusters) * 100) : 0
    };
  }, [contentGroups, decisions]);

  return (
    <div className="cluster-timeline-container w-full h-full min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="cluster-timeline-header bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Cluster Timeline</h2>
            <p className="text-gray-600">Review and approve the best takes from each content group</p>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={generateDebugInfo}
            className="gap-2"
          >
            <Bug className="w-4 h-4" />
            Copy Debug Info
          </Button>
          
          <div className="flex items-center gap-4">
            {/* Progress indicator */}
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">
                {progressStats.decidedClusters} of {progressStats.totalClusters} groups decided
              </span>
              <Badge variant={progressStats.percentage === 100 ? 'default' : 'secondary'}>
                {progressStats.percentage}%
              </Badge>
            </div>
            
            {/* Continue button */}
            {canProgressToSilence && (
              <Button onClick={onProgressToSilence} className="flex items-center gap-2">
                Continue to Silence Timeline
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Video player - large and prominent */}
        <div className="flex-1 p-6 overflow-y-auto">
          <Card className="w-full h-full">
            <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
              {videoUrl ? (
                <>
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    className="w-full h-full object-contain"
                    controls
                    playsInline
                  />
                  
                  {/* Video overlay with current time */}
                  <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-md text-sm font-mono">
                    {formatTime(currentTime)} / {formatTime(videoDuration)}
                  </div>
                  
                  {/* Selected segment indicator */}
                  {selectedSegment && (
                    <div className="absolute top-4 left-4 bg-blue-600/90 text-white px-3 py-1 rounded-md text-sm">
                      Take {currentCluster ? (currentCluster.takes.findIndex(t => t.id === selectedSegment.takeId) + 1) : '?'} - 
                      Quality: {selectedSegment.qualityScore}/10
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <Play className="w-16 h-16 mx-auto mb-4" />
                    <p>No video loaded</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Decision panel - sidebar */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          {!currentCluster ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div className="text-gray-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-4" />
                <p className="font-medium mb-2">Select a Timeline Segment</p>
                <p className="text-sm">Click on any colored segment in the timeline below to review takes</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Cluster header */}
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900 capitalize">
                  {currentCluster.contentType.replace('_', ' ')}
                </h3>
                <p className="text-sm text-gray-600 mt-1">{currentCluster.description}</p>
                
                {/* AI recommendation */}
                <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">AI Recommends:</span>
                  </div>
                  <p className="text-sm text-yellow-700 mt-1">{currentCluster.reasoning}</p>
                </div>
              </div>

              {/* Take options */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                {currentCluster.takes.map((take, index) => {
                  const decision = decisions.get(take.id);
                  const isRecommended = take.id === currentCluster.bestTakeId;
                  
                  return (
                    <div
                      key={take.id}
                      className={`p-3 border rounded-lg ${
                        decision?.status === 'approved' 
                          ? 'border-green-300 bg-green-50' 
                          : decision?.status === 'rejected'
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      {/* Take header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Take {index + 1}</span>
                          {isRecommended && (
                            <Badge variant="secondary" className="text-xs">
                              <Crown className="w-3 h-3 mr-1" />
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline">
                          {take.qualityScore}/10
                        </Badge>
                      </div>

                      {/* Take details */}
                      <div className="text-sm text-gray-600 mb-3">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {take.duration}s
                          </span>
                          <span>{formatTime(parseTimeToSeconds(take.startTime))} - {formatTime(parseTimeToSeconds(take.endTime))}</span>
                        </div>
                        
                        {/* Issues and qualities */}
                        {take.issues.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-red-600 mb-1">Issues:</p>
                            <div className="space-y-1">
                              {take.issues.map((issue, idx) => (
                                <div key={idx} className="flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-red-500" />
                                  <span className="text-xs">{issue.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSegmentClick(
                            timelineSegments.find(s => s.takeId === take.id)!
                          )}
                          className="flex-1"
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Preview
                        </Button>
                        
                        <Button
                          size="sm"
                          variant={decision?.status === 'approved' ? 'default' : 'outline'}
                          onClick={() => handleDecision(take.id, 'approve')}
                          disabled={decision?.status === 'approved'}
                        >
                          {decision?.status === 'approved' ? (
                            <CheckCircle className="w-3 h-3 mr-1" />
                          ) : null}
                          Keep
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline track - bottom section */}
      <div className="h-32 bg-white border-t border-gray-200 p-4 flex-shrink-0">
        <div className="w-full h-full">
          <div className="text-sm text-gray-600 mb-2 flex items-center justify-between">
            <span>
              {contentGroups.length === 0 
                ? 'No clusters detected - Click Continue to proceed to Silence Detection' 
                : 'Timeline - Click segments to review takes'}
            </span>
            <span className="font-mono">{formatTime(videoDuration)} total</span>
          </div>
          
          {/* Timeline track */}
          <div className="relative w-full h-16 bg-gray-100 rounded-lg overflow-hidden">
            {/* Show empty state message if no clusters */}
            {contentGroups.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                No repeated takes or clusters detected in this video
              </div>
            )}
            
            {/* Time markers */}
            <div className="absolute inset-0">
              {Array.from({ length: Math.ceil(videoDuration / 30) }, (_, i) => {
                const time = i * 30;
                const left = (time / videoDuration) * 100;
                return (
                  <div
                    key={time}
                    className="absolute top-0 bottom-0 w-px bg-gray-300"
                    style={{ left: `${left}%` }}
                  >
                    <div className="absolute -top-4 -left-4 text-xs text-gray-500 w-8 text-center">
                      {formatTime(time)}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Cluster gray boxes - render behind segments */}
            <div className="absolute inset-0">
              {contentGroups.map(group => {
                const startTime = parseTimeToSeconds(group.timeRange.start);
                const endTime = parseTimeToSeconds(group.timeRange.end);
                const left = (startTime / videoDuration) * 100;
                const width = ((endTime - startTime) / videoDuration) * 100;
                const hasApprovedTake = group.takes.some(take => 
                  decisions.get(take.id)?.status === 'approved'
                );
                const isSelectedCluster = selectedCluster === group.id;
                
                return (
                  <button
                    key={`cluster-${group.id}`}
                    onClick={() => {
                      setSelectedCluster(group.id);
                      // Jump to first take in cluster
                      const firstTake = group.takes[0];
                      if (firstTake && videoRef.current) {
                        videoRef.current.currentTime = parseTimeToSeconds(firstTake.startTime);
                      }
                    }}
                    className={`absolute h-full transition-all duration-200 ${
                      isSelectedCluster ? 'z-10' : 'z-0'
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: hasApprovedTake 
                        ? 'rgba(34, 197, 94, 0.15)' // Green tint if decided
                        : 'rgba(156, 163, 175, 0.3)', // Gray if pending
                      border: isSelectedCluster 
                        ? '2px solid rgba(59, 130, 246, 0.8)' // Blue border when selected
                        : '1px solid rgba(156, 163, 175, 0.4)',
                      borderRadius: '6px'
                    }}
                    title={`${group.name} - Click to review takes`}
                  >
                    <div className="absolute top-1 left-2 text-xs font-medium text-gray-700 pointer-events-none">
                      Cluster: {group.takes.length} takes
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Timeline segments (individual takes) - render on top */}
            <div className="absolute inset-0 z-5">
              {timelineSegments.map(segment => {
                const left = (segment.startTime / videoDuration) * 100;
                const width = (segment.duration / videoDuration) * 100;
                const isSelected = selectedSegment?.id === segment.id;
                
                return (
                  <button
                    key={segment.id}
                    onClick={() => handleSegmentClick(segment)}
                    className={`absolute h-12 top-2 transition-all duration-200 hover:opacity-90 hover:z-20 ${
                      isSelected ? 'ring-2 ring-blue-400 ring-offset-1 z-30' : 'z-15'
                    } ${
                      segment.decision === 'approved' 
                        ? 'ring-2 ring-green-400'
                        : segment.decision === 'rejected'
                        ? 'ring-2 ring-red-400' 
                        : ''
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: segment.color,
                      borderRadius: '4px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}
                    title={`Take ${segment.takeId} - Click to preview`}
                  >
                    {/* Segment content */}
                    <div className="w-full h-full flex items-center justify-center relative">
                      {segment.isRecommended && (
                        <Crown className="w-3 h-3 text-yellow-600" />
                      )}
                      {segment.decision === 'approved' && (
                        <CheckCircle className="absolute top-1 right-1 w-3 h-3 text-white drop-shadow" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Current time playhead */}
            {videoDuration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-blue-600 z-40"
                style={{ left: `${(currentTime / videoDuration) * 100}%` }}
              >
                <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-600 rounded-full"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}