'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause,
  ChevronRight,
  ChevronLeft,
  Scissors,
  Undo,
  Redo,
  Save,
  Download,
  Settings,
  Info,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Layers,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  SkipForward,
  SkipBack,
  VolumeX,
  Volume2,
  FileVideo,
  Wand2,
  SlidersHorizontal
} from 'lucide-react';
import { EnhancedSegment } from '@/lib/types/segments';
import { ContentGroup } from '@/lib/types/takes';
import { detectSilenceRegions } from '@/lib/audio-analysis';
import toast from 'react-hot-toast';

// Timeline segment types
interface TimelineSegment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  type: 'keep' | 'remove';
  category?: string; // pause, filler, dead_air, redundant, etc.
  reason?: string;
  confidence?: number;
  isEditable: boolean;
  originalSegmentId?: string;
  clusterId?: string;
  takeId?: string;
}

interface UnifiedTimelineProps {
  segments: EnhancedSegment[];
  contentGroups?: ContentGroup[];
  videoUrl: string | null;
  videoDuration: number;
  onSegmentUpdate: (segments: TimelineSegment[]) => void;
  onExport: (format: 'edl' | 'fcpxml' | 'premiere', segments: EnhancedSegment[]) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  originalFilename?: string;
  supabaseUrl?: string; // Pre-uploaded Supabase URL for rendering
}

export function UnifiedTimeline({
  segments,
  contentGroups,
  videoUrl,
  videoDuration,
  onSegmentUpdate,
  onExport,
  videoRef,
  originalFilename,
  supabaseUrl
}: UnifiedTimelineProps) {
  // Stage state
  const [currentStage, setCurrentStage] = useState<'edit' | 'silence' | 'review'>('edit');
  
  // Core state
  const [timelineSegments, setTimelineSegments] = useState<TimelineSegment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<TimelineSegment | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [timelineOffset, setTimelineOffset] = useState(0);
  
  // Silence detection state
  const [silenceSegments, setSilenceSegments] = useState<TimelineSegment[]>([]);
  const [isDetectingSilence, setIsDetectingSilence] = useState(false);
  const [silenceThreshold, setSilenceThreshold] = useState(-40); // dB
  const [minSilenceDuration, setMinSilenceDuration] = useState(1.5); // seconds
  const [hasDetectedSilence, setHasDetectedSilence] = useState(false); // Track if we've already detected
  
  // Render settings state
  const [renderService, setRenderService] = useState<'shotstack' | 'chillin'>('shotstack');
  const [renderFPS, setRenderFPS] = useState<number>(60);
  const [renderQuality, setRenderQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [renderResolution, setRenderResolution] = useState<'sd' | 'hd' | '1080' | '4k'>('1080');
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [draggedSegment, setDraggedSegment] = useState<TimelineSegment | null>(null);
  const [dragMode, setDragMode] = useState<'move' | 'resize-start' | 'resize-end' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [originalSegmentData, setOriginalSegmentData] = useState<TimelineSegment | null>(null);
  
  // History for undo/redo
  const [history, setHistory] = useState<TimelineSegment[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [autoMergeGaps, setAutoMergeGaps] = useState(true);
  const [minSegmentDuration, setMinSegmentDuration] = useState(0.5);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(0.1); // 100ms grid
  
  // View options
  const [showCategories, setShowCategories] = useState(true);
  const [showConfidence, setShowConfidence] = useState(true);
  const [highlightEditedSegments, setHighlightEditedSegments] = useState(true);

  // Initialize timeline segments from input segments
  useEffect(() => {
    const initialSegments: TimelineSegment[] = [];
    let lastEndTime = 0;

    // Sort segments by start time
    const sortedSegments = [...segments].sort((a, b) => {
      const aStart = typeof a.startTime === 'string' ? parseTimeToSeconds(a.startTime) : a.startTime;
      const bStart = typeof b.startTime === 'string' ? parseTimeToSeconds(b.startTime) : b.startTime;
      return aStart - bStart;
    });

    sortedSegments.forEach((segment, index) => {
      const startTime = typeof segment.startTime === 'string' 
        ? parseTimeToSeconds(segment.startTime) 
        : segment.startTime;
      const endTime = typeof segment.endTime === 'string'
        ? parseTimeToSeconds(segment.endTime)
        : segment.endTime;

      // Add "keep" segment for gap before this segment
      if (startTime > lastEndTime) {
        initialSegments.push({
          id: `keep-${lastEndTime.toFixed(2)}-${startTime.toFixed(2)}-${Date.now()}-${index}`,
          startTime: lastEndTime,
          endTime: startTime,
          duration: startTime - lastEndTime,
          type: 'keep',
          isEditable: false
        });
      }

      // Add "remove" segment for the actual segment to remove
      // Ensure unique ID by adding timestamp and index
      const uniqueId = `${segment.id}-${Date.now()}-${index}`;
      initialSegments.push({
        id: uniqueId,
        startTime,
        endTime,
        duration: endTime - startTime,
        type: 'remove',
        category: segment.category,
        reason: segment.reason,
        confidence: segment.confidence,
        isEditable: true,
        originalSegmentId: segment.id
      });

      lastEndTime = endTime;
    });

    // Add final "keep" segment if there's content after the last removed segment
    if (lastEndTime < videoDuration) {
      initialSegments.push({
        id: `keep-${lastEndTime.toFixed(2)}-${videoDuration.toFixed(2)}-${Date.now()}-final`,
        startTime: lastEndTime,
        endTime: videoDuration,
        duration: videoDuration - lastEndTime,
        type: 'keep',
        isEditable: false
      });
    }

    setTimelineSegments(initialSegments);
    addToHistory(initialSegments);
  }, [segments, videoDuration]);

  // Parse time helper
  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return parseFloat(timeStr) || 0;
  };

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Add to history for undo/redo
  const addToHistory = (newSegments: TimelineSegment[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newSegments]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Undo/Redo functions
  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setTimelineSegments([...history[historyIndex - 1]]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setTimelineSegments([...history[historyIndex + 1]]);
    }
  };

  // Handle segment click
  const handleSegmentClick = (segment: TimelineSegment, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.shiftKey && segment.isEditable) {
      // Toggle segment type with Shift+Click
      const updatedSegments = timelineSegments.map(s => 
        s.id === segment.id 
          ? { ...s, type: s.type === 'keep' ? 'remove' : 'keep' as 'keep' | 'remove' }
          : s
      );
      setTimelineSegments(updatedSegments);
      addToHistory(updatedSegments);
      onSegmentUpdate(updatedSegments);
      toast.success(`Segment ${segment.id} toggled to ${segment.type === 'keep' ? 'remove' : 'keep'}`);
    } else {
      // Select segment and jump to its position
      setSelectedSegment(segment);
      if (videoRef.current) {
        videoRef.current.currentTime = segment.startTime;
      }
      
      // If clicking a silence segment from Silence Detection tab, switch to Edit Timeline
      if (currentStage === 'silence' && segment.id.startsWith('silence-')) {
        setCurrentStage('edit');
        toast('Switched to Edit Timeline to show the segment', {
          icon: '📍',
          duration: 2000
        });
        
        // Ensure the timeline view scrolls to show the selected segment
        setTimeout(() => {
          const timelineElement = document.querySelector('.timeline-scrollable');
          if (timelineElement) {
            const segmentPosition = (segment.startTime / videoDuration) * timelineElement.scrollWidth;
            const viewportWidth = timelineElement.clientWidth;
            const scrollPosition = Math.max(0, segmentPosition - viewportWidth / 2);
            timelineElement.scrollTo({
              left: scrollPosition,
              behavior: 'smooth'
            });
          }
        }, 100);
      }
    }
  };

  // Handle drag start
  const handleDragStart = (segment: TimelineSegment, mode: 'move' | 'resize-start' | 'resize-end', event: React.MouseEvent) => {
    if (!segment.isEditable) return;
    
    event.preventDefault();
    setDraggedSegment(segment);
    setDragMode(mode);
    setDragStartX(event.clientX);
    setOriginalSegmentData({ ...segment });
    setIsEditing(true);
  };

  // Handle drag move
  const handleDragMove = useCallback((event: MouseEvent) => {
    if (!draggedSegment || !dragMode || !timelineRef.current || !originalSegmentData) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = event.clientX - dragStartX;
    const deltaTime = (deltaX / rect.width) * videoDuration / zoom;

    let newStartTime = originalSegmentData.startTime;
    let newEndTime = originalSegmentData.endTime;

    if (dragMode === 'move') {
      // Move entire segment
      newStartTime = Math.max(0, Math.min(videoDuration - originalSegmentData.duration, originalSegmentData.startTime + deltaTime));
      newEndTime = newStartTime + originalSegmentData.duration;
    } else if (dragMode === 'resize-start') {
      // Resize from start
      newStartTime = Math.max(0, Math.min(originalSegmentData.endTime - minSegmentDuration, originalSegmentData.startTime + deltaTime));
    } else if (dragMode === 'resize-end') {
      // Resize from end
      newEndTime = Math.max(originalSegmentData.startTime + minSegmentDuration, Math.min(videoDuration, originalSegmentData.endTime + deltaTime));
    }

    // Apply grid snapping if enabled
    if (snapToGrid) {
      newStartTime = Math.round(newStartTime / gridSize) * gridSize;
      newEndTime = Math.round(newEndTime / gridSize) * gridSize;
    }

    // Update segment
    const updatedSegments = timelineSegments.map(s => 
      s.id === draggedSegment.id 
        ? { ...s, startTime: newStartTime, endTime: newEndTime, duration: newEndTime - newStartTime }
        : s
    );

    setTimelineSegments(updatedSegments);
  }, [draggedSegment, dragMode, dragStartX, originalSegmentData, videoDuration, zoom, snapToGrid, gridSize, minSegmentDuration, timelineSegments]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (draggedSegment && isEditing) {
      addToHistory(timelineSegments);
      onSegmentUpdate(timelineSegments);
      toast.success('Segment updated');
    }
    
    setDraggedSegment(null);
    setDragMode(null);
    setOriginalSegmentData(null);
    setIsEditing(false);
  }, [draggedSegment, isEditing, timelineSegments, onSegmentUpdate]);

  // Mouse event listeners for dragging
  useEffect(() => {
    if (dragMode) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [dragMode, handleDragMove, handleDragEnd]);

  // Handle video time update
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [videoRef]);

  // Set up video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('play', () => setIsPlaying(true));
      video.addEventListener('pause', () => setIsPlaying(false));
      
      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('play', () => setIsPlaying(true));
        video.removeEventListener('pause', () => setIsPlaying(false));
      };
    }
  }, [videoRef, handleTimeUpdate]);

  // Calculate stats
  const stats = useMemo(() => {
    const keepSegments = timelineSegments.filter(s => s.type === 'keep');
    const removeSegments = timelineSegments.filter(s => s.type === 'remove');
    const totalKeepTime = keepSegments.reduce((sum, s) => sum + s.duration, 0);
    const totalRemoveTime = removeSegments.reduce((sum, s) => sum + s.duration, 0);
    
    return {
      keepCount: keepSegments.length,
      removeCount: removeSegments.length,
      keepDuration: totalKeepTime,
      removeDuration: totalRemoveTime,
      finalDuration: totalKeepTime,
      reduction: (totalRemoveTime / videoDuration) * 100
    };
  }, [timelineSegments, videoDuration]);

  // Get segment color with improved design
  const getSegmentColor = (segment: TimelineSegment): string => {
    if (segment.type === 'keep') {
      // Gradient green for keep segments
      return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    } else {
      // Different gradient reds based on category
      switch (segment.category) {
        case 'pause':
        case 'dead_air':
          return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'; // Strong red gradient for silence/pauses
        case 'filler':
        case 'filler_words':
          return 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)'; // Medium red gradient
        case 'redundant':
        case 'redundancy':
        case 'off-topic':
        case 'off_topic':
          return 'linear-gradient(135deg, #fca5a5 0%, #f87171 100%)'; // Light red gradient
        case 'technical':
        case 'false_start':
        case 'tangent':
          return 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)'; // Orange gradient
        default:
          return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'; // Default orange gradient
      }
    }
  };
  
  // Get segment style with shadow and border
  const getSegmentStyle = (segment: TimelineSegment, isSelected: boolean, isDragging: boolean) => {
    const left = (segment.startTime / videoDuration) * 100;
    const width = (segment.duration / videoDuration) * 100;
    
    return {
      left: `${left}%`,
      width: `${width}%`,
      background: getSegmentColor(segment),
      borderRadius: '6px',
      border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(0,0,0,0.1)',
      boxShadow: isSelected 
        ? '0 4px 20px rgba(59, 130, 246, 0.4), 0 0 0 3px rgba(59, 130, 246, 0.1)' 
        : isDragging
        ? '0 8px 24px rgba(0,0,0,0.15)'
        : '0 2px 8px rgba(0,0,0,0.1)',
      opacity: isDragging ? 0.85 : 1,
      transform: isDragging ? 'scale(1.02)' : 'scale(1)',
      transition: 'all 0.2s ease'
    };
  };

  // Jump to next/previous segment
  const jumpToSegment = (direction: 'next' | 'prev') => {
    const currentSegmentIndex = timelineSegments.findIndex(s => 
      currentTime >= s.startTime && currentTime < s.endTime
    );
    
    let targetIndex = currentSegmentIndex;
    if (direction === 'next') {
      targetIndex = Math.min(timelineSegments.length - 1, currentSegmentIndex + 1);
    } else {
      targetIndex = Math.max(0, currentSegmentIndex - 1);
    }
    
    const targetSegment = timelineSegments[targetIndex];
    if (targetSegment && videoRef.current) {
      videoRef.current.currentTime = targetSegment.startTime;
      setSelectedSegment(targetSegment);
    }
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  // Detect REAL silence segments using audio analysis
  const detectSilenceSegments = useCallback(async () => {
    if (!videoRef.current) {
      toast.error('Video not loaded');
      return;
    }
    
    setIsDetectingSilence(true);
    toast('Analyzing audio for silence... This may take a moment.', {
      icon: '🎵',
      duration: 4000
    });
    
    try {
      // Use real audio analysis to detect silence
      const silenceRegions = await detectSilenceRegions(
        videoRef.current,
        videoDuration,
        minSilenceDuration,
        silenceThreshold
      );
      
      // Convert silence regions to timeline segments
      const detectedSilenceSegments: TimelineSegment[] = silenceRegions.map((region, index) => ({
        id: `silence-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        startTime: region.start,
        endTime: region.end,
        duration: region.duration,
        type: 'remove' as const,
        category: 'pause', // Use 'pause' instead of 'silence'
        reason: `Silence detected (${silenceThreshold}dB, ${region.duration.toFixed(1)}s)`,
        confidence: 0.95, // High confidence since it's actual audio analysis
        isEditable: true
      }));
      
      setSilenceSegments(detectedSilenceSegments);
      
      // Merge with existing segments, avoiding overlaps
      const mergedSegments = [...timelineSegments];
      detectedSilenceSegments.forEach(silenceSegment => {
        // Check for overlaps
        const hasOverlap = mergedSegments.some(seg => 
          seg.type === 'remove' && (
            (seg.startTime <= silenceSegment.startTime && seg.endTime > silenceSegment.startTime) ||
            (seg.startTime < silenceSegment.endTime && seg.endTime >= silenceSegment.endTime) ||
            (silenceSegment.startTime <= seg.startTime && silenceSegment.endTime >= seg.endTime)
          )
        );
        
        if (!hasOverlap) {
          mergedSegments.push(silenceSegment);
        }
      });
      
      // Sort and update
      mergedSegments.sort((a, b) => a.startTime - b.startTime);
      setTimelineSegments(mergedSegments);
      addToHistory(mergedSegments);
      onSegmentUpdate(mergedSegments);
      
      if (detectedSilenceSegments.length > 0) {
        toast.success(`Detected ${detectedSilenceSegments.length} silence segments totaling ${detectedSilenceSegments.reduce((sum, s) => sum + s.duration, 0).toFixed(1)} seconds`);
      } else {
        toast('No silence segments found with current settings', {
          icon: 'ℹ️'
        });
      }
    } catch (error) {
      console.error('Silence detection error:', error);
      toast.error('Failed to detect silence. Try adjusting the threshold.');
    } finally {
      setIsDetectingSilence(false);
    }
  }, [videoRef, videoDuration, silenceThreshold, minSilenceDuration, timelineSegments, onSegmentUpdate]);

  // Extract silence/pause segments from initial segments
  useEffect(() => {
    if (currentStage === 'silence' && !hasDetectedSilence) {
      // Get silence/pause segments from the initial AI analysis
      const aiDetectedSilence = segments.filter(seg => 
        seg.category === 'pause' || 
        seg.category === 'dead_air' ||
        (seg.reason && seg.reason.toLowerCase().includes('silence')) ||
        (seg.reason && seg.reason.toLowerCase().includes('pause'))
      );
      
      if (aiDetectedSilence.length > 0) {
        // Convert AI segments to timeline segments
        const silenceTimelineSegments: TimelineSegment[] = aiDetectedSilence.map((seg, index) => ({
          id: `silence-ai-${index}-${Date.now()}`,
          startTime: typeof seg.startTime === 'string' ? parseTimeToSeconds(seg.startTime) : seg.startTime,
          endTime: typeof seg.endTime === 'string' ? parseTimeToSeconds(seg.endTime) : seg.endTime,
          duration: seg.duration,
          type: 'remove' as const,
          category: 'pause', // Use 'pause' for silence segments
          reason: seg.reason || `Silence/Pause detected (${seg.duration.toFixed(1)}s)`,
          confidence: seg.confidence || 0.9,
          isEditable: true
        }));
        
        setSilenceSegments(silenceTimelineSegments);
        setHasDetectedSilence(true);
        
        // These are already in the main timeline from initial load,
        // so we don't need to merge them again
        toast(`Found ${silenceTimelineSegments.length} silence segments from AI analysis`, {
          icon: '🎯'
        });
      } else {
        // No silence from AI, offer to do audio analysis
        toast('No silence detected by AI. Use "Detect More" for audio analysis.', {
          icon: '💡'
        });
        setHasDetectedSilence(true);
      }
    }
  }, [currentStage, hasDetectedSilence, segments]);

  return (
    <div className="unified-timeline-container w-full h-full flex flex-col bg-gray-50">
      {/* Header with stage tabs */}
      <div className="bg-white border-b border-gray-200">
        {/* Stage tabs */}
        <div className="flex items-center border-b border-gray-200">
          <button
            onClick={() => setCurrentStage('edit')}
            className={`px-6 py-3 font-medium transition-all border-b-2 ${
              currentStage === 'edit'
                ? 'text-blue-600 border-blue-600 bg-blue-50'
                : 'text-gray-600 border-transparent hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              <span>Edit Timeline</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentStage('silence')}
            className={`px-6 py-3 font-medium transition-all border-b-2 ${
              currentStage === 'silence'
                ? 'text-purple-600 border-purple-600 bg-purple-50'
                : 'text-gray-600 border-transparent hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <VolumeX className="w-4 h-4" />
              <span>Silence Detection</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentStage('review')}
            className={`px-6 py-3 font-medium transition-all border-b-2 ${
              currentStage === 'review'
                ? 'text-green-600 border-green-600 bg-green-50'
                : 'text-gray-600 border-transparent hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileVideo className="w-4 h-4" />
              <span>Final Review</span>
            </div>
          </button>
        </div>
        
        {/* Stage-specific header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                {currentStage === 'edit' && 'Timeline Editor'}
                {currentStage === 'silence' && 'Silence Detection'}
                {currentStage === 'review' && 'Final Review'}
              </h2>
              <p className="text-gray-600">
                {currentStage === 'edit' && 'Click and drag to adjust segments • Green = Keep • Red = Remove'}
                {currentStage === 'silence' && 'Detect and remove silence or low audio segments'}
                {currentStage === 'review' && 'Review all edits and export your final video'}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Stage-specific controls */}
              {currentStage === 'silence' && (
                <div className="flex items-center gap-2">
                  {isDetectingSilence && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-purple-100 rounded-lg">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600" />
                      <span className="text-sm text-purple-700">Analyzing audio...</span>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      detectSilenceSegments(); // Run audio analysis for additional silence
                    }}
                    disabled={isDetectingSilence}
                    title="Perform deep audio analysis to find additional silence"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Detect More
                  </Button>
                </div>
              )}
              
              {/* Stats */}
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="outline" className="bg-green-50">
                  Keep: {formatTime(stats.keepDuration)}
                </Badge>
                <Badge variant="outline" className="bg-red-50">
                  Remove: {formatTime(stats.removeDuration)}
                </Badge>
                <Badge variant="default">
                  Final: {formatTime(stats.finalDuration)} (-{stats.reduction.toFixed(1)}%)
                </Badge>
              </div>
            
            {/* Undo/Redo */}
            <div className="flex items-center gap-1 border-l pl-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={undo}
                disabled={historyIndex <= 0}
              >
                <Undo className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
              >
                <Redo className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Export */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const removeSegments = timelineSegments
                  .filter(s => s.type === 'remove')
                  .map(s => ({
                    id: s.id,
                    selected: true,
                    startTime: s.startTime.toString(),
                    endTime: s.endTime.toString(),
                    duration: s.duration,
                    reason: s.reason || 'User edited',
                    confidence: s.confidence || 0.8,
                    category: (s.category || 'pause') as any,
                    transcript: s.reason || ''
                  } as EnhancedSegment));
                onExport('fcpxml', removeSegments);
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            
            {/* Settings */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
        
        {/* Settings panel */}
        {showSettings && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="grid grid-cols-3 gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={snapToGrid}
                  onChange={(e) => setSnapToGrid(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Snap to grid ({gridSize}s)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showCategories}
                  onChange={(e) => setShowCategories(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Show categories</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={highlightEditedSegments}
                  onChange={(e) => setHighlightEditedSegments(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Highlight edited</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Stage-specific content */}
        {currentStage === 'review' ? (
          /* Final Review Stage */
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="grid grid-cols-3 gap-6">
              {/* Left Column - Video Preview */}
              <div className="col-span-2">
                <Card className="p-4">
                  <h3 className="text-lg font-semibold mb-3">Video Preview</h3>
                  <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                    {videoUrl ? (
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        controls
                        playsInline
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        <Play className="w-16 h-16" />
                      </div>
                    )}
                  </div>
                </Card>
                
                {/* Edit Summary */}
                <Card className="mt-4 p-6 bg-gradient-to-br from-green-50 to-blue-50">
                  <h3 className="text-xl font-semibold mb-4">Edit Summary</h3>
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{formatTime(videoDuration)}</div>
                      <div className="text-sm text-gray-600">Original Duration</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{formatTime(stats.finalDuration)}</div>
                      <div className="text-sm text-gray-600">Final Duration</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">-{stats.reduction.toFixed(1)}%</div>
                      <div className="text-sm text-gray-600">Time Reduced</div>
                    </div>
                  </div>
                </Card>
              
                {/* Segment Categories Breakdown */}
                <Card className="mt-4 p-6">
                  <h3 className="text-lg font-semibold mb-4">Removed Segments by Category</h3>
                <div className="space-y-3">
                  {Object.entries(
                    timelineSegments
                      .filter(s => s.type === 'remove')
                      .reduce((acc, seg) => {
                        const category = seg.category || 'other';
                        if (!acc[category]) {
                          acc[category] = { count: 0, duration: 0 };
                        }
                        acc[category].count++;
                        acc[category].duration += seg.duration;
                        return acc;
                      }, {} as Record<string, { count: number; duration: number }>)
                  ).map(([category, data]) => (
                    <div key={category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span className="font-medium capitalize">{category}</span>
                        <Badge variant="outline">{data.count} segments</Badge>
                      </div>
                      <span className="text-sm text-gray-600">{formatTime(data.duration)}</span>
                    </div>
                  ))}
                  </div>
                </Card>
              </div>
              
              {/* Right Column - Render Settings & Export Options */}
              <div className="col-span-1">
                <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Render Settings</h3>
                
                {/* Render Service Selection */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <label className="text-sm font-medium mb-2 block">Render Service:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`px-4 py-2 text-sm rounded transition-colors ${
                        renderService === 'shotstack'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      onClick={() => setRenderService('shotstack')}
                    >
                      Shotstack (Recommended)
                    </button>
                    <button
                      className={`px-4 py-2 text-sm rounded transition-colors ${
                        renderService === 'chillin'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      onClick={() => setRenderService('chillin')}
                    >
                      Chillin (Backup)
                    </button>
                  </div>
                </div>
                
                {/* FPS Selection */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-sm font-medium">Frame Rate (FPS):</label>
                    <span className="text-xs text-blue-600">(60 fps recommended)</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[24, 25, 30, 50, 60].map((fps) => (
                      <button
                        key={fps}
                        className={`px-3 py-2 text-sm rounded transition-colors ${
                          renderFPS === fps
                            ? 'bg-blue-600 text-white'
                            : fps === 60
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 ring-1 ring-blue-300'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        onClick={() => setRenderFPS(fps)}
                      >
                        {fps}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    60 FPS prevents freezing issues. Match source video FPS if known.
                  </p>
                </div>
                
                {/* Quality Selection */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <label className="text-sm font-medium mb-2 block">Quality:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map((quality) => (
                      <button
                        key={quality}
                        className={`px-3 py-2 text-sm rounded transition-colors capitalize ${
                          renderQuality === quality
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        onClick={() => setRenderQuality(quality)}
                      >
                        {quality}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Resolution Selection */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <label className="text-sm font-medium mb-2 block">Resolution:</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['sd', 'hd', '1080', '4k'] as const).map((res) => (
                      <button
                        key={res}
                        className={`px-3 py-2 text-sm rounded transition-colors uppercase ${
                          renderResolution === res
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        onClick={() => setRenderResolution(res)}
                      >
                        {res === '1080' ? '1080p' : res}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Render Button */}
                <Button
                  className="w-full h-16 text-lg font-semibold bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white mb-4"
                  onClick={async () => {
                    if (!videoUrl && !supabaseUrl) {
                      toast.error('No video URL available for rendering');
                      return;
                    }
                    
                    setIsRendering(true);
                    setRenderProgress(0);
                    
                    try {
                      // Use the actual render API endpoint
                      const renderEndpoint = renderService === 'shotstack' 
                        ? '/api/render/shotstack'
                        : '/api/render/chillin';
                      
                      // Convert timeline segments to the format expected by render API
                      const segmentsToRemove = timelineSegments
                        .filter(s => s.type === 'remove')
                        .map(s => ({
                          startTime: s.startTime,
                          endTime: s.endTime,
                          duration: s.duration,
                          reason: s.reason || 'User edited',
                          category: s.category || 'manual'
                        }));
                      
                      console.log('Submitting render job:', {
                        service: renderService,
                        fps: renderFPS,
                        quality: renderQuality,
                        resolution: renderResolution,
                        segmentsCount: segmentsToRemove.length
                      });
                      
                      const response = await fetch(renderEndpoint, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          videoUrl: supabaseUrl || videoUrl,
                          segmentsToRemove,
                          videoDuration,
                          videoWidth: renderResolution === '4k' ? 3840 : renderResolution === '1080' ? 1920 : renderResolution === 'hd' ? 1280 : 854,
                          videoHeight: renderResolution === '4k' ? 2160 : renderResolution === '1080' ? 1080 : renderResolution === 'hd' ? 720 : 480,
                          fps: renderFPS,
                          quality: renderQuality,
                          resolution: renderResolution
                        })
                      });
                      
                      const renderData = await response.json();
                      
                      if (!renderData || renderData.error) {
                        throw new Error(renderData?.error || 'Failed to submit render job');
                      }
                      
                      toast.success('Render job submitted! Checking status...');
                      setRenderProgress(10);
                      
                      // Poll for render status
                      const renderId = renderData.renderId;
                      let attempts = 0;
                      const maxAttempts = 180; // 15 minutes max
                      const pollInterval = 5000; // 5 seconds
                      
                      const pollStatus = async () => {
                        if (attempts >= maxAttempts) {
                          setIsRendering(false);
                          toast.error('Render timeout. Please check your jobs list.');
                          return;
                        }
                        
                        try {
                          const statusEndpoint = renderService === 'shotstack'
                            ? `/api/render/shotstack?renderId=${renderId}`
                            : `/api/render/chillin?renderId=${renderId}`;
                          
                          const statusResponse = await fetch(statusEndpoint);
                          const statusResult = await statusResponse.json();
                          
                          if (statusResult.status === 'completed' && statusResult.outputUrl) {
                            setRenderProgress(100);
                            setIsRendering(false);
                            toast.success('Video rendered successfully!');
                            
                            // Open the rendered video
                            window.open(statusResult.outputUrl, '_blank');
                            
                            // Trigger download
                            const link = document.createElement('a');
                            link.href = statusResult.outputUrl;
                            link.download = `edited_${originalFilename || 'video.mp4'}`;
                            link.target = '_blank';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          } else if (statusResult.status === 'failed') {
                            setIsRendering(false);
                            toast.error('Render failed: ' + (statusResult.error || 'Unknown error'));
                          } else {
                            // Still processing
                            setRenderProgress(Math.min(10 + (attempts * 0.5), 90));
                            attempts++;
                            setTimeout(pollStatus, pollInterval);
                          }
                        } catch (error) {
                          console.error('Status check error:', error);
                          attempts++;
                          setTimeout(pollStatus, pollInterval);
                        }
                      };
                      
                      // Start polling
                      setTimeout(pollStatus, pollInterval);
                      
                    } catch (error) {
                      console.error('Render error:', error);
                      setIsRendering(false);
                      toast.error(error instanceof Error ? error.message : 'Failed to start render');
                    }
                  }}
                  disabled={isRendering}
                >
                  {isRendering ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3" />
                      Rendering... {renderProgress}%
                    </>
                  ) : (
                    <>
                      <FileVideo className="w-6 h-6 mr-2" />
                      Render Final Video
                    </>
                  )}
                </Button>
                
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Export Edit Decision List</h4>
                  <div className="grid grid-cols-3 gap-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const removeSegments = timelineSegments
                        .filter(s => s.type === 'remove')
                        .map(s => ({
                          id: s.id,
                          selected: true,
                          startTime: s.startTime.toString(),
                          endTime: s.endTime.toString(),
                          duration: s.duration,
                          reason: s.reason || 'User edited',
                          confidence: s.confidence || 0.8,
                          category: (s.category || 'pause') as any,
                          transcript: s.reason || ''
                        } as EnhancedSegment));
                      onExport('edl', removeSegments);
                    }}
                    className="h-24 flex-col"
                  >
                    <FileVideo className="w-8 h-8 mb-2" />
                    <span>Export EDL</span>
                    <span className="text-xs text-gray-500 mt-1">For DaVinci Resolve</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const removeSegments = timelineSegments
                        .filter(s => s.type === 'remove')
                        .map(s => ({
                          id: s.id,
                          selected: true,
                          startTime: s.startTime.toString(),
                          endTime: s.endTime.toString(),
                          duration: s.duration,
                          reason: s.reason || 'User edited',
                          confidence: s.confidence || 0.8,
                          category: (s.category || 'pause') as any,
                          transcript: s.reason || ''
                        } as EnhancedSegment));
                      onExport('fcpxml', removeSegments);
                    }}
                    className="h-24 flex-col"
                  >
                    <FileVideo className="w-8 h-8 mb-2" />
                    <span>Export FCPXML</span>
                    <span className="text-xs text-gray-500 mt-1">For Final Cut Pro</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const removeSegments = timelineSegments
                        .filter(s => s.type === 'remove')
                        .map(s => ({
                          id: s.id,
                          selected: true,
                          startTime: s.startTime.toString(),
                          endTime: s.endTime.toString(),
                          duration: s.duration,
                          reason: s.reason || 'User edited',
                          confidence: s.confidence || 0.8,
                          category: (s.category || 'pause') as any,
                          transcript: s.reason || ''
                        } as EnhancedSegment));
                      onExport('premiere', removeSegments);
                    }}
                    className="h-24 flex-col"
                  >
                    <FileVideo className="w-8 h-8 mb-2" />
                    <span>Export XML</span>
                    <span className="text-xs text-gray-500 mt-1">For Premiere Pro</span>
                  </Button>
                  </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          /* Edit/Silence Stage - Video Player + Side Panel */
          <>
            <div className="flex-1 p-6">
              <Card className="w-full h-full">
                <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
                  {videoUrl ? (
                    <>
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        controls
                        playsInline
                      />
                      
                      {/* Overlay with current segment info */}
                      {selectedSegment && (
                        <div className={`absolute top-4 left-4 px-3 py-2 rounded-md text-white ${
                          selectedSegment.type === 'keep' ? 'bg-green-600/90' : 'bg-red-600/90'
                        }`}>
                          <div className="text-sm font-medium">
                            {selectedSegment.type === 'keep' ? 'KEEP' : 'REMOVE'}
                            {selectedSegment.category && ` - ${selectedSegment.category}`}
                          </div>
                          <div className="text-xs opacity-90">
                            {formatTime(selectedSegment.startTime)} - {formatTime(selectedSegment.endTime)}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <Play className="w-16 h-16" />
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Side panel with segment list or silence controls */}
            <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
              {currentStage === 'silence' ? (
                /* Silence Detection Controls */
                <>
                  <h3 className="font-semibold mb-4">Silence Detection Settings</h3>
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        Silence Threshold: {silenceThreshold}dB
                      </label>
                      <Slider
                        value={[silenceThreshold]}
                        onValueChange={(value) => {
                          setSilenceThreshold(value[0]);
                          setHasDetectedSilence(false); // Will trigger re-detection
                        }}
                        min={-60}
                        max={-20}
                        step={5}
                        className="w-full"
                        disabled={isDetectingSilence}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        Minimum Duration: {minSilenceDuration}s
                      </label>
                      <Slider
                        value={[minSilenceDuration]}
                        onValueChange={(value) => {
                          setMinSilenceDuration(value[0]);
                          setHasDetectedSilence(false); // Will trigger re-detection
                        }}
                        min={0.5}
                        max={5}
                        step={0.5}
                        className="w-full"
                        disabled={isDetectingSilence}
                      />
                    </div>
                    {!hasDetectedSilence && !isDetectingSilence && (
                      <div className="text-xs text-gray-500 italic">
                        Settings changed. Switch tabs or click Re-detect to apply.
                      </div>
                    )}
                  </div>
                  
                  {/* Detected Silence Segments */}
                  <h3 className="font-semibold mb-4">
                    Silence Segments
                    {silenceSegments.length > 0 && (
                      <span className="text-sm font-normal text-gray-500 ml-2">
                        ({silenceSegments.length} found)
                      </span>
                    )}
                  </h3>
                  <div className="space-y-2">
                    {silenceSegments.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <VolumeX className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-sm">No silence segments found</p>
                        <p className="text-xs mt-1">AI didn't detect any silence/pauses</p>
                        <p className="text-xs mt-1">Try "Detect More" for audio analysis</p>
                      </div>
                    ) : (
                      silenceSegments.map((segment) => (
                        <div
                          key={segment.id}
                          onClick={(e) => handleSegmentClick(segment, e)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedSegment?.id === segment.id 
                              ? 'ring-2 ring-purple-500 border-purple-500' 
                              : 'border-gray-200 hover:border-gray-300'
                          } bg-purple-50`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="bg-purple-100">
                              <VolumeX className="w-3 h-3 mr-1" />
                              Silence
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {(segment.confidence! * 100).toFixed(0)}% confident
                            </span>
                          </div>
                          <div className="text-xs text-gray-600">
                            {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                            <span className="ml-2">({segment.duration.toFixed(1)}s)</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                /* Regular Segment List for Edit Stage */
                <>
                  <h3 className="font-semibold mb-4">Segments</h3>
                  <div className="space-y-2">
                    {timelineSegments.map((segment) => (
                      <div
                        key={segment.id}
                        onClick={(e) => handleSegmentClick(segment, e)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedSegment?.id === segment.id 
                            ? 'ring-2 ring-blue-500 border-blue-500' 
                            : 'border-gray-200 hover:border-gray-300'
                        } ${segment.type === 'keep' ? 'bg-green-50' : 'bg-red-50'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant={segment.type === 'keep' ? 'default' : 'destructive'}>
                            {segment.type === 'keep' ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                            {segment.type}
                          </Badge>
                          {segment.isEditable && (
                            <span className="text-xs text-gray-500">Editable</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600">
                          {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                          <span className="ml-2">({segment.duration.toFixed(1)}s)</span>
                        </div>
                        {segment.category && (
                          <div className="text-xs text-gray-500 mt-1">{segment.category}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Enhanced Timeline track at bottom - Always visible for all stages */}
      {currentStage !== 'review' && (
        <div className="h-48 bg-gradient-to-b from-gray-50 to-white border-t-2 border-gray-200 p-4">
          <div className="h-full flex flex-col">
            {/* Timeline header with legend */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-gray-700">Timeline Editor</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-green-500 to-green-600" />
                    <span className="text-xs text-gray-600">Keep</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-red-500 to-red-600" />
                    <span className="text-xs text-gray-600">Remove</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-purple-500 to-purple-600" />
                    <span className="text-xs text-gray-600">Silence</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Drag to move</span>
                <span>•</span>
                <span>Edges to resize</span>
                <span>•</span>
                <span>Shift+Click to toggle</span>
              </div>
            </div>
            
            {/* Timeline controls */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => jumpToSegment('prev')}
                >
                  <SkipBack className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={togglePlayPause}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => jumpToSegment('next')}
                >
                  <SkipForward className="w-4 h-4" />
                </Button>
                
                <span className="text-sm font-mono text-gray-600 ml-4">
                  {formatTime(currentTime)} / {formatTime(videoDuration)}
                </span>
              </div>
              
              {/* Zoom controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600 w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(Math.min(4, zoom + 0.25))}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Main timeline */}
            <div 
              ref={containerRef}
              className="flex-1 overflow-x-auto overflow-y-hidden timeline-scrollable"
            >
              <div 
                ref={timelineRef}
                className="relative h-full bg-gradient-to-b from-gray-100 to-gray-50 rounded-xl shadow-inner"
                style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
              >
                {/* Enhanced time markers with better visibility */}
                <div className="absolute inset-0 pointer-events-none">
                  {Array.from({ length: Math.ceil(videoDuration / 10) + 1 }, (_, i) => {
                    const time = i * 10;
                    const left = (time / videoDuration) * 100;
                    const isMajor = time % 30 === 0; // Major marker every 30 seconds
                    return (
                      <div
                        key={time}
                        className="absolute top-0 h-full"
                        style={{ left: `${left}%` }}
                      >
                        <div className={`h-full w-px ${isMajor ? 'bg-gray-400' : 'bg-gray-300'}`} />
                        <div className={`absolute -top-6 -left-4 text-xs w-8 text-center ${
                          isMajor ? 'text-gray-700 font-semibold' : 'text-gray-500'
                        }`}>
                          {formatTime(time)}
                        </div>
                        {isMajor && (
                          <div className="absolute top-0 w-2 h-2 bg-gray-400 rounded-full -left-1" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Timeline segments with enhanced design */}
                <div className="absolute inset-0 top-6">
                  {timelineSegments.map((segment, segmentIndex) => {
                    const left = (segment.startTime / videoDuration) * 100;
                    const width = (segment.duration / videoDuration) * 100;
                    const isSelected = selectedSegment?.id === segment.id;
                    const isDragging = draggedSegment?.id === segment.id;
                    
                    // Ensure unique key even if IDs are duplicated
                    const uniqueKey = `${segment.id}-${segmentIndex}-${segment.startTime}-${segment.endTime}`;
                    
                    return (
                      <div
                        key={uniqueKey}
                        className={`absolute h-12 cursor-pointer group ${
                          isSelected ? 'z-20' : 'z-10'
                        } ${
                          highlightEditedSegments && segment.isEditable ? 'animate-pulse' : ''
                        }`}
                        style={getSegmentStyle(segment, isSelected, isDragging)}
                        title={`${segment.type === 'keep' ? 'Keep' : 'Remove'} ${segment.category ? `(${segment.category})` : ''} - ${segment.duration.toFixed(1)}s`}
                        onClick={(e) => handleSegmentClick(segment, e)}
                        onMouseDown={(e) => {
                          if (segment.isEditable) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const edgeThreshold = 10;
                            
                            if (x < edgeThreshold) {
                              handleDragStart(segment, 'resize-start', e);
                            } else if (x > rect.width - edgeThreshold) {
                              handleDragStart(segment, 'resize-end', e);
                            } else {
                              handleDragStart(segment, 'move', e);
                            }
                          }
                        }}
                      >
                        {/* Clean visual-only segment (no text) */}
                        <div className="relative h-full overflow-hidden pointer-events-none">
                          {/* Show duration only on hover */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <span className="text-white text-xs font-semibold drop-shadow-md bg-black/20 px-1.5 py-0.5 rounded">
                              {segment.duration.toFixed(1)}s
                            </span>
                          </div>
                        </div>
                        
                        {/* Subtle resize handles - only visible on hover */}
                        {segment.isEditable && (
                          <>
                            <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity bg-white/20" />
                            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity bg-white/20" />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Enhanced playhead with animation */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-blue-600 z-30 pointer-events-none shadow-lg"
                  style={{ 
                    left: `${(currentTime / videoDuration) * 100}%`,
                    transition: isPlaying ? 'none' : 'left 0.1s ease-out'
                  }}
                >
                  <div className="absolute -top-3 -left-2 w-5 h-5 bg-blue-600 rounded-full shadow-lg flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                  <div className="absolute -bottom-1 -left-8 bg-blue-600 text-white text-xs px-2 py-0.5 rounded shadow">
                    {formatTime(currentTime)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}