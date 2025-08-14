'use client';

import { useState } from 'react';
import { TakeCluster, ClusterSelection } from '@/lib/clustering';
import { EnhancedSegment } from '@/lib/types/segments';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, SkipBack, SkipForward, Check, X } from 'lucide-react';

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

    if (take === 'winner' && selectedCluster?.winner) {
      const startTime = parseTimeToSeconds(selectedCluster.winner.startTime);
      videoRef.current.currentTime = startTime;
      await videoRef.current.play();
      setPreviewingTake('winner');
    } else if (take !== 'winner') {
      const startTime = parseTimeToSeconds(take.startTime);
      videoRef.current.currentTime = startTime;
      await videoRef.current.play();
      const takeIndex = selectedCluster?.attempts.findIndex(a => a.id === take.id) ?? -1;
      setPreviewingTake(takeIndex);
    }
  };

  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(timeStr);
  };

  const currentSelection = selectedCluster 
    ? clusterSelections.find(s => s.clusterId === selectedCluster.id)
    : null;

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left Panel - Cluster List */}
      <div className="col-span-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <span className="mr-2">🎬</span>
              Detected Clusters
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
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
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedCluster(cluster)}
                >
                  <div className="font-semibold text-sm">{cluster.name}</div>
                  <div className="text-xs text-gray-500">
                    {cluster.attempts.length} attempts • {cluster.timeRange.start} - {cluster.timeRange.end}
                  </div>
                  {selection && (
                    <div className="text-xs mt-1">
                      {selection.selectedWinner === 'gap' ? (
                        <span className="text-green-600">✓ Winner selected</span>
                      ) : (
                        <span className="text-yellow-600">⚠️ Needs review</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            <div className="pt-3 mt-3 border-t">
              <Button className="w-full bg-green-500 hover:bg-green-600">
                Accept All Selections
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Center - Cluster Details */}
      <div className="col-span-5">
        {selectedCluster ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Cluster: {selectedCluster.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Failed Attempts */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-red-600 mb-2">
                  ❌ FAILED ATTEMPTS (TO REMOVE):
                </h3>
                <div className="space-y-2">
                  {selectedCluster.attempts.map((attempt, index) => (
                    <div
                      key={attempt.id}
                      className="p-3 bg-red-50 border border-red-200 rounded-lg relative"
                    >
                      <Badge className="absolute top-2 right-2 bg-red-100 text-red-700">
                        Remove
                      </Badge>
                      <div className="font-semibold text-sm">
                        Take {index + 1} • {attempt.startTime} - {attempt.endTime} ({attempt.duration.toFixed(1)}s)
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {attempt.reason}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
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
                  <h3 className="text-sm font-semibold text-green-600 mb-2">
                    ✅ WINNING TAKE (TO KEEP):
                  </h3>
                  <div className="p-3 bg-green-50 border-2 border-green-300 rounded-lg relative">
                    <Badge className="absolute top-2 right-2 bg-green-100 text-green-700">
                      Keep
                    </Badge>
                    <div className="font-semibold text-sm">
                      Take {selectedCluster.attempts.length + 1} • {selectedCluster.winner.startTime} - {selectedCluster.winner.endTime}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Clean delivery - no issues detected
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
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
                  onClick={() => {
                    // Logic to select different winner
                  }}
                >
                  Select Different Winner
                </Button>
                <Button
                  className="bg-green-500 hover:bg-green-600"
                  onClick={() => handleSelectWinner(selectedCluster.id, 'gap')}
                >
                  Accept Selection
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="text-center py-8 text-gray-500">
              Select a cluster to view details
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right - Video Preview */}
      <div className="col-span-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Video Preview</CardTitle>
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
                  <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600">
                    <Play className="w-4 h-4 mr-1" />
                    Play
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