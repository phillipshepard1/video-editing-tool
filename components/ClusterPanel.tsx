'use client';

import { useState, useEffect } from 'react';
import { TakeCluster, ClusterSelection } from '@/lib/clustering';
import { EnhancedSegment } from '@/lib/types/segments';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, SkipBack, SkipForward, Check, X, CheckSquare, Square } from 'lucide-react';

interface ClusterPanelProps {
  clusters: TakeCluster[];
  clusterSelections: ClusterSelection[];
  onClusterSelection: (clusterId: string, selection: ClusterSelection) => void;
  videoUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  onSegmentSelect: (segment: EnhancedSegment | null) => void;
}

export function ClusterPanel({
  clusters,
  clusterSelections,
  onClusterSelection,
  videoUrl,
  videoRef,
  onSegmentSelect
}: ClusterPanelProps) {
  const [selectedCluster, setSelectedCluster] = useState<TakeCluster | null>(
    clusters.length > 0 ? clusters[0] : null
  );
  const [previewingTake, setPreviewingTake] = useState<number | 'winner' | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewTimeoutId, setPreviewTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [showBuffer, setShowBuffer] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [clipBounds, setClipBounds] = useState<{ start: number; end: number } | null>(null);

  const handleSelectWinner = (clusterId: string, winnerIndex: number | 'gap') => {
    const cluster = clusters.find(c => c.id === clusterId);
    if (!cluster) return;

    const selection: ClusterSelection = {
      clusterId,
      selectedWinner: winnerIndex === 'gap' ? 'gap' : winnerIndex,
      removedSegments: cluster.attempts.map(a => a.id),
      keptSegments: []
    };

    onClusterSelection(clusterId, selection);
  };

  const handlePreviewTake = async (take: EnhancedSegment | 'winner') => {
    if (!videoRef.current) return;

    // Clear any existing timeout
    if (previewTimeoutId) {
      clearTimeout(previewTimeoutId);
      setPreviewTimeoutId(null);
    }

    let startTime: number;
    let endTime: number;

    if (take === 'winner' && selectedCluster?.winner) {
      startTime = parseTimeToSeconds(selectedCluster.winner.startTime);
      endTime = parseTimeToSeconds(selectedCluster.winner.endTime);
      setPreviewingTake('winner');
    } else if (take !== 'winner') {
      startTime = parseTimeToSeconds(take.startTime);
      endTime = parseTimeToSeconds(take.endTime);
      const takeIndex = selectedCluster?.attempts.findIndex(a => a.id === take.id) ?? -1;
      setPreviewingTake(takeIndex);
    } else {
      return;
    }

    // Store clip boundaries for markers
    setClipBounds({ start: startTime, end: endTime });

    // Apply buffer if enabled
    const previewStartTime = showBuffer ? Math.max(0, startTime - 3) : startTime;
    const previewEndTime = showBuffer ? endTime + 3 : endTime;
    const previewDuration = (previewEndTime - previewStartTime) * 1000; // Convert to milliseconds

    videoRef.current.currentTime = previewStartTime;
    await videoRef.current.play();
    setIsPlaying(true);

    // Set timeout to pause the video after the preview duration
    const timeoutId = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }, previewDuration);
    
    setPreviewTimeoutId(timeoutId);
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      // Clear timeout if pausing manually
      if (previewTimeoutId) {
        clearTimeout(previewTimeoutId);
        setPreviewTimeoutId(null);
      }
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(timeStr);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup timeout on unmount or when component updates
  useEffect(() => {
    return () => {
      if (previewTimeoutId) {
        clearTimeout(previewTimeoutId);
      }
    };
  }, [previewTimeoutId]);

  // Update playing state based on video events
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Set initial duration if video is already loaded
    if (video.duration) {
      setDuration(video.duration);
    }

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoRef.current]);

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const currentSelection = selectedCluster 
    ? clusterSelections.find(s => s.clusterId === selectedCluster.id)
    : null;

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left Panel - Cluster List */}
      <div className="col-span-3">
        <Card className="bg-white border-gray-200 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center text-gray-900">
              <span className="mr-2">🎬</span>
              Detected Clusters
            </CardTitle>
            <p className="text-xs text-gray-600 mt-1">
              {clusters.length} cluster groups found
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {clusters.map((cluster) => {
              const selection = clusterSelections.find(s => s.clusterId === cluster.id);
              const isSelected = selectedCluster?.id === cluster.id;
              
              return (
                <div
                  key={cluster.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedCluster(cluster)}
                >
                  <div className="font-semibold text-sm text-gray-900">{cluster.name}</div>
                  <div className="text-xs text-gray-600">
                    {cluster.attempts.length} attempts • {cluster.timeRange.start} - {cluster.timeRange.end}
                  </div>
                  {selection && (
                    <div className="text-xs mt-1">
                      {selection.selectedWinner === 'gap' ? (
                        <span className="text-green-400">✓ Winner selected</span>
                      ) : (
                        <span className="text-yellow-400">⚠️ Needs review</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            <div className="pt-3 mt-3 border-t">
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white cursor-pointer">
                Accept All Selections
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Center - Cluster Details */}
      <div className="col-span-5">
        {selectedCluster ? (
          <Card className="bg-white border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900">
                Cluster: {selectedCluster.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Failed Attempts */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-red-400 mb-2">
                  ❌ FAILED ATTEMPTS (TO REMOVE):
                </h3>
                <div className="space-y-2">
                  {selectedCluster.attempts.map((attempt, index) => (
                    <div
                      key={attempt.id}
                      className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg relative"
                    >
                      <Badge className="absolute top-2 right-2 bg-red-500/20 text-red-400">
                        Remove
                      </Badge>
                      <div className="font-semibold text-sm text-gray-900">
                        Take {index + 1} • {attempt.startTime} - {attempt.endTime} ({attempt.duration.toFixed(1)}s)
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {attempt.reason}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 cursor-pointer bg-white hover:bg-gray-50 text-gray-900 border-gray-300"
                        onClick={() => handlePreviewTake(attempt)}
                      >
                        Preview
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Winning Take */}
              {selectedCluster.winner && (
                <div>
                  <h3 className="text-sm font-semibold text-green-400 mb-2">
                    ✅ WINNING TAKE (TO KEEP):
                  </h3>
                  <div className="p-3 bg-green-500/10 border-2 border-green-500/30 rounded-lg relative">
                    <Badge className="absolute top-2 right-2 bg-green-500/20 text-green-400">
                      Keep
                    </Badge>
                    <div className="font-semibold text-sm text-gray-900">
                      Take {selectedCluster.attempts.length + 1} • {selectedCluster.winner.startTime} - {selectedCluster.winner.endTime}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Clean delivery - no issues detected
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 cursor-pointer bg-white hover:bg-gray-50 text-gray-900 border-gray-300"
                      onClick={() => handlePreviewTake('winner')}
                    >
                      Preview Winner
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  className="cursor-pointer bg-white hover:bg-gray-50 text-gray-900 border-gray-300"
                  onClick={() => {
                    // Logic to select different winner
                  }}
                >
                  Select Different Winner
                </Button>
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
                  onClick={() => handleSelectWinner(selectedCluster.id, 'gap')}
                >
                  Accept Selection
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white border-gray-200 shadow-lg">
            <CardContent className="text-center py-8 text-gray-600">
              Select a cluster to view details
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right - Video Preview */}
      <div className="col-span-4">
        <Card className="bg-white border-gray-200 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900">Video Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {videoUrl ? (
              <>
                <div className="aspect-video bg-black rounded-lg overflow-hidden mb-3">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full"
                    controls={false}
                  />
                </div>
                
                {/* Video Scrubber */}
                <div className="mb-3">
                  <div 
                    className="relative h-2 bg-gray-200 rounded-full cursor-pointer"
                    onClick={handleScrub}
                  >
                    {/* Progress bar */}
                    <div 
                      className="absolute h-full bg-blue-500 rounded-full"
                      style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />
                    
                    {/* Clip start marker */}
                    {clipBounds && duration && (
                      <>
                        <div 
                          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-green-500"
                          style={{ left: `${(clipBounds.start / duration) * 100}%` }}
                          title="Clip Start"
                        />
                        {/* Clip end marker */}
                        <div 
                          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-red-500"
                          style={{ left: `${(clipBounds.end / duration) * 100}%` }}
                          title="Clip End"
                        />
                      </>
                    )}
                    
                    {/* Scrubber handle */}
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-blue-500 rounded-full"
                      style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                  
                  {/* Time display */}
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
                
                {/* Buffer preview checkbox */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setShowBuffer(!showBuffer)}
                    className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                  >
                    {showBuffer ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    Show 3-second buffer preview
                  </button>
                </div>
                
                {selectedCluster && (
                  <>
                    <div className="text-xs text-gray-500 mb-2">Comparing Takes:</div>
                    <div className="grid grid-cols-3 gap-1 mb-3">
                      {selectedCluster.attempts.map((attempt, index) => (
                        <Button
                          key={attempt.id}
                          size="sm"
                          variant={previewingTake === index ? "default" : "outline"}
                          className={`text-xs ${
                            previewingTake === index 
                              ? 'bg-red-500 hover:bg-red-600' 
                              : 'border-red-300'
                          }`}
                          onClick={() => handlePreviewTake(attempt)}
                        >
                          Take {index + 1}
                        </Button>
                      ))}
                      {selectedCluster.winner && (
                        <Button
                          size="sm"
                          variant={previewingTake === 'winner' ? "default" : "outline"}
                          className={`text-xs ${
                            previewingTake === 'winner'
                              ? 'bg-green-500 hover:bg-green-600'
                              : 'border-green-300'
                          }`}
                          onClick={() => handlePreviewTake('winner')}
                        >
                          Winner ✓
                        </Button>
                      )}
                    </div>
                  </>
                )}
                
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    <SkipBack className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <Button 
                    size="sm" 
                    className="flex-1 bg-green-500 hover:bg-green-600"
                    onClick={handlePlayPause}
                  >
                    {isPlaying ? (
                      <><Pause className="w-4 h-4 mr-1" />Pause</>
                    ) : (
                      <><Play className="w-4 h-4 mr-1" />Play</>
                    )}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1">
                    Next
                    <SkipForward className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </>
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