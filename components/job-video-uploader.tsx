/**
 * Job-based Video Uploader Component
 * Integrates with the new queue-based processing system
 */

'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, Video, X, Zap, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';

export interface JobUploadOptions {
  title?: string;
  description?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  processingOptions?: {
    quality?: 'low' | 'medium' | 'high' | 'lossless';
    maxSizeBytes?: number;
    chunkSize?: number;
  };
  metadata?: Record<string, any>;
}

export interface UploadProgress {
  stage: 'uploading' | 'queuing' | 'complete' | 'error';
  progress: number;
  message: string;
}

export interface JobResult {
  jobId: string;
  title: string;
  status: string;
  created_at: string;
}

interface Props {
  onJobCreated?: (job: JobResult) => void;
  onUploadProgress?: (progress: UploadProgress) => void;
  userId?: string;
  options?: JobUploadOptions;
  disabled?: boolean;
  className?: string;
}

export function JobVideoUploader({
  onJobCreated,
  onUploadProgress,
  userId,
  options = {},
  disabled = false,
  className = '',
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('video/')) {
      setFile(droppedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const updateProgress = (newProgress: UploadProgress) => {
    setProgress(newProgress);
    onUploadProgress?.(newProgress);
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      updateProgress({
        stage: 'uploading',
        progress: 0,
        message: 'Starting upload...',
      });

      // Convert file to ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Prepare form data
      const formData = new FormData();
      formData.append('video', file);
      formData.append('title', options.title || file.name);
      if (options.description) formData.append('description', options.description);
      if (userId) formData.append('userId', userId);
      formData.append('priority', options.priority || 'normal');
      
      if (options.processingOptions) {
        formData.append('processingOptions', JSON.stringify(options.processingOptions));
      }
      
      if (options.metadata) {
        formData.append('metadata', JSON.stringify(options.metadata));
      }

      updateProgress({
        stage: 'uploading',
        progress: 20,
        message: 'Uploading video file...',
      });

      // Create upload request
      const response = await fetch('/api/upload/queue', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();

      updateProgress({
        stage: 'queuing',
        progress: 80,
        message: 'Adding to processing queue...',
      });

      // Simulate brief queuing delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      updateProgress({
        stage: 'complete',
        progress: 100,
        message: 'Job created successfully!',
      });

      setResult({
        jobId: data.job.id,
        title: data.job.title,
        status: data.job.status,
        created_at: data.job.created_at,
      });

      onJobCreated?.(data.job);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      updateProgress({
        stage: 'error',
        progress: 0,
        message: errorMessage,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // If upload is complete, show result
  if (result) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <CheckCircle className="w-6 h-6 text-green-500 mr-3" />
            <h3 className="text-lg font-semibold text-green-900">Job Created Successfully!</h3>
          </div>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Job ID:</span> {result.jobId}</p>
            <p><span className="font-medium">Title:</span> {result.title}</p>
            <p><span className="font-medium">Status:</span> {result.status}</p>
          </div>
          <div className="mt-4">
            <Button onClick={handleReset} variant="outline" size="sm">
              Upload Another Video
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* File Selection */}
      {!file && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors cursor-pointer"
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={disabled}
          />
          
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Upload your video
          </h3>
          <p className="text-gray-600 mb-4">
            Drag and drop or click to select your talking head video
          </p>
          <p className="text-sm text-gray-500">
            Supported formats: MP4, MOV, AVI, MKV (Max 2GB)
          </p>
          
          {disabled && (
            <p className="text-sm text-red-500 mt-2">
              Upload is temporarily disabled
            </p>
          )}
        </div>
      )}

      {/* Selected File */}
      {file && !isUploading && (
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
              onClick={removeFile}
              className="text-gray-400 hover:text-gray-700"
              disabled={disabled}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="mt-4 flex gap-2">
            <Button 
              onClick={handleUpload}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              disabled={disabled}
            >
              <Zap className="mr-2 w-4 h-4" />
              Start Processing
            </Button>
            <Button variant="outline" onClick={removeFile} disabled={disabled}>
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && progress && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <div className="w-6 h-6 mr-3">
                {progress.stage === 'uploading' && <Upload className="w-6 h-6 text-blue-500 animate-pulse" />}
                {progress.stage === 'queuing' && <Clock className="w-6 h-6 text-blue-500 animate-spin" />}
                {progress.stage === 'complete' && <CheckCircle className="w-6 h-6 text-green-500" />}
                {progress.stage === 'error' && <AlertCircle className="w-6 h-6 text-red-500" />}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-900">
                  {progress.stage === 'uploading' && 'Uploading Video'}
                  {progress.stage === 'queuing' && 'Adding to Queue'}
                  {progress.stage === 'complete' && 'Upload Complete'}
                  {progress.stage === 'error' && 'Upload Failed'}
                </h3>
                <p className="text-blue-700 text-sm">{progress.message}</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-blue-700">Progress</span>
                <span className="text-blue-700">{progress.progress}%</span>
              </div>
              <Progress 
                value={progress.progress} 
                className="h-2" 
              />
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-3" />
            <div>
              <h4 className="text-red-900 font-medium">Upload Failed</h4>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
          <div className="mt-3">
            <Button variant="outline" onClick={handleReset} size="sm">
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobVideoUploader;