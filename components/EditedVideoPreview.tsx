'use client';

import { useEffect, useRef, useState } from 'react';
import { EnhancedSegment } from '@/lib/types/segments';
import { Button } from '@/components/ui/button';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';

interface EditedVideoPreviewProps {
  videoUrl: string | null;
  segmentsToRemove: EnhancedSegment[];
  originalDuration: number;
  finalDuration: number;
}

export function EditedVideoPreview({
  videoUrl,
  segmentsToRemove,
  originalDuration,
  finalDuration
}: EditedVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [skipSchedule, setSkipSchedule] = useState<Array<{start: number, end: number}>>([]);
  const animationFrameRef = useRef<number>(0);

  // Parse time to seconds - handles various formats
  const parseTimeToSeconds = (time: string | number): number => {
    if (typeof time === 'number') return time;
    
    // Handle HH:MM:SS format from enhanced analysis
    if (time.includes(':')) {
      const parts = time.split(':');
      if (parts.length === 2) {
        // MM:SS format
        return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
      } else if (parts.length === 3) {
        // HH:MM:SS format - handle fractional seconds
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseFloat(parts[2]);
        return hours * 3600 + minutes * 60 + seconds;
      }
    }
    
    return parseFloat(time) || 0;
  };

  // Build skip schedule on mount
  useEffect(() => {
    const schedule = segmentsToRemove.map(segment => {
      const start = parseTimeToSeconds(segment.startTime);
      let end: number;
      
      if (segment.endTime) {
        end = parseTimeToSeconds(segment.endTime);
      } else if (segment.duration) {
        end = start + (typeof segment.duration === 'number' ? segment.duration : parseFloat(segment.duration));
      } else {
        // Default to 1 second if no end or duration
        end = start + 1;
      }
      
      return { start, end };
    }).sort((a, b) => a.start - b.start);
    
    // Filter out invalid segments
    const validSchedule = schedule.filter(s => s.start < s.end && s.start >= 0);
    
    setSkipSchedule(validSchedule);
    console.log('Skip schedule:', validSchedule);
    console.log('Segments to remove:', segmentsToRemove);
  }, [segmentsToRemove]);

  // Track last skip to prevent loops
  const lastSkipRef = useRef<number>(-1);
  
  // Check if current time is in a segment to remove
  const checkAndSkip = () => {
    if (!videoRef.current) return;
    
    const currentTime = videoRef.current.currentTime;
    
    for (const segment of skipSchedule) {
      if (currentTime >= segment.start && currentTime < segment.end) {
        // Prevent infinite loop by checking if we just skipped this segment
        if (lastSkipRef.current === segment.start) {
          return;
        }
        
        console.log(`Skipping segment: ${segment.start} to ${segment.end}`);
        lastSkipRef.current = segment.start;
        
        // Jump to end of segment + small buffer to avoid re-triggering
        videoRef.current.currentTime = segment.end + 0.1;
        break;
      }
    }
    
    // Reset last skip if we're not in any segment
    const inAnySegment = skipSchedule.some(s => currentTime >= s.start && currentTime < s.end);
    if (!inAnySegment) {
      lastSkipRef.current = -1;
    }
  };

  // Animation loop for smooth skipping
  const animate = () => {
    if (!videoRef.current) return;
    
    checkAndSkip();
    setCurrentTime(videoRef.current.currentTime);
    
    if (isPlaying && !videoRef.current.paused) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  };

  // Handle play/pause
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  };

  // Handle video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };

    const handleSeeking = () => {
      checkAndSkip();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeking);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeking);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [skipSchedule]);

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate adjusted time (time minus removed segments)
  const getAdjustedTime = (currentTime: number): number => {
    let removedTime = 0;
    for (const segment of skipSchedule) {
      if (currentTime > segment.end) {
        removedTime += (segment.end - segment.start);
      } else if (currentTime > segment.start) {
        removedTime += (currentTime - segment.start);
        break;
      }
    }
    return currentTime - removedTime;
  };

  // Reset video
  const handleReset = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    setCurrentTime(0);
  };

  // Skip to next kept segment
  const handleSkipForward = () => {
    if (!videoRef.current) return;
    
    const currentTime = videoRef.current.currentTime;
    
    // Find next segment start after current time
    for (const segment of skipSchedule) {
      if (segment.end > currentTime) {
        videoRef.current.currentTime = segment.end;
        break;
      }
    }
  };

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        No video loaded
      </div>
    );
  }

  const adjustedTime = getAdjustedTime(currentTime);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Video Player */}
      <div className="flex-1 relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full"
          onClick={togglePlayPause}
        />
        
        {/* Overlay showing edited time */}
        <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-md text-sm">
          {formatTime(adjustedTime)} / {formatTime(finalDuration)}
        </div>
        
        {/* Skip indicator */}
        {skipSchedule.some(s => currentTime >= s.start && currentTime < s.end) && (
          <div className="absolute top-4 left-4 bg-red-600/90 text-white px-3 py-1 rounded-md text-sm animate-pulse">
            Skipping removed segment...
          </div>
        )}
      </div>
      
      {/* Custom Controls */}
      <div className="mt-2 flex items-center justify-between bg-gray-100 rounded-lg p-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={togglePlayPause}
            className="h-8 w-8 p-0"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            className="h-8 w-8 p-0"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSkipForward}
            className="h-8 w-8 p-0"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Progress Bar */}
        <div className="flex-1 mx-4">
          <div className="relative h-2 bg-gray-300 rounded-full overflow-hidden">
            {/* Progress */}
            <div 
              className="absolute h-full bg-blue-600"
              style={{ width: `${(adjustedTime / finalDuration) * 100}%` }}
            />
            
            {/* Removed segments visualization */}
            {skipSchedule.map((segment, idx) => {
              const startPercent = (segment.start / originalDuration) * 100;
              const widthPercent = ((segment.end - segment.start) / originalDuration) * 100;
              return (
                <div
                  key={idx}
                  className="absolute h-full bg-red-500/50"
                  style={{
                    left: `${startPercent}%`,
                    width: `${widthPercent}%`
                  }}
                />
              );
            })}
          </div>
        </div>
        
        {/* Time Display */}
        <div className="text-sm text-gray-600 font-mono">
          {formatTime(adjustedTime)} / {formatTime(finalDuration)}
        </div>
      </div>
      
      {/* Info */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        Preview automatically skips {segmentsToRemove.length} removed segments
      </div>
    </div>
  );
}