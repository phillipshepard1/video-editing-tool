'use client';

import { EnhancedSegment } from '@/lib/types/segments';
import { TakeCluster, ClusterSelection } from '@/lib/clustering';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileText, Film, FileCode, Video, Loader2, CheckCircle, AlertCircle, Upload, Info, Save } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useState, useEffect } from 'react';
import { getVideoFileForUpload, uploadVideoToSupabase } from '@/lib/video-upload';
import { EditedVideoPreview } from './EditedVideoPreview';

interface FinalReviewPanelProps {
  sessionId?: string;  // Optional session ID if this is part of a saved session
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
  sessionId,
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
  const [renderFPS, setRenderFPS] = useState<number>(60); // Default to 60 FPS to prevent freezing issues
  const [renderQuality, setRenderQuality] = useState<'low' | 'medium' | 'high'>('high'); // Default quality
  const [renderResolution, setRenderResolution] = useState<'sd' | 'hd' | '1080' | '4k'>('1080'); // Default resolution
  const [detectedFPS, setDetectedFPS] = useState<number | null>(null); // Detected source FPS
  const [isSavingToSession, setIsSavingToSession] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const timeRemoved = originalDuration - finalDuration;
  const reductionPercentage = ((timeRemoved / originalDuration) * 100).toFixed(1);
  
  const clustersProcessed = clusterSelections.length;
  const segmentsRemoved = finalSegmentsToRemove.length;

  // Try to detect source video FPS
  useEffect(() => {
    if (videoRef.current && videoUrl) {
      const detectFPS = () => {
        const video = videoRef.current;
        if (video) {
          // Try to get FPS from video metadata (not always available)
          // Some browsers expose this through videoTracks
          const videoTracks = (video as any).videoTracks;
          if (videoTracks && videoTracks.length > 0) {
            const track = videoTracks[0];
            if (track.frameRate) {
              const fps = Math.round(track.frameRate);
              setDetectedFPS(fps);
              // Only override if detected FPS is different and valid
              if (fps && fps !== 60) {
                setRenderFPS(fps); // Auto-select detected FPS
              }
              console.log('Detected source FPS:', fps);
            }
          }
          
          // Alternative: Use MediaSource API if available
          if (!detectedFPS && (video as any).captureStream) {
            try {
              const stream = (video as any).captureStream();
              const videoTrack = stream.getVideoTracks()[0];
              if (videoTrack) {
                const settings = videoTrack.getSettings();
                if (settings.frameRate) {
                  const fps = Math.round(settings.frameRate);
                  setDetectedFPS(fps);
                  // Only override if detected FPS is different and valid
                  if (fps && fps !== 60) {
                    setRenderFPS(fps); // Auto-select detected FPS
                  }
                  console.log('Detected source FPS from stream:', fps);
                }
              }
            } catch (e) {
              console.log('Could not detect FPS from stream:', e);
            }
          }
        }
      };

      // Try detection when video metadata loads
      if (videoRef.current.readyState >= 2) {
        detectFPS();
      } else {
        videoRef.current.addEventListener('loadedmetadata', detectFPS);
        return () => {
          if (videoRef.current) {
            videoRef.current.removeEventListener('loadedmetadata', detectFPS);
          }
        };
      }
    }
  }, [videoRef, videoUrl]);

  // Save rendered video URL to session
  const saveRenderedVideoToSession = async (renderedUrl: string) => {
    if (!sessionId) {
      console.log('No session ID, skipping save to session');
      return;
    }

    setIsSavingToSession(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rendered_video_url: renderedUrl,
          rendered_at: new Date().toISOString(),
          render_service: renderService,
          render_settings: {
            fps: renderFPS,
            quality: renderQuality,
            resolution: renderResolution
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save rendered video to session');
      }

      const result = await response.json();
      console.log('Rendered video saved to session:', result);
      setSessionSaved(true);
      
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      successMsg.textContent = '✅ Rendered video saved to project!';
      document.body.appendChild(successMsg);
      setTimeout(() => successMsg.remove(), 3000);
      
    } catch (error) {
      console.error('Error saving rendered video to session:', error);
      // Show error message
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      errorMsg.textContent = '❌ Failed to save to project';
      document.body.appendChild(errorMsg);
      setTimeout(() => errorMsg.remove(), 3000);
    } finally {
      setIsSavingToSession(false);
    }
  };

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
          fps: renderFPS,  // Use user-selected FPS
          quality: renderQuality,  // Use user-selected quality
          resolution: renderResolution  // Use user-selected resolution
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
            
            // Save to session/project
            await saveRenderedVideoToSession(statusResult.outputUrl);
            
            // Open the video in a new tab
            window.open(statusResult.outputUrl, '_blank');
            
            // Also trigger download
            const link = document.createElement('a');
            link.href = statusResult.outputUrl;
            link.download = `edited_video_${Date.now()}.mp4`;
            link.target = '_blank';
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
                  
                  {/* Render Settings - Only show for Shotstack */}
                  {renderService === 'shotstack' && (
                    <div className="space-y-3 mb-3">
                      {/* FPS Selection */}
                      <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <div className="flex items-center gap-1 mb-1">
                          <label className="text-sm font-medium">Frame Rate (FPS):</label>
                          <span className="text-xs text-blue-600 font-medium">(60 default)</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3 h-3 text-gray-400" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">
                                  <strong>24 fps:</strong> Cinema standard<br/>
                                  <strong>25 fps:</strong> PAL TV standard (Europe)<br/>
                                  <strong>30 fps:</strong> NTSC TV standard (USA)<br/>
                                  <strong>50 fps:</strong> PAL high frame rate<br/>
                                  <strong>60 fps:</strong> Smooth motion video (Recommended default)<br/>
                                  <br/>
                                  ⚠️ Always match your source video FPS to avoid choppy playback!
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {[24, 25, 30, 50, 60].map((fps) => (
                            <button
                              key={fps}
                              className={`px-2 py-1 text-xs rounded transition-colors relative ${
                                renderFPS === fps
                                  ? 'bg-blue-600 text-white'
                                  : fps === 60
                                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 ring-1 ring-blue-300 dark:ring-blue-700'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                              onClick={() => setRenderFPS(fps)}
                            >
                              {fps}{detectedFPS === fps ? '*' : ''}
                              {fps === 60 && renderFPS !== 60 && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                              )}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {detectedFPS 
                            ? `Source video detected at ${detectedFPS} fps${detectedFPS === renderFPS ? ' - matched!' : ''}`
                            : '60 FPS default prevents freezing issues. Adjust if needed.'}
                        </p>
                      </div>

                      {/* Quality Selection */}
                      <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <div className="flex items-center gap-1 mb-1">
                          <label className="text-sm font-medium">Quality:</label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3 h-3 text-gray-400" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">
                                  <strong>Low:</strong> Smaller file, faster render, lower quality<br/>
                                  <strong>Medium:</strong> Balanced file size and quality<br/>
                                  <strong>High:</strong> Best quality, larger file, slower render<br/>
                                  <br/>
                                  Use High for final exports, Low for quick previews.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {(['low', 'medium', 'high'] as const).map((quality) => (
                            <button
                              key={quality}
                              className={`px-2 py-1 text-xs rounded transition-colors capitalize ${
                                renderQuality === quality
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                              onClick={() => setRenderQuality(quality)}
                            >
                              {quality === 'low' ? 'Low (Fast)' : quality === 'medium' ? 'Medium' : 'High (Best)'}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Higher quality = larger file size
                        </p>
                      </div>

                      {/* Resolution Selection */}
                      <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <label className="text-sm font-medium mb-1 block">Resolution:</label>
                        <div className="grid grid-cols-4 gap-1">
                          {(['sd', 'hd', '1080', '4k'] as const).map((res) => (
                            <button
                              key={res}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                renderResolution === res
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                              onClick={() => setRenderResolution(res)}
                            >
                              {res === 'sd' ? '480p' : res === 'hd' ? '720p' : res === '1080' ? '1080p' : '4K'}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Higher resolution = better quality but longer render time
                        </p>
                      </div>

                      {/* Render Settings Summary */}
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span className="text-xs font-medium text-blue-900 dark:text-blue-200">Render Settings Configured</span>
                        </div>
                        <div className="text-xs text-blue-700 dark:text-blue-300">
                          <div className="flex items-center gap-2">
                            <span>📹 Output:</span>
                            <span className="font-mono font-bold bg-white dark:bg-gray-800 px-1 rounded">
                              {renderResolution === 'sd' ? '480p' : renderResolution === 'hd' ? '720p' : renderResolution === '1080' ? '1080p' : '4K'}
                            </span>
                            <span>@</span>
                            <span className="font-mono font-bold bg-white dark:bg-gray-800 px-1 rounded">
                              {renderFPS}fps
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span>🎯 Quality:</span>
                            <span className="font-mono font-bold bg-white dark:bg-gray-800 px-1 rounded capitalize">
                              {renderQuality}
                            </span>
                            {renderQuality === 'high' && <span className="text-green-600">✓ Best</span>}
                          </div>
                          {detectedFPS && renderFPS !== detectedFPS && (
                            <div className="text-yellow-600 dark:text-yellow-400 mt-2 p-1 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                              ⚠️ FPS mismatch: Source is {detectedFPS}fps, rendering at {renderFPS}fps
                              <br/>
                              <span className="text-xs">This may cause choppy playback. Consider matching source FPS.</span>
                            </div>
                          )}
                          {detectedFPS && renderFPS === detectedFPS && (
                            <div className="text-green-600 dark:text-green-400 mt-2">
                              ✅ FPS matches source video - optimal playback quality
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
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
                  
                  {/* Save to Project Status - Show after render completes */}
                  {renderStatus === 'completed' && renderedVideoUrl && sessionId && (
                    <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2">
                        {sessionSaved ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <div className="flex-1">
                              <div className="text-xs font-medium text-green-900 dark:text-green-200">
                                ✅ Saved to Project
                              </div>
                              <div className="text-xs text-green-700 dark:text-green-300">
                                Video URL stored in session
                              </div>
                            </div>
                          </>
                        ) : isSavingToSession ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            <span className="text-xs text-blue-600 dark:text-blue-400">
                              Saving to project...
                            </span>
                          </>
                        ) : (
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <Save className="w-4 h-4 text-amber-600" />
                              <span className="text-xs text-amber-700 dark:text-amber-400">
                                Not saved yet
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => saveRenderedVideoToSession(renderedVideoUrl)}
                              className="text-xs h-6 px-2"
                            >
                              Save
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Show message if no session ID */}
                  {renderStatus === 'completed' && renderedVideoUrl && !sessionId && (
                    <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <div className="text-xs text-amber-700 dark:text-amber-300">
                          Save your workflow as a session to store rendered videos
                        </div>
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