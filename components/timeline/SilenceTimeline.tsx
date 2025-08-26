'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Volume2, 
  VolumeX, 
  Play, 
  Pause,
  ChevronRight,
  Scissors,
  Clock,
  Trash2,
  RotateCcw,
  Info,
  Settings,
  CheckCircle
} from 'lucide-react';

// Silence segment for visualization
interface SilenceSegment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  decibels: number;
  type: 'silence' | 'low_audio' | 'background_noise';
  confidence: number;
  shouldRemove: boolean;
}

interface SilenceDetectionSettings {
  minSilenceDuration: number; // Minimum duration in seconds to consider as silence
  silenceThreshold: number;    // dB threshold below which audio is considered silence
  bufferTime: number;          // Buffer time to add around silence cuts (seconds)
  autoDetect: boolean;         // Auto-detect optimal threshold
}

interface SilenceTimelineProps {
  videoUrl: string | null;
  videoDuration: number;
  onSilenceDecisions: (segments: SilenceSegment[]) => void;
  onProgressToFinal: () => void;
  onBack: () => void;
  originalFilename?: string;
  initialSilenceSegments?: any[]; // Real silence segments from Gemini analysis
}

export function SilenceTimeline({
  videoUrl,
  videoDuration,
  onSilenceDecisions,
  onProgressToFinal,
  onBack,
  originalFilename,
  initialSilenceSegments
}: SilenceTimelineProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedSegment, setSelectedSegment] = useState<SilenceSegment | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [silenceSegments, setSilenceSegments] = useState<SilenceSegment[]>([]);
  const [removedSegments, setRemovedSegments] = useState<Set<string>>(new Set());
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<SilenceDetectionSettings>({
    minSilenceDuration: 1.5,
    silenceThreshold: -40,
    bufferTime: 0.2,
    autoDetect: true
  });

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

  // Initialize with real silence segments from Gemini analysis
  useEffect(() => {
    if (initialSilenceSegments && initialSilenceSegments.length > 0) {
      // Convert Gemini segments to SilenceSegment format
      const convertedSegments: SilenceSegment[] = initialSilenceSegments.map((seg, index) => ({
        id: `silence-${index}`,
        startTime: parseTimeToSeconds(seg.startTime),
        endTime: parseTimeToSeconds(seg.endTime),
        duration: seg.duration,
        decibels: -40, // Default decibel level for silence detection
        type: seg.duration > 3 ? 'silence' : 'low_audio',
        confidence: seg.confidence || 0.8,
        shouldRemove: seg.duration >= settings.minSilenceDuration
      }));
      
      setSilenceSegments(convertedSegments.sort((a, b) => a.startTime - b.startTime));
      setIsAnalyzing(false);
    } else if (isAnalyzing && videoDuration > 0) {
      // Fallback to mock data if no real segments provided
      setTimeout(() => {
        const segments: SilenceSegment[] = [];
        const segmentCount = Math.floor(videoDuration / 15);
        
        for (let i = 0; i < segmentCount; i++) {
          const startTime = (i * 15) + Math.random() * 10;
          const duration = 1 + Math.random() * 3;
          
          if (startTime + duration < videoDuration) {
            segments.push({
              id: `silence-${i}`,
              startTime,
              endTime: startTime + duration,
              duration,
              decibels: -50 - Math.random() * 20,
              type: duration > 2.5 ? 'silence' : 'low_audio',
              confidence: 0.75 + Math.random() * 0.25,
              shouldRemove: duration >= settings.minSilenceDuration
            });
          }
        }
        
        setSilenceSegments(segments.sort((a, b) => a.startTime - b.startTime));
        setIsAnalyzing(false);
      }, 2000);
    }
  }, [initialSilenceSegments, videoDuration, settings.minSilenceDuration, isAnalyzing, parseTimeToSeconds]);

  // Handle segment click
  const handleSegmentClick = useCallback((segment: SilenceSegment) => {
    setSelectedSegment(segment);
    
    // Jump to video position with buffer
    if (videoRef.current) {
      const jumpTime = Math.max(0, segment.startTime - 2); // Start 2 seconds before
      videoRef.current.currentTime = jumpTime;
      videoRef.current.play();
    }
  }, []);

  // Toggle segment removal
  const toggleSegmentRemoval = useCallback((segmentId: string) => {
    setRemovedSegments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(segmentId)) {
        newSet.delete(segmentId);
      } else {
        newSet.add(segmentId);
      }
      return newSet;
    });
  }, []);

  // Apply bulk actions
  const removeAllSilences = useCallback(() => {
    const allIds = silenceSegments
      .filter(s => s.shouldRemove)
      .map(s => s.id);
    setRemovedSegments(new Set(allIds));
  }, [silenceSegments]);

  const resetSelections = useCallback(() => {
    setRemovedSegments(new Set());
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const totalSilence = silenceSegments.reduce((sum, s) => sum + s.duration, 0);
    const markedForRemoval = silenceSegments
      .filter(s => removedSegments.has(s.id))
      .reduce((sum, s) => sum + s.duration, 0);
    
    return {
      totalSegments: silenceSegments.length,
      totalSilenceDuration: totalSilence,
      markedDuration: markedForRemoval,
      finalDuration: videoDuration - markedForRemoval,
      reductionPercentage: videoDuration > 0 
        ? Math.round((markedForRemoval / videoDuration) * 100)
        : 0
    };
  }, [silenceSegments, removedSegments, videoDuration]);

  // Handle progression
  const handleContinue = useCallback(() => {
    const finalSegments = silenceSegments.map(s => ({
      ...s,
      shouldRemove: removedSegments.has(s.id)
    }));
    onSilenceDecisions(finalSegments);
    onProgressToFinal();
  }, [silenceSegments, removedSegments, onSilenceDecisions, onProgressToFinal]);

  // Format time display
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Time update handler
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  return (
    <div className="silence-timeline-container w-full h-full min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={onBack} size="sm">
              ← Back to Clusters
            </Button>
            <div className="border-l border-gray-300 h-6 mx-2" />
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Silence Timeline</h2>
              <p className="text-gray-600">Remove silence and dead air from your video</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="outline">
                <VolumeX className="w-3 h-3 mr-1" />
                {stats.totalSegments} silences found
              </Badge>
              <Badge variant="destructive">
                <Scissors className="w-3 h-3 mr-1" />
                {formatTime(stats.markedDuration)} to remove
              </Badge>
              <Badge variant="secondary">
                {stats.reductionPercentage}% reduction
              </Badge>
            </div>
            
            {/* Continue button */}
            <Button 
              onClick={handleContinue}
              className="flex items-center gap-2"
              disabled={removedSegments.size === 0}
            >
              Continue to Final Review
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Video player */}
        <div className="flex-1 p-6">
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
                  
                  {/* Overlay indicators */}
                  <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-md text-sm font-mono">
                    {formatTime(currentTime)} / {formatTime(videoDuration)}
                  </div>
                  
                  {/* Current segment indicator */}
                  {selectedSegment && (
                    <div className="absolute top-4 left-4 bg-red-600/90 text-white px-3 py-1 rounded-md text-sm">
                      Silence: {selectedSegment.duration.toFixed(1)}s at {selectedSegment.decibels.toFixed(0)}dB
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <VolumeX className="w-16 h-16" />
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Control panel */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          {/* Settings section */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Detection Settings</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
            
            {showSettings && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-600">
                    Minimum Silence Duration: {settings.minSilenceDuration}s
                  </label>
                  <Slider
                    value={[settings.minSilenceDuration]}
                    onValueChange={([value]) => setSettings(prev => ({ ...prev, minSilenceDuration: value }))}
                    min={0.5}
                    max={5}
                    step={0.5}
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <label className="text-sm text-gray-600">
                    Silence Threshold: {settings.silenceThreshold}dB
                  </label>
                  <Slider
                    value={[settings.silenceThreshold]}
                    onValueChange={([value]) => setSettings(prev => ({ ...prev, silenceThreshold: value }))}
                    min={-60}
                    max={-20}
                    step={5}
                    className="mt-2"
                  />
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setIsAnalyzing(true)}
                >
                  Re-analyze with New Settings
                </Button>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={removeAllSilences}
                className="flex-1"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Remove All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetSelections}
                className="flex-1"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            </div>
          </div>

          {/* Segments list */}
          <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="font-semibold text-gray-900 mb-3">
              Detected Silences ({silenceSegments.length})
            </h3>
            
            {isAnalyzing ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-pulse">
                  <VolumeX className="w-12 h-12 mx-auto mb-4" />
                  <p>Analyzing audio track...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {silenceSegments.map((segment) => {
                  const isMarked = removedSegments.has(segment.id);
                  const isSelected = selectedSegment?.id === segment.id;
                  
                  return (
                    <div
                      key={segment.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        isMarked 
                          ? 'border-red-300 bg-red-50' 
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      } ${isSelected ? 'ring-2 ring-blue-400' : ''}`}
                      onClick={() => handleSegmentClick(segment)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <VolumeX className={`w-4 h-4 ${
                            segment.type === 'silence' ? 'text-red-500' : 'text-yellow-500'
                          }`} />
                          <span className="font-medium text-sm">
                            {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                          </span>
                        </div>
                        <Badge variant={segment.type === 'silence' ? 'destructive' : 'secondary'} className="text-xs">
                          {segment.duration.toFixed(1)}s
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>{segment.decibels.toFixed(0)}dB</span>
                        <Button
                          size="sm"
                          variant={isMarked ? 'destructive' : 'outline'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSegmentRemoval(segment.id);
                          }}
                        >
                          {isMarked ? (
                            <>
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Marked
                            </>
                          ) : (
                            <>
                              <Scissors className="w-3 h-3 mr-1" />
                              Remove
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Original Duration:</span>
                <span className="font-medium">{formatTime(videoDuration)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Silence to Remove:</span>
                <span className="font-medium text-red-600">-{formatTime(stats.markedDuration)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Final Duration:</span>
                <span className="text-green-600">{formatTime(stats.finalDuration)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline visualization - bottom */}
      <div className="h-32 bg-white border-t border-gray-200 p-4 flex-shrink-0">
        <div className="w-full h-full">
          <div className="text-sm text-gray-600 mb-2 flex items-center justify-between">
            <span>
              <VolumeX className="w-4 h-4 inline mr-1" />
              Silence Timeline - Click to preview
            </span>
            <span className="font-mono">{formatTime(videoDuration)} total</span>
          </div>
          
          {/* Timeline track */}
          <div className="relative w-full h-16 bg-gray-100 rounded-lg overflow-hidden">
            {/* Background audio waveform simulation */}
            <div className="absolute inset-0 opacity-20">
              {Array.from({ length: 100 }, (_, i) => {
                const height = 20 + Math.random() * 60;
                return (
                  <div
                    key={i}
                    className="absolute bg-gray-400"
                    style={{
                      left: `${i}%`,
                      width: '1%',
                      height: `${height}%`,
                      top: `${(100 - height) / 2}%`
                    }}
                  />
                );
              })}
            </div>
            
            {/* Silence segments */}
            {silenceSegments.map(segment => {
              const left = (segment.startTime / videoDuration) * 100;
              const width = (segment.duration / videoDuration) * 100;
              const isMarked = removedSegments.has(segment.id);
              const isSelected = selectedSegment?.id === segment.id;
              
              return (
                <button
                  key={segment.id}
                  onClick={() => handleSegmentClick(segment)}
                  className={`absolute h-full transition-all duration-200 ${
                    isSelected ? 'ring-2 ring-blue-400 z-10' : ''
                  }`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: isMarked 
                      ? 'rgba(239, 68, 68, 0.8)'  // Red for marked
                      : segment.type === 'silence'
                      ? 'rgba(239, 68, 68, 0.3)'  // Light red for silence
                      : 'rgba(251, 191, 36, 0.3)', // Yellow for low audio
                    borderRadius: '2px'
                  }}
                >
                  {isMarked && (
                    <Scissors className="w-3 h-3 text-white mx-auto" />
                  )}
                </button>
              );
            })}
            
            {/* Playhead */}
            {videoDuration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-blue-600 z-20"
                style={{ left: `${(currentTime / videoDuration) * 100}%` }}
              >
                <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-600 rounded-full" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}