'use client';

import { useState, useEffect, useRef } from 'react';
import { VideoUploader } from '@/components/video-uploader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterPanel } from '@/components/FilterPanel';
import { SegmentCard } from '@/components/SegmentCard';
import { BrowserCompatibilityAlert, SystemHealthIndicator, MemoryUsageIndicator } from '@/components/system-health';
import { UnifiedProgress } from '@/components/unified-progress';
import { Loader2, Download, Video, Clock, Scissors, CheckCircle, Upload, Cpu, Brain, Play, Pause, RotateCcw, X, FileCode, FileText, Film, AlertTriangle, Info } from 'lucide-react';
import { formatTime, formatFileSize } from '@/lib/utils';
import { EnhancedSegment, FilterState, createDefaultFilterState, SegmentCategory } from '@/lib/types/segments';
import { needsCompression, compressVideoForAnalysis } from '@/lib/video-compression';
import { generateFCPXML, generateEDL, generatePremiereXML, downloadFile } from '@/lib/export-formats';
import { 
  VideoProcessingManager, 
  checkBrowserCompatibility, 
  DEFAULT_ENGINE_CONFIG,
  type ProcessingOptions,
  type ProcessingProgress,
  type MemoryStats 
} from '@/lib/video-processing';

interface AnalysisResult {
  segmentsToRemove: EnhancedSegment[];
  summary: {
    originalDuration: number;
    finalDuration: number;
    timeRemoved: number;
    segmentCount: number;
  };
}

export default function Home() {
  // Utility function to parse time strings
  const parseTime = (timeStr: string): number => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  };

  // Core state
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [targetDuration, setTargetDuration] = useState<number | undefined>();
  
  // New video processing state
  const [processingManager, setProcessingManager] = useState<VideoProcessingManager | null>(null);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [systemHealth, setSystemHealth] = useState<{ healthy: boolean; warnings: string[] } | null>(null);
  const [browserCompatibility, setBrowserCompatibility] = useState<ReturnType<typeof checkBrowserCompatibility> | null>(null);
  
  // Filter state
  const [filterState, setFilterState] = useState<FilterState>(createDefaultFilterState());
  const [bulkActions, setBulkActions] = useState<Map<string, 'keep' | 'remove'>>(new Map());
  
  // Detailed progress tracking
  const [stage, setStage] = useState<'idle' | 'uploading' | 'processing' | 'analyzing' | 'complete'>('idle');
  const [stageProgress, setStageProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Video preview functionality
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [segmentStates, setSegmentStates] = useState<Map<number, boolean>>(new Map());
  const [showVideoPanel, setShowVideoPanel] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState<'horizontal' | 'vertical' | 'square' | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewStart, setPreviewStart] = useState(0);
  const [previewEnd, setPreviewEnd] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Initialize video processing system
  useEffect(() => {
    const initializeProcessing = async () => {
      try {
        // Check browser compatibility
        const compatibility = checkBrowserCompatibility();
        setBrowserCompatibility(compatibility);
        
        if (!compatibility.compatible) {
          setError(`Browser not compatible: ${compatibility.issues.join(', ')}`);
          return;
        }
        
        // Initialize processing manager
        const manager = new VideoProcessingManager({
          maxMemoryMB: 4096,
          chunkSizeMB: 500,
          enableAutoRecovery: true,
          enableProgressPersistence: true,
        });
        
        await manager.initialize();
        
        // Set up event handlers
        manager.setEventHandlers({
          onJobProgress: (jobId, progress) => {
            if (jobId === processingJobId) {
              setStageProgress(progress.progress);
              setStatusMessage(`Processing: ${progress.stage}`);
            }
          },
          onJobComplete: (jobId, result) => {
            if (jobId === processingJobId) {
              console.log('Video processing completed');
              setStage('complete');
            }
          },
          onJobError: (jobId, error) => {
            if (jobId === processingJobId) {
              setError(`Processing failed: ${error}`);
              setStage('idle');
            }
          },
          onMemoryWarning: (usage, limit) => {
            console.warn(`Memory warning: ${usage}MB / ${limit}MB`);
          },
        });
        
        setProcessingManager(manager);
        
        // Start monitoring system health
        const healthCheck = async () => {
          const health = await manager.checkSystemHealth();
          setSystemHealth(health);
          
          const memStats = manager.getMemoryStats();
          setMemoryStats(memStats);
        };
        
        healthCheck();
        const healthInterval = setInterval(healthCheck, 5000); // Check every 5 seconds
        
        return () => {
          clearInterval(healthInterval);
          manager.shutdown();
        };
        
      } catch (error) {
        console.error('Failed to initialize video processing:', error);
        setError(`Failed to initialize video processing: ${error}`);
      }
    };
    
    initializeProcessing();
  }, []);

  // Timer for elapsed time
  useEffect(() => {
    if (startTime && (isUploading || isAnalyzing)) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [startTime, isUploading, isAnalyzing]);

  // Cleanup video URL on unmount
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  // Keyboard navigation for segments
  useEffect(() => {
    if (!analysis || !showVideoPanel) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedSegmentIndex === null) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          const prevIndex = selectedSegmentIndex > 0 ? selectedSegmentIndex - 1 : analysis.segmentsToRemove.length - 1;
          setSelectedSegmentIndex(prevIndex);
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          const nextIndex = selectedSegmentIndex < analysis.segmentsToRemove.length - 1 ? selectedSegmentIndex + 1 : 0;
          setSelectedSegmentIndex(nextIndex);
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          toggleSegmentState(selectedSegmentIndex);
          break;
        case 'Escape':
          e.preventDefault();
          handleCloseVideoPanel();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [analysis, selectedSegmentIndex, showVideoPanel]);

  // Global mouse events for timeline dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging && timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        
        if (videoRef.current && previewDuration > 0) {
          const targetTime = previewStart + (percentage * previewDuration);
          const clampedTime = Math.max(previewStart, Math.min(previewEnd, targetTime));
          videoRef.current.currentTime = clampedTime;
        }
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, previewStart, previewEnd, previewDuration]);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setAnalysis(null);
    
    // Create video URL for preview
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    const newVideoUrl = URL.createObjectURL(selectedFile);
    setVideoUrl(newVideoUrl);
    
    // Reset preview states
    setSelectedSegmentIndex(null);
    setShowVideoPanel(false);
    setSegmentStates(new Map());
    setVideoOrientation(null);
    setPreviewStart(0);
    setPreviewEnd(0);
    setPreviewDuration(0);
    
    // Reset filter states
    setFilterState(createDefaultFilterState());
    setBulkActions(new Map());
  };

  const handleUpload = async () => {
    if (!file) return;

    // Check file size before upload (2GB max for Gemini)
    const maxSizeGB = 2;
    const maxSizeBytes = maxSizeGB * 1024 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(`File is too large (${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB). Maximum size is ${maxSizeGB}GB.`);
      return;
    }

    setIsUploading(true);
    setError(null);
    setStage('uploading');
    setStageProgress(0);
    setStatusMessage('Preparing upload...');
    setStartTime(Date.now());
    setElapsedTime(0);

    try {
      let fileToUpload = file;
      
      // Check if compression is needed (files over 500MB)
      if (needsCompression(file, 500)) {
        const sizeMB = file.size / (1024 * 1024);
        setStatusMessage(`Large file detected (${sizeMB.toFixed(0)}MB). Compressing for better analysis...`);
        setStageProgress(10);
        
        try {
          // Use server-side FFmpeg compression
          const compressFormData = new FormData();
          compressFormData.append('file', file);
          
          setStatusMessage('Compressing video to 480p for analysis...');
          
          const compressResponse = await fetch('/api/analysis/compress', {
            method: 'POST',
            body: compressFormData,
          });
          
          if (!compressResponse.ok) {
            const error = await compressResponse.json();
            throw new Error(error.error || 'Compression failed');
          }
          
          // Get compressed video as blob
          const compressedBlob = await compressResponse.blob();
          const originalSize = parseInt(compressResponse.headers.get('X-Original-Size') || '0');
          const compressedSize = parseInt(compressResponse.headers.get('X-Compressed-Size') || '0');
          const compressionRatio = compressResponse.headers.get('X-Compression-Ratio') || '0';
          
          // Create File from blob
          fileToUpload = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, '_compressed.mp4'), {
            type: 'video/mp4'
          });
          
          const originalMB = originalSize / (1024 * 1024);
          const compressedMB = compressedSize / (1024 * 1024);
          
          setStatusMessage(`Compressed: ${originalMB.toFixed(1)}MB → ${compressedMB.toFixed(1)}MB (${compressionRatio}% smaller)`);
          console.log(`Video compressed successfully: ${originalMB.toFixed(1)}MB → ${compressedMB.toFixed(1)}MB`);
          
        } catch (compressionError: any) {
          console.error('Compression failed:', compressionError);
          
          // If compression fails, ask user what to do
          const userChoice = confirm(
            `Compression failed: ${compressionError.message}\n\n` +
            `This file is ${sizeMB.toFixed(0)}MB and may have issues with Gemini 2.5 Pro.\n\n` +
            `Options:\n` +
            `• Click OK to upload original file (may fail)\n` +
            `• Click Cancel to stop\n\n` +
            `Note: Make sure FFmpeg is installed for compression to work.`
          );
          
          if (!userChoice) {
            setIsUploading(false);
            setError('Upload cancelled. Install FFmpeg for automatic compression of large files.');
            return;
          }
          
          setStatusMessage('Uploading original file (this may fail for large files)...');
        }
      }
      
      const formData = new FormData();
      formData.append('file', fileToUpload);

      setStatusMessage('Uploading video to Gemini...');

      // Use XMLHttpRequest for progress tracking
      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let lastProgressTime = Date.now();
        let lastLoaded = 0;
        const uploadStartTime = Date.now();
        
        // Track actual upload speed
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const currentTime = Date.now();
            const timeDiff = (currentTime - lastProgressTime) / 1000; // seconds
            const bytesDiff = e.loaded - lastLoaded;
            const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0; // bytes per second
            const speedMBps = (speed / (1024 * 1024)).toFixed(2);
            
            // More realistic progress calculation:
            // - 0-60%: Actual upload to browser/network buffer
            // - 60-80%: Server receiving (estimated)
            // - 80-100%: Server processing
            const browserProgress = (e.loaded / e.total) * 100;
            const displayProgress = Math.min(60, Math.round(browserProgress * 0.6));
            
            setStageProgress(displayProgress);
            setUploadProgress(displayProgress);
            
            // Update status message with percentage and speed
            if (browserProgress < 100) {
              const remaining = e.total - e.loaded;
              const eta = speed > 0 ? remaining / speed : 0;
              const etaMinutes = Math.floor(eta / 60);
              const etaSeconds = Math.floor(eta % 60);
              
              setStatusMessage(
                `Uploading to server... ${displayProgress}% (${speedMBps} MB/s, ETA: ${etaMinutes}:${etaSeconds.toString().padStart(2, '0')})`
              );
            } else {
              // Browser finished sending, but server still receiving
              setStageProgress(65);
              setStatusMessage('Server receiving video... (this may take a few minutes for large files)');
            }
            
            lastProgressTime = currentTime;
            lastLoaded = e.loaded;
          }
        });

        xhr.onloadstart = () => {
          lastProgressTime = Date.now();
          lastLoaded = 0;
        };

        // Add progress simulation for server processing phase
        let serverProgressInterval: NodeJS.Timeout;
        
        xhr.upload.addEventListener('loadend', () => {
          // Browser finished uploading, simulate server processing
          let serverProgress = 65;
          serverProgressInterval = setInterval(() => {
            if (serverProgress < 90) {
              serverProgress += 2;
              setStageProgress(serverProgress);
              const elapsed = Math.floor((Date.now() - uploadStartTime) / 1000);
              setStatusMessage(`Server processing video... ${serverProgress}% (${elapsed}s elapsed)`);
            }
          }, 1000);
        });

        xhr.onload = () => {
          // Clear the interval when server responds
          if (serverProgressInterval) clearInterval(serverProgressInterval);
          
          // Set to 100% when server actually responds
          setStageProgress(100);
          setUploadProgress(100);
          setStatusMessage('Upload complete!');
          
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (e) {
              reject(new Error('Invalid response format'));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || 'Upload failed'));
            } catch (e) {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => {
          if (serverProgressInterval) clearInterval(serverProgressInterval);
          reject(new Error('Network error during upload'));
        };
        
        xhr.ontimeout = () => {
          if (serverProgressInterval) clearInterval(serverProgressInterval);
          reject(new Error('Upload timed out (file may be too large)'));
        };

        xhr.open('POST', '/api/analysis/upload');
        xhr.timeout = 900000; // 15 minute timeout for large files
        xhr.send(formData);
      });

      setStage('processing');
      setStageProgress(0);
      setStatusMessage('Gemini is processing your video file...');
      
      // More realistic processing progress
      // Gemini file activation typically takes 15-180 seconds depending on file size
      const fileSize = file.size / (1024 * 1024); // MB
      const estimatedProcessingTime = Math.min(180, Math.max(15, fileSize * 0.1)); // seconds
      const progressIncrement = 90 / estimatedProcessingTime; // Progress per second
      
      let processingProgress = 0;
      const processingInterval = setInterval(() => {
        processingProgress = Math.min(90, processingProgress + progressIncrement);
        setStageProgress(Math.round(processingProgress));
        
        const elapsed = Math.floor(processingProgress / progressIncrement);
        if (processingProgress < 30) {
          setStatusMessage(`Gemini receiving file... (${elapsed}s elapsed)`);
        } else if (processingProgress < 60) {
          setStatusMessage(`Gemini processing video... (${elapsed}s elapsed)`);
        } else {
          setStatusMessage(`Finalizing video processing... (${elapsed}s elapsed)`);
        }
      }, 1000);

      setFileUri(result.fileUri);
      clearInterval(processingInterval);
      setStageProgress(100);
      setStatusMessage('Video ready for analysis!');

      // Start analysis automatically
      await handleAnalysis(result.fileUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStage('idle');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalysis = async (uri: string) => {
    setIsAnalyzing(true);
    setError(null);
    setStage('analyzing');
    setStageProgress(0);
    setStatusMessage('Starting AI analysis...');

    try {
      // Show gradual progress for analysis
      const analysisInterval = setInterval(() => {
        setStageProgress(prev => {
          if (prev >= 80) {
            clearInterval(analysisInterval);
            return 80;
          }
          // Slower progress for analysis phase
          return prev + 5;
        });
        
        // Update status message based on progress
        setStatusMessage(prev => {
          const progress = prev.includes('%') ? 
            parseInt(prev.match(/\d+/)?.[0] || '0') : 0;
          
          if (progress < 30) return 'Starting AI analysis...';
          if (progress < 60) return 'Analyzing video content...';
          return 'Identifying segments to remove...';
        });
      }, 1000);

      const fileSizeMB = file ? file.size / (1024 * 1024) : 0;
      setStatusMessage(`Analyzing with Gemini 2.5 Pro...`);
      
      const response = await fetch('/api/analysis/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileUri: uri,
          prompt: customPrompt,
          targetDuration: targetDuration,
          fileSize: fileSizeMB, // Size in MB
        }),
      });

      clearInterval(analysisInterval);
      setStageProgress(90);
      setStatusMessage('Finalizing analysis results...');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Analysis failed');
      }

      const result = await response.json();
      
      // Debug logging to understand segment structure
      console.log('=== ANALYSIS RESULT DEBUG ===');
      console.log('Full result:', result);
      console.log('Analysis:', result.analysis);
      console.log('Segments:', result.analysis?.segmentsToRemove);
      if (result.analysis?.segmentsToRemove?.length > 0) {
        console.log('First segment structure:', result.analysis.segmentsToRemove[0]);
        console.log('All segment categories:', result.analysis.segmentsToRemove.map(s => s.category));
      }
      console.log('=== END DEBUG ===');
      
      setAnalysis(result.analysis);
      setStage('complete');
      setStageProgress(100);
      setStatusMessage('Analysis complete!');
      setStartTime(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setStage('idle');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Video preview handlers
  const handleSegmentClick = (index: number) => {
    setSelectedSegmentIndex(index);
    setShowVideoPanel(true);
    setCurrentTime(0);
    setIsPlaying(false);
    // Reset video to preview start when switching segments
    if (videoRef.current && analysis) {
      const segment = analysis.segmentsToRemove[index];
      const segmentStartTime = parseTime(segment.startTime);
      const previewStartTime = Math.max(0, segmentStartTime - 5);
      videoRef.current.currentTime = previewStartTime;
    }
  };

  const handleCloseVideoPanel = () => {
    setShowVideoPanel(false);
    setSelectedSegmentIndex(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setIsDragging(false);
    setPreviewStart(0);
    setPreviewEnd(0);
    setPreviewDuration(0);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const toggleSegmentState = (index: number) => {
    const newStates = new Map(segmentStates);
    newStates.set(index, !newStates.get(index));
    setSegmentStates(newStates);
  };

  const getFilteredSegments = () => {
    if (!analysis) return [];
    
    console.log('=== FILTERING DEBUG ===');
    console.log('Total segments to filter:', analysis.segmentsToRemove.length);
    console.log('Filter state:', filterState);
    
    const filtered = analysis.segmentsToRemove.filter((segment, index) => {
      // Check bulk actions first
      const segmentKey = `${segment.startTime}-${segment.endTime}`;
      if (bulkActions.has(segmentKey)) {
        return bulkActions.get(segmentKey) === 'remove';
      }
      
      // Check if user manually kept this segment
      if (segmentStates.get(index)) {
        return false; // Don't remove if user wants to keep
      }
      
      console.log(`\n--- Filtering segment ${index} ---`);
      console.log('Segment:', segment);
      console.log('Category:', segment.category);
      console.log('Severity:', segment.severity);
      console.log('Confidence:', segment.confidence);
      
      // For segments without severity (legacy format), check category filtering
      if (!segment.severity) {
        console.log('Legacy segment - checking category filter');
        
        // Map the segment category to filter state
        const categoryLower = (segment.category || '').toLowerCase();
        let shouldShow = false;
        
        if (categoryLower === 'pause') {
          shouldShow = filterState[SegmentCategory.PAUSE];
        } else if (categoryLower === 'filler') {
          shouldShow = filterState[SegmentCategory.FILLER_WORDS];
        } else if (categoryLower === 'redundant') {
          shouldShow = filterState[SegmentCategory.REDUNDANT];
        } else if (categoryLower === 'off-topic') {
          shouldShow = filterState[SegmentCategory.TANGENT];
        } else if (categoryLower === 'technical') {
          shouldShow = filterState[SegmentCategory.TECHNICAL];
        }
        
        console.log(`Legacy category "${categoryLower}" should show: ${shouldShow}`);
        
        if (!shouldShow) return false;
        
        // Still check confidence if available
        if (segment.confidence && segment.confidence < filterState.minConfidence) {
          console.log(`Confidence filter failed: ${segment.confidence} < ${filterState.minConfidence}`);
          return false;
        }
        
        return true;
      }
      
      // For new format segments with proper categorization
      let categoryMatches = false;
      
      // Map various category formats to our filter state
      const categoryLower = (segment.category || '').toLowerCase();
      
      if (categoryLower === 'pause' || categoryLower === 'pause') {
        categoryMatches = filterState[SegmentCategory.PAUSE];
      } else if (categoryLower === 'filler' || categoryLower === 'filler_words') {
        categoryMatches = filterState[SegmentCategory.FILLER_WORDS];
      } else if (categoryLower === 'redundant') {
        categoryMatches = filterState[SegmentCategory.REDUNDANT];
      } else if (categoryLower === 'off-topic' || categoryLower === 'tangent') {
        categoryMatches = filterState[SegmentCategory.TANGENT];
      } else if (categoryLower === 'technical') {
        categoryMatches = filterState[SegmentCategory.TECHNICAL];
      } else if (categoryLower === 'bad_take') {
        categoryMatches = filterState[SegmentCategory.BAD_TAKE];
      } else if (categoryLower === 'false_start') {
        categoryMatches = filterState[SegmentCategory.FALSE_START];
      } else if (categoryLower === 'low_energy') {
        categoryMatches = filterState[SegmentCategory.LOW_ENERGY];
      } else if (categoryLower === 'long_explanation') {
        categoryMatches = filterState[SegmentCategory.LONG_EXPLANATION];
      } else if (categoryLower === 'weak_transition') {
        categoryMatches = filterState[SegmentCategory.WEAK_TRANSITION];
      } else {
        // Unknown category - show by default
        console.log(`Unknown category "${segment.category}" - showing by default`);
        categoryMatches = true;
      }
      
      console.log(`Category matches: ${categoryMatches} (${segment.category})`);
      if (!categoryMatches) return false;
      
      // Check severity filter
      if (filterState.showOnlyHighSeverity && segment.severity !== 'high') {
        console.log(`Severity filter failed: showOnlyHighSeverity=${filterState.showOnlyHighSeverity}, severity=${segment.severity}`);
        return false;
      }
      
      // Check confidence filter
      if (segment.confidence < filterState.minConfidence) {
        console.log(`Confidence filter failed: ${segment.confidence} < ${filterState.minConfidence}`);
        return false;
      }
      
      console.log('Segment passes all filters');
      return true;
    });
    
    console.log('Filtered result:', filtered.length, 'segments');
    console.log('=== END FILTERING DEBUG ===');
    return filtered;
  };

  // Handle timeline clicking/dragging for preview window
  // Handle bulk actions
  const handleBulkAction = (category: SegmentCategory, action: 'keep' | 'remove') => {
    const newBulkActions = new Map(bulkActions);
    
    analysis?.segmentsToRemove
      .filter(segment => segment.category === category)
      .forEach(segment => {
        const key = `${segment.startTime}-${segment.endTime}`;
        if (action === 'remove') {
          newBulkActions.delete(key); // Use default filtering
        } else {
          newBulkActions.set(key, action);
        }
      });
    
    setBulkActions(newBulkActions);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current || previewDuration === 0) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    // Map percentage to preview window time
    const targetTime = previewStart + (percentage * previewDuration);
    
    // Clamp to preview window boundaries
    const clampedTime = Math.max(previewStart, Math.min(previewEnd, targetTime));
    
    videoRef.current.currentTime = clampedTime;
  };

  const exportAsJSON = () => {
    if (!analysis) return;
    
    const filteredSegments = getFilteredSegments();
    const exportData = {
      ...analysis,
      segmentsToRemove: filteredSegments,
      summary: {
        ...analysis.summary,
        segmentCount: filteredSegments.length,
        timeRemoved: filteredSegments.reduce((total, segment) => total + segment.duration, 0),
        finalDuration: analysis.summary.originalDuration - filteredSegments.reduce((total, segment) => total + segment.duration, 0)
      },
      exportSettings: {
        totalSegmentsAnalyzed: analysis.segmentsToRemove.length,
        segmentsKept: analysis.segmentsToRemove.length - filteredSegments.length,
        segmentsRemoved: filteredSegments.length,
        userModifications: Array.from(segmentStates.entries()).filter(([_, keep]) => keep).length
      }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `video-analysis-filtered-${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const exportAsFCPXML = () => {
    if (!analysis || !file) return;
    
    const filtered = getFilteredSegments();
    const fcpxml = generateFCPXML(
      filtered,
      videoDuration || analysis.summary.originalDuration,
      file.name,
      file.name // You might want to provide full path if available
    );
    
    const filename = file.name.replace(/\.[^/.]+$/, '') + '_edit.fcpxml';
    downloadFile(fcpxml, filename, 'application/xml');
  };
  
  const exportAsEDL = () => {
    if (!analysis || !file) return;
    
    const filtered = getFilteredSegments();
    const edl = generateEDL(
      filtered,
      videoDuration || analysis.summary.originalDuration,
      file.name
    );
    
    const filename = file.name.replace(/\.[^/.]+$/, '') + '_edit.edl';
    downloadFile(edl, filename, 'text/plain');
  };
  
  const exportAsPremiereXML = () => {
    if (!analysis || !file) return;
    
    const filtered = getFilteredSegments();
    const xml = generatePremiereXML(
      filtered,
      videoDuration || analysis.summary.originalDuration,
      file.name,
      file.name
    );
    
    const filename = file.name.replace(/\.[^/.]+$/, '') + '_premiere.xml';
    downloadFile(xml, filename, 'application/xml');
  };

  const exportAsCSV = () => {
    if (!analysis) return;
    
    const filteredSegments = getFilteredSegments();
    let csv = 'Start Time,End Time,Duration (sec),Reason,Category,Confidence,Status\n';
    
    // Export all segments with their current status
    analysis.segmentsToRemove.forEach((segment, index) => {
      const status = segmentStates.get(index) ? 'KEEP' : 'REMOVE';
      csv += `${segment.startTime},${segment.endTime},${segment.duration},"${segment.reason}",${segment.category},${segment.confidence},${status}\n`;
    });
    
    const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csv);
    const exportFileDefaultName = `video-cuts-with-status-${Date.now()}.csv`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-800">
      <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Browser Compatibility Alert */}
        <BrowserCompatibilityAlert />
        
        {/* Memory Usage Indicator - Floating */}
        {(isUploading || isAnalyzing) && <MemoryUsageIndicator />}
        
        {/* Light Terminal Header */}
        <div className="mb-8 border-b border-gray-300 pb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <span className="text-green-600 mr-2">●</span>
              <span className="text-blue-600 mr-2">●</span>
              <span className="text-yellow-600 mr-2">●</span>
              <span className="text-sm text-gray-600 ml-2 font-mono">ai-video-analyzer v2.0.0</span>
            </div>
            
            {/* System Health Indicators */}
            <div className="flex items-center space-x-4">
              {/* Browser Compatibility */}
              {browserCompatibility && (
                <div className="flex items-center">
                  {browserCompatibility.compatible ? (
                    <CheckCircle className="w-4 h-4 text-green-600 mr-1" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600 mr-1" />
                  )}
                  <span className="text-xs text-gray-600">
                    {browserCompatibility.compatible ? 'Compatible' : 'Issues'}
                  </span>
                </div>
              )}
              
              {/* Memory Usage */}
              {memoryStats && (
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    memoryStats.warningLevel === 'critical' ? 'bg-red-500' :
                    memoryStats.warningLevel === 'high' ? 'bg-yellow-500' :
                    memoryStats.warningLevel === 'medium' ? 'bg-blue-500' :
                    'bg-green-500'
                  }`} />
                  <span className="text-xs text-gray-600">
                    {Math.round(memoryStats.currentUsageMB)}MB
                  </span>
                </div>
              )}
              
              {/* System Health */}
              {systemHealth && (
                <div className="flex items-center">
                  {systemHealth.healthy ? (
                    <CheckCircle className="w-4 h-4 text-green-600 mr-1" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-yellow-600 mr-1" />
                  )}
                  <span className="text-xs text-gray-600">
                    {systemHealth.healthy ? 'Healthy' : `${systemHealth.warnings.length} warnings`}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="font-mono">
            <div className="text-sm text-gray-600 mb-2">$ ./analyze --mode interactive --ai gemini-2.5-pro --engine browser-ffmpeg</div>
            <h1 className="text-3xl font-bold text-green-700 mb-2 flex items-center">
              <span className="mr-3">⚡</span>
              AI VIDEO ANALYSIS TERMINAL
            </h1>
            <p className="text-gray-700 text-base flex items-center">
              <span className="text-blue-700 mr-2">→</span>
              Upload video and let AI identify segments for removal - Now with browser-based processing
            </p>
          </div>
          
          {/* System Warnings */}
          {browserCompatibility && !browserCompatibility.compatible && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-500 mr-2 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Browser Compatibility Issues</h3>
                  <ul className="mt-1 text-sm text-red-700">
                    {browserCompatibility.issues.map((issue, index) => (
                      <li key={index}>• {issue}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-red-600">
                    Please use Chrome 90+, Firefox 90+, or Edge 90+ for best results.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {systemHealth && !systemHealth.healthy && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start">
                <Info className="w-5 h-5 text-yellow-500 mr-2 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">System Health Warnings</h3>
                  <ul className="mt-1 text-sm text-yellow-700">
                    {systemHealth.warnings.map((warning, index) => (
                      <li key={index}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* System Health Sidebar - Desktop Only */}
          <div className="hidden lg:block lg:col-span-1">
            <SystemHealthIndicator />
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {!analysis && (
              <div className="bg-white border border-gray-300 rounded-lg p-8 font-mono shadow-sm">
                <VideoUploader 
                  onFileSelect={handleFileSelect}
                  isUploading={isUploading || isAnalyzing}
                />

            {file && !isUploading && !isAnalyzing && (
              <div className="mt-6 space-y-4">
                {/* Main Prompt Section */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-base font-semibold text-gray-800 mb-3">
                    📝 Analysis Instructions for AI
                  </label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                    rows={8}
                    placeholder={`Tell the AI what to focus on in your video analysis. Be specific about what you want to achieve.

Examples:
• "This is a tutorial video. Remove all pauses longer than 2 seconds, any repeated explanations, and moments where I'm searching for words. Keep all the actual demonstration parts intact."

• "This is an interview. Cut out all the 'um' and 'uh' filler words, long pauses, and any off-topic discussions. Preserve the key insights and natural conversation flow."

• "Remove the first 30 seconds of setup, any technical difficulties, and dead air. Make it punchy and engaging, targeting 10 minutes final duration."

• "Focus on creating a highlight reel. Keep only the most impactful moments, remove all redundant content, and create a fast-paced edit."

The more specific you are, the better the AI can tailor the analysis to your needs!`}
                  />
                  <p className="text-xs text-gray-600 mt-2">
                    💡 Tip: Describe your video type, what to remove, what to keep, and any specific requirements
                  </p>
                </div>

                {/* Target Duration Section */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ⏱️ Target Duration (optional)
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      value={targetDuration || ''}
                      onChange={(e) => setTargetDuration(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="e.g., 15"
                      min="1"
                    />
                    <span className="text-sm text-gray-600">minutes</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Set a target length and AI will prioritize cuts to reach it
                  </p>
                </div>

                {/* Quick Prompt Templates */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Quick Templates (click to use):
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setCustomPrompt("Remove all pauses longer than 2 seconds, filler words like 'um' and 'uh', and any repeated content. Keep all key information and maintain natural flow.")}
                      className="text-left px-3 py-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      🎯 <strong>Standard Clean-up</strong>
                    </button>
                    <button
                      onClick={() => setCustomPrompt("This is a tutorial/educational video. Remove setup time, long pauses, searching for words, and technical issues. Keep all teaching moments and demonstrations clear and concise.")}
                      className="text-left px-3 py-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      📚 <strong>Tutorial/Education</strong>
                    </button>
                    <button
                      onClick={() => setCustomPrompt("This is an interview/podcast. Cut filler words, long pauses, and off-topic tangents. Preserve the conversational flow and all key insights from the discussion.")}
                      className="text-left px-3 py-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      🎙️ <strong>Interview/Podcast</strong>
                    </button>
                    <button
                      onClick={() => setCustomPrompt("Create a highlight reel by removing all slow moments, redundant content, and keeping only the most engaging and impactful segments. Make it fast-paced and dynamic.")}
                      className="text-left px-3 py-2 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      ⚡ <strong>Highlight Reel</strong>
                    </button>
                  </div>
                </div>

                <Button 
                  onClick={handleUpload}
                  className="w-full"
                  size="lg"
                >
                  <Video className="mr-2" />
                  Start AI Analysis
                </Button>
              </div>
            )}

            {(isUploading || isAnalyzing) && (
              <div className="mt-6 space-y-6">
                {/* Use the new UnifiedProgress component */}
                <UnifiedProgress
                  overall={{
                    percentage: Math.round(
                      stage === 'uploading' ? stageProgress * 0.4 :
                      stage === 'processing' ? 40 + (stageProgress * 0.3) :
                      stage === 'analyzing' ? 70 + (stageProgress * 0.3) :
                      100
                    ),
                    stage: statusMessage,
                    estimatedTimeRemaining: 0,
                    startTime: startTime ? new Date(startTime) : undefined
                  }}
                  stages={{
                    conversion: {
                      name: 'Format Conversion',
                      status: stage === 'idle' ? 'pending' : 'skipped',
                      progress: 0,
                      message: 'Not needed - MP4 format'
                    },
                    compression: {
                      name: 'Video Compression',
                      status: stage === 'uploading' ? 'active' : stage === 'idle' ? 'pending' : 'completed',
                      progress: stage === 'uploading' ? stageProgress : 100,
                      message: stage === 'uploading' ? 'Preparing video for analysis...' : 'Compression complete'
                    },
                    processing: {
                      name: 'AI Analysis',
                      status: stage === 'analyzing' ? 'active' : stage === 'uploading' || stage === 'processing' ? 'pending' : 'completed',
                      progress: stage === 'analyzing' ? stageProgress : 0,
                      message: stage === 'analyzing' ? 'Analyzing video content...' : 'Waiting...'
                    }
                  }}
                  metrics={{
                    dataProcessed: file ? file.size * (stageProgress / 100) : 0,
                    totalData: file?.size,
                    memoryUsed: memoryStats?.used
                  }}
                  showDetails={true}
                />

                {/* File info */}
                {file && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg font-mono">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">File:</span>
                      <span className="font-medium text-gray-900">{file.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-600">Size:</span>
                      <span className="font-medium text-gray-900">{formatFileSize(file.size)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

          {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>
        )}

        {analysis && (
          <div className="space-y-6 font-mono">
            {/* Light Terminal-style Analysis Results */}
            <div className="bg-white border border-gray-300 rounded-lg p-8 shadow-sm">
              <div className="flex items-center mb-6">
                <span className="text-green-600 mr-2">✓</span>
                <h2 className="text-xl font-bold text-green-700">ANALYSIS COMPLETE</h2>
              </div>
              
              {/* Light Terminal-style metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                <div className="space-y-2">
                  <div className="flex items-center text-gray-600 text-sm">
                    <Clock className="w-3 h-3 mr-1" />
                    <span>Original</span>
                  </div>
                  <div className="text-gray-800 text-2xl font-bold font-mono">
                    {formatTime(analysis.summary.originalDuration)}
                  </div>
                  <div className="h-1 bg-gray-200 rounded">
                    <div className="h-full bg-gray-400 rounded" style={{width: '100%'}}></div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center text-green-600 text-sm">
                    <Clock className="w-3 h-3 mr-1" />
                    <span>Final</span>
                  </div>
                  <div className="text-green-700 text-2xl font-bold font-mono">
                    {formatTime(analysis.summary.finalDuration)}
                  </div>
                  <div className="h-1 bg-gray-200 rounded">
                    <div className="h-full bg-green-500 rounded" 
                         style={{width: `${(analysis.summary.finalDuration/analysis.summary.originalDuration)*100}%`}}>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center text-red-600 text-sm">
                    <Scissors className="w-3 h-3 mr-1" />
                    <span>Removed</span>
                  </div>
                  <div className="text-red-700 text-2xl font-bold font-mono">
                    {formatTime(getFilteredSegments().reduce((total, segment) => total + segment.duration, 0))}
                  </div>
                  <div className="h-1 bg-gray-200 rounded">
                    <div className="h-full bg-red-500 rounded" 
                         style={{width: `${(getFilteredSegments().reduce((total, segment) => total + segment.duration, 0)/analysis.summary.originalDuration)*100}%`}}>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center text-blue-600 text-sm">
                    <Scissors className="w-3 h-3 mr-1" />
                    <span>Cuts</span>
                  </div>
                  <div className="text-blue-700 text-2xl font-bold font-mono">
                    {getFilteredSegments().length}<span className="text-gray-500">/{analysis.summary.segmentCount}</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    {Array.from(segmentStates.values()).filter(keep => keep).length} kept
                  </div>
                </div>
              </div>

              {/* Light Terminal-style action buttons */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-300">
                <button 
                  onClick={exportAsFCPXML}
                  className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-mono text-sm font-semibold"
                >
                  <Film className="mr-2 h-4 w-4" />
                  Final Cut
                </button>
                <button 
                  onClick={exportAsEDL}
                  className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors font-mono text-sm font-semibold"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  EDL
                </button>
                <button 
                  onClick={exportAsPremiereXML}
                  className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-mono text-sm font-semibold"
                >
                  <FileCode className="mr-2 h-4 w-4" />
                  Premiere
                </button>
                <button 
                  onClick={exportAsJSON}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-mono text-sm font-semibold"
                >
                  <Download className="mr-2 h-4 w-4" />
                  JSON
                </button>
                <button 
                  onClick={exportAsCSV}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-mono text-sm font-semibold"
                >
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </button>
                <button 
                  onClick={() => {
                    setAnalysis(null);
                    setFile(null);
                    setFileUri(null);
                  }}
                  className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-mono text-sm font-semibold"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  new_analysis
                </button>
              </div>
            </div>

            {/* Smart Filtering Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Filter Panel - Left sidebar - increased width */}
              <div className="xl:col-span-3">
                <div className="sticky top-8">
                  <FilterPanel
                    segments={analysis.segmentsToRemove}
                    filterState={filterState}
                    onFilterChange={setFilterState}
                    onBulkAction={handleBulkAction}
                  />
                </div>
              </div>
              
              {/* Segments List - adjusted proportions */}
              <div className={showVideoPanel ? 'xl:col-span-4' : 'xl:col-span-9'}>
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        Segments to Review
                        <span className="text-sm font-normal text-muted-foreground">
                          ({getFilteredSegments().length} matching filters)
                        </span>
                      </CardTitle>
                      {showVideoPanel && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleCloseVideoPanel}
                          title="Close video preview"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-4">
                    <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
                    {getFilteredSegments().map((segment, originalIndex) => {
                      // Find the original index in the full array
                      const fullIndex = analysis.segmentsToRemove.findIndex(s => 
                        s.startTime === segment.startTime && s.endTime === segment.endTime
                      );
                      
                      return (
                        <div 
                          key={fullIndex} 
                          onClick={() => handleSegmentClick(fullIndex)}
                          className={`cursor-pointer transition-all duration-200 ${
                            selectedSegmentIndex === fullIndex 
                              ? 'ring-2 ring-gray-700 ring-offset-2 rounded-lg bg-gray-100/50' 
                              : 'hover:bg-gray-50/50 rounded-lg'
                          }`}
                        >
                          <SegmentCard
                            segment={segment}
                            onKeep={() => toggleSegmentState(fullIndex)}
                            onRemove={() => toggleSegmentState(fullIndex)}
                            onPreview={() => handleSegmentClick(fullIndex)}
                            isSelected={selectedSegmentIndex === fullIndex}
                          />
                        </div>
                      );
                    })}
                    
                    {getFilteredSegments().length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">No segments match current filters</p>
                        <p className="text-sm">Adjust your filter settings to see more segments</p>
                      </div>
                    )}
                  </div>
                  </CardContent>
                </Card>
              </div>

              {/* Video preview panel - right side - balanced size */}
              {showVideoPanel && (
                <div className="xl:col-span-5 mt-6 xl:mt-0">
                  <div className="bg-gray-50 rounded-lg p-4 h-fit lg:sticky lg:top-4 max-h-screen overflow-y-auto">
                    <h4 className="font-semibold mb-3 flex items-center justify-between">
                      <div className="flex items-center">
                        <Video className="w-4 h-4 mr-2" />
                        Video Preview
                      </div>
                      {videoOrientation && (
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          videoOrientation === 'vertical' ? 'bg-purple-100 text-purple-700' :
                          videoOrientation === 'horizontal' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {videoOrientation === 'vertical' ? '📱 Portrait' :
                           videoOrientation === 'horizontal' ? '💻 Landscape' :
                           '⏹️ Square'}
                        </span>
                      )}
                    </h4>
                    {selectedSegmentIndex !== null && videoUrl && (
                      <div className="space-y-3">
                        {/* Custom video timeline with cut markers */}
                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                            {(() => {
                              const segment = analysis.segmentsToRemove[selectedSegmentIndex];
                              const segStart = parseTime(segment.startTime);
                              const segEnd = parseTime(segment.endTime);
                              const prevStart = Math.max(0, segStart - 5);
                              const prevEnd = Math.min(videoDuration, segEnd + 5);
                              const prevDuration = prevEnd - prevStart;
                              
                              const cutStartPos = ((segStart - prevStart) / prevDuration) * 100;
                              const cutEndPos = ((segEnd - prevStart) / prevDuration) * 100;
                              const progressPos = ((currentTime - prevStart) / prevDuration) * 100;
                              
                              return (
                                <>
                                  {/* Preview range background */}
                                  <div className="absolute inset-0 bg-gray-600" />
                                  
                                  {/* Cut segment highlight */}
                                  <div 
                                    className="absolute h-full bg-red-500/30"
                                    style={{
                                      left: `${cutStartPos}%`,
                                      width: `${cutEndPos - cutStartPos}%`
                                    }}
                                  />
                                  
                                  {/* Progress bar */}
                                  <div 
                                    className="absolute h-full bg-blue-500 transition-all duration-100"
                                    style={{ width: `${Math.min(100, Math.max(0, progressPos))}%` }}
                                  />
                                  
                                  {/* Cut start marker */}
                                  <div 
                                    className="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-purple-500 rounded-full shadow-lg"
                                    style={{ left: `${cutStartPos}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                      Cut Start
                                    </div>
                                  </div>
                                  
                                  {/* Cut end marker */}
                                  <div 
                                    className="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-purple-500 rounded-full shadow-lg"
                                    style={{ left: `${cutEndPos}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                      Cut End
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                          
                          {/* Time labels */}
                          <div className="flex justify-between mt-2 text-xs text-gray-400">
                            <span>-5s</span>
                            <span className="text-purple-400 font-medium">Cut Region</span>
                            <span>+5s</span>
                          </div>
                        </div>
                        
                        <div className="relative bg-black rounded-lg overflow-hidden">
                          <video
                            ref={videoRef}
                            key={selectedSegmentIndex}
                            controls={false}
                            className="w-full h-auto max-h-96 object-contain"
                            style={{
                              aspectRatio: 'auto',
                              minHeight: '200px'
                            }}
                            preload="metadata"
                            onLoadedMetadata={(e) => {
                              const video = e.target as HTMLVideoElement;
                              const segment = analysis.segmentsToRemove[selectedSegmentIndex];
                              
                              // Set video duration
                              setVideoDuration(video.duration);
                              
                              // Calculate preview window boundaries
                              const segmentStart = parseTime(segment.startTime);
                              const segmentEnd = parseTime(segment.endTime);
                              const windowStart = Math.max(0, segmentStart - 5);
                              const windowEnd = Math.min(video.duration, segmentEnd + 5);
                              const windowDuration = windowEnd - windowStart;
                              
                              setPreviewStart(windowStart);
                              setPreviewEnd(windowEnd);
                              setPreviewDuration(windowDuration);
                              
                              // Detect video orientation and adjust container
                              const isVertical = video.videoHeight > video.videoWidth;
                              const aspectRatio = video.videoWidth / video.videoHeight;
                              const container = video.parentElement;
                              
                              if (container) {
                                let orientation: 'horizontal' | 'vertical' | 'square';
                                if (isVertical) {
                                  // Vertical video (portrait): limit width, center horizontally
                                  container.style.maxWidth = '280px';
                                  container.style.margin = '0 auto';
                                  container.setAttribute('data-orientation', 'vertical');
                                  orientation = 'vertical';
                                } else if (aspectRatio > 1.5) {
                                  // Wide horizontal video (landscape): full width
                                  container.style.maxWidth = '100%';
                                  container.style.margin = '0';
                                  container.setAttribute('data-orientation', 'horizontal');
                                  orientation = 'horizontal';
                                } else {
                                  // Square-ish video: moderate width
                                  container.style.maxWidth = '350px';
                                  container.style.margin = '0 auto';
                                  container.setAttribute('data-orientation', 'square');
                                  orientation = 'square';
                                }
                                setVideoOrientation(orientation);
                              }
                              
                              console.log(`Video dimensions: ${video.videoWidth}x${video.videoHeight}, aspect ratio: ${aspectRatio.toFixed(2)}, orientation: ${isVertical ? 'vertical' : 'horizontal'}`);
                              
                              // Start 5 seconds before the cut (or at 0 if too early)
                              const segStartTime = parseTime(segment.startTime);
                              const prevStartTime = Math.max(0, segStartTime - 5);
                              video.currentTime = prevStartTime;
                            }}
                            onTimeUpdate={(e) => {
                              const video = e.target as HTMLVideoElement;
                              setCurrentTime(video.currentTime);
                              
                              // Enforce preview window boundaries
                              if (video.currentTime < previewStart) {
                                video.currentTime = previewStart;
                              } else if (video.currentTime > previewEnd) {
                                video.pause();
                                setIsPlaying(false);
                                // Loop back to preview start
                                video.currentTime = previewStart;
                              }
                            }}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onError={(e) => {
                              console.error('Video playback error:', e);
                              const video = e.target as HTMLVideoElement;
                              const container = video.parentElement;
                              if (container) {
                                container.innerHTML = `
                                  <div class="flex items-center justify-center h-48 bg-gray-100 rounded-lg text-gray-500">
                                    <div class="text-center">
                                      <div class="text-lg mb-2">⚠️ Video Preview Unavailable</div>
                                      <div class="text-sm">This video format may not be supported for browser preview</div>
                                    </div>
                                  </div>
                                `;
                              }
                            }}
                          >
                            <source src={videoUrl} type={file?.type || 'video/mp4'} />
                            <source src={videoUrl} type="video/mp4" />
                            <source src={videoUrl} type="video/webm" />
                            <source src={videoUrl} type="video/quicktime" />
                            Your browser does not support the video tag or this video format.
                          </video>
                        </div>
                        
                        {/* Custom Preview Timeline */}
                        <div className="bg-gray-900 rounded-lg p-4 mb-3">
                          <div className="flex justify-between text-xs text-gray-400 mb-2">
                            <span>Preview Timeline</span>
                            <span>{Math.floor(previewDuration)}s window</span>
                          </div>
                          
                          {/* Custom timeline scrubber */}
                          <div 
                            ref={timelineRef}
                            className="relative h-6 bg-gray-700 rounded-full cursor-pointer"
                            onMouseDown={(e) => {
                              setIsDragging(true);
                              handleTimelineClick(e);
                            }}
                            onMouseMove={(e) => {
                              if (isDragging) {
                                handleTimelineClick(e);
                              }
                            }}
                            onMouseUp={() => setIsDragging(false)}
                            onMouseLeave={() => setIsDragging(false)}
                          >
                            {(() => {
                              if (previewDuration === 0) return null;
                              
                              const segment = analysis.segmentsToRemove[selectedSegmentIndex];
                              const segmentStartTime = parseTime(segment.startTime);
                              const segmentEndTime = parseTime(segment.endTime);
                              
                              // Calculate positions relative to preview window
                              const cutStartPos = ((segmentStartTime - previewStart) / previewDuration) * 100;
                              const cutEndPos = ((segmentEndTime - previewStart) / previewDuration) * 100;
                              const currentPos = ((currentTime - previewStart) / previewDuration) * 100;
                              
                              return (
                                <>
                                  {/* Context areas (what will remain) */}
                                  <div className="absolute inset-0 bg-green-500/20 rounded-full" />
                                  
                                  {/* Cut segment highlight */}
                                  <div 
                                    className="absolute h-full bg-red-500/40 rounded-full"
                                    style={{
                                      left: `${Math.max(0, cutStartPos)}%`,
                                      width: `${Math.min(100, cutEndPos) - Math.max(0, cutStartPos)}%`
                                    }}
                                  />
                                  
                                  {/* Progress indicator */}
                                  <div 
                                    className="absolute h-full bg-blue-500 rounded-full transition-all duration-100"
                                    style={{ width: `${Math.min(100, Math.max(0, currentPos))}%` }}
                                  />
                                  
                                  {/* Cut markers */}
                                  {cutStartPos >= 0 && cutStartPos <= 100 && (
                                    <div 
                                      className="absolute top-0 w-1 h-full bg-purple-500 rounded-full"
                                      style={{ left: `${cutStartPos}%`, transform: 'translateX(-50%)' }}
                                    />
                                  )}
                                  
                                  {cutEndPos >= 0 && cutEndPos <= 100 && (
                                    <div 
                                      className="absolute top-0 w-1 h-full bg-purple-500 rounded-full"
                                      style={{ left: `${cutEndPos}%`, transform: 'translateX(-50%)' }}
                                    />
                                  )}
                                  
                                  {/* Playhead */}
                                  <div 
                                    className="absolute top-1/2 w-3 h-3 bg-white border-2 border-blue-500 rounded-full transform -translate-y-1/2 shadow-lg"
                                    style={{ left: `${Math.min(100, Math.max(0, currentPos))}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                                  />
                                </>
                              );
                            })()}
                          </div>
                          
                          {/* Time display */}
                          <div className="flex justify-between mt-2 text-xs">
                            <span className="text-gray-400">
                              {Math.max(0, Math.floor(currentTime - previewStart))}s
                            </span>
                            <div className="flex space-x-4 text-gray-500">
                              <span>Context</span>
                              <span className="text-purple-400">Cut</span>
                              <span>Context</span>
                            </div>
                            <span className="text-gray-400">
                              {Math.floor(previewDuration)}s
                            </span>
                          </div>
                        </div>
                        
                        {/* Custom playback controls */}
                        <div className="flex items-center space-x-2 mb-3">
                          <button
                            onClick={() => {
                              if (videoRef.current) {
                                videoRef.current.currentTime = previewStart;
                                videoRef.current.play();
                              }
                            }}
                            className="flex items-center px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Play Preview
                          </button>
                          
                          <button
                            onClick={() => {
                              if (videoRef.current) {
                                if (isPlaying) {
                                  videoRef.current.pause();
                                } else {
                                  videoRef.current.play();
                                }
                              }
                            }}
                            className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                          >
                            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                          
                          <button
                            onClick={() => {
                              if (videoRef.current) {
                                videoRef.current.currentTime = previewStart;
                              }
                            }}
                            className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                            title="Restart preview"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="text-sm space-y-2">
                          {/* Preview window info */}
                          <div className="bg-gray-800 rounded-lg p-3 mb-2">
                            <div className="text-xs text-gray-400 mb-1">Preview Window</div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                <span className="text-green-400 text-xs">5s before</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-purple-500 rounded-full" />
                                <span className="text-purple-400 text-xs font-medium">CUT</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-green-400 text-xs">5s after</span>
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Cut Region:</span>
                            <span className="font-medium text-purple-600">
                              {analysis.segmentsToRemove[selectedSegmentIndex].startTime} - 
                              {analysis.segmentsToRemove[selectedSegmentIndex].endTime}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Duration:</span>
                            <span className="font-medium">
                              {analysis.segmentsToRemove[selectedSegmentIndex].duration}s
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Format:</span>
                            <span className="font-medium text-xs">
                              {file?.type?.split('/')[1]?.toUpperCase() || 'MP4'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Status:</span>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              segmentStates.get(selectedSegmentIndex)
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {segmentStates.get(selectedSegmentIndex) ? 'Will Keep' : 'Will Remove'}
                            </span>
                          </div>
                          <div className="pt-2 border-t">
                            <p className="text-gray-600 text-xs">
                              {analysis.segmentsToRemove[selectedSegmentIndex].reason}
                            </p>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => toggleSegmentState(selectedSegmentIndex)}
                          className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                            segmentStates.get(selectedSegmentIndex)
                              ? 'bg-red-500 text-white hover:bg-red-600'
                              : 'bg-green-500 text-white hover:bg-green-600'
                          }`}
                        >
                          {segmentStates.get(selectedSegmentIndex) ? 'Mark for Removal' : 'Keep This Segment'}
                        </button>
                        
                        <div className="mt-4 pt-3 border-t text-xs text-gray-500">
                          <div className="font-medium mb-2">Keyboard Shortcuts:</div>
                          <div className="grid grid-cols-2 gap-1">
                            <div>↑/↓ Navigate</div>
                            <div>Space Toggle</div>
                            <div>←/→ Navigate</div>
                            <div>Esc Close</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </main>
  );
}
