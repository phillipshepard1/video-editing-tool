'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Video, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatFileSize } from '@/lib/utils';

interface VideoUploaderProps {
  onFileSelect: (file: File) => void;
  isUploading?: boolean;
  maxSizeMB?: number;
}

export function VideoUploader({ 
  onFileSelect, 
  isUploading = false,
  maxSizeMB = 5120 // 5GB limit for new browser-based processing
}: VideoUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setError(null);
    
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors[0]?.code === 'file-too-large') {
        setError(`File too large. Maximum size is ${maxSizeMB}MB`);
      } else {
        setError('Invalid file type. Please upload a video file.');
      }
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect, maxSizeMB]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm']
    },
    maxSize: maxSizeMB * 1024 * 1024,
    maxFiles: 1,
    disabled: isUploading
  });

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all bg-white/80 backdrop-blur-sm",
          isDragActive && "border-purple-500 bg-purple-50",
          isUploading && "opacity-50 cursor-not-allowed",
          !isDragActive && !isUploading && "border-gray-300 hover:border-purple-400 hover:bg-gray-50"
        )}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center space-y-4">
          {selectedFile ? (
            <>
              <Video className="w-16 h-16 text-purple-500" />
              <div>
                <p className="text-lg font-medium text-gray-900">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-gray-600">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-16 h-16 text-purple-500" />
              <div>
                <p className="text-lg font-medium text-gray-900">
                  {isDragActive ? 'Drop your video here' : 'Drop video here or click to browse'}
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Supported: MP4, MOV, AVI, MKV, WebM (max {Math.round(maxSizeMB/1024)}GB)
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-300 rounded-lg flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {selectedFile && !isUploading && (
        <div className="mt-6 flex justify-center">
          <Button
            onClick={() => {
              setSelectedFile(null);
              setError(null);
            }}
            variant="outline"
          >
            Choose Different Video
          </Button>
        </div>
      )}
    </div>
  );
}