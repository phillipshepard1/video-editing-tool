'use client';

import { useState, useEffect, useRef } from 'react';
import { VideoUploader } from '@/components/video-uploader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkflowManager } from '@/components/WorkflowManager';
import { FilterPanel } from '@/components/FilterPanel';
import { SegmentCard } from '@/components/SegmentCard';
import { Loader2, Download, Video, Clock, Scissors, CheckCircle, Upload, Cpu, Brain, Play, Pause, RotateCcw, X, FileCode, FileText, Film, AlertTriangle, Info, SkipBack, SkipForward } from 'lucide-react';
import { formatTime, formatFileSize } from '@/lib/utils';
import { EnhancedSegment, FilterState, createDefaultFilterState, SegmentCategory } from '@/lib/types/segments';
import { needsCompression, compressVideoForAnalysis } from '@/lib/video-compression';
import { generateFCPXML, generateEDL, generatePremiereXML, downloadFile } from '@/lib/export-formats';

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
  const videoRef = useRef<HTMLVideoElement>(null);
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
        content = generateEDL(selectedSegments, file.name, analysis.summary.originalDuration);
        filename = `${file.name.replace(/\.[^/.]+$/, '')}_cuts.edl`;
        mimeType = 'text/plain';
        break;
      case 'fcpxml':
        content = generateFCPXML(selectedSegments, file.name, analysis.summary.originalDuration);
        filename = `${file.name.replace(/\.[^/.]+$/, '')}_cuts.fcpxml`;
        mimeType = 'application/xml';
        break;
      case 'premiere':
        content = generatePremiereXML(selectedSegments, file.name, analysis.summary.originalDuration);
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
          <div className="space-y-6">
            {/* Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Analysis Complete</span>
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    New Analysis
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Original Duration</p>
                    <p className="text-xl font-semibold">{formatTime(analysis.summary.originalDuration)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Final Duration</p>
                    <p className="text-xl font-semibold">{formatTime(analysis.summary.finalDuration)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Time Removed</p>
                    <p className="text-xl font-semibold text-red-600">{formatTime(analysis.summary.timeRemoved)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Segments Found</p>
                    <p className="text-xl font-semibold">{analysis.summary.segmentCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Export Options */}
            <Card>
              <CardHeader>
                <CardTitle>Export Options</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => handleExport('edl')} variant="outline">
                    <FileText className="w-4 h-4 mr-2" />
                    Export EDL
                  </Button>
                  <Button onClick={() => handleExport('fcpxml')} variant="outline">
                    <FileCode className="w-4 h-4 mr-2" />
                    Export FCPXML
                  </Button>
                  <Button onClick={() => handleExport('premiere')} variant="outline">
                    <Film className="w-4 h-4 mr-2" />
                    Export Premiere XML
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Three Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column - Filter Panel */}
              <div className="lg:col-span-3">
                <div className="sticky top-4">
                  <FilterPanel 
                    segments={analysis.segmentsToRemove}
                    filterState={filterState}
                    onFilterChange={setFilterState}
                    onBulkAction={(category, action) => {
                      // Handle bulk actions for segments
                      const updatedOverrides = { ...overrideStates };
                      analysis.segmentsToRemove.forEach(segment => {
                        if (segment.category === category) {
                          if (action === 'keep') {
                            updatedOverrides[segment.id] = 'include';
                          } else {
                            updatedOverrides[segment.id] = 'exclude';
                          }
                        }
                      });
                      setOverrideStates(updatedOverrides);
                    }}
                  />
                </div>
              </div>

              {/* Center Column - Segments List */}
              <div className="lg:col-span-5">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>
                      Segments to Remove ({visibleSegments.length} of {analysis.segmentsToRemove.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[600px] overflow-y-auto">
                    {visibleSegments.length === 0 ? (
                      <div className="py-8 text-center text-gray-500">
                        No segments match the current filters
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {visibleSegments.map((segment, index) => {
                          const fullIndex = analysis.segmentsToRemove.findIndex(s => s.id === segment.id);
                          return (
                            <div
                              key={segment.id}
                              className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                                selectedSegmentIndex === fullIndex 
                                  ? 'border-blue-500 bg-blue-50' 
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => jumpToSegment(segment, fullIndex)}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium">
                                      {segment.startTime} - {segment.endTime}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      ({segment.duration}s)
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600">{segment.reason}</p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className={`text-xs px-2 py-1 rounded ${
                                      segment.category === 'pause' || segment.category === 'dead_air' ? 'bg-blue-100 text-blue-700' :
                                      segment.category === 'filler' ? 'bg-yellow-100 text-yellow-700' :
                                      segment.category === 'technical' ? 'bg-red-100 text-red-700' :
                                      segment.category === 'off_topic' || segment.category === 'off-topic' ? 'bg-purple-100 text-purple-700' :
                                      segment.category === 'redundancy' || segment.category === 'redundant' ? 'bg-orange-100 text-orange-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {segment.category}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {Math.round(segment.confidence * 100)}% confidence
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant={overrideStates[segment.id] === 'include' ? 'default' : 'outline'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOverrideStates(prev => ({
                                        ...prev,
                                        [segment.id]: prev[segment.id] === 'include' ? 'exclude' : 'include'
                                      }));
                                    }}
                                  >
                                    {overrideStates[segment.id] === 'include' ? 'Keep' : 'Remove'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Video Preview with Context */}
              <div className="lg:col-span-4">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Video Preview</span>
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
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {file && (
                      <div className="space-y-4">
                        {/* Context Timeline - Top */}
                        {selectedSegment && (
                          <div className="bg-gray-900 rounded-lg p-3">
                            <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                              {(() => {
                                const segStart = parseTimeToSeconds(selectedSegment.startTime);
                                const segEnd = parseTimeToSeconds(selectedSegment.endTime);
                                
                                const cutStartPos = ((segStart - previewStart) / previewDuration) * 100;
                                const cutEndPos = ((segEnd - previewStart) / previewDuration) * 100;
                                const progressPos = ((currentTime - previewStart) / previewDuration) * 100;
                                
                                return (
                                  <>
                                    {/* Preview range background (what remains) */}
                                    <div className="absolute inset-0 bg-green-500/20" />
                                    
                                    {/* Cut segment highlight (what will be removed) */}
                                    <div 
                                      className="absolute h-full bg-red-500/40"
                                      style={{
                                        left: `${Math.max(0, cutStartPos)}%`,
                                        width: `${Math.min(100, cutEndPos) - Math.max(0, cutStartPos)}%`
                                      }}
                                    />
                                    
                                    {/* Progress bar */}
                                    <div 
                                      className="absolute h-full bg-blue-500 transition-all duration-100"
                                      style={{ width: `${Math.min(100, Math.max(0, progressPos))}%` }}
                                    />
                                    
                                    {/* Cut start marker */}
                                    {cutStartPos >= 0 && cutStartPos <= 100 && (
                                      <div 
                                        className="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-purple-500 rounded-full shadow-lg"
                                        style={{ left: `${cutStartPos}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                                      >
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                          Cut Start
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Cut end marker */}
                                    {cutEndPos >= 0 && cutEndPos <= 100 && (
                                      <div 
                                        className="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-purple-500 rounded-full shadow-lg"
                                        style={{ left: `${cutEndPos}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                                      >
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                          Cut End
                                        </div>
                                      </div>
                                    )}
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
                        )}

                        {/* Video Player */}
                        <div className="relative bg-black rounded-lg overflow-hidden">
                          <video
                            ref={videoRef}
                            controls={false}
                            className="w-full h-auto max-h-96 object-contain"
                            style={{
                              aspectRatio: 'auto',
                              minHeight: '200px'
                            }}
                            preload="metadata"
                            playsInline
                            muted={false}
                            onLoadedMetadata={(e) => {
                              const video = e.target as HTMLVideoElement;
                              setVideoDuration(video.duration);
                              
                              // Detect video orientation
                              const isVertical = video.videoHeight > video.videoWidth;
                              const aspectRatio = video.videoWidth / video.videoHeight;
                              const container = video.parentElement;
                              
                              if (container) {
                                let orientation: 'horizontal' | 'vertical' | 'square';
                                if (isVertical) {
                                  container.style.maxWidth = '280px';
                                  container.style.margin = '0 auto';
                                  orientation = 'vertical';
                                } else if (aspectRatio > 1.5) {
                                  container.style.maxWidth = '100%';
                                  container.style.margin = '0';
                                  orientation = 'horizontal';
                                } else {
                                  container.style.maxWidth = '350px';
                                  container.style.margin = '0 auto';
                                  orientation = 'square';
                                }
                                setVideoOrientation(orientation);
                              }
                              
                              // If we have a selected segment, jump to its preview window
                              if (selectedSegment) {
                                const segStart = parseTimeToSeconds(selectedSegment.startTime);
                                const windowStart = Math.max(0, segStart - 5);
                                video.currentTime = windowStart;
                              }
                            }}
                            onTimeUpdate={(e) => {
                              const video = e.target as HTMLVideoElement;
                              setCurrentTime(video.currentTime);
                              
                              // Enforce preview window boundaries
                              if (selectedSegment && previewEnd > 0) {
                                if (video.currentTime < previewStart) {
                                  video.currentTime = previewStart;
                                } else if (video.currentTime > previewEnd) {
                                  video.pause();
                                  setIsPlaying(false);
                                  // Loop back to preview start
                                  video.currentTime = previewStart;
                                }
                              }
                            }}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onError={(e) => {
                              const video = e.target as HTMLVideoElement;
                              console.error('Video playback error:', video.error);
                              console.error('Error code:', video.error?.code);
                              console.error('Error message:', video.error?.message);
                              console.error('File type:', file?.type);
                              console.error('File name:', file?.name);
                            }}
                            onCanPlay={() => {
                              console.log('Video can play - ready for playback');
                              console.log('Video codec info:', videoRef.current?.canPlayType('video/quicktime'));
                            }}
                          >
                            {videoUrl && (
                              <source 
                                src={videoUrl} 
                                type={file?.name.toLowerCase().endsWith('.mov') ? 'video/mp4' : (file?.type || 'video/mp4')} 
                              />
                            )}
                          </video>
                        </div>

                        {/* Custom Timeline Scrubber */}
                        {selectedSegment && (
                          <div className="bg-gray-900 rounded-lg p-4">
                            <div className="flex justify-between text-xs text-gray-400 mb-2">
                              <span>Preview Timeline</span>
                              <span>{Math.floor(previewDuration)}s window</span>
                            </div>
                            
                            {/* Timeline scrubber */}
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
                                
                                const segmentStartTime = parseTimeToSeconds(selectedSegment.startTime);
                                const segmentEndTime = parseTimeToSeconds(selectedSegment.endTime);
                                
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
                                {formatTime(Math.max(0, currentTime - previewStart))}
                              </span>
                              <span className="text-white">
                                {formatTime(currentTime)} / {formatTime(videoDuration)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Current Segment Info */}
                        {selectedSegment && (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm font-medium text-blue-900 mb-1">
                              Current Segment
                            </p>
                            <p className="text-sm text-blue-700">
                              {selectedSegment.startTime} - {selectedSegment.endTime} ({selectedSegment.duration}s)
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                              {selectedSegment.reason}
                            </p>
                          </div>
                        )}

                        {/* Playback Controls */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Playback Controls</p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={jumpToPreviousSegment}
                              disabled={!selectedSegment || !visibleSegments.length || 
                                visibleSegments.findIndex(s => s.id === selectedSegment.id) <= 0}
                            >
                              <SkipBack className="w-4 h-4 mr-1" />
                              Previous
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={togglePlayPause}
                              disabled={!selectedSegment}
                            >
                              {isPlaying ? (
                                <>
                                  <Pause className="w-4 h-4 mr-1" />
                                  Pause
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4 mr-1" />
                                  Play
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={jumpToNextSegment}
                              disabled={!selectedSegment || !visibleSegments.length ||
                                visibleSegments.findIndex(s => s.id === selectedSegment.id) >= visibleSegments.length - 1}
                            >
                              <SkipForward className="w-4 h-4 mr-1" />
                              Next
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (videoRef.current && selectedSegment) {
                                  const segStart = parseTimeToSeconds(selectedSegment.startTime);
                                  const windowStart = Math.max(0, segStart - 5);
                                  videoRef.current.currentTime = windowStart;
                                }
                              }}
                              disabled={!selectedSegment}
                            >
                              <RotateCcw className="w-4 h-4 mr-1" />
                              Restart
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}