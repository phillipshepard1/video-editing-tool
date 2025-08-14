'use client';

import { useState, useEffect, useRef } from 'react';
import { VideoUploader } from '@/components/video-uploader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkflowManagerV2 } from '@/components/WorkflowManagerV2';
import { FilterPanel } from '@/components/FilterPanel';
import { SegmentCard } from '@/components/SegmentCard';
import { Loader2, Download, Video, Clock, Scissors, CheckCircle, Upload, Cpu, Brain, Play, Pause, RotateCcw, X, FileCode, FileText, Film, AlertTriangle, Info, SkipBack, SkipForward } from 'lucide-react';
import { formatTime, formatFileSize } from '@/lib/utils';
import { EnhancedSegment, FilterState, createDefaultFilterState, SegmentCategory } from '@/lib/types/segments';
import { needsCompression, compressVideoForAnalysis } from '@/lib/video-compression';
import { generateFCPXML, generateEDL, generatePremiereXML, downloadFile } from '@/lib/export-formats';
import AuthenticatedLayout from '@/components/AuthenticatedLayout';

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
  // Core state
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedSegment, setSelectedSegment] = useState<EnhancedSegment | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null!);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  // Video playback state
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState<'horizontal' | 'vertical' | 'square' | null>(null);
  
  // Preview window state
  const [previewStart, setPreviewStart] = useState(0);
  const [previewEnd, setPreviewEnd] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  
  // Filter state
  const [filterState, setFilterState] = useState<FilterState>(createDefaultFilterState());
  const [visibleSegments, setVisibleSegments] = useState<EnhancedSegment[]>([]);
  const [overrideStates, setOverrideStates] = useState<Record<string, 'include' | 'exclude'>>({});

  // Create video URL when file changes
  useEffect(() => {
    if (file) {
      let url: string;
      
      // For MOV files, try to improve browser compatibility
      if (file.name.toLowerCase().endsWith('.mov')) {
        // Create a new blob with MP4 MIME type for better browser support
        const mp4Blob = new Blob([file], { type: 'video/mp4' });
        url = URL.createObjectURL(mp4Blob);
        console.log('Created MOV video URL with MP4 MIME type');
      } else {
        url = URL.createObjectURL(file);
      }
      
      setVideoUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setVideoUrl(null);
    }
  }, [file]);

  // Upload and analyze video using original Gemini API approach
  const handleUploadAndAnalyze = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);
    setAnalysisProgress(0);

    try {
      // Check if compression is needed
      let videoToUpload = file;
      if (needsCompression(file)) {
        setUploadProgress(10);
        console.log('Compressing video before upload...');
        const compressedBlob = await compressVideoForAnalysis(file);
        videoToUpload = new File([compressedBlob], file.name, { type: 'video/mp4' });
        console.log(`Compressed from ${formatFileSize(file.size)} to ${formatFileSize(videoToUpload.size)}`);
      }

      // Upload to Gemini with real progress tracking
      setUploadProgress(20);
      const formData = new FormData();
      formData.append('file', videoToUpload);

      // Upload with simulated progress since Next.js buffers the entire request
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        const fileSizeMB = videoToUpload.size / 1024 / 1024;
        console.log(`Starting upload of ${fileSizeMB.toFixed(1)} MB file`);
        
        // Estimate upload time based on file size (assuming ~10 MB/s average speed)
        const estimatedSeconds = Math.max(5, fileSizeMB / 10);
        const startTime = Date.now();
        let progressInterval: NodeJS.Timeout;
        
        // Simulate smooth progress based on estimated time
        const simulateProgress = () => {
          progressInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed / estimatedSeconds, 0.95); // Cap at 95%
            const adjustedProgress = 20 + (progress * 65); // 20% to 85%
            setUploadProgress(Math.round(adjustedProgress));
            
            if (progress >= 0.95) {
              clearInterval(progressInterval);
            }
          }, 100); // Update every 100ms for smooth animation
        };
        
        // Start simulated progress
        simulateProgress();
        
        xhr.addEventListener('load', () => {
          clearInterval(progressInterval);
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText);
              setUploadProgress(85); // Set to 85% when upload completes
              resolve(result);
            } catch (err) {
              reject(new Error('Failed to parse upload response'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.error || 'Upload failed'));
            } catch {
              reject(new Error('Upload failed'));
            }
          }
        });
        
        xhr.addEventListener('error', () => {
          clearInterval(progressInterval);
          reject(new Error('Network error during upload'));
        });
        
        xhr.open('POST', '/api/analysis/upload');
        xhr.send(formData);
      });
      
      setUploadProgress(85);

      // Analyze with Gemini
      setIsUploading(false);
      setIsAnalyzing(true);
      setAnalysisProgress(10);

      const analyzeResponse = await fetch('/api/analysis/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileUri: uploadResult.fileUri,
          prompt: 'Analyze for pauses, filler words, and content that can be removed',
          fileSize: Math.round(videoToUpload.size / (1024 * 1024)), // Size in MB
        }),
      });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const analyzeResult = await analyzeResponse.json();
      setAnalysisProgress(100);

      // Process results
      const enhancedSegments: EnhancedSegment[] = analyzeResult.analysis.segmentsToRemove.map((seg: any, index: number) => ({
        ...seg,
        id: `segment-${index}`,
        selected: true,
      }));

      setAnalysis({
        segmentsToRemove: enhancedSegments,
        summary: analyzeResult.analysis.summary,
      });
      setVisibleSegments(enhancedSegments);

    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  // Filter segments based on filter state
  useEffect(() => {
    if (!analysis) return;

    const filtered = analysis.segmentsToRemove.filter(segment => {
      // Map old category format to new enum values
      let mappedCategory: SegmentCategory | null = null;
      
      if (segment.category === 'pause') mappedCategory = SegmentCategory.PAUSE;
      else if (segment.category === 'filler') mappedCategory = SegmentCategory.FILLER_WORDS;
      else if (segment.category === 'redundant' || segment.category === 'redundancy') mappedCategory = SegmentCategory.REDUNDANT;
      else if (segment.category === 'off-topic' || segment.category === 'off_topic') mappedCategory = SegmentCategory.TANGENT;
      else if (segment.category === 'technical') mappedCategory = SegmentCategory.TECHNICAL;
      else if (segment.category === 'dead_air') mappedCategory = SegmentCategory.PAUSE; // Map dead_air to pause
      
      // If we couldn't map the category, default to showing it
      if (!mappedCategory) return true;
      
      // Category filter - check if this category is enabled
      if (!filterState[mappedCategory]) return false;
      
      // High severity only filter
      if (filterState.showOnlyHighSeverity && segment.severity !== 'high') return false;
      
      // Confidence filter
      if (segment.confidence < filterState.minConfidence) return false;
      
      return true;
    });

    setVisibleSegments(filtered);
  }, [filterState, analysis]);

  const handleReset = () => {
    setFile(null);
    setVideoUrl(null);
    setAnalysis(null);
    setError(null);
    setUploadProgress(0);
    setAnalysisProgress(0);
    setFilterState(createDefaultFilterState());
    setOverrideStates({});
    setSelectedSegment(null);
    setSelectedSegmentIndex(null);
    setVideoDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setPreviewStart(0);
    setPreviewEnd(0);
    setPreviewDuration(0);
  };

  const handleExport = (format: 'edl' | 'fcpxml' | 'premiere') => {
    if (!analysis || !file) return;

    const selectedSegments = visibleSegments.filter(seg => 
      overrideStates[seg.id] === 'exclude' || 
      (overrideStates[seg.id] !== 'include' && seg.selected)
    );

    let content: string;
    let filename: string;
    let mimeType: string;

    switch (format) {
      case 'edl':
        content = generateEDL(selectedSegments, analysis.summary.originalDuration, file.name);
        filename = `${file.name.replace(/\.[^/.]+$/, '')}_cuts.edl`;
        mimeType = 'text/plain';
        break;
      case 'fcpxml':
        content = generateFCPXML(selectedSegments, analysis.summary.originalDuration, file.name);
        filename = `${file.name.replace(/\.[^/.]+$/, '')}_cuts.fcpxml`;
        mimeType = 'application/xml';
        break;
      case 'premiere':
        content = generatePremiereXML(selectedSegments, analysis.summary.originalDuration, file.name);
        filename = `${file.name.replace(/\.[^/.]+$/, '')}_cuts.xml`;
        mimeType = 'application/xml';
        break;
      default:
        return;
    }

    downloadFile(content, filename, mimeType);
  };

  // Parse time string to seconds
  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':').map(p => parseFloat(p));
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  // Jump to segment in video with context window
  const jumpToSegment = (segment: EnhancedSegment, index: number) => {
    setSelectedSegment(segment);
    setSelectedSegmentIndex(index);
    
    if (videoRef.current) {
      const segmentStart = parseTimeToSeconds(segment.startTime);
      const segmentEnd = parseTimeToSeconds(segment.endTime);
      
      // Calculate preview window (5 seconds before and after)
      const windowStart = Math.max(0, segmentStart - 5);
      const windowEnd = Math.min(videoDuration || segmentEnd + 10, segmentEnd + 5);
      const windowDuration = windowEnd - windowStart;
      
      setPreviewStart(windowStart);
      setPreviewEnd(windowEnd);
      setPreviewDuration(windowDuration);
      
      // Jump to 5 seconds before the segment (or start if less than 5 seconds)
      videoRef.current.currentTime = windowStart;
    }
  };

  // Handle timeline click for scrubbing
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = previewStart + (percentage * previewDuration);
    
    videoRef.current.currentTime = Math.max(previewStart, Math.min(previewEnd, newTime));
  };

  // Play/Pause toggle with promise handling
  const togglePlayPause = async () => {
    console.log('togglePlayPause called');
    console.log('videoRef.current:', videoRef.current);
    console.log('video paused:', videoRef.current?.paused);
    
    if (!videoRef.current) {
      console.error('No video ref available');
      return;
    }
    
    try {
      if (videoRef.current.paused) {
        console.log('Attempting to play video');
        await videoRef.current.play();
        setIsPlaying(true);
      } else {
        console.log('Attempting to pause video');
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } catch (err) {
      // Ignore interruption errors - they're harmless
      if (err instanceof Error && !err.message.includes('interrupted')) {
        console.error('Playback error:', err);
      }
    }
  };

  // Jump to previous segment
  const jumpToPreviousSegment = () => {
    if (!visibleSegments.length || selectedSegmentIndex === null) return;
    
    // Find current segment in visible segments
    const currentVisibleIndex = visibleSegments.findIndex(s => 
      analysis?.segmentsToRemove[selectedSegmentIndex]?.id === s.id
    );
    
    if (currentVisibleIndex > 0) {
      const prevSegment = visibleSegments[currentVisibleIndex - 1];
      const fullIndex = analysis!.segmentsToRemove.findIndex(s => s.id === prevSegment.id);
      jumpToSegment(prevSegment, fullIndex);
    }
  };

  // Jump to next segment
  const jumpToNextSegment = () => {
    if (!visibleSegments.length || selectedSegmentIndex === null) return;
    
    // Find current segment in visible segments
    const currentVisibleIndex = visibleSegments.findIndex(s => 
      analysis?.segmentsToRemove[selectedSegmentIndex]?.id === s.id
    );
    
    if (currentVisibleIndex >= 0 && currentVisibleIndex < visibleSegments.length - 1) {
      const nextSegment = visibleSegments[currentVisibleIndex + 1];
      const fullIndex = analysis!.segmentsToRemove.findIndex(s => s.id === nextSegment.id);
      jumpToSegment(nextSegment, fullIndex);
    }
  };

  return (
    <AuthenticatedLayout>
      <main className="min-h-screen bg-gray-50 text-gray-800">
        <div className="container mx-auto py-8 px-4 max-w-[1600px]">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-green-700 mb-2">
            AI VIDEO ANALYSIS
          </h1>
          <p className="text-gray-700">
            Upload video for Gemini AI analysis to identify content that can be removed
          </p>
        </div>

        {!analysis && (
          <div className="bg-white border border-gray-300 rounded-lg p-8">
            <VideoUploader 
              onFileSelect={setFile}
              isUploading={isUploading || isAnalyzing}
            />

            {file && !isUploading && !isAnalyzing && (
              <div className="mt-6">
                <Button 
                  onClick={handleUploadAndAnalyze}
                  className="w-full"
                  size="lg"
                >
                  <Video className="mr-2" />
                  Upload & Analyze with Gemini
                </Button>
              </div>
            )}

            {(isUploading || isAnalyzing) && (
              <div className="mt-6 space-y-4">
                {isUploading && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Uploading to Gemini...</span>
                      <span className="text-sm text-gray-500">{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                )}
                
                {isAnalyzing && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Analyzing with Gemini AI...</span>
                      <span className="text-sm text-gray-500">{analysisProgress}%</span>
                    </div>
                    <Progress value={analysisProgress} className="h-2" />
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
          <WorkflowManagerV2
            segments={analysis.segmentsToRemove}
            videoUrl={videoUrl}
            videoDuration={videoDuration}
            onExport={(format, segmentsToRemove) => {
              if (format === 'edl') {
                const content = generateEDL(segmentsToRemove, videoDuration, file?.name || 'video.mp4');
                downloadFile(content, `${file?.name || 'video'}_edit.edl`, 'text/plain');
              } else if (format === 'fcpxml') {
                const content = generateFCPXML(segmentsToRemove, videoDuration, file?.name || 'video.mp4');
                downloadFile(content, `${file?.name || 'video'}_edit.fcpxml`, 'application/xml');
              } else if (format === 'premiere') {
                const content = generatePremiereXML(segmentsToRemove, videoDuration, file?.name || 'video.mp4');
                downloadFile(content, `${file?.name || 'video'}_edit.xml`, 'application/xml');
              }
            }}
            onNewAnalysis={handleReset}
            originalDuration={analysis.summary.originalDuration}
            videoRef={videoRef}
            onSegmentSelect={setSelectedSegment}
          />
        )}
      </div>
      </main>
    </AuthenticatedLayout>
  );
}