'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileVideo, AlertCircle, Loader2, CheckCircle, Download, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface QueueVideoUploaderProps {
  onJobCreated?: (jobId: string) => void;
}

export function QueueVideoUploader({ onJobCreated }: QueueVideoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    setJobId(null);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('video', file); // API expects 'video' not 'file'
      formData.append('title', file.name);
      formData.append('description', `Uploaded video: ${file.name}`);
      // Don't send userId if we don't have a valid UUID - let the backend handle it
      formData.append('priority', 'normal');
      
      // Add processing options
      const processingOptions = {
        targetDuration: 60,
        chunkSize: 50 * 1024 * 1024, // 50MB chunks
        analysisOptions: {
          thoroughness: 'standard'
        }
      };
      formData.append('processingOptions', JSON.stringify(processingOptions));

      // Upload to queue endpoint
      // Use fast endpoint for better performance
      const response = await fetch('/api/upload/queue-fast', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Upload failed');
      }

      const result = await response.json();
      console.log('Upload result:', result);

      setJobId(result.jobId);
      setUploadProgress(100);

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

    const poll = async () => {
      try {
        // Use the jobs API endpoint for more detailed info
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) return;

        const data = await response.json();
        setJobStatus(data.job);

        // Check if job is completed and has download URL
        if (data.job) {
          if (data.job.status === 'completed') {
            setIsPolling(false);
            if (data.job.downloadUrl) {
              setDownloadUrl(data.job.downloadUrl);
              console.log('Video ready for download:', data.job.downloadUrl);
            }
          } else if (data.job.status === 'failed') {
            setIsPolling(false);
            setError('Job failed: ' + (data.job.last_error || 'Unknown error'));
          } else {
            // Continue polling if job is still processing
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(poll, 5000); // Poll every 5 seconds
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
              <p className="text-lg font-medium">Uploading and processing...</p>
              <Progress value={uploadProgress} className="max-w-xs mx-auto" />
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
          <h3 className="font-semibold mb-2">Job Status</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Status:</span>
              <span className={`text-sm font-medium ${
                jobStatus.status === 'completed' ? 'text-green-600' :
                jobStatus.status === 'failed' ? 'text-red-600' :
                'text-blue-600'
              }`}>{jobStatus.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Stage:</span>
              <span className="text-sm font-medium">{jobStatus.current_stage}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Progress:</span>
              <span className="text-sm font-medium">{jobStatus.progress_percentage}%</span>
            </div>
            <Progress value={jobStatus.progress_percentage} />
            
            {isPolling && (
              <div className="flex items-center justify-center mt-4">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span className="text-sm text-gray-500">Processing video...</span>
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