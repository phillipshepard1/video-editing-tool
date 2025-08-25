'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileVideo, AlertCircle, Loader2, CheckCircle, Download, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { extractFramesFromVideo } from '@/lib/video-utils';

interface QueueVideoUploaderProps {
  onJobCreated?: (jobId: string) => void;
}

export function QueueVideoUploader({ onJobCreated }: QueueVideoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [stageProgress, setStageProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    setJobId(null);

    try {
      // Generate thumbnail from first frame
      setUploadStage('Generating thumbnail...');
      let thumbnailUrl = '';
      try {
        const frames = await extractFramesFromVideo(file, 1);
        if (frames.length > 0) {
          thumbnailUrl = `data:image/jpeg;base64,${frames[0]}`;
        }
      } catch (thumbError) {
        console.warn('Could not generate thumbnail:', thumbError);
      }

      // Create form data
      const formData = new FormData();
      formData.append('video', file); // API expects 'video' not 'file'
      formData.append('title', file.name);
      formData.append('description', `Uploaded video: ${file.name}`);
      // Don't send userId if we don't have a valid UUID - let the backend handle it
      formData.append('priority', 'normal');
      
      // Add processing options with thumbnail
      const processingOptions = {
        targetDuration: 60,
        chunkSize: 50 * 1024 * 1024, // 50MB chunks
        analysisOptions: {
          thoroughness: 'standard'
        },
        thumbnail: thumbnailUrl
      };
      formData.append('processingOptions', JSON.stringify(processingOptions));

      // Use XMLHttpRequest for upload progress tracking
      setUploadStage('Uploading video...');
      
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
          
          // Update stage based on progress
          if (percentComplete < 30) {
            setUploadStage('Starting upload...');
          } else if (percentComplete < 60) {
            setUploadStage('Uploading video data...');
          } else if (percentComplete < 90) {
            setUploadStage('Almost done uploading...');
          } else {
            setUploadStage('Finalizing upload...');
          }
        }
      });

      // Create promise for async handling
      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (err) {
              reject(new Error('Failed to parse response'));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.details || error.error || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload cancelled'));
      });

      // Send request
      xhr.open('POST', '/api/upload/queue-fast');
      xhr.send(formData);

      // Wait for upload to complete
      const result = await uploadPromise;
      console.log('Upload result:', result);

      setJobId(result.jobId);
      setUploadProgress(100);
      setUploadStage('Upload complete!');

      // Start polling for job status
      if (result.jobId) {
        onJobCreated?.(result.jobId);
        pollJobStatus(result.jobId);
      }

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onJobCreated]);

  const pollJobStatus = async (jobId: string) => {
    const maxAttempts = 120; // Poll for up to 10 minutes
    let attempts = 0;
    setIsPolling(true);
    setProcessingStage('Initializing processing...');

    const poll = async () => {
      try {
        // Use the jobs API endpoint for more detailed info
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) return;

        const data = await response.json();
        setJobStatus(data.job);

        // Update processing stage based on current_stage
        if (data.job && data.job.current_stage) {
          const stageNames: Record<string, string> = {
            'upload_video': 'Uploading video to storage...',
            'chunk_video': 'Splitting video into chunks...',
            'analyze_video': 'Analyzing video content...',
            'gemini_processing': 'AI analyzing segments...',
            'assemble_timeline': 'Creating edited timeline...',
            'render_video': 'Rendering final video...',
            'completed': 'Processing complete!'
          };
          
          const stageName = stageNames[data.job.current_stage] || data.job.current_stage.replace(/_/g, ' ');
          setProcessingStage(stageName);
          
          // Calculate stage-specific progress
          const stageWeights: Record<string, number> = {
            'upload_video': 0.15,
            'chunk_video': 0.20,
            'analyze_video': 0.25,
            'gemini_processing': 0.20,
            'assemble_timeline': 0.10,
            'render_video': 0.10
          };
          
          // Calculate cumulative progress
          const stages = ['upload_video', 'chunk_video', 'analyze_video', 'gemini_processing', 'assemble_timeline', 'render_video'];
          let cumulativeProgress = 0;
          let currentStageIndex = stages.indexOf(data.job.current_stage);
          
          if (currentStageIndex >= 0) {
            // Add completed stages
            for (let i = 0; i < currentStageIndex; i++) {
              cumulativeProgress += (stageWeights[stages[i]] || 0) * 100;
            }
            // Add current stage progress
            const currentStageWeight = stageWeights[data.job.current_stage] || 0;
            const currentStageProgress = data.job.progress_percentage || 0;
            cumulativeProgress += (currentStageWeight * currentStageProgress);
            
            setStageProgress(Math.round(cumulativeProgress));
          } else {
            setStageProgress(data.job.progress_percentage || 0);
          }
        }

        // Check if job is completed and has download URL
        if (data.job) {
          if (data.job.status === 'completed') {
            setIsPolling(false);
            setProcessingStage('Processing complete!');
            setStageProgress(100);
            if (data.job.downloadUrl) {
              setDownloadUrl(data.job.downloadUrl);
              console.log('Video ready for download:', data.job.downloadUrl);
            }
          } else if (data.job.status === 'failed') {
            setIsPolling(false);
            setProcessingStage('Processing failed');
            setError('Job failed: ' + (data.job.last_error || 'Unknown error'));
          } else {
            // Continue polling if job is still processing
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(poll, 3000); // Poll every 3 seconds for better responsiveness
            } else {
              setIsPolling(false);
              setError('Job timed out - please check the job dashboard');
            }
          }
        }
      } catch (err) {
        console.error('Status poll error:', err);
        setIsPolling(false);
      }
    };

    poll();
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `edited_video_${jobId}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const resetUploader = () => {
    setJobId(null);
    setJobStatus(null);
    setDownloadUrl(null);
    setError(null);
    setUploadProgress(0);
    setUploadStage('');
    setProcessingStage('');
    setStageProgress(0);
    setIsPolling(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.webm', '.mkv']
    },
    maxFiles: 1,
    disabled: uploading || isPolling
  });

  // Stage indicator component
  const StageIndicator = ({ stage, currentStage, label }: { stage: string; currentStage: string; label: string }) => {
    const stages = ['upload_video', 'chunk_video', 'analyze_video', 'gemini_processing', 'assemble_timeline', 'render_video'];
    const currentIndex = stages.indexOf(currentStage);
    const stageIndex = stages.indexOf(stage);
    
    const isCompleted = stageIndex < currentIndex;
    const isCurrent = stage === currentStage;
    const isPending = stageIndex > currentIndex;
    
    return (
      <div className="flex items-center space-x-2">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
          isCompleted ? 'bg-green-500 text-white' :
          isCurrent ? 'bg-blue-500 text-white animate-pulse' :
          'bg-gray-200 text-gray-500'
        }`}>
          {isCompleted ? '✓' : isCurrent ? '•' : ''}
        </div>
        <span className={`text-xs flex-1 ${
          isCompleted ? 'text-green-600 font-medium' :
          isCurrent ? 'text-blue-600 font-medium' :
          'text-gray-400'
        }`}>
          {label}
        </span>
        {isCurrent && (
          <span className="text-xs text-blue-500">Processing...</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-all duration-200 ease-in-out
            ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
            ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400'}
          `}
        >
          <input {...getInputProps()} />
          
          {uploading ? (
            <div className="space-y-4">
              <Loader2 className="w-12 h-12 mx-auto text-blue-500 animate-spin" />
              <p className="text-lg font-medium">{uploadStage || 'Uploading and processing...'}</p>
              <div className="max-w-xs mx-auto space-y-2">
                <Progress value={uploadProgress} className="h-2" />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Upload Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
              </div>
            </div>
          ) : isDragActive ? (
            <>
              <FileVideo className="w-12 h-12 mx-auto text-blue-500 mb-4" />
              <p className="text-lg font-medium">Drop the video here</p>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium mb-2">
                Drag & drop a video here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Supported formats: MP4, MOV, AVI, WebM, MKV
              </p>
            </>
          )}
        </div>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {jobId && (
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <div className="flex-1">
              <p className="font-medium">Job Created</p>
              <p className="text-sm text-gray-500">Job ID: {jobId}</p>
            </div>
          </div>
        </Card>
      )}

      {jobStatus && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Processing Status</h3>
          <div className="space-y-3">
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Status:</span>
              <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                jobStatus.status === 'completed' ? 'bg-green-100 text-green-700' :
                jobStatus.status === 'failed' ? 'bg-red-100 text-red-700' :
                jobStatus.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {jobStatus.status === 'processing' ? '🔄 Processing' : 
                 jobStatus.status === 'completed' ? '✅ Completed' :
                 jobStatus.status === 'failed' ? '❌ Failed' :
                 jobStatus.status}
              </span>
            </div>
            
            {/* Current Stage with emoji */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Current Stage:</span>
              <span className="text-sm font-medium text-blue-600">
                {processingStage || jobStatus.current_stage?.replace(/_/g, ' ')}
              </span>
            </div>
            
            {/* Overall Progress */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Overall Progress:</span>
                <span className="text-sm font-medium text-blue-600">{stageProgress || jobStatus.progress_percentage}%</span>
              </div>
              <Progress value={stageProgress || jobStatus.progress_percentage} className="h-2" />
            </div>
            
            {/* Stage Progress Breakdown */}
            {jobStatus.status === 'processing' && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="space-y-2">
                  <StageIndicator stage="upload_video" currentStage={jobStatus.current_stage} label="Upload" />
                  <StageIndicator stage="chunk_video" currentStage={jobStatus.current_stage} label="Chunking" />
                  <StageIndicator stage="analyze_video" currentStage={jobStatus.current_stage} label="Analysis" />
                  <StageIndicator stage="gemini_processing" currentStage={jobStatus.current_stage} label="AI Processing" />
                  <StageIndicator stage="assemble_timeline" currentStage={jobStatus.current_stage} label="Timeline" />
                  <StageIndicator stage="render_video" currentStage={jobStatus.current_stage} label="Rendering" />
                </div>
              </div>
            )}
            
            {isPolling && (
              <div className="flex items-center justify-center mt-4 py-2">
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-blue-500" />
                <span className="text-sm text-blue-600 font-medium animate-pulse">
                  {processingStage || 'Processing video...'}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {downloadUrl && (
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <div className="flex-1">
                <p className="font-semibold text-green-900">Video Ready!</p>
                <p className="text-sm text-green-700">Your edited video is ready for download</p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Button 
                onClick={handleDownload}
                className="flex-1"
                variant="default"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Video
              </Button>
              
              <Button 
                onClick={resetUploader}
                variant="outline"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Process Another
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}