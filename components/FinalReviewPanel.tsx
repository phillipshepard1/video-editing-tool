'use client';

import { EnhancedSegment } from '@/lib/types/segments';
import { TakeCluster, ClusterSelection } from '@/lib/clustering';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileText, Film, FileCode } from 'lucide-react';

interface FinalReviewPanelProps {
  finalSegmentsToRemove: EnhancedSegment[];
  clusters: TakeCluster[];
  clusterSelections: ClusterSelection[];
  originalDuration: number;
  finalDuration: number;
  onExport: (format: 'edl' | 'fcpxml' | 'premiere', segmentsToRemove: EnhancedSegment[]) => void;
  videoUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function FinalReviewPanel({
  finalSegmentsToRemove,
  clusters,
  clusterSelections,
  originalDuration,
  finalDuration,
  onExport,
  videoUrl,
  videoRef
}: FinalReviewPanelProps) {
  const timeRemoved = originalDuration - finalDuration;
  const reductionPercentage = ((timeRemoved / originalDuration) * 100).toFixed(1);
  
  const clustersProcessed = clusterSelections.length;
  const segmentsRemoved = finalSegmentsToRemove.length;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(0).padStart(2, '0');
    return `${mins.toString().padStart(2, '0')}:${secs}`;
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left Panel - Summary Stats */}
      <div className="col-span-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <span className="mr-2">📊</span>
              Final Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-gray-500">Clusters Processed</div>
              <div className="text-2xl font-bold text-green-600">
                {clustersProcessed}
              </div>
            </div>
            
            <div>
              <div className="text-xs text-gray-500">Segments Removed</div>
              <div className="text-2xl font-bold text-red-600">
                {segmentsRemoved}
              </div>
            </div>
            
            <div>
              <div className="text-xs text-gray-500">Time Saved</div>
              <div className="text-2xl font-bold text-cyan-600">
                {formatTime(timeRemoved)}
              </div>
            </div>
            
            <div>
              <div className="text-xs text-gray-500">Reduction</div>
              <div className="text-2xl font-bold">
                {reductionPercentage}%
              </div>
            </div>
            
            <div className="border-t pt-4">
              <div className="font-semibold text-sm mb-3">Export Options</div>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => onExport('edl', finalSegmentsToRemove)}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Export EDL
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => onExport('fcpxml', finalSegmentsToRemove)}
                >
                  <FileCode className="w-4 h-4 mr-2" />
                  Export FCPXML
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => onExport('premiere', finalSegmentsToRemove)}
                >
                  <Film className="w-4 h-4 mr-2" />
                  Export Premiere XML
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Center & Right - Final Preview */}
      <div className="col-span-9">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Final Cut Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Video Preview */}
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full"
                  controls
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  No video loaded
                </div>
              )}
            </div>

            {/* Timeline Visualization */}
            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">Edit Timeline</div>
              <div className="relative h-16 bg-gray-100 rounded-lg overflow-hidden">
                {/* Original timeline */}
                <div className="absolute inset-0 flex items-center px-2">
                  <div className="w-full h-8 bg-gray-300 rounded relative">
                    {/* Removed segments */}
                    {finalSegmentsToRemove.map((segment, index) => {
                      const startPercent = (parseTimeToSeconds(segment.startTime) / originalDuration) * 100;
                      const widthPercent = (segment.duration / originalDuration) * 100;
                      
                      return (
                        <div
                          key={segment.id}
                          className="absolute h-full bg-red-500 opacity-50"
                          style={{
                            left: `${startPercent}%`,
                            width: `${widthPercent}%`
                          }}
                          title={`${segment.startTime} - ${segment.endTime}: ${segment.reason}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm">
                <span className="text-gray-500">Final Duration:</span>
                <span className="font-bold ml-2">
                  {formatTime(finalDuration)} / {formatTime(originalDuration)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline">
                  ← Back to Edit
                </Button>
                <Button 
                  className="bg-green-500 hover:bg-green-600"
                  onClick={() => onExport('fcpxml', finalSegmentsToRemove)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Final Cut
                </Button>
              </div>
            </div>

            {/* Breakdown of Edits */}
            <div className="mt-6 pt-4 border-t">
              <h3 className="text-sm font-semibold mb-3">Edit Breakdown</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 mb-2">Clusters Resolved</div>
                  {clusters.map((cluster) => {
                    const selection = clusterSelections.find(s => s.clusterId === cluster.id);
                    return (
                      <div key={cluster.id} className="flex justify-between py-1">
                        <span className="text-xs">{cluster.name}</span>
                        <span className="text-xs text-green-600">
                          {selection?.removedSegments.length || 0} removed
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <div className="text-gray-500 mb-2">Categories Removed</div>
                  {Object.entries(
                    finalSegmentsToRemove.reduce((acc, seg) => {
                      acc[seg.category] = (acc[seg.category] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([category, count]) => (
                    <div key={category} className="flex justify-between py-1">
                      <span className="text-xs capitalize">{category.replace('_', ' ')}</span>
                      <span className="text-xs text-red-600">{count} segments</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(timeStr);
}