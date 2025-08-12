'use client';

import { useState, useEffect, useRef } from 'react';
import { VideoUploader } from '@/components/video-uploader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Download, Video, Clock, Scissors, CheckCircle, Upload, Cpu, Brain, Play, Pause, RotateCcw } from 'lucide-react';
import { formatTime, formatFileSize } from '@/lib/utils';

interface AnalysisResult {
  segmentsToRemove: Array<{
    startTime: string;
    endTime: string;
    duration: number;
    reason: string;
    category: string;
    confidence: number;
  }>;
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

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [targetDuration, setTargetDuration] = useState<number | undefined>();
  
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
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setStage('uploading');
    setStageProgress(0);
    setStatusMessage('Preparing upload...');
    setStartTime(Date.now());
    setElapsedTime(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simulate upload progress
      setStageProgress(20);
      setStatusMessage('Uploading video to Gemini...');

      const response = await fetch('/api/analysis/upload', {
        method: 'POST',
        body: formData,
      });

      setStageProgress(60);
      setStage('processing');
      setStatusMessage('Video uploaded, waiting for processing...');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      setFileUri(result.fileUri);
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
      // Simulate analysis progress
      setTimeout(() => {
        setStageProgress(30);
        setStatusMessage('Analyzing video content...');
      }, 500);

      setTimeout(() => {
        setStageProgress(60);
        setStatusMessage('Identifying segments to remove...');
      }, 1500);

      const response = await fetch('/api/analysis/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileUri: uri,
          prompt: customPrompt,
          targetDuration: targetDuration,
        }),
      });

      setStageProgress(90);
      setStatusMessage('Finalizing analysis results...');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Analysis failed');
      }

      const result = await response.json();
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
    return analysis.segmentsToRemove.filter((_, index) => {
      // If state is true, keep the segment (don't remove it)
      // If state is false or undefined, remove it (default behavior)
      return !segmentStates.get(index);
    });
  };

  // Handle timeline clicking/dragging for preview window
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
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            AI Video Analysis Tool
          </h1>
          <p className="text-lg text-gray-600">
            Upload your video and let AI identify segments to remove
          </p>
        </div>

        {!analysis && (
          <div className="bg-white rounded-lg shadow-md p-8">
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
                {/* Main progress indicator */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">Processing Progress</h3>
                    <span className="text-sm text-gray-500">
                      {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')} elapsed
                    </span>
                  </div>
                  
                  {/* Overall progress bar */}
                  <div className="space-y-2">
                    <Progress 
                      value={
                        stage === 'uploading' ? stageProgress * 0.3 :
                        stage === 'processing' ? 30 + (stageProgress * 0.3) :
                        stage === 'analyzing' ? 60 + (stageProgress * 0.4) :
                        100
                      } 
                      className="w-full h-3" 
                    />
                    <p className="text-center text-sm font-medium text-gray-700">
                      {statusMessage}
                    </p>
                  </div>

                  {/* Stage indicators */}
                  <div className="grid grid-cols-3 gap-4">
                    {/* Upload Stage */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        {stage === 'uploading' ? (
                          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                        ) : stage === 'idle' ? (
                          <Upload className="h-5 w-5 text-gray-400" />
                        ) : (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                        <span className={`text-sm font-medium ${
                          stage === 'uploading' ? 'text-blue-600' : 
                          stage === 'idle' ? 'text-gray-400' : 'text-gray-700'
                        }`}>
                          Upload
                        </span>
                      </div>
                      {stage === 'uploading' && (
                        <Progress value={stageProgress} className="w-full h-2" />
                      )}
                    </div>

                    {/* Processing Stage */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        {stage === 'processing' ? (
                          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                        ) : stage === 'uploading' || stage === 'idle' ? (
                          <Cpu className="h-5 w-5 text-gray-400" />
                        ) : (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                        <span className={`text-sm font-medium ${
                          stage === 'processing' ? 'text-blue-600' : 
                          (stage === 'uploading' || stage === 'idle') ? 'text-gray-400' : 'text-gray-700'
                        }`}>
                          Processing
                        </span>
                      </div>
                      {stage === 'processing' && (
                        <Progress value={stageProgress} className="w-full h-2" />
                      )}
                    </div>

                    {/* Analysis Stage */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        {stage === 'analyzing' ? (
                          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                        ) : stage === 'complete' ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <Brain className="h-5 w-5 text-gray-400" />
                        )}
                        <span className={`text-sm font-medium ${
                          stage === 'analyzing' ? 'text-blue-600' : 
                          stage === 'complete' ? 'text-gray-700' : 'text-gray-400'
                        }`}>
                          Analysis
                        </span>
                      </div>
                      {stage === 'analyzing' && (
                        <Progress value={stageProgress} className="w-full h-2" />
                      )}
                    </div>
                  </div>

                  {/* File info */}
                  {file && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
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
            <div className="bg-white rounded-lg shadow-md p-8">
              <h2 className="text-2xl font-bold mb-4">Analysis Results</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center text-gray-600 mb-1">
                    <Clock className="w-4 h-4 mr-1" />
                    <span className="text-sm">Original</span>
                  </div>
                  <p className="text-xl font-semibold">
                    {formatTime(analysis.summary.originalDuration)}
                  </p>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center text-green-600 mb-1">
                    <Clock className="w-4 h-4 mr-1" />
                    <span className="text-sm">Final</span>
                  </div>
                  <p className="text-xl font-semibold text-green-700">
                    {formatTime(analysis.summary.originalDuration - getFilteredSegments().reduce((total, segment) => total + segment.duration, 0))}
                  </p>
                </div>
                
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="flex items-center text-red-600 mb-1">
                    <Scissors className="w-4 h-4 mr-1" />
                    <span className="text-sm">Removed</span>
                  </div>
                  <p className="text-xl font-semibold text-red-700">
                    {formatTime(getFilteredSegments().reduce((total, segment) => total + segment.duration, 0))}
                  </p>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center text-blue-600 mb-1">
                    <Scissors className="w-4 h-4 mr-1" />
                    <span className="text-sm">Cuts</span>
                  </div>
                  <p className="text-xl font-semibold text-blue-700">
                    {getFilteredSegments().length} / {analysis.summary.segmentCount}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {Array.from(segmentStates.values()).filter(keep => keep).length} kept
                  </p>
                </div>
              </div>

              <div className="flex space-x-4">
                <Button onClick={exportAsJSON} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Export JSON
                </Button>
                <Button onClick={exportAsCSV} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                <Button 
                  onClick={() => {
                    setAnalysis(null);
                    setFile(null);
                    setFileUri(null);
                  }}
                  variant="outline"
                >
                  Analyze Another Video
                </Button>
              </div>
            </div>

            {/* Split-view container with animation */}
            <div className={`bg-white rounded-lg shadow-md transition-all duration-500 ${
              showVideoPanel ? 'grid grid-cols-1 lg:grid-cols-5 gap-6 p-6' : 'p-8'
            }`}>
              {/* Segments panel - left side or full width */}
              <div className={showVideoPanel ? 'lg:col-span-3' : ''}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold">Segments to Remove</h3>
                  {showVideoPanel && (
                    <button
                      onClick={handleCloseVideoPanel}
                      className="text-gray-500 hover:text-gray-700 p-2"
                      title="Close video preview"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {analysis.segmentsToRemove.map((segment, index) => (
                    <div 
                      key={index}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                        selectedSegmentIndex === index 
                          ? 'border-blue-500 bg-blue-50 shadow-md transform scale-[1.02]' 
                          : segmentStates.get(index)
                          ? 'border-green-300 bg-green-50 hover:bg-green-100'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      onClick={() => handleSegmentClick(index)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center space-x-3">
                          <div>
                            <span className="font-medium">
                              {segment.startTime} - {segment.endTime}
                            </span>
                            <span className="ml-2 text-sm text-gray-500">
                              ({segment.duration}s)
                            </span>
                          </div>
                          {/* Include/Exclude toggle */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSegmentState(index);
                            }}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                              segmentStates.get(index)
                                ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                                : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                            }`}
                          >
                            {segmentStates.get(index) ? '✓ Keep' : '✗ Remove'}
                          </button>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            segment.category === 'pause' ? 'bg-yellow-100 text-yellow-800' :
                            segment.category === 'filler' ? 'bg-orange-100 text-orange-800' :
                            segment.category === 'redundant' ? 'bg-purple-100 text-purple-800' :
                            segment.category === 'off-topic' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {segment.category}
                          </span>
                          <span className="text-sm text-gray-500">
                            {Math.round(segment.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{segment.reason}</p>
                      {selectedSegmentIndex === index && (
                        <div className="mt-2 text-xs text-blue-600 flex items-center justify-between">
                          <div className="flex items-center">
                            <Video className="w-3 h-3 mr-1" />
                            Previewing this segment →
                          </div>
                          <div className="text-gray-500">
                            Use ↑↓ to navigate, Space to toggle
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Video preview panel - right side */}
              {showVideoPanel && (
                <div className="lg:col-span-2 mt-6 lg:mt-0 animate-in slide-in-from-right-5 duration-300">
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
                            <span className="font-medium text-purple-400">
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
    </main>
  );
}
