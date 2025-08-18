'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Video, AlertCircle, FileVideo, CheckCircle, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn, formatFileSize } from '@/lib/utils';

interface VideoUploaderProps {
  onFileSelect: (file: File) => void;
  isUploading?: boolean;
  maxSizeMB?: number;
  conversionProgress?: ConversionProgress;
}

interface ConversionProgress {
  stage: 'uploading' | 'converting' | 'processing' | 'complete';
  progress: number;
  message: string;
  chunkInfo?: {
    currentChunk: number;
    totalChunks: number;
  };
}

const SUPPORTED_FORMATS = {
  'video/mp4': { extension: '.mp4', label: 'MP4', optimal: true, conversion: false },
  'video/quicktime': { extension: '.mov', label: 'MOV', optimal: true, conversion: false },
  'video/x-msvideo': { extension: '.avi', label: 'AVI', optimal: false, conversion: true },
  'video/x-matroska': { extension: '.mkv', label: 'MKV', optimal: false, conversion: true },
  'video/webm': { extension: '.webm', label: 'WebM', optimal: true, conversion: false },
  'video/x-ms-wmv': { extension: '.wmv', label: 'WMV', optimal: false, conversion: true },
  'video/3gpp': { extension: '.3gp', label: '3GP', optimal: false, conversion: true }
};

const SIZE_LIMITS = {
  small: { size: 100, label: 'Small files (<100MB)' },
  medium: { size: 500, label: 'Medium files (100MB-500MB)' },
  large: { size: 2048, label: 'Large files (500MB-2GB)' },
  xlarge: { size: 5120, label: 'Extra large files (2GB-5GB)' }
};

export function VideoUploader({ 
  onFileSelect, 
  isUploading = false,
  maxSizeMB = 5120, // 5GB limit for new browser-based processing
  conversionProgress
}: VideoUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileCompatibility, setFileCompatibility] = useState<{
    needsConversion: boolean;
    format: string;
    quality: 'optimal' | 'good' | 'needs-conversion';
  } | null>(null);

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
      
      // Analyze file compatibility
      const formatInfo = SUPPORTED_FORMATS[file.type as keyof typeof SUPPORTED_FORMATS];
      if (formatInfo) {
        setFileCompatibility({
          needsConversion: !!formatInfo.conversion,
          format: formatInfo.label,
          quality: formatInfo.optimal ? 'optimal' : 'needs-conversion'
        });
      }
      
      onFileSelect(file);
    }
  }, [onFileSelect, maxSizeMB]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': Object.values(SUPPORTED_FORMATS).map(f => f.extension)
    },
    maxSize: maxSizeMB * 1024 * 1024,
    maxFiles: 1,
    disabled: isUploading
  });

  const getSizeLimitInfo = () => {
    const limits = Object.entries(SIZE_LIMITS).find(
      ([, limit]) => maxSizeMB <= limit.size
    );
    return limits ? limits[1] : SIZE_LIMITS.xlarge;
  };

  const getCompatibilityColor = (quality: string) => {
    switch (quality) {
      case 'optimal': return 'text-green-600 bg-green-50 border-green-200';
      case 'good': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'needs-conversion': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <TooltipProvider>
      <div className="w-full max-w-2xl mx-auto">
        {/* Enhanced Format and Size Information */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-blue-900">Supported Formats & Limits</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-700 mb-2">Optimal Formats:</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(SUPPORTED_FORMATS)
                  .filter(([, info]) => info.optimal)
                  .map(([, info]) => (
                    <Badge key={info.label} variant="secondary" className="text-xs">
                      {info.label}
                    </Badge>
                  ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Ready to process immediately</p>
            </div>
            <div>
              <p className="font-medium text-gray-700 mb-2">Supported with Conversion:</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(SUPPORTED_FORMATS)
                  .filter(([, info]) => info.conversion)
                  .map(([, info]) => (
                    <Badge key={info.label} variant="outline" className="text-xs">
                      {info.label}
                    </Badge>
                  ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Will be converted to MP4</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-blue-200">
            <p className="text-sm text-gray-600">
              <strong>Size Limit:</strong> {getSizeLimitInfo().label} (Max: {Math.round(maxSizeMB/1024)}GB)
            </p>
          </div>
        </div>

        {/* Main Upload Area */}
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
                <div className="relative">
                  <FileVideo className="w-16 h-16 text-purple-500" />
                  {fileCompatibility?.quality === 'optimal' && (
                    <CheckCircle className="w-6 h-6 text-green-500 absolute -top-1 -right-1 bg-white rounded-full" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium text-gray-900">
                    {selectedFile.name}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <p className="text-sm text-gray-600">
                      {formatFileSize(selectedFile.size)}
                    </p>
                    {fileCompatibility && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge className={cn(
                            "text-xs border cursor-help",
                            getCompatibilityColor(fileCompatibility.quality)
                          )}>
                            {fileCompatibility.format}
                            {fileCompatibility.needsConversion && " → MP4"}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {fileCompatibility.quality === 'optimal'
                              ? 'Optimal format - ready for immediate processing'
                              : fileCompatibility.quality === 'needs-conversion'
                              ? 'Will be converted to MP4 for optimal processing'
                              : 'Good format - compatible with our system'
                            }
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
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
                    All major video formats supported • Max {Math.round(maxSizeMB/1024)}GB
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Conversion Progress */}
        {conversionProgress && isUploading && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                <span className="font-medium text-gray-900">
                  {conversionProgress.stage === 'uploading' && 'Uploading...'}
                  {conversionProgress.stage === 'converting' && 'Converting to MP4...'}
                  {conversionProgress.stage === 'processing' && 'Processing...'}
                  {conversionProgress.stage === 'complete' && 'Complete!'}
                </span>
              </div>
              <span className="text-sm text-gray-600">{Math.round(conversionProgress.progress)}%</span>
            </div>
            <Progress value={conversionProgress.progress} className="mb-2" />
            <p className="text-sm text-gray-600">{conversionProgress.message}</p>
            {conversionProgress.chunkInfo && (
              <p className="text-xs text-gray-500 mt-1">
                Processing Part {conversionProgress.chunkInfo.currentChunk} of {conversionProgress.chunkInfo.totalChunks}
                {conversionProgress.stage === 'processing' && conversionProgress.chunkInfo.currentChunk === conversionProgress.chunkInfo.totalChunks && " • Stitching segments..."}
              </p>
            )}
          </div>
        )}

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
                setFileCompatibility(null);
              }}
              variant="outline"
            >
              Choose Different Video
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export type { ConversionProgress };