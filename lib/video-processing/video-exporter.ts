/**
 * Video Export System with Quality Preservation
 * Handles exporting processed videos with various quality settings and formats
 */

import { FFmpegEngine, ProcessingOptions } from './ffmpeg-engine';
import { MemoryManager } from './memory-manager';
import { ProgressTracker } from './progress-tracker';

export interface ExportOptions {
  // Quality settings
  quality: 'lossless' | 'high' | 'medium' | 'low' | 'custom';
  preserveOriginalQuality: boolean;
  
  // Format settings
  outputFormat: 'mp4' | 'webm' | 'mov' | 'avi' | 'mkv';
  videoCodec: 'h264' | 'h265' | 'vp9' | 'av1' | 'prores';
  audioCodec: 'aac' | 'opus' | 'flac' | 'wav';
  
  // Custom quality settings (used when quality = 'custom')
  customSettings?: {
    videoBitrate?: string;
    audioBitrate?: string;
    crf?: number;
    preset?: string;
    profile?: string;
    level?: string;
    pixelFormat?: string;
  };
  
  // Size and resolution
  maxWidth?: number;
  maxHeight?: number;
  maintainAspectRatio: boolean;
  scaleAlgorithm?: 'lanczos' | 'bicubic' | 'bilinear' | 'neighbor';
  
  // Advanced options
  enableTwoPass: boolean;
  enableHardwareAcceleration: boolean;
  optimizeForStreaming: boolean;
  includeMetadata: boolean;
  
  // Chunk export options
  exportAsChunks: boolean;
  chunkDuration?: number; // seconds
  chunkNaming?: 'sequential' | 'timestamp' | 'custom';
  customNamingPattern?: string;
}

export interface ExportJob {
  id: string;
  inputFile: File;
  outputOptions: ExportOptions;
  originalVideoInfo?: {
    width: number;
    height: number;
    duration: number;
    bitrate: number;
    fps: number;
    format: string;
  };
  status: 'pending' | 'analyzing' | 'processing' | 'completed' | 'failed';
  progress: number;
  outputFiles: File[];
  error?: string;
  startTime?: number;
  endTime?: number;
  estimatedSize?: number;
  actualSize?: number;
}

export interface QualityPreset {
  name: string;
  description: string;
  videoCodec: ExportOptions['videoCodec'];
  audioCodec: ExportOptions['audioCodec'];
  videoBitrate: string;
  audioBitrate: string;
  crf?: number;
  preset: string;
  profile?: string;
  pixelFormat: string;
  twoPass: boolean;
}

export class VideoExporter {
  private ffmpegEngine: FFmpegEngine;
  private memoryManager: MemoryManager;
  private progressTracker: ProgressTracker;
  
  private exportJobs = new Map<string, ExportJob>();
  private qualityPresets = new Map<string, QualityPreset>();
  
  constructor(
    ffmpegEngine: FFmpegEngine,
    memoryManager: MemoryManager,
    progressTracker: ProgressTracker
  ) {
    this.ffmpegEngine = ffmpegEngine;
    this.memoryManager = memoryManager;
    this.progressTracker = progressTracker;
    
    this.initializeQualityPresets();
  }
  
  /**
   * Start video export with given options
   */
  async exportVideo(inputFile: File, options: ExportOptions): Promise<string> {
    const jobId = this.generateJobId();
    
    const job: ExportJob = {
      id: jobId,
      inputFile,
      outputOptions: options,
      status: 'pending',
      progress: 0,
      outputFiles: [],
      startTime: Date.now(),
    };
    
    this.exportJobs.set(jobId, job);
    
    // Initialize progress tracking
    this.progressTracker.initializeJob(jobId, [
      { id: 'analysis', name: 'Video Analysis', description: 'Analyzing input video properties' },
      { id: 'optimization', name: 'Settings Optimization', description: 'Optimizing export settings for quality' },
      { id: 'processing', name: 'Video Processing', description: 'Encoding video with selected settings' },
      { id: 'finalization', name: 'Finalization', description: 'Finalizing export and cleanup' },
    ]);
    
    try {
      await this.processExportJob(job);
      return jobId;
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.endTime = Date.now();
      
      this.progressTracker.failJob(jobId, job.error);
      throw error;
    }
  }
  
  /**
   * Get export job status
   */
  getExportJob(jobId: string): ExportJob | undefined {
    return this.exportJobs.get(jobId);
  }
  
  /**
   * Get all export jobs
   */
  getAllExportJobs(): ExportJob[] {
    return Array.from(this.exportJobs.values());
  }
  
  /**
   * Cancel export job
   */
  async cancelExport(jobId: string): Promise<void> {
    const job = this.exportJobs.get(jobId);
    if (!job || job.status === 'completed') return;
    
    job.status = 'failed';
    job.error = 'Export cancelled by user';
    job.endTime = Date.now();
    
    this.progressTracker.failJob(jobId, 'Export cancelled by user');
  }
  
  /**
   * Get quality presets
   */
  getQualityPresets(): QualityPreset[] {
    return Array.from(this.qualityPresets.values());
  }
  
  /**
   * Add custom quality preset
   */
  addQualityPreset(preset: QualityPreset): void {
    this.qualityPresets.set(preset.name, preset);
  }
  
  /**
   * Estimate export file size
   */
  async estimateExportSize(inputFile: File, options: ExportOptions): Promise<number> {
    try {
      const videoInfo = await this.ffmpegEngine.getVideoInfo(inputFile);
      return this.calculateEstimatedSize(videoInfo, options);
    } catch (error) {
      console.warn('Failed to estimate export size:', error);
      return inputFile.size; // Fallback to input size
    }
  }
  
  /**
   * Get optimal export settings for a video
   */
  async getOptimalSettings(inputFile: File, targetQuality: 'high' | 'medium' | 'low'): Promise<ExportOptions> {
    try {
      const videoInfo = await this.ffmpegEngine.getVideoInfo(inputFile);
      return this.generateOptimalSettings(videoInfo, targetQuality);
    } catch (error) {
      console.warn('Failed to analyze video for optimal settings:', error);
      return this.getDefaultSettings(targetQuality);
    }
  }
  
  // Private methods
  
  private async processExportJob(job: ExportJob): Promise<void> {
    // Stage 1: Analysis
    this.progressTracker.startStage(job.id, 'analysis');
    job.status = 'analyzing';
    
    const videoInfo = await this.ffmpegEngine.getVideoInfo(job.inputFile);
    job.originalVideoInfo = videoInfo;
    
    this.progressTracker.updateStageProgress(job.id, 'analysis', 50);
    
    // Estimate output size
    job.estimatedSize = this.calculateEstimatedSize(videoInfo, job.outputOptions);
    
    this.progressTracker.completeStage(job.id, 'analysis');
    
    // Stage 2: Optimization
    this.progressTracker.startStage(job.id, 'optimization');
    
    const optimizedOptions = await this.optimizeExportSettings(videoInfo, job.outputOptions);
    
    this.progressTracker.completeStage(job.id, 'optimization');
    
    // Stage 3: Processing
    this.progressTracker.startStage(job.id, 'processing');
    job.status = 'processing';
    
    if (job.outputOptions.exportAsChunks) {
      job.outputFiles = await this.exportAsChunks(job.inputFile, optimizedOptions, job.id);
    } else {
      const outputFile = await this.exportSingleFile(job.inputFile, optimizedOptions, job.id);
      job.outputFiles = [outputFile];
    }
    
    this.progressTracker.completeStage(job.id, 'processing');
    
    // Stage 4: Finalization
    this.progressTracker.startStage(job.id, 'finalization');
    
    // Calculate actual size
    job.actualSize = job.outputFiles.reduce((sum, file) => sum + file.size, 0);
    
    job.status = 'completed';
    job.endTime = Date.now();
    job.progress = 100;
    
    this.progressTracker.completeStage(job.id, 'finalization');
    this.progressTracker.completeJob(job.id);
  }
  
  private async exportSingleFile(
    inputFile: File,
    options: ProcessingOptions,
    jobId: string
  ): Promise<File> {
    // Set up progress monitoring
    let lastProgress = 0;
    const progressCallback = (progress: any) => {
      if (progress.progress > lastProgress + 5) { // Update every 5%
        this.progressTracker.updateStageProgress(jobId, 'processing', progress.progress);
        lastProgress = progress.progress;
      }
    };
    
    // Create new FFmpeg engine with progress callback
    const exportEngine = new FFmpegEngine({ onProgress: progressCallback });
    await exportEngine.initialize();
    
    try {
      const result = await exportEngine.processVideo(inputFile, options);
      await exportEngine.terminate();
      return result;
    } catch (error) {
      await exportEngine.terminate();
      throw error;
    }
  }
  
  private async exportAsChunks(
    inputFile: File,
    options: ProcessingOptions,
    jobId: string
  ): Promise<File[]> {
    const videoInfo = await this.ffmpegEngine.getVideoInfo(inputFile);
    const chunkDuration = options.targetChunkDuration || 60; // Default 1 minute chunks
    const numChunks = Math.ceil(videoInfo.duration / chunkDuration);
    
    const chunks: Array<{ index: number; startTime: number; endTime: number; duration: number }> = [];
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const endTime = Math.min((i + 1) * chunkDuration, videoInfo.duration);
      chunks.push({
        index: i,
        startTime,
        endTime,
        duration: endTime - startTime,
      });
    }
    
    const outputFiles: File[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkProgress = (i / chunks.length) * 100;
      
      this.progressTracker.updateStageProgress(jobId, 'processing', chunkProgress, {
        message: `Processing chunk ${i + 1} of ${chunks.length}`,
      });
      
      // Create chunk-specific options
      const chunkOptions: ProcessingOptions = {
        ...options,
        startTime: chunk.startTime,
        duration: chunk.duration,
      };
      
      const chunkFile = await this.exportSingleFile(inputFile, chunkOptions, jobId);
      
      // Rename chunk file with appropriate naming
      const chunkName = this.generateChunkName(inputFile.name, i, chunks.length, options);
      const renamedChunk = new File([chunkFile], chunkName, { type: chunkFile.type });
      
      outputFiles.push(renamedChunk);
    }
    
    return outputFiles;
  }
  
  private async optimizeExportSettings(
    videoInfo: any,
    options: ExportOptions
  ): Promise<ProcessingOptions> {
    const processingOptions: ProcessingOptions = {};
    
    // Quality settings
    if (options.preserveOriginalQuality || options.quality === 'lossless') {
      // Preserve original quality
      processingOptions.videoBitrate = `${Math.round(videoInfo.bitrate / 1000)}k`;
      processingOptions.crf = 18; // Very high quality
      processingOptions.preset = 'slow';
    } else if (options.quality === 'high') {
      processingOptions.crf = 20;
      processingOptions.preset = 'medium';
    } else if (options.quality === 'medium') {
      processingOptions.crf = 23;
      processingOptions.preset = 'medium';
    } else if (options.quality === 'low') {
      processingOptions.crf = 28;
      processingOptions.preset = 'fast';
    } else if (options.quality === 'custom' && options.customSettings) {
      // Use custom settings
      Object.assign(processingOptions, options.customSettings);
    }
    
    // Resolution settings
    if (options.maxWidth || options.maxHeight) {
      processingOptions.maxWidth = options.maxWidth || videoInfo.width;
      processingOptions.maxHeight = options.maxHeight || videoInfo.height;
    }
    
    // Codec settings
    processingOptions.videoCodec = this.mapVideoCodec(options.videoCodec);
    processingOptions.audioCodec = this.mapAudioCodec(options.audioCodec);
    
    // Format settings
    processingOptions.outputFormat = options.outputFormat;
    
    // Advanced settings
    if (options.enableHardwareAcceleration) {
      processingOptions.enableHardwareAcceleration = true;
    }
    
    return processingOptions;
  }
  
  private calculateEstimatedSize(videoInfo: any, options: ExportOptions): number {
    let bitrate = videoInfo.bitrate;
    
    // Adjust for quality settings
    if (options.quality === 'high' || options.preserveOriginalQuality) {
      bitrate = bitrate * 1.0; // Same bitrate
    } else if (options.quality === 'medium') {
      bitrate = bitrate * 0.7;
    } else if (options.quality === 'low') {
      bitrate = bitrate * 0.4;
    }
    
    // Adjust for resolution changes
    if (options.maxWidth && options.maxHeight) {
      const originalPixels = videoInfo.width * videoInfo.height;
      const targetPixels = options.maxWidth * options.maxHeight;
      const resolutionRatio = targetPixels / originalPixels;
      bitrate = bitrate * resolutionRatio;
    }
    
    // Calculate size: bitrate (bits/sec) * duration (sec) / 8 (bits to bytes)
    return (bitrate * videoInfo.duration) / 8;
  }
  
  private generateOptimalSettings(videoInfo: any, targetQuality: 'high' | 'medium' | 'low'): ExportOptions {
    const baseSettings: ExportOptions = {
      quality: targetQuality,
      preserveOriginalQuality: false,
      outputFormat: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      maintainAspectRatio: true,
      enableTwoPass: false,
      enableHardwareAcceleration: false,
      optimizeForStreaming: true,
      includeMetadata: true,
      exportAsChunks: false,
    };
    
    // Adjust based on input video characteristics
    if (videoInfo.width > 1920 || videoInfo.height > 1080) {
      // 4K+ content - may benefit from H.265
      baseSettings.videoCodec = 'h265';
      baseSettings.enableTwoPass = targetQuality === 'high';
    }
    
    if (videoInfo.duration > 3600) {
      // Long videos - consider chunking
      baseSettings.exportAsChunks = true;
      baseSettings.chunkDuration = 600; // 10 minute chunks
    }
    
    return baseSettings;
  }
  
  private getDefaultSettings(targetQuality: 'high' | 'medium' | 'low'): ExportOptions {
    return {
      quality: targetQuality,
      preserveOriginalQuality: false,
      outputFormat: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      maintainAspectRatio: true,
      enableTwoPass: false,
      enableHardwareAcceleration: false,
      optimizeForStreaming: true,
      includeMetadata: true,
      exportAsChunks: false,
    };
  }
  
  private mapVideoCodec(codec: ExportOptions['videoCodec']): string {
    const codecMap = {
      'h264': 'libx264',
      'h265': 'libx265',
      'vp9': 'libvpx-vp9',
      'av1': 'libaom-av1',
      'prores': 'prores',
    };
    
    return codecMap[codec] || 'libx264';
  }
  
  private mapAudioCodec(codec: ExportOptions['audioCodec']): string {
    const codecMap = {
      'aac': 'aac',
      'opus': 'libopus',
      'flac': 'flac',
      'wav': 'pcm_s16le',
    };
    
    return codecMap[codec] || 'aac';
  }
  
  private generateChunkName(
    originalName: string,
    chunkIndex: number,
    totalChunks: number,
    options: ProcessingOptions
  ): string {
    const baseName = originalName.replace(/\.[^/.]+$/, '');
    const extension = options.outputFormat || 'mp4';
    
    const chunkNumber = String(chunkIndex + 1).padStart(String(totalChunks).length, '0');
    
    return `${baseName}_chunk_${chunkNumber}.${extension}`;
  }
  
  private generateJobId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private initializeQualityPresets(): void {
    // Lossless preset
    this.qualityPresets.set('lossless', {
      name: 'Lossless',
      description: 'No quality loss, largest file size',
      videoCodec: 'h264',
      audioCodec: 'flac',
      videoBitrate: '50M',
      audioBitrate: '1411k',
      crf: 0,
      preset: 'veryslow',
      profile: 'high444',
      pixelFormat: 'yuv444p',
      twoPass: false,
    });
    
    // High quality preset
    this.qualityPresets.set('high', {
      name: 'High Quality',
      description: 'Excellent quality with reasonable file size',
      videoCodec: 'h264',
      audioCodec: 'aac',
      videoBitrate: '8M',
      audioBitrate: '320k',
      crf: 18,
      preset: 'slow',
      profile: 'high',
      pixelFormat: 'yuv420p',
      twoPass: true,
    });
    
    // Medium quality preset
    this.qualityPresets.set('medium', {
      name: 'Medium Quality',
      description: 'Good quality with balanced file size',
      videoCodec: 'h264',
      audioCodec: 'aac',
      videoBitrate: '4M',
      audioBitrate: '192k',
      crf: 23,
      preset: 'medium',
      profile: 'high',
      pixelFormat: 'yuv420p',
      twoPass: false,
    });
    
    // Low quality preset
    this.qualityPresets.set('low', {
      name: 'Low Quality',
      description: 'Acceptable quality with small file size',
      videoCodec: 'h264',
      audioCodec: 'aac',
      videoBitrate: '1M',
      audioBitrate: '128k',
      crf: 28,
      preset: 'fast',
      profile: 'main',
      pixelFormat: 'yuv420p',
      twoPass: false,
    });
  }
}