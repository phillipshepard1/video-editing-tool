'use client';

import React, { useState } from 'react';
import { VideoUploader, type ConversionProgress } from '@/components/video-uploader';
import { EnhancedVideoStatus, type ProcessingInfo } from '@/components/enhanced-video-status';
import { QualityBadge, RenderQualityIndicator, type QualityLevel } from '@/components/ui/quality-badge';
import { ChunkingProgress, ConversionFeedback } from '@/components/ui/enhanced-progress';
import { VideoHelpSystem, HelpTooltip } from '@/components/video-help-system';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Play, 
  Upload, 
  Settings, 
  HelpCircle,
  Star,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

export function EnhancedVideoDemo() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [demoStage, setDemoStage] = useState<'upload' | 'processing' | 'completed'>('upload');

  // Mock conversion progress
  const [conversionProgress, setConversionProgress] = useState<ConversionProgress>({
    stage: 'converting',
    progress: 65,
    message: 'Converting AVI to MP4 for optimal processing...',
    chunkInfo: {
      currentChunk: 2,
      totalChunks: 4
    }
  });

  // Mock processing info for different stages
  const processingInfos: Record<string, ProcessingInfo> = {
    uploading: {
      status: 'uploading',
      progress: 45,
      message: 'Uploading your video securely...',
      estimatedTime: '2:30'
    },
    converting: {
      status: 'converting',
      progress: 65,
      message: 'Converting to optimal format...',
      conversionInfo: {
        fromFormat: 'AVI',
        toFormat: 'MP4',
        isConverting: true
      },
      estimatedTime: '1:45'
    },
    chunking: {
      status: 'chunking',
      progress: 30,
      currentChunk: 2,
      totalChunks: 5,
      message: 'Splitting large video for efficient processing...',
      estimatedTime: '3:20'
    },
    processing: {
      status: 'processing',
      progress: 75,
      currentChunk: 3,
      totalChunks: 5,
      currentSegment: 15,
      totalSegments: 20,
      message: 'AI analyzing content and removing filler segments...',
      estimatedTime: '1:15'
    },
    stitching: {
      status: 'stitching',
      progress: 90,
      currentChunk: 5,
      totalChunks: 5,
      message: 'Combining processed segments...',
      estimatedTime: '0:45'
    },
    rendering: {
      status: 'rendering',
      progress: 95,
      message: 'Creating final optimized video...',
      estimatedTime: '0:30'
    },
    completed: {
      status: 'completed',
      progress: 100,
      message: 'Video processing completed successfully!',
      renderQuality: 'hd',
      renderInfo: {
        renderTime: '4:23',
        fileSize: '45.2 MB',
        resolution: '1080p',
        bitrate: '2.5 Mbps'
      }
    },
    error: {
      status: 'error',
      progress: 60,
      error: 'Processing failed due to unsupported codec in source file. Please try a different video or convert to MP4 first.',
      message: 'An error occurred during processing'
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleStartProcessing = () => {
    setIsProcessing(true);
    setDemoStage('processing');
  };

  const handleRetry = () => {
    setIsProcessing(true);
    setDemoStage('processing');
  };

  const handleQualityRetry = () => {
    console.log('Retrying with higher quality settings...');
  };

  return (
    <TooltipProvider>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Enhanced Video Processing UI</h1>
          <p className="text-gray-600">
            Demonstration of enhanced upload interface, conversion feedback, chunking progress, and quality indicators
          </p>
        </div>

        <Tabs defaultValue="demo" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="demo">Live Demo</TabsTrigger>
            <TabsTrigger value="components">Component Showcase</TabsTrigger>
            <TabsTrigger value="help">Help System</TabsTrigger>
          </TabsList>

          <TabsContent value="demo" className="space-y-6">
            {/* Enhanced Video Uploader */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Enhanced File Upload
                </CardTitle>
              </CardHeader>
              <CardContent>
                <VideoUploader
                  onFileSelect={handleFileSelect}
                  isUploading={isProcessing && demoStage === 'processing'}
                  conversionProgress={demoStage === 'processing' ? conversionProgress : undefined}
                  maxSizeMB={5120}
                />
                {selectedFile && !isProcessing && (
                  <div className="mt-4 text-center">
                    <Button onClick={handleStartProcessing}>
                      <Play className="w-4 h-4 mr-2" />
                      Start Processing
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Enhanced Processing Status */}
            {isProcessing && (
              <Card>
                <CardHeader>
                  <CardTitle>Processing Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(processingInfos).map(([stage, info]) => (
                      <div key={stage} className="space-y-2">
                        <h4 className="font-medium capitalize flex items-center gap-2">
                          {stage} Stage
                          <HelpTooltip 
                            content={`This shows how the ${stage} stage appears with enhanced UI feedback`}
                            title={`${stage.charAt(0).toUpperCase() + stage.slice(1)} Stage Demo`}
                          >
                            <HelpCircle className="w-4 h-4 text-gray-400" />
                          </HelpTooltip>
                        </h4>
                        <EnhancedVideoStatus
                          info={info}
                          onRetry={handleRetry}
                          onQualityRetry={handleQualityRetry}
                          showChunkingDetails={true}
                          showConversionFeedback={true}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="components" className="space-y-6">
            {/* Quality Badges Showcase */}
            <Card>
              <CardHeader>
                <CardTitle>Quality Indicators</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Quality Badges</h4>
                    <div className="flex flex-wrap gap-2">
                      <QualityBadge quality="premium" />
                      <QualityBadge quality="hd" />
                      <QualityBadge quality="standard" />
                      <QualityBadge quality="low" retryAction={() => console.log('Retry clicked')} />
                      <QualityBadge quality="processing" />
                      <QualityBadge quality="failed" retryAction={() => console.log('Retry clicked')} />
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Render Quality Indicator</h4>
                    <RenderQualityIndicator
                      quality="hd"
                      renderTime="4:23"
                      fileSize="45.2 MB"
                      resolution="1080p"
                      bitrate="2.5 Mbps"
                      onRetry={() => console.log('Quality retry')}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Progress Components Showcase */}
            <Card>
              <CardHeader>
                <CardTitle>Enhanced Progress Components</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-2">Chunking Progress</h4>
                    <ChunkingProgress
                      currentStep={2}
                      totalSteps={3}
                      currentChunk={3}
                      totalChunks={5}
                      progress={60}
                      stage="processing"
                      message="Processing video segments with AI analysis..."
                      estimatedTimeRemaining="2:15"
                    />
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Conversion Feedback</h4>
                    <ConversionFeedback
                      isConverting={true}
                      fromFormat="AVI"
                      toFormat="MP4"
                      progress={75}
                      message="Converting to optimal format for faster processing..."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Format Support Showcase */}
            <Card>
              <CardHeader>
                <CardTitle>Format Support & Compatibility</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Optimal Formats</h4>
                    <div className="space-y-2">
                      {[
                        { format: 'MP4', status: 'optimal' },
                        { format: 'MOV', status: 'optimal' },
                        { format: 'WebM', status: 'optimal' }
                      ].map(({ format, status }) => (
                        <div key={format} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
                          <span className="font-medium">{format}</span>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              Ready to Process
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Supported with Conversion</h4>
                    <div className="space-y-2">
                      {[
                        { format: 'AVI', status: 'conversion' },
                        { format: 'MKV', status: 'conversion' },
                        { format: 'WMV', status: 'conversion' }
                      ].map(({ format, status }) => (
                        <div key={format} className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded">
                          <span className="font-medium">{format}</span>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-600" />
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                              Will Convert to MP4
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="help">
            <VideoHelpSystem />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}