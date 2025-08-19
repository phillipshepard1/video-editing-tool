/**
 * FFmpeg.wasm Engine for Browser-based Video Processing
 * Handles video conversion, compression, and chunk processing
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface ProcessingOptions {
  // Video output settings
  maxWidth?: number;
  maxHeight?: number;
  videoBitrate?: string;
  audioBitrate?: string;
  fps?: number;
  
  // Quality settings
  crf?: number; // 18-28, lower = better quality
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  
  // Format settings
  outputFormat?: 'mp4' | 'webm' | 'mov';
  videoCodec?: 'libx264' | 'libx265' | 'libvpx-vp9';
  audioCodec?: 'aac' | 'libopus' | 'libvorbis';
  
  // Processing settings
  enableHardwareAcceleration?: boolean;
  enableGPUProcessing?: boolean;
  memoryLimit?: number; // MB
}

export interface ProcessingProgress {
  stage: 'initializing' | 'processing' | 'finalizing' | 'complete' | 'error';
  progress: number; // 0-100
  currentTime: number; // seconds processed
  totalTime: number; // total video duration
  speed: number; // processing speed multiplier
  bitrate: string; // current bitrate
  fps: number; // current fps
  size: number; // output size in bytes
  timeRemaining: number; // estimated seconds remaining
}

export interface ChunkInfo {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  complexity: 'low' | 'medium' | 'high';
  estimatedSize: number;
}

export class FFmpegEngine {
  private ffmpeg: FFmpeg;
  private isLoaded = false;
  private onProgress?: (progress: ProcessingProgress) => void;
  private memoryUsage = 0;
  private maxMemoryMB = 2048; // 2GB default limit
  
  constructor(options: { onProgress?: (progress: ProcessingProgress) => void; maxMemoryMB?: number } = {}) {
    this.ffmpeg = new FFmpeg();
    this.onProgress = options.onProgress;
    this.maxMemoryMB = options.maxMemoryMB || 2048;
    
    // Set up progress monitoring
    this.ffmpeg.on('log', ({ message }) => {
      this.parseFFmpegProgress(message);
    });
    
    this.ffmpeg.on('progress', ({ progress, time }) => {
      if (this.onProgress) {
        this.onProgress({
          stage: 'processing',
          progress: progress * 100,
          currentTime: time / 1000000, // Convert microseconds to seconds
          totalTime: 0, // Will be updated from log parsing
          speed: 0,
          bitrate: '',
          fps: 0,
          size: 0,
          timeRemaining: 0,
        });
      }
    });
  }
  
  /**
   * Initialize FFmpeg.wasm with optimized settings
   */
  async initialize(): Promise<void> {
    if (this.isLoaded) return;
    
    try {
      this.reportProgress({
        stage: 'initializing',
        progress: 0,
        currentTime: 0,
        totalTime: 0,
        speed: 0,
        bitrate: '',
        fps: 0,
        size: 0,
        timeRemaining: 0,
      });
      
      // Load FFmpeg with optimized core for desktop browsers
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
      
      this.isLoaded = true;
      
      this.reportProgress({
        stage: 'initializing',
        progress: 100,
        currentTime: 0,
        totalTime: 0,
        speed: 0,
        bitrate: '',
        fps: 0,
        size: 0,
        timeRemaining: 0,
      });
      
    } catch (error) {
      this.reportProgress({
        stage: 'error',
        progress: 0,
        currentTime: 0,
        totalTime: 0,
        speed: 0,
        bitrate: '',
        fps: 0,
        size: 0,
        timeRemaining: 0,
      });
      throw new Error(`Failed to initialize FFmpeg: ${error}`);
    }
  }
  
  /**
   * Process video file with given options
   */
  async processVideo(
    inputFile: File, 
    options: ProcessingOptions = {}
  ): Promise<File> {
    if (!this.isLoaded) {
      await this.initialize();
    }
    
    try {
      const {
        maxWidth = 1920,
        maxHeight = 1080,
        videoBitrate = '2M',
        audioBitrate = '128k',
        fps = 30,
        crf = 23,
        preset = 'medium',
        outputFormat = 'mp4',
        videoCodec = 'libx264',
        audioCodec = 'aac',
      } = options;
      
      this.reportProgress({
        stage: 'processing',
        progress: 0,
        currentTime: 0,
        totalTime: 0,
        speed: 0,
        bitrate: '',
        fps: 0,
        size: 0,
        timeRemaining: 0,
      });
      
      // Write input file to FFmpeg filesystem
      const inputName = `input.${this.getFileExtension(inputFile.name)}`;
      const outputName = `output.${outputFormat}`;
      
      await this.ffmpeg.writeFile(inputName, await fetchFile(inputFile));
      
      // Build FFmpeg command for optimized processing
      const command = this.buildProcessingCommand(inputName, outputName, {
        maxWidth,
        maxHeight,
        videoBitrate,
        audioBitrate,
        fps,
        crf,
        preset,
        videoCodec,
        audioCodec,
      });
      
      // Execute processing
      await this.ffmpeg.exec(command);
      
      // Read processed file
      const data = await this.ffmpeg.readFile(outputName);
      const processedBlob = new Blob([data], { type: `video/${outputFormat}` });
      
      // Clean up files from memory
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile(outputName);
      
      this.reportProgress({
        stage: 'complete',
        progress: 100,
        currentTime: 0,
        totalTime: 0,
        speed: 0,
        bitrate: '',
        fps: 0,
        size: processedBlob.size,
        timeRemaining: 0,
      });
      
      return new File(
        [processedBlob], 
        inputFile.name.replace(/\.[^/.]+$/, `.${outputFormat}`),
        { type: `video/${outputFormat}` }
      );
      
    } catch (error) {
      this.reportProgress({
        stage: 'error',
        progress: 0,
        currentTime: 0,
        totalTime: 0,
        speed: 0,
        bitrate: '',
        fps: 0,
        size: 0,
        timeRemaining: 0,
      });
      throw new Error(`Video processing failed: ${error}`);
    }
  }
  
  /**
   * Process video in chunks for large files
   */
  async processVideoInChunks(
    inputFile: File,
    chunks: ChunkInfo[],
    options: ProcessingOptions = {}
  ): Promise<File[]> {
    if (!this.isLoaded) {
      await this.initialize();
    }
    
    const processedChunks: File[] = [];
    const inputName = `input.${this.getFileExtension(inputFile.name)}`;
    
    try {
      // Write input file once
      await this.ffmpeg.writeFile(inputName, await fetchFile(inputFile));
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const outputName = `chunk_${i}.${options.outputFormat || 'mp4'}`;
        
        this.reportProgress({
          stage: 'processing',
          progress: (i / chunks.length) * 100,
          currentTime: chunk.startTime,
          totalTime: chunks[chunks.length - 1].endTime,
          speed: 0,
          bitrate: '',
          fps: 0,
          size: 0,
          timeRemaining: 0,
        });
        
        // Build command for chunk extraction and processing
        const command = this.buildChunkCommand(
          inputName, 
          outputName, 
          chunk.startTime, 
          chunk.duration, 
          options
        );
        
        await this.ffmpeg.exec(command);
        
        // Read processed chunk
        const data = await this.ffmpeg.readFile(outputName);
        const chunkBlob = new Blob([data], { type: `video/${options.outputFormat || 'mp4'}` });
        
        processedChunks.push(new File(
          [chunkBlob],
          `${inputFile.name}_chunk_${i}.${options.outputFormat || 'mp4'}`,
          { type: `video/${options.outputFormat || 'mp4'}` }
        ));
        
        // Clean up chunk file
        await this.ffmpeg.deleteFile(outputName);
        
        // Monitor memory usage
        this.memoryUsage += chunkBlob.size / (1024 * 1024); // Convert to MB
        if (this.memoryUsage > this.maxMemoryMB * 0.8) {
          // Trigger garbage collection hint
          if (global.gc) {
            global.gc();
          }
          this.memoryUsage = 0;
        }
      }
      
      // Clean up input file
      await this.ffmpeg.deleteFile(inputName);
      
      return processedChunks;
      
    } catch (error) {
      // Clean up on error
      try {
        await this.ffmpeg.deleteFile(inputName);
      } catch {}
      
      this.reportProgress({
        stage: 'error',
        progress: 0,
        currentTime: 0,
        totalTime: 0,
        speed: 0,
        bitrate: '',
        fps: 0,
        size: 0,
        timeRemaining: 0,
      });
      
      throw new Error(`Chunk processing failed: ${error}`);
    }
  }
  
  /**
   * Merge multiple video files into one
   */
  async mergeVideos(videoFiles: File[], outputName: string = 'merged.mp4'): Promise<File> {
    if (!this.isLoaded) {
      await this.initialize();
    }
    
    try {
      // Write all input files
      const inputNames: string[] = [];
      for (let i = 0; i < videoFiles.length; i++) {
        const inputName = `input_${i}.${this.getFileExtension(videoFiles[i].name)}`;
        await this.ffmpeg.writeFile(inputName, await fetchFile(videoFiles[i]));
        inputNames.push(inputName);
      }
      
      // Create concat file list
      const concatList = inputNames.map(name => `file '${name}'`).join('\n');
      await this.ffmpeg.writeFile('concat.txt', concatList);
      
      // Execute merge command
      await this.ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        outputName
      ]);
      
      // Read merged file
      const data = await this.ffmpeg.readFile(outputName);
      const mergedBlob = new Blob([data], { type: 'video/mp4' });
      
      // Clean up
      for (const inputName of inputNames) {
        await this.ffmpeg.deleteFile(inputName);
      }
      await this.ffmpeg.deleteFile('concat.txt');
      await this.ffmpeg.deleteFile(outputName);
      
      return new File([mergedBlob], outputName, { type: 'video/mp4' });
      
    } catch (error) {
      throw new Error(`Video merging failed: ${error}`);
    }
  }
  
  /**
   * Get video metadata
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
    if (!this.isLoaded) {
      await this.initialize();
    }
    
    const inputName = `probe.${this.getFileExtension(file.name)}`;
    
    try {
      await this.ffmpeg.writeFile(inputName, await fetchFile(file));
      
      // Use ffprobe to get video information
      await this.ffmpeg.exec([
        '-i', inputName,
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        'info.json'
      ]);
      
      const infoData = await this.ffmpeg.readFile('info.json');
      const info = JSON.parse(
        typeof infoData === 'string' 
          ? infoData 
          : new TextDecoder().decode(infoData as Uint8Array)
      );
      
      // Clean up
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile('info.json');
      
      const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
      
      return {
        duration: parseFloat(info.format.duration),
        width: videoStream.width,
        height: videoStream.height,
        fps: eval(videoStream.r_frame_rate), // Handle fraction like "30/1"
        bitrate: parseInt(info.format.bit_rate),
        format: info.format.format_name,
        size: parseInt(info.format.size),
      };
      
    } catch (error) {
      try {
        await this.ffmpeg.deleteFile(inputName);
      } catch {}
      throw new Error(`Failed to get video info: ${error}`);
    }
  }
  
  /**
   * Terminate FFmpeg and clean up resources
   */
  async terminate(): Promise<void> {
    if (this.isLoaded) {
      await this.ffmpeg.terminate();
      this.isLoaded = false;
    }
  }
  
  // Private helper methods
  
  private buildProcessingCommand(
    inputName: string, 
    outputName: string, 
    options: any
  ): string[] {
    const command = ['-i', inputName];
    
    // Video encoding settings
    command.push('-c:v', options.videoCodec);
    command.push('-preset', options.preset);
    command.push('-crf', options.crf.toString());
    
    // Resolution scaling (maintain aspect ratio)
    command.push('-vf', `scale='min(${options.maxWidth},iw)':'min(${options.maxHeight},ih)':force_original_aspect_ratio=decrease`);
    
    // Frame rate
    command.push('-r', options.fps.toString());
    
    // Audio encoding
    command.push('-c:a', options.audioCodec);
    command.push('-b:a', options.audioBitrate);
    
    // Output optimization
    command.push('-movflags', '+faststart'); // Enable streaming
    command.push('-pix_fmt', 'yuv420p'); // Ensure compatibility
    
    // Memory optimization
    command.push('-threads', '0'); // Use all available cores
    command.push('-fflags', '+genpts'); // Generate presentation timestamps
    
    command.push(outputName);
    
    return command;
  }
  
  private buildChunkCommand(
    inputName: string, 
    outputName: string, 
    startTime: number, 
    duration: number, 
    options: ProcessingOptions
  ): string[] {
    const command = ['-i', inputName];
    
    // Time range
    command.push('-ss', startTime.toString());
    command.push('-t', duration.toString());
    
    // Video settings
    command.push('-c:v', options.videoCodec || 'libx264');
    command.push('-preset', options.preset || 'medium');
    command.push('-crf', (options.crf || 23).toString());
    
    // Audio settings
    command.push('-c:a', options.audioCodec || 'aac');
    command.push('-b:a', options.audioBitrate || '128k');
    
    // Ensure accuracy with keyframes
    command.push('-avoid_negative_ts', 'make_zero');
    command.push('-fflags', '+genpts');
    
    command.push(outputName);
    
    return command;
  }
  
  private parseFFmpegProgress(message: string): void {
    // Parse FFmpeg log output for detailed progress information
    if (message.includes('frame=') && this.onProgress) {
      const frameMatch = message.match(/frame=\s*(\d+)/);
      const fpsMatch = message.match(/fps=\s*([\d.]+)/);
      const sizeMatch = message.match(/size=\s*(\d+)kB/);
      const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2}.\d{2})/);
      const bitrateMatch = message.match(/bitrate=\s*([\d.]+)kbits\/s/);
      const speedMatch = message.match(/speed=\s*([\d.]+)x/);
      
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        
        this.onProgress({
          stage: 'processing',
          progress: 0, // Will be calculated based on total duration
          currentTime,
          totalTime: 0,
          speed: speedMatch ? parseFloat(speedMatch[1]) : 0,
          bitrate: bitrateMatch ? `${bitrateMatch[1]}kbps` : '',
          fps: fpsMatch ? parseFloat(fpsMatch[1]) : 0,
          size: sizeMatch ? parseInt(sizeMatch[1]) * 1024 : 0,
          timeRemaining: 0, // Calculate based on speed and remaining time
        });
      }
    }
  }
  
  private reportProgress(progress: ProcessingProgress): void {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }
  
  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'mp4';
  }
}