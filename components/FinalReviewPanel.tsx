'use client';

import { EnhancedSegment } from '@/lib/types/segments';
import { TakeCluster, ClusterSelection } from '@/lib/clustering';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileText, Film, FileCode, Video, Loader2, CheckCircle, AlertCircle, Upload } from 'lucide-react';
import { useState } from 'react';
import { getVideoFileForUpload, uploadVideoToSupabase } from '@/lib/video-upload';
import { EditedVideoPreview } from './EditedVideoPreview';

interface FinalReviewPanelProps {
  finalSegmentsToRemove: EnhancedSegment[];
  clusters: TakeCluster[];
  clusterSelections: ClusterSelection[];
  originalDuration: number;
  finalDuration: number;
  onExport: (format: 'edl' | 'fcpxml' | 'premiere', segmentsToRemove: EnhancedSegment[]) => void;
  videoUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoDuration?: number;
  supabaseUrl?: string;  // Pre-uploaded Supabase URL
}

export function FinalReviewPanel({
  finalSegmentsToRemove,
  clusters,
  clusterSelections,
  originalDuration,
  finalDuration,
  onExport,
  videoUrl,
  videoRef,
  videoDuration,
  supabaseUrl
}: FinalReviewPanelProps) {
  const [renderStatus, setRenderStatus] = useState<'idle' | 'uploading' | 'rendering' | 'completed' | 'error'>('idle');
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [renderService, setRenderService] = useState<'shotstack' | 'chillin'>('shotstack'); // Default to Shotstack
  const timeRemoved = originalDuration - finalDuration;
  const reductionPercentage = ((timeRemoved / originalDuration) * 100).toFixed(1);
  
  const clustersProcessed = clusterSelections.length;
  const segmentsRemoved = finalSegmentsToRemove.length;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(0).padStart(2, '0');
    return `${mins.toString().padStart(2, '0')}:${secs}`;
  };

  const parseTimeToSeconds = (timeStr: string | number): number => {
    // If already a number, return it
    if (typeof timeStr === 'number') {
      return timeStr;
    }
    
    // Parse time string
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 3) {
      // Handle HH:MM:SS format
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return parseFloat(timeStr);
  };

  const handleRenderVideo = async () => {
    if (!videoUrl) {
      setRenderError('No video URL available');
      return;
    }

    setRenderError(null);
    setRenderProgress(0);
    setUploadProgress(0);

    try {
      let publicUrl: string;
      
      // Check if we already have a Supabase URL from the initial upload
      if (supabaseUrl) {
        console.log('Using pre-uploaded Supabase URL:', supabaseUrl);
        publicUrl = supabaseUrl;
        setUploadProgress(100);  // Show as already uploaded
        setRenderStatus('rendering');
      } else {
        // Fallback: Upload video to Supabase if not already uploaded
        console.log('No pre-uploaded URL, uploading to Supabase now...');
        setRenderStatus('uploading');
        
        const videoFile = await getVideoFileForUpload(videoUrl, 'original_video.mp4');
        console.log('Video file prepared:', videoFile.name, videoFile.size);
        const fileSizeMB = videoFile.size / (1024 * 1024);
        
        console.log(`Processing video file (${fileSizeMB.toFixed(1)}MB): Uploading to Supabase...`);
        
        const uploadResult = await uploadVideoToSupabase(videoFile, (progress) => {
          setUploadProgress(progress.percentage);
          console.log('Upload progress:', progress.percentage + '%');
        });
        
        console.log('Video uploaded to Supabase:', uploadResult.publicUrl);
        publicUrl = uploadResult.publicUrl;
        setUploadProgress(100);
        setRenderStatus('rendering');
      }
      
      // Use Shotstack by default (more reliable than Chillin)
      const renderEndpoint = renderService === 'shotstack' 
        ? '/api/render/shotstack'
        : '/api/render/chillin';
      
      console.log(`Using ${renderService} for rendering`);
      
      const response = await fetch(renderEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoUrl: publicUrl,  // Use the publicUrl (either pre-uploaded or just uploaded)
          segmentsToRemove: finalSegmentsToRemove,
          videoDuration: videoDuration || originalDuration,
          videoWidth: 1920,
          videoHeight: 1080,
          fps: 30,
          quality: 'high' // For Shotstack
        })
      });
      
      const renderData = await response.json();
      console.log('URL-based render job submitted:', renderData);

      if (!renderData || renderData.error) {
        const errorMessage = renderData?.error || 'Failed to submit render job';
        console.error('Render submission failed:', {
          renderData,
          errorMessage,
          videoUrl: publicUrl,
          segmentsCount: finalSegmentsToRemove.length
        });
        
        // Check if it's a server error and provide alternatives
        if (renderData?.serverError) {
          const alternativesMsg = renderData.alternatives 
            ? '\n\nAlternatives:\n' + (Array.isArray(renderData.alternatives) 
              ? renderData.alternatives.join('\n')
              : renderData.alternatives.map((a: any) => a.description || a).join('\n'))
            : '';
          
          throw new Error(
            `Chillin render servers are currently down. This is a known issue on their end.${alternativesMsg}`
          );
        }
        
        throw new Error(errorMessage);
      }

      setRenderId(renderData.renderId);
      setRenderStatus('rendering');
      setRenderProgress(10);

      // Poll for status
      let attempts = 0;
      const maxAttempts = 180; // 15 minutes max for large videos
      const pollInterval = 5000; // 5 seconds

      const pollStatus = async () => {
        if (attempts >= maxAttempts) {
          console.error('Render timeout after', attempts, 'attempts');
          setRenderStatus('error');
          setRenderProgress(0);
          alert(`Render is taking longer than expected (${Math.floor((attempts * pollInterval) / 1000 / 60)} minutes). The video may still be processing on Chillin's servers. Render ID: ${renderData.renderId}`);
          return;
        }

        try {
          const statusEndpoint = renderService === 'shotstack'
            ? `/api/render/shotstack?renderId=${renderData.renderId}`
            : `/api/render/chillin?renderId=${renderData.renderId}`;
          
          const statusResponse = await fetch(statusEndpoint);
          const statusResult = await statusResponse.json();
          
          console.log(`Status check ${attempts + 1}:`, statusResult);

          // Handle timeout response from API (when Chillin is slow)
          if (statusResult.timeout) {
            console.log('Status check timed out, but render may still be processing');
            setRenderProgress(Math.min(50 + (attempts * 0.2), 90)); // Gradually increase progress
            attempts++;
            setTimeout(pollStatus, pollInterval);
            return;
          }

          if (statusResult.status === 'completed' && statusResult.outputUrl) {
            console.log('Render completed:', statusResult.outputUrl);
            setRenderStatus('completed');
            setRenderProgress(100);
            setRenderedVideoUrl(statusResult.outputUrl);
            
            // Download the video
            const link = document.createElement('a');
            link.href = statusResult.outputUrl;
            link.download = `edited_video_${Date.now()}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
          } else if (statusResult.status === 'failed' || statusResult.status === 'server_error') {
            console.error('Render failed:', statusResult);
            
            // Check if it's a server error
            if (statusResult.serverError) {
              const alternatives = statusResult.alternatives 
                ? '\n\nWhat you can do:\n• ' + statusResult.alternatives.join('\n• ')
                : '';
              
              throw new Error(
                `Chillin servers are down: ${statusResult.error || statusResult.details}${alternatives}`
              );
            }
            
            throw new Error(statusResult.error || 'Render failed');
          } else if (statusResult.status === 'error') {
            console.error('Render error:', statusResult);
            throw new Error(statusResult.error || statusResult.details || 'Render error');
          } else {
            // Still processing
            attempts++;
            console.log(`Still processing... attempt ${attempts}/${maxAttempts}`);
            setRenderProgress(Math.min(90, 10 + (attempts * 80 / maxAttempts)));
            setTimeout(pollStatus, pollInterval);
          }
        } catch (fetchError) {
          console.error('Error checking render status:', fetchError);
          attempts++;
          if (attempts < maxAttempts) {
            console.log('Retrying status check...');
            setTimeout(pollStatus, pollInterval);
          } else {
            throw new Error('Failed to check render status: ' + (fetchError as Error).message);
          }
        }
      };

      // Start polling
      setTimeout(pollStatus, pollInterval);

    } catch (error) {
      console.error('Render error:', error);
      setRenderStatus('error');
      
      let errorMessage = error instanceof Error ? error.message : 'Failed to render video';
      
      // Check if it contains server error indicators
      if (errorMessage.includes('EOF') || 
          errorMessage.includes('server timeout') ||
          errorMessage.includes('servers are down')) {
        errorMessage = '⚠️ Chillin render servers are currently experiencing issues.\n\n' +
                      'This is a known problem on their end (server error: EOF).\n\n' +
                      'What you can do instead:\n' +
                      '• Export your timeline as EDL/XML for local editing\n' +
                      '• Wait and try again later\n' +
                      '• Contact support@chillin.online for status updates';
      }
      
      setRenderError(errorMessage);
      
      // Log additional context for debugging
      console.log('Debug info:', {
        videoUrl,
        segmentsCount: finalSegmentsToRemove.length,
        videoDuration: videoDuration || originalDuration,
        renderId,
        error: errorMessage
      });
    }
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
                
                <div className="border-t mt-3 pt-3">
                  {/* Render Service Toggle */}
                  <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    <label className="text-sm font-medium mb-1 block">Render Service:</label>
                    <div className="flex gap-2">
                      <button
                        className={`flex-1 px-3 py-1 text-xs rounded transition-colors ${
                          renderService === 'shotstack' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                        onClick={() => setRenderService('shotstack')}
                      >
                        Shotstack (Recommended)
                      </button>
                      <button
                        className={`flex-1 px-3 py-1 text-xs rounded transition-colors ${
                          renderService === 'chillin' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                        onClick={() => setRenderService('chillin')}
                      >
                        Chillin (Backup)
                      </button>
                    </div>
                  </div>
                  
                  <Button
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                    onClick={handleRenderVideo}
                    disabled={renderStatus !== 'idle' && renderStatus !== 'completed' && renderStatus !== 'error'}
                  >
                    {renderStatus === 'idle' && (
                      <>
                        <Video className="w-4 h-4 mr-2" />
                        Render Video
                      </>
                    )}
                    {renderStatus === 'uploading' && (
                      <>
                        <Upload className="w-4 h-4 mr-2 animate-spin" />
                        Uploading... ({uploadProgress}%)
                      </>
                    )}
                    {renderStatus === 'rendering' && (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Rendering ({renderProgress}%)
                      </>
                    )}
                    {renderStatus === 'completed' && (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Render Complete
                      </>
                    )}
                    {renderStatus === 'error' && (
                      <>
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Retry Render
                      </>
                    )}
                  </Button>
                  
                  {renderError && (
                    <div className="mt-2 text-xs text-red-600">
                      {renderError}
                    </div>
                  )}
                  
                  {(renderStatus === 'uploading' || renderStatus === 'rendering') && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">
                        {renderStatus === 'uploading' ? 'Uploading video...' : 'Rendering video...'}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-purple-600 to-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${renderStatus === 'uploading' ? uploadProgress : renderProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-2 text-xs text-gray-500">
                    Powered by Chillin.online
                  </div>
                </div>
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
            {/* Edited Video Preview with automatic segment skipping */}
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
              <EditedVideoPreview
                videoUrl={videoUrl}
                segmentsToRemove={finalSegmentsToRemove}
                originalDuration={originalDuration}
                finalDuration={finalDuration}
              />
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
                      const startTime = typeof segment.startTime === 'number' ? segment.startTime : parseTimeToSeconds(segment.startTime);
                      const startPercent = (startTime / originalDuration) * 100;
                      const widthPercent = (segment.duration / originalDuration) * 100;
                      
                      return (
                        <div
                          key={`${segment.id}-${index}`}
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
                <Button 
                  variant="outline"
                  onClick={() => window.history.back()}
                >
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