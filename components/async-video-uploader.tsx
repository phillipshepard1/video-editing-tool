'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface UploadedJob {
  id: string;
  title: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  current_stage: string;
  progress_percentage: number;
  created_at: string;
  metadata: {
    originalFileName: string;
    fileSize: number;
    needsChunking?: boolean;
  };
}

interface AsyncVideoUploaderProps {
  onJobCreated?: (job: UploadedJob) => void;
  onUploadComplete?: (job: UploadedJob) => void;
  maxFileSize?: number;
  acceptedFormats?: string[];
}

export default function AsyncVideoUploader({
  onJobCreated,
  onUploadComplete,
  maxFileSize = 5 * 1024 * 1024 * 1024, // 5GB
  acceptedFormats = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', '3gp']
}: AsyncVideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size
    if (file.size > maxFileSize) {
      const maxSizeGB = (maxFileSize / (1024 * 1024 * 1024)).toFixed(1);
      const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(1);
      return {
        valid: false,
        error: `File size (${fileSizeGB}GB) exceeds maximum allowed size (${maxSizeGB}GB)`
      };
    }

    // Check file type
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !acceptedFormats.includes(extension)) {
      return {
        valid: false,
        error: `Unsupported file format. Supported formats: ${acceptedFormats.join(', ')}`
      };
    }

    // Check MIME type
    if (!file.type.startsWith('video/')) {
      return {
        valid: false,
        error: 'Selected file is not a video file'
      };
    }

    return { valid: true };
  };

  const uploadFile = async (file: File): Promise<UploadedJob> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title || file.name);
    formData.append('description', description);
    formData.append('priority', priority);
    formData.append('processingOptions', JSON.stringify({
      quality,
      maxSizeBytes: 2 * 1024 * 1024 * 1024, // 2GB for Gemini
    }));

    const response = await fetch('/api/analysis/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    return result.job;
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      // Validate file
      const validation = validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Upload and create job
      const job = await uploadFile(file);
      
      // Notify parent components
      onJobCreated?.(job);

      // Show success message
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const needsChunking = job.metadata?.needsChunking;
      const estimatedTime = needsChunking ? '5-15 minutes' : '2-8 minutes';
      
      alert(`✅ Video "${job.title}" queued successfully!\n\nFile size: ${fileSizeMB}MB\nEstimated processing time: ${estimatedTime}\n\nYou can monitor progress in the Jobs dashboard.`);

      // Clear form
      setTitle('');
      setDescription('');
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Navigate to job tracking if no callback provided
      if (!onJobCreated) {
        router.push(`/jobs/${job.id}`);
      }

    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    handleFileUpload(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 space-y-6">
      {/* Upload Options */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Video Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter video title (optional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isUploading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your video (optional)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isUploading}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isUploading}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Quality
            </label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isUploading}
            >
              <option value="low">Low (faster)</option>
              <option value="medium">Medium (balanced)</option>
              <option value="high">High (slower)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
          }
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!isUploading ? handleBrowseClick : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.map(fmt => `.${fmt}`).join(',')}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={isUploading}
        />

        <div className="space-y-2">
          {isUploading ? (
            <>
              <div className="text-blue-600">
                <svg className="animate-spin h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
                  <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <p className="text-lg font-medium text-blue-600">Creating job...</p>
              <p className="text-sm text-gray-600">Please wait while we queue your video for processing</p>
            </>
          ) : (
            <>
              <div className="text-gray-400">
                <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"/>
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-900">
                Drop your video here or click to browse
              </p>
              <p className="text-sm text-gray-600">
                Supports: {acceptedFormats.join(', ').toUpperCase()} up to {(maxFileSize / (1024 * 1024 * 1024)).toFixed(0)}GB
              </p>
              <p className="text-xs text-gray-500">
                Videos will be processed asynchronously in the background
              </p>
            </>
          )}
        </div>
      </div>

      {/* Error Display */}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Upload Error</h3>
              <div className="mt-2 text-sm text-red-700">
                {uploadError}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="text-sm text-blue-700">
          <h4 className="font-medium mb-1">How it works:</h4>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Upload starts immediately and returns a job ID</li>
            <li>Video processing happens in the background</li>
            <li>You can monitor progress in real-time</li>
            <li>Large files are automatically chunked for reliable processing</li>
            <li>Failed jobs can be retried with different settings</li>
          </ul>
        </div>
      </div>
    </div>
  );
}