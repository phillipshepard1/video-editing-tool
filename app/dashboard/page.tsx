'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../src/contexts/AuthContext';
import AuthenticatedLayout from '@/components/AuthenticatedLayout';
import { VideoUploader } from '@/components/video-uploader';
import { QueueVideoUploader } from '@/components/queue-video-uploader';
import { JobList } from '@/components/job-list';
import { WorkflowManagerV2 } from '@/components/WorkflowManagerV2';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { QualityBadge, type QualityLevel } from '@/components/ui/quality-badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { 
  Video, Upload, Clock, TrendingUp, Film, Sparkles, 
  Play, FileText, Zap, ChevronRight, BarChart3,
  FolderOpen, Plus, Grid, List, Search, Filter, Briefcase
} from 'lucide-react';
import { formatTime, formatFileSize } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { EnhancedSegment, FilterState, createDefaultFilterState, SegmentCategory } from '@/lib/types/segments';
import { EnhancedAnalysisResult } from '@/lib/types/takes';
import { createMockEnhancedAnalysis } from '@/lib/take-converter';
import { needsCompression, compressVideoForAnalysis } from '@/lib/video-compression';
import { generateFCPXML, generateEDL, generatePremiereXML, downloadFile } from '@/lib/export-formats';
import Link from 'next/link';

interface AnalysisResult {
  segmentsToRemove: EnhancedSegment[];
  summary: {
    originalDuration: number;
    finalDuration: number;
    timeRemoved: number;
    segmentCount: number;
  };
  supabaseUrl?: string;  // Pre-uploaded Supabase URL
}

interface RecentProject {
  id: string;
  name: string;
  thumbnail?: string;
  duration: string;
  editedAt: string;
  segmentsRemoved: number;
  timeSaved: string;
  renderQuality?: QualityLevel;
  fileSize?: string;
  resolution?: string;
  jobData?: any; // Store full job data for review
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [view, setView] = useState<'dashboard' | 'analysis' | 'review'>('dashboard');
  
  // Core state for video analysis
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [enhancedAnalysis, setEnhancedAnalysis] = useState<EnhancedAnalysisResult | null>(null);
  const [useEnhancedAnalysis, setUseEnhancedAnalysis] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [selectedSegment, setSelectedSegment] = useState<EnhancedSegment | null>(null);
  const [currentJob, setCurrentJob] = useState<any>(null); // Track selected job for review
  const [refreshJobList, setRefreshJobList] = useState(0); // Trigger job list refresh
  const videoRef = useRef<HTMLVideoElement>(null!);
  
  // Filter state
  const [filterState, setFilterState] = useState<FilterState>(createDefaultFilterState());
  const [visibleSegments, setVisibleSegments] = useState<EnhancedSegment[]>([]);

  // Fetch real recent projects from completed jobs
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  
  // Fetch recent completed jobs
  useEffect(() => {
    const fetchRecentProjects = async () => {
      try {
        const userId = user?.id;
        if (!userId) {
          setLoadingProjects(false);
          return;
        }
        const response = await fetch(`/api/jobs?status=completed&limit=6&userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          const jobs = data.jobs || [];
          
          // Transform jobs into recent projects format
          const projects = jobs.map((job: any) => {
            const assembleData = job.result_data?.assemble_timeline;
            const geminiData = job.result_data?.gemini_processing;
            const metadata = job.metadata || {};
            
            // Calculate time saved
            let timeSaved = '0:00';
            let segmentsRemoved = 0;
            
            if (assembleData?.timeReduction) {
              const minutes = Math.floor(assembleData.timeReduction / 60);
              const seconds = Math.floor(assembleData.timeReduction % 60);
              timeSaved = `${minutes}:${seconds.toString().padStart(2, '0')}`;
              segmentsRemoved = assembleData.segmentsToRemove || 0;
            } else if (geminiData?.analysis?.summary) {
              const timeRemovedSec = geminiData.analysis.summary.timeRemoved || 0;
              const minutes = Math.floor(timeRemovedSec / 60);
              const seconds = Math.floor(timeRemovedSec % 60);
              timeSaved = `${minutes}:${seconds.toString().padStart(2, '0')}`;
              segmentsRemoved = geminiData.analysis.summary.segmentCount || 0;
            }
            
            // Format duration
            const duration = metadata.videoDuration 
              ? `${Math.floor(metadata.videoDuration / 60)}:${Math.floor(metadata.videoDuration % 60).toString().padStart(2, '0')}`
              : 'N/A';
            
            // Format edited time
            const editedAt = job.completed_at 
              ? formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })
              : formatDistanceToNow(new Date(job.created_at), { addSuffix: true });
            
            return {
              id: job.id,
              name: metadata.originalFileName || job.title || 'Untitled Video',
              thumbnail: metadata.thumbnail || metadata.videoUrl || null,
              duration,
              editedAt,
              segmentsRemoved,
              timeSaved,
              renderQuality: metadata.quality || 'standard',
              fileSize: metadata.fileSize ? formatFileSize(metadata.fileSize) : 'N/A',
              resolution: metadata.resolution || '1080p',
              jobData: job // Store full job data for review
            };
          });
          
          setRecentProjects(projects.slice(0, 3)); // Show only 3 most recent
        }
      } catch (error) {
        console.error('Failed to fetch recent projects:', error);
      } finally {
        setLoadingProjects(false);
      }
    };
    
    fetchRecentProjects();
  }, [refreshJobList, user?.id]); // Refresh when job list updates or user changes

  // Calculate real stats from user data
  const [stats, setStats] = useState({
    totalVideos: 0,
    totalTimeSaved: '0:00',
    avgEditingTime: '0:00',
    storageUsed: '0 MB'
  });

  // Fetch and calculate user stats
  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        const userId = user?.id;
        if (!userId) return;

        // Fetch all completed jobs for stats
        const response = await fetch(`/api/jobs?status=completed&userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          const jobs = data.jobs || [];
          
          // Calculate total time saved
          let totalTimeSavedSeconds = 0;
          let totalProcessingTime = 0;
          let totalStorageBytes = 0;
          
          jobs.forEach((job: any) => {
            const assembleData = job.result_data?.assemble_timeline;
            const geminiData = job.result_data?.gemini_processing;
            
            // Calculate time saved
            if (assembleData?.timeReduction) {
              totalTimeSavedSeconds += assembleData.timeReduction;
            } else if (geminiData?.analysis?.summary?.timeRemoved) {
              totalTimeSavedSeconds += geminiData.analysis.summary.timeRemoved;
            }
            
            // Calculate processing time
            if (job.created_at && job.completed_at) {
              const startTime = new Date(job.created_at).getTime();
              const endTime = new Date(job.completed_at).getTime();
              totalProcessingTime += (endTime - startTime) / 1000; // Convert to seconds
            }
            
            // Calculate storage used
            if (job.metadata?.fileSize) {
              totalStorageBytes += job.metadata.fileSize;
            }
          });
          
          // Format total time saved
          const totalMinutes = Math.floor(totalTimeSavedSeconds / 60);
          const totalSeconds = Math.floor(totalTimeSavedSeconds % 60);
          const formattedTimeSaved = totalMinutes > 0 
            ? `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}` 
            : `${totalSeconds}s`;
          
          // Calculate average editing time
          const avgProcessingSeconds = jobs.length > 0 ? totalProcessingTime / jobs.length : 0;
          const avgMinutes = Math.floor(avgProcessingSeconds / 60);
          const avgSeconds = Math.floor(avgProcessingSeconds % 60);
          const formattedAvgTime = avgMinutes > 0
            ? `${avgMinutes}:${avgSeconds.toString().padStart(2, '0')}`
            : `${avgSeconds}s`;
          
          // Format storage
          const formattedStorage = formatFileSize(totalStorageBytes);
          
          setStats({
            totalVideos: jobs.length,
            totalTimeSaved: formattedTimeSaved,
            avgEditingTime: formattedAvgTime,
            storageUsed: formattedStorage
          });
        }
      } catch (error) {
        console.error('Failed to fetch user stats:', error);
      }
    };
    
    fetchUserStats();
  }, [refreshJobList, user?.id]);

  // Get user display name
  const displayName = user?.user_metadata?.full_name || 
                     user?.email?.split('@')[0] || 
                     'there';

  // Create video URL when file changes and get duration
  useEffect(() => {
    if (file) {
      let url: string;
      
      if (file.name.toLowerCase().endsWith('.mov')) {
        const mp4Blob = new Blob([file], { type: 'video/mp4' });
        url = URL.createObjectURL(mp4Blob);
      } else {
        url = URL.createObjectURL(file);
      }
      
      setVideoUrl(url);
      
      // Get video duration
      const tempVideo = document.createElement('video');
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        setVideoDuration(tempVideo.duration);
      };
      
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setVideoUrl(null);
    }
  }, [file]);

  // Upload and analyze video
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
        const compressedBlob = await compressVideoForAnalysis(file);
        videoToUpload = new File([compressedBlob], file.name, { type: 'video/mp4' });
      }

      // Upload to Gemini
      setUploadProgress(20);
      const formData = new FormData();
      formData.append('file', videoToUpload);

      const uploadResult = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const fileSizeMB = videoToUpload.size / 1024 / 1024;
        const estimatedSeconds = Math.max(5, fileSizeMB / 10);
        const startTime = Date.now();
        let progressInterval: NodeJS.Timeout;
        
        const simulateProgress = () => {
          progressInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed / estimatedSeconds, 0.95);
            const adjustedProgress = 20 + (progress * 65);
            setUploadProgress(Math.round(adjustedProgress));
            
            if (progress >= 0.95) {
              clearInterval(progressInterval);
            }
          }, 100);
        };
        
        simulateProgress();
        
        xhr.addEventListener('load', () => {
          clearInterval(progressInterval);
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText);
              setUploadProgress(85);
              resolve(result);
            } catch (err) {
              reject(new Error('Failed to parse upload response'));
            }
          } else {
            reject(new Error('Upload failed'));
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

      let analyzeResult;
      let enhancedResult: EnhancedAnalysisResult | null = null;

      if (useEnhancedAnalysis) {
        try {
          // Try enhanced analysis first
          const enhancedResponse = await fetch('/api/analysis/process-enhanced', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileUri: uploadResult.fileUri,
              supabaseUrl: uploadResult.supabaseUrl, // Include Supabase URL as fallback
              prompt: 'Analyze for multiple takes, quality scoring, and take recommendations',
            }),
          });

          if (enhancedResponse.ok) {
            const enhancedData = await enhancedResponse.json();
            enhancedResult = enhancedData.analysis;
            setAnalysisProgress(100);
            console.log('Enhanced analysis successful:', enhancedResult);
          } else {
            console.log('Enhanced analysis failed, falling back to traditional');
          }
        } catch (enhancedError) {
          console.log('Enhanced analysis error, falling back to traditional:', enhancedError);
        }
      }

      // If enhanced analysis failed or not requested, use traditional analysis
      if (!enhancedResult) {
        const analyzeResponse = await fetch('/api/analysis/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileUri: uploadResult.fileUri,
            supabaseUrl: uploadResult.supabaseUrl, // Include Supabase URL as fallback
            prompt: 'Analyze for pauses, filler words, and content that can be removed',
            fileSize: Math.round(videoToUpload.size / (1024 * 1024)),
          }),
        });

        if (!analyzeResponse.ok) {
          const errorData = await analyzeResponse.json();
          throw new Error(errorData.error || 'Analysis failed');
        }

        analyzeResult = await analyzeResponse.json();
        setAnalysisProgress(100);
      }

      // Process results
      let enhancedSegments: EnhancedSegment[];
      
      if (enhancedResult) {
        // Use enhanced analysis results
        enhancedSegments = enhancedResult.segments?.map((seg: any, index: number) => ({
          ...seg,
          id: seg.id || `segment-${index}`,
          selected: true,
        })) || [];
        
        setEnhancedAnalysis(enhancedResult);
        console.log('Using enhanced analysis with', enhancedResult.contentGroups?.length || 0, 'content groups');
      } else {
        // Use traditional analysis results
        enhancedSegments = analyzeResult.analysis.segmentsToRemove.map((seg: any, index: number) => ({
          ...seg,
          id: `segment-${index}`,
          selected: true,
        }));
        
        // Create mock enhanced analysis for groups view compatibility
        const mockEnhanced = createMockEnhancedAnalysis(enhancedSegments, videoDuration);
        setEnhancedAnalysis(mockEnhanced);
        console.log('Using traditional analysis with mock groups');
      }
      
      console.log('Enhanced segments created:', enhancedSegments);
      console.log('Categories:', enhancedSegments.map(s => `${s.startTime}: ${s.category}`));

      setAnalysis({
        segmentsToRemove: enhancedSegments,
        summary: enhancedResult?.summary || analyzeResult.analysis.summary,
        supabaseUrl: uploadResult.supabaseUrl,  // Store the pre-uploaded Supabase URL
      });
      setVisibleSegments(enhancedSegments);
      setView('analysis');

    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  const handleNewProject = () => {
    setFile(null);
    setVideoUrl(null);
    setAnalysis(null);
    setEnhancedAnalysis(null);
    setError(null);
    setUploadProgress(0);
    setAnalysisProgress(0);
    setView('dashboard');
    setFilterState(createDefaultFilterState());
    setVisibleSegments([]);
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    // Immediately start analysis after file selection
    setTimeout(() => {
      handleUploadAndAnalyze();
    }, 100);
  };

  // Filter segments based on filter state
  useEffect(() => {
    if (!analysis) return;

    const filtered = analysis.segmentsToRemove.filter(segment => {
      let mappedCategory: SegmentCategory | null = null;
      
      if (segment.category === 'pause') mappedCategory = SegmentCategory.PAUSE;
      else if (segment.category === 'filler') mappedCategory = SegmentCategory.FILLER_WORDS;
      else if (segment.category === 'redundant' || segment.category === 'redundancy') mappedCategory = SegmentCategory.REDUNDANT;
      else if (segment.category === 'off-topic' || segment.category === 'off_topic') mappedCategory = SegmentCategory.TANGENT;
      else if (segment.category === 'technical') mappedCategory = SegmentCategory.TECHNICAL;
      else if (segment.category === 'dead_air') mappedCategory = SegmentCategory.PAUSE;
      
      if (!mappedCategory) return true;
      if (!filterState[mappedCategory]) return false;
      if (filterState.showOnlyHighSeverity && segment.severity !== 'high') return false;
      if (segment.confidence < filterState.minConfidence) return false;
      
      return true;
    });

    setVisibleSegments(filtered);
  }, [filterState, analysis]);

  // Review View - for reviewing completed jobs before rendering
  if (view === 'review' && currentJob) {
    return (
      <AuthenticatedLayout>
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <div className="container mx-auto py-8 px-4 max-w-[1600px]">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setView('dashboard');
                    setCurrentJob(null);
                  }}
                >
                  ← Back to Dashboard
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Review & Edit</h1>
                  <p className="text-sm text-gray-600">{currentJob.metadata?.originalFileName || currentJob.title}</p>
                </div>
              </div>
            </div>

            {/* Use WorkflowManagerV2 if we have analysis data */}
            {(() => {
              // Check both possible data formats
              const geminiData = currentJob.result_data?.gemini_processing as any;
              const assembleData = currentJob.result_data?.assemble_timeline as any;
              
              let analysisData = null;
              let videoUrlToUse = currentJob.metadata?.videoUrl || '';
              let originalDurationValue = 0;
              
              // Try to get data from either format
              if (assembleData?.timeline) {
                // Use assemble_timeline format - convert numeric times to strings
                const convertedSegments = (assembleData.timeline.segmentsToRemove || []).map((seg: any) => ({
                  ...seg,
                  startTime: typeof seg.startTime === 'number' ? seg.startTime.toString() : seg.startTime,
                  endTime: typeof seg.endTime === 'number' ? seg.endTime.toString() : seg.endTime
                }));
                
                analysisData = {
                  segmentsToRemove: convertedSegments,
                  summary: assembleData.timeline.summary
                };
                originalDurationValue = assembleData.timeline.summary?.originalDuration || 180;
                console.log('Using assemble_timeline data:', analysisData);
              } else if (geminiData?.analysis) {
                // Use gemini_processing format
                analysisData = geminiData.analysis;
                originalDurationValue = analysisData.summary?.originalDuration || 0;
                console.log('Using gemini_processing data:', analysisData);
              }
              
              if (!analysisData) {
                return (
                  <div className="bg-white rounded-xl p-8 text-center">
                    <p className="text-gray-500">No analysis data found</p>
                    <Button 
                      onClick={() => setView('dashboard')}
                      className="mt-4"
                    >
                      Back to Dashboard
                    </Button>
                  </div>
                );
              }
              
              return (
                <WorkflowManagerV2
                  segments={analysisData.segmentsToRemove || []}
                  videoUrl={videoUrlToUse}
                  videoDuration={originalDurationValue}
                  originalDuration={originalDurationValue}
                  originalFilename={currentJob.metadata?.originalFileName || 'video.mp4'}
                  videoRef={videoRef}
                  onSegmentSelect={setSelectedSegment}
                  onExport={(format, segmentsToRemove) => {
                    console.log('Export requested:', format, segmentsToRemove);
                    const fileName = currentJob.metadata?.originalFileName || 'video.mp4';
                    const baseName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
                    
                    if (format === 'edl') {
                      const content = generateEDL(segmentsToRemove, originalDurationValue, fileName);
                      downloadFile(content, `${baseName}_edit.edl`, 'text/plain');
                    } else if (format === 'fcpxml') {
                      const content = generateFCPXML(segmentsToRemove, originalDurationValue, fileName);
                      downloadFile(content, `${baseName}_edit.fcpxml`, 'application/xml');
                    } else if (format === 'premiere') {
                      const content = generatePremiereXML(segmentsToRemove, originalDurationValue, fileName);
                      downloadFile(content, `${baseName}_edit.xml`, 'application/xml');
                    }
                  }}
                  onNewAnalysis={() => {
                    setView('dashboard');
                    setCurrentJob(null);
                  }}
                  supabaseUrl={videoUrlToUse}
                />
              );
            })()}
          </div>
        </main>                                         
      </AuthenticatedLayout>
    );
  }

  if (view === 'analysis' && analysis) {
    return (
      <AuthenticatedLayout>
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <div className="container mx-auto py-8 px-4 max-w-[1600px]">
            <WorkflowManagerV2
              segments={analysis.segmentsToRemove}
              videoUrl={videoUrl}
              videoDuration={videoDuration}
              originalFilename={file?.name || 'video.mp4'}
              supabaseUrl={analysis.supabaseUrl}
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
              onNewAnalysis={handleNewProject}
              originalDuration={analysis.summary.originalDuration}
              videoRef={videoRef}
              onSegmentSelect={setSelectedSegment}
              enhancedAnalysis={enhancedAnalysis}
            />
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <TooltipProvider>
      <AuthenticatedLayout>
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Welcome back, {displayName}! 👋
            </h1>
            <p className="text-gray-600 text-lg">
              Let's edit your videos with AI-powered precision
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <Film className="w-8 h-8 text-purple-500" />
                <span className="text-2xl font-bold text-gray-900">{stats.totalVideos}</span>
              </div>
              <p className="text-gray-600 text-sm">Videos Edited</p>
            </div>
            
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <Clock className="w-8 h-8 text-green-500" />
                <span className="text-2xl font-bold text-gray-900">{stats.totalTimeSaved}</span>
              </div>
              <p className="text-gray-600 text-sm">Time Saved</p>
            </div>
            
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <TrendingUp className="w-8 h-8 text-blue-500" />
                <span className="text-2xl font-bold text-gray-900">{stats.avgEditingTime}</span>
              </div>
              <p className="text-gray-600 text-sm">Avg. Edit Time</p>
            </div>
            
            
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <BarChart3 className="w-8 h-8 text-pink-500" />
                <span className="text-2xl font-bold text-gray-900">{stats.storageUsed}</span>
              </div>
              <p className="text-gray-600 text-sm">Storage Used</p>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Upload Section - Left Column */}
            <div className="lg:col-span-1">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 shadow-lg">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mr-3">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Upload Videos</h2>
                    <p className="text-sm text-gray-600">Process multiple videos in background</p>
                  </div>
                </div>

                <QueueVideoUploader 
                  onJobCreated={(jobId) => {
                    console.log('Job created:', jobId);
                    setRefreshJobList(prev => prev + 1); // Trigger job list refresh
                  }}
                />
              </div>
            </div>

            {/* Job List - Right Column */}
            <div className="lg:col-span-2">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mr-3">
                      <Briefcase className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Processing Queue</h2>
                      <p className="text-sm text-gray-600">Your videos are processing in the background</p>
                    </div>
                  </div>
                </div>

                <JobList 
                  key={refreshJobList}
                  onJobSelect={(job) => {
                    console.log('Job selected for review:', job);
                    
                    // Only allow review for completed jobs with data
                    if (job.status !== 'completed' || !job.result_data) {
                      setError('This job is not ready for review yet');
                      return;
                    }
                    
                    setCurrentJob(job);
                    
                    // Load the job's analysis data from either gemini_processing or assemble_timeline
                    const geminiData = job.result_data?.gemini_processing as any;
                    const assembleData = job.result_data?.assemble_timeline as any;
                    
                    if (assembleData?.timeline) {
                      // Convert assemble_timeline format to analysis format
                      setAnalysis({
                        segmentsToRemove: assembleData.timeline.segmentsToRemove || [],
                        summary: assembleData.timeline.summary,
                        supabaseUrl: job.metadata?.videoUrl
                      });
                      setView('review');
                    } else if (geminiData?.analysis) {
                      setAnalysis(geminiData.analysis);
                      setView('review');
                    } else {
                      setError('No analysis data found in job. Please try processing again.');
                      console.error('No analysis data found in job');
                    }
                  }}
                  onJobDelete={(jobId) => {
                    console.log('Job deleted:', jobId);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Recent Projects */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Recent Projects</h2>
              <div className="flex items-center gap-2">
                <Link href="/sessions">
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    View All Sessions
                  </Button>
                </Link>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Grid className="w-5 h-5 text-gray-600" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <List className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {loadingProjects ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading recent projects...</p>
                </div>
              </div>
            ) : recentProjects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {recentProjects.map((project) => (
                  <div
                    key={project.id}
                    className="bg-gray-50 rounded-xl p-4 border border-gray-200 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => {
                      if (project.jobData) {
                        setCurrentJob(project.jobData);
                        
                        // Load the job's analysis data
                        const geminiData = project.jobData.result_data?.gemini_processing as any;
                        const assembleData = project.jobData.result_data?.assemble_timeline as any;
                        
                        if (assembleData?.timeline) {
                          setAnalysis({
                            segmentsToRemove: assembleData.timeline.segmentsToRemove || [],
                            summary: assembleData.timeline.summary,
                            supabaseUrl: project.jobData.metadata?.videoUrl
                          });
                          setView('review');
                        } else if (geminiData?.analysis) {
                          setAnalysis(geminiData.analysis);
                          setView('review');
                        }
                      }
                    }}
                  >
                    <div className="aspect-video bg-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                      {project.thumbnail ? (
                        <div className="w-full h-full relative">
                          {project.thumbnail.startsWith('http') || project.thumbnail.startsWith('blob:') ? (
                            <video 
                              className="w-full h-full object-cover"
                              src={project.thumbnail}
                              muted
                              playsInline
                              onMouseEnter={(e) => {
                                e.currentTarget.currentTime = 0;
                                e.currentTarget.play().catch(() => {});
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.pause();
                                e.currentTarget.currentTime = 0;
                              }}
                            />
                          ) : (
                            <img 
                              src={project.thumbnail} 
                              alt={project.name}
                              className="w-full h-full object-cover"
                            />
                          )}
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                            <Play className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ) : (
                        <Video className="w-8 h-8 text-gray-400" />
                      )}
                    </div>
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="text-gray-900 font-medium group-hover:text-purple-600 transition-colors flex-1">
                        {project.name}
                      </h3>
                      {project.renderQuality && (
                        <QualityBadge quality={project.renderQuality} showTooltip={true} />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                      <span>{project.duration}</span>
                      <span>{project.editedAt}</span>
                    </div>
                    {project.resolution && project.fileSize && (
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <span>{project.resolution}</span>
                        <span>{project.fileSize}</span>
                      </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between text-xs">
                      <span className="text-green-600">{project.segmentsRemoved} cuts</span>
                      <span className="text-purple-600">Saved {project.timeSaved}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No projects yet. Upload your first video to get started!</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </AuthenticatedLayout>
    </TooltipProvider>
  );
}