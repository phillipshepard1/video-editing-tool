/**
 * Comprehensive Video Processing Service
 * Handles format validation, conversion, chunking, and Gemini processing
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { getErrorHandler, createErrorContext, ProcessingError } from './error-handler';

interface VideoFormat {
  extension: string;
  mimeType: string;
  geminiCompatible: boolean;
  conversionRequired: boolean;
}

interface ProcessingOptions {
  maxSizeBytes?: number;
  chunkSize?: number; // MB
  quality?: 'low' | 'medium' | 'high' | 'lossless';
  targetFormat?: string;
}

interface ConversionProgress {
  stage: 'validation' | 'conversion' | 'chunking' | 'upload' | 'complete';
  progress: number; // 0-100
  message: string;
  timeRemaining?: number;
  chunkIndex?: number;
  totalChunks?: number;
}

interface VideoChunk {
  index: number;
  file: File;
  startTime: number;
  endTime: number;
  duration: number;
  size: number;
}

interface ProcessingResult {
  success: boolean;
  chunks?: VideoChunk[];
  convertedFile?: File;
  originalFormat: string;
  targetFormat: string;
  totalSize: number;
  geminiCompatible: boolean;
  error?: string;
  processingError?: ProcessingError;
}

export class VideoProcessor {
  private ffmpeg: FFmpeg | null = null;
  private initialized = false;
  private progressCallback?: (progress: ConversionProgress) => void;

  // Supported video formats
  private readonly supportedFormats: Record<string, VideoFormat> = {
    'mp4': {
      extension: 'mp4',
      mimeType: 'video/mp4',
      geminiCompatible: true,
      conversionRequired: false
    },
    'mov': {
      extension: 'mov',
      mimeType: 'video/quicktime',
      geminiCompatible: true,
      conversionRequired: false
    },
    'avi': {
      extension: 'avi',
      mimeType: 'video/x-msvideo',
      geminiCompatible: false,
      conversionRequired: true
    },
    'mkv': {
      extension: 'mkv',
      mimeType: 'video/x-matroska',
      geminiCompatible: false,
      conversionRequired: true
    },
    'webm': {
      extension: 'webm',
      mimeType: 'video/webm',
      geminiCompatible: false,
      conversionRequired: true
    },
    'flv': {
      extension: 'flv',
      mimeType: 'video/x-flv',
      geminiCompatible: false,
      conversionRequired: true
    },
    'wmv': {
      extension: 'wmv',
      mimeType: 'video/x-ms-wmv',
      geminiCompatible: false,
      conversionRequired: true
    },
    'ogv': {
      extension: 'ogv',
      mimeType: 'video/ogg',
      geminiCompatible: false,
      conversionRequired: true
    },
    '3gp': {
      extension: '3gp',
      mimeType: 'video/3gpp',
      geminiCompatible: false,
      conversionRequired: true
    }
  };

  // Quality presets for conversion
  private readonly qualityPresets = {
    low: {
      crf: 28,
      preset: 'fast',
      videoBitrate: '1M',
      audioBitrate: '128k',
      scale: '720:-1'
    },
    medium: {
      crf: 23,
      preset: 'medium',
      videoBitrate: '4M',
      audioBitrate: '192k',
      scale: '1280:-1'
    },
    high: {
      crf: 18,
      preset: 'slow',
      videoBitrate: '8M',
      audioBitrate: '320k',
      scale: '1920:-1'
    },
    lossless: {
      crf: 0,
      preset: 'veryslow',
      videoBitrate: '50M',
      audioBitrate: '1411k',
      scale: null // Preserve original resolution
    }
  };

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!this.ffmpeg) {
        throw new Error('FFmpeg not initialized');
      }

      // Initialize FFmpeg with WebAssembly
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.initialized = true;
      console.log('VideoProcessor initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize VideoProcessor:', error);
      throw new Error(`VideoProcessor initialization failed: ${error}`);
    }
  }

  setProgressCallback(callback: (progress: ConversionProgress) => void): void {
    this.progressCallback = callback;
  }

  private emitProgress(progress: ConversionProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Get list of supported formats
   */
  getSupportedFormats(): { supported: string[]; geminiCompatible: string[]; requiresConversion: string[] } {
    const supported = Object.keys(this.supportedFormats);
    const geminiCompatible = supported.filter(format => this.supportedFormats[format].geminiCompatible);
    const requiresConversion = supported.filter(format => this.supportedFormats[format].conversionRequired);

    return {
      supported,
      geminiCompatible,
      requiresConversion
    };
  }

  /**
   * Validate video file format and size
   */
  async validateVideo(file: File, options: ProcessingOptions = {}): Promise<{
    valid: boolean;
    format?: VideoFormat;
    issues: string[];
    fileExtension: string;
  }> {
    const issues: string[] = [];
    
    this.emitProgress({
      stage: 'validation',
      progress: 10,
      message: 'Validating video file...'
    });

    // Check file type
    if (!file.type.startsWith('video/')) {
      issues.push('File is not a video file');
      return { valid: false, issues, fileExtension: '' };
    }

    // Extract file extension
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    
    if (!fileExtension) {
      issues.push('File has no extension');
      return { valid: false, issues, fileExtension: '' };
    }

    // Check if format is supported
    const format = this.supportedFormats[fileExtension];
    if (!format) {
      issues.push(`Format ${fileExtension.toUpperCase()} is not supported`);
      return { valid: false, issues, fileExtension };
    }

    // Check file size
    const maxSize = options.maxSizeBytes || (2 * 1024 * 1024 * 1024); // 2GB default
    if (file.size > maxSize) {
      const maxSizeGB = (maxSize / (1024 * 1024 * 1024)).toFixed(1);
      const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(1);
      issues.push(`File size (${fileSizeGB}GB) exceeds maximum allowed size (${maxSizeGB}GB)`);
    }

    // Check MIME type consistency
    if (file.type !== format.mimeType && !file.type.includes('video/')) {
      issues.push(`File type mismatch: expected ${format.mimeType}, got ${file.type}`);
    }

    this.emitProgress({
      stage: 'validation',
      progress: 100,
      message: issues.length === 0 ? 'Video validation successful' : `Validation found ${issues.length} issue(s)`
    });

    return {
      valid: issues.length === 0,
      format,
      issues,
      fileExtension
    };
  }

  /**
   * Get video metadata using FFmpeg
   */
  async getVideoInfo(file: File): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    format: string;
    size: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    try {
      const inputFileName = 'input.' + file.name.split('.').pop();
      await this.ffmpeg.writeFile(inputFileName, await fetchFile(file));

      // Get video info using ffprobe
      await this.ffmpeg.exec([
        '-i', inputFileName,
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        'info.json'
      ]);

      const infoData = await this.ffmpeg.readFile('info.json');
      const info = JSON.parse(new TextDecoder().decode(infoData));

      const videoStream = info.streams.find((stream: any) => stream.codec_type === 'video');
      
      if (!videoStream) {
        throw new Error('No video stream found in file');
      }

      return {
        duration: parseFloat(info.format.duration || '0'),
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        fps: eval(videoStream.r_frame_rate || '30/1'), // Handle fraction
        bitrate: parseInt(info.format.bit_rate || '0'),
        format: info.format.format_name || '',
        size: file.size
      };
    } catch (error) {
      console.error('Failed to get video info:', error);
      throw new Error(`Failed to analyze video: ${error}`);
    }
  }

  /**
   * Convert video to Gemini-compatible format (MP4)
   */
  async convertVideo(
    file: File, 
    targetFormat: string = 'mp4',
    options: ProcessingOptions = {}
  ): Promise<File> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    this.emitProgress({
      stage: 'conversion',
      progress: 0,
      message: `Starting conversion to ${targetFormat.toUpperCase()}...`
    });

    try {
      const inputFileName = 'input.' + file.name.split('.').pop();
      const outputFileName = `output.${targetFormat}`;
      
      // Write input file
      await this.ffmpeg.writeFile(inputFileName, await fetchFile(file));

      // Get quality preset
      const quality = options.quality || 'medium';
      const preset = this.qualityPresets[quality];

      // Build FFmpeg command
      const command = [
        '-i', inputFileName,
        '-c:v', 'libx264',
        '-crf', preset.crf.toString(),
        '-preset', preset.preset,
        '-c:a', 'aac',
        '-b:a', preset.audioBitrate,
        '-movflags', '+faststart', // Optimize for web streaming
      ];

      // Add video bitrate if not lossless
      if (quality !== 'lossless') {
        command.push('-b:v', preset.videoBitrate);
      }

      // Add scaling if specified
      if (preset.scale) {
        command.push('-vf', `scale=${preset.scale}`);
      }

      command.push(outputFileName);

      // Set up progress monitoring
      this.ffmpeg.on('progress', ({ progress }) => {
        this.emitProgress({
          stage: 'conversion',
          progress: Math.round(progress * 100),
          message: `Converting video... ${Math.round(progress * 100)}%`
        });
      });

      // Execute conversion
      await this.ffmpeg.exec(command);

      // Read converted file
      const convertedData = await this.ffmpeg.readFile(outputFileName);
      const convertedBlob = new Blob([convertedData], { type: `video/${targetFormat}` });
      const convertedFile = new File(
        [convertedBlob], 
        file.name.replace(/\.[^.]+$/, `.${targetFormat}`), 
        { type: `video/${targetFormat}` }
      );

      this.emitProgress({
        stage: 'conversion',
        progress: 100,
        message: `Conversion to ${targetFormat.toUpperCase()} complete`
      });

      return convertedFile;
      
    } catch (error) {
      console.error('Video conversion failed:', error);
      throw new Error(`Video conversion failed: ${error}`);
    }
  }

  /**
   * Split large video into chunks for Gemini processing
   */
  async chunkVideo(file: File, options: ProcessingOptions = {}): Promise<VideoChunk[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    const chunkSizeMB = options.chunkSize || 500; // 500MB default
    const maxSizeBytes = chunkSizeMB * 1024 * 1024;
    
    // If file is small enough, return as single chunk
    if (file.size <= maxSizeBytes) {
      return [{
        index: 0,
        file,
        startTime: 0,
        endTime: 0, // Will be determined by video info
        duration: 0,
        size: file.size
      }];
    }

    this.emitProgress({
      stage: 'chunking',
      progress: 0,
      message: 'Analyzing video for chunking...'
    });

    // Get video info
    const videoInfo = await this.getVideoInfo(file);
    
    // Calculate chunk duration based on file size and target chunk size
    const avgBytesPerSecond = file.size / videoInfo.duration;
    const chunkDurationSeconds = maxSizeBytes / avgBytesPerSecond;
    const numChunks = Math.ceil(videoInfo.duration / chunkDurationSeconds);

    console.log(`Splitting ${videoInfo.duration}s video into ${numChunks} chunks of ~${chunkDurationSeconds.toFixed(1)}s each`);

    const chunks: VideoChunk[] = [];
    const inputFileName = 'input.' + file.name.split('.').pop();
    
    // Write input file once
    await this.ffmpeg.writeFile(inputFileName, await fetchFile(file));

    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDurationSeconds;
      const endTime = Math.min((i + 1) * chunkDurationSeconds, videoInfo.duration);
      const duration = endTime - startTime;

      this.emitProgress({
        stage: 'chunking',
        progress: Math.round((i / numChunks) * 100),
        message: `Creating chunk ${i + 1} of ${numChunks}...`,
        chunkIndex: i + 1,
        totalChunks: numChunks
      });

      const outputFileName = `chunk_${i}.mp4`;

      // Create chunk using FFmpeg
      await this.ffmpeg.exec([
        '-i', inputFileName,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-c', 'copy', // Copy streams for faster processing
        '-avoid_negative_ts', 'make_zero',
        outputFileName
      ]);

      // Read chunk data
      const chunkData = await this.ffmpeg.readFile(outputFileName);
      const chunkBlob = new Blob([chunkData], { type: 'video/mp4' });
      const chunkFile = new File(
        [chunkBlob],
        `${file.name.replace(/\.[^.]+$/, '')}_chunk_${i + 1}.mp4`,
        { type: 'video/mp4' }
      );

      chunks.push({
        index: i,
        file: chunkFile,
        startTime,
        endTime,
        duration,
        size: chunkFile.size
      });
    }

    this.emitProgress({
      stage: 'chunking',
      progress: 100,
      message: `Created ${chunks.length} chunks successfully`
    });

    return chunks;
  }

  /**
   * Process video through complete pipeline with comprehensive error handling
   */
  async processVideo(file: File, options: ProcessingOptions = {}): Promise<ProcessingResult> {
    const errorHandler = getErrorHandler();
    const videoInfo = {
      name: file.name,
      size: file.size,
      format: file.name.split('.').pop() || 'unknown'
    };
    
    try {
      // Step 1: Validate video
      let validation;
      try {
        validation = await this.validateVideo(file, options);
        if (!validation.valid) {
          const context = createErrorContext('processVideo', 'validation', videoInfo, options);
          const error = new Error(validation.issues.join('; '));
          const processedError = errorHandler.handleError(error, context);
          
          return {
            success: false,
            originalFormat: validation.fileExtension,
            targetFormat: 'unknown',
            totalSize: file.size,
            geminiCompatible: false,
            error: processedError.userMessage,
            processingError: processedError
          };
        }
      } catch (validationError) {
        const context = createErrorContext('processVideo', 'validation', videoInfo, options);
        const processedError = errorHandler.handleError(
          validationError instanceof Error ? validationError : new Error(String(validationError)),
          context
        );
        
        return {
          success: false,
          originalFormat: videoInfo.format,
          targetFormat: 'unknown',
          totalSize: file.size,
          geminiCompatible: false,
          error: processedError.userMessage,
          processingError: processedError
        };
      }

      const format = validation.format!;
      let processedFile = file;
      
      // Step 2: Convert if necessary
      if (format.conversionRequired) {
        try {
          this.emitProgress({
            stage: 'conversion',
            progress: 0,
            message: 'Starting video conversion...'
          });
          
          processedFile = await this.convertVideo(file, 'mp4', options);
          
        } catch (conversionError) {
          const context = createErrorContext('processVideo', 'conversion', {
            ...videoInfo,
            duration: 0 // We don't have duration yet
          }, options);
          
          const processedError = errorHandler.handleError(
            conversionError instanceof Error ? conversionError : new Error(String(conversionError)),
            context
          );
          
          return {
            success: false,
            originalFormat: validation.fileExtension,
            targetFormat: 'mp4',
            totalSize: file.size,
            geminiCompatible: false,
            error: processedError.userMessage,
            processingError: processedError
          };
        }
      }

      // Step 3: Check if chunking is needed
      const maxSizeBytes = options.maxSizeBytes || (2 * 1024 * 1024 * 1024); // 2GB
      let chunks: VideoChunk[] | undefined;
      
      if (processedFile.size > maxSizeBytes) {
        try {
          this.emitProgress({
            stage: 'chunking',
            progress: 0,
            message: 'Splitting video into chunks...'
          });
          
          chunks = await this.chunkVideo(processedFile, options);
          
        } catch (chunkingError) {
          const context = createErrorContext('processVideo', 'chunking', {
            ...videoInfo,
            duration: 0 // We might not have duration info
          }, options);
          
          const processedError = errorHandler.handleError(
            chunkingError instanceof Error ? chunkingError : new Error(String(chunkingError)),
            context
          );
          
          return {
            success: false,
            originalFormat: validation.fileExtension,
            targetFormat: format.conversionRequired ? 'mp4' : validation.fileExtension,
            totalSize: processedFile.size,
            geminiCompatible: true,
            error: processedError.userMessage,
            processingError: processedError
          };
        }
      }

      this.emitProgress({
        stage: 'complete',
        progress: 100,
        message: 'Video processing complete'
      });

      return {
        success: true,
        chunks,
        convertedFile: format.conversionRequired ? processedFile : undefined,
        originalFormat: validation.fileExtension,
        targetFormat: format.conversionRequired ? 'mp4' : validation.fileExtension,
        totalSize: processedFile.size,
        geminiCompatible: true
      };
      
    } catch (error) {
      console.error('Video processing failed:', error);
      
      const context = createErrorContext('processVideo', 'unknown', videoInfo, options);
      const processedError = errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        context
      );
      
      return {
        success: false,
        originalFormat: file.name.split('.').pop() || 'unknown',
        targetFormat: 'unknown',
        totalSize: file.size,
        geminiCompatible: false,
        error: processedError.userMessage,
        processingError: processedError
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.ffmpeg && this.initialized) {
      try {
        await this.ffmpeg.terminate();
      } catch (error) {
        console.warn('FFmpeg cleanup warning:', error);
      }
    }
    this.initialized = false;
    this.ffmpeg = null;
  }
}

// Export singleton instance
let processorInstance: VideoProcessor | null = null;

export function getVideoProcessor(): VideoProcessor {
  if (!processorInstance) {
    processorInstance = new VideoProcessor();
  }
  return processorInstance;
}

export { ProcessingOptions, ConversionProgress, VideoChunk, ProcessingResult };
