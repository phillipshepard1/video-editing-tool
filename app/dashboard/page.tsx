'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../src/contexts/AuthContext';
import AuthenticatedLayout from '@/components/AuthenticatedLayout';
import { VideoUploader } from '@/components/video-uploader';
import { WorkflowManagerV2 } from '@/components/WorkflowManagerV2';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { QualityBadge, type QualityLevel } from '@/components/ui/quality-badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { 
  Video, Upload, Clock, TrendingUp, Film, Sparkles, 
  Play, FileText, Zap, ChevronRight, BarChart3,
  FolderOpen, Plus, Grid, List, Search, Filter
} from 'lucide-react';
import { formatTime, formatFileSize } from '@/lib/utils';
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
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [view, setView] = useState<'dashboard' | 'analysis'>('dashboard');
  
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
  const videoRef = useRef<HTMLVideoElement>(null!);
  
  // Filter state
  const [filterState, setFilterState] = useState<FilterState>(createDefaultFilterState());
  const [visibleSegments, setVisibleSegments] = useState<EnhancedSegment[]>([]);

  // Mock data for recent projects (in production, this would come from Supabase)
  const [recentProjects] = useState<RecentProject[]>([
    {
      id: '1',
      name: 'Product Demo Video',
      duration: '5:23',
      editedAt: '2 hours ago',
      segmentsRemoved: 12,
      timeSaved: '1:45',
      renderQuality: 'hd',
      fileSize: '45.2 MB',
      resolution: '1080p'
    },
    {
      id: '2',
      name: 'Tutorial - Getting Started',
      duration: '10:15',
      editedAt: 'Yesterday',
      segmentsRemoved: 28,
      timeSaved: '3:20',
      renderQuality: 'standard',
      fileSize: '78.5 MB',
      resolution: '720p'
    },
    {
      id: '3',
      name: 'Interview with CEO',
      duration: '15:42',
      editedAt: '3 days ago',
      segmentsRemoved: 45,
      timeSaved: '5:10',
      renderQuality: 'premium',
      fileSize: '156.8 MB',
      resolution: '4K'
    }
  ]);

  // Stats (in production, these would be calculated from user data)
  const stats = {
    totalVideos: recentProjects.length,
    totalTimeSaved: '10:15',
    avgEditingTime: '2:30',
    storageUsed: '1.2 GB'
  };

  // Get user display name
  const displayName = user?.user_metadata?.full_name || 
                     user?.email?.split('@')[0] || 
                     'there';

  // Create video URL when file changes
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

  if (view === 'analysis' && analysis) {
    return (
      <AuthenticatedLayout>
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <div className="container mx-auto py-8 px-4 max-w-[1600px]">
            <WorkflowManagerV2
              segments={analysis.segmentsToRemove}
              videoUrl={videoUrl}
              videoDuration={videoDuration}
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
              originalFilename={file?.name}
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

          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Upload Section */}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 shadow-lg">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mr-4">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Start New Project</h2>
                  <p className="text-gray-600">Upload your talking head video for AI analysis</p>
                </div>
              </div>

              {!file && !isUploading && !isAnalyzing && (
                <VideoUploader 
                  onFileSelect={handleFileSelect}
                  isUploading={false}
                />
              )}

              {file && !isUploading && !isAnalyzing && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Video className="w-5 h-5 text-purple-500 mr-3" />
                        <div>
                          <p className="text-gray-900 font-medium">{file.name}</p>
                          <p className="text-gray-600 text-sm">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setFile(null)}
                        className="text-gray-400 hover:text-gray-700"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <Button 
                    onClick={handleUploadAndAnalyze}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    size="lg"
                  >
                    <Sparkles className="mr-2" />
                    Analyze with AI
                  </Button>
                </div>
              )}

              {(isUploading || isAnalyzing) && (
                <div className="space-y-4">
                  {isUploading && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">Uploading to Gemini...</span>
                        <span className="text-sm text-gray-600">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                    </div>
                  )}
                  
                  {isAnalyzing && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">Analyzing with AI...</span>
                        <span className="text-sm text-gray-600">{analysisProgress}%</span>
                      </div>
                      <Progress value={analysisProgress} className="h-2" />
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </div>

            {/* Features Section */}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 shadow-lg">
              <h3 className="text-xl font-bold text-gray-900 mb-6">How It Works</h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                    <Upload className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-medium mb-1">Upload Your Video</h4>
                    <p className="text-gray-600 text-sm">Upload your talking head video in any format</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                    <Sparkles className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-medium mb-1">AI Analysis</h4>
                    <p className="text-gray-600 text-sm">AI detects pauses, filler words, and mistakes</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                    <Play className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-medium mb-1">Review & Edit</h4>
                    <p className="text-gray-600 text-sm">Preview and select segments to remove</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                    <FileText className="w-4 h-4 text-pink-600" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-medium mb-1">Export EDL</h4>
                    <p className="text-gray-600 text-sm">Get EDL file for your editing software</p>
                  </div>
                </div>
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

            {recentProjects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {recentProjects.map((project) => (
                  <div
                    key={project.id}
                    className="bg-gray-50 rounded-xl p-4 border border-gray-200 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="aspect-video bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                      <Video className="w-8 h-8 text-gray-400" />
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