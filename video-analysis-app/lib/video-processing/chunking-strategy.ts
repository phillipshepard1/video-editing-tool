/**
 * Adaptive Chunking Strategy for Video Processing
 * Analyzes video complexity and creates optimal chunks for memory-efficient processing
 */

import { ChunkInfo } from './ffmpeg-engine';

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  format: string;
  size: number;
}

export interface ChunkingOptions {
  maxChunkSizeMB: number;
  memoryLimit: number;
  targetChunkDuration?: number; // seconds
  minChunkDuration?: number; // seconds
  maxChunkDuration?: number; // seconds
  qualityThreshold?: number; // 0-1, for complexity analysis
  enableSceneDetection?: boolean;
  enableMotionAnalysis?: boolean;
}

export interface ComplexityAnalysis {
  overall: 'low' | 'medium' | 'high';
  timeSegments: Array<{
    startTime: number;
    endTime: number;
    complexity: 'low' | 'medium' | 'high';
    motionScore: number;
    sceneChanges: number;
    bitratePeak: number;
  }>;
  recommendations: {
    chunkDuration: number;
    memoryMultiplier: number;
    processingMode: 'fast' | 'balanced' | 'quality';
  };
}

export class ChunkingStrategy {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  constructor() {
    // Create canvas for frame analysis
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  /**
   * Analyze video and create optimal chunks
   */
  async analyzeAndChunk(
    videoFile: File,
    videoInfo: VideoInfo,
    options: ChunkingOptions
  ): Promise<ChunkInfo[]> {
    try {
      console.log(`Analyzing video for chunking: ${videoInfo.duration}s, ${videoInfo.width}x${videoInfo.height}`);
      
      // Perform complexity analysis
      const complexity = await this.analyzeComplexity(videoFile, videoInfo, options);
      
      // Create chunks based on analysis
      const chunks = await this.createAdaptiveChunks(videoInfo, complexity, options);
      
      console.log(`Created ${chunks.length} adaptive chunks`);
      return chunks;
      
    } catch (error) {
      console.warn('Failed to analyze video complexity, using default chunking:', error);
      return this.createDefaultChunks(videoFile, options);
    }
  }
  
  /**
   * Create default chunks when analysis fails
   */
  async createDefaultChunks(
    videoFile: File,
    options?: ChunkingOptions
  ): Promise<ChunkInfo[]> {
    const opts = {
      maxChunkSizeMB: 500,
      targetChunkDuration: 60, // 1 minute chunks
      ...options,
    };
    
    // Estimate duration from file size and typical bitrates
    const estimatedDuration = this.estimateDurationFromSize(videoFile.size);
    const chunkDuration = opts.targetChunkDuration;
    const numChunks = Math.ceil(estimatedDuration / chunkDuration);
    
    const chunks: ChunkInfo[] = [];
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const endTime = Math.min((i + 1) * chunkDuration, estimatedDuration);
      const duration = endTime - startTime;
      
      chunks.push({
        index: i,
        startTime,
        endTime,
        duration,
        complexity: 'medium', // Default complexity
        estimatedSize: this.estimateChunkSize(videoFile.size, duration, estimatedDuration),
      });
    }
    
    return chunks;
  }
  
  /**
   * Analyze video complexity for optimal chunking
   */
  private async analyzeComplexity(
    videoFile: File,
    videoInfo: VideoInfo,
    options: ChunkingOptions
  ): Promise<ComplexityAnalysis> {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoFile);
    video.preload = 'metadata';
    
    return new Promise((resolve, reject) => {
      video.onloadedmetadata = async () => {
        try {
          const analysis = await this.performComplexityAnalysis(video, videoInfo, options);
          URL.revokeObjectURL(video.src);
          resolve(analysis);
        } catch (error) {
          URL.revokeObjectURL(video.src);
          reject(error);
        }
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Failed to load video for analysis'));
      };
    });
  }
  
  /**
   * Perform detailed complexity analysis
   */
  private async performComplexityAnalysis(
    video: HTMLVideoElement,
    videoInfo: VideoInfo,
    options: ChunkingOptions
  ): Promise<ComplexityAnalysis> {
    const duration = videoInfo.duration;
    const sampleInterval = Math.max(5, duration / 50); // Sample every 5 seconds or 50 samples total
    const timeSegments: ComplexityAnalysis['timeSegments'] = [];
    
    // Set canvas size for analysis
    this.canvas.width = Math.min(320, videoInfo.width); // Downscale for analysis
    this.canvas.height = Math.min(240, videoInfo.height);
    
    let overallComplexityScore = 0;
    let previousFrame: ImageData | null = null;
    
    for (let time = 0; time < duration; time += sampleInterval) {
      const segmentEnd = Math.min(time + sampleInterval, duration);
      
      try {
        // Seek to time
        video.currentTime = time;
        await this.waitForSeek(video);
        
        // Capture frame
        this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
        const currentFrame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        // Analyze frame
        const motionScore = previousFrame ? this.calculateMotion(previousFrame, currentFrame) : 0;
        const complexityScore = this.calculateFrameComplexity(currentFrame);
        const sceneChanges = previousFrame ? this.detectSceneChange(previousFrame, currentFrame) : 0;
        
        // Estimate bitrate peak for this segment
        const bitratePeak = this.estimateBitratePeak(motionScore, complexityScore, videoInfo.bitrate);
        
        const segmentComplexity: 'low' | 'medium' | 'high' = 
          complexityScore > 0.7 ? 'high' :
          complexityScore > 0.4 ? 'medium' : 'low';
        
        timeSegments.push({
          startTime: time,
          endTime: segmentEnd,
          complexity: segmentComplexity,
          motionScore,
          sceneChanges,
          bitratePeak,
        });
        
        overallComplexityScore += complexityScore;
        previousFrame = currentFrame;
        
      } catch (error) {
        console.warn(`Failed to analyze segment at ${time}s:`, error);
        
        // Add default segment
        timeSegments.push({
          startTime: time,
          endTime: segmentEnd,
          complexity: 'medium',
          motionScore: 0.5,
          sceneChanges: 0,
          bitratePeak: videoInfo.bitrate,
        });
      }
    }
    
    const avgComplexity = overallComplexityScore / timeSegments.length;
    const overall: 'low' | 'medium' | 'high' = 
      avgComplexity > 0.7 ? 'high' :
      avgComplexity > 0.4 ? 'medium' : 'low';
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(overall, timeSegments, videoInfo, options);
    
    return {
      overall,
      timeSegments,
      recommendations,
    };
  }
  
  /**
   * Create adaptive chunks based on complexity analysis
   */
  private async createAdaptiveChunks(
    videoInfo: VideoInfo,
    complexity: ComplexityAnalysis,
    options: ChunkingOptions
  ): Promise<ChunkInfo[]> {
    const chunks: ChunkInfo[] = [];
    const { targetChunkDuration = 60, minChunkDuration = 30, maxChunkDuration = 180 } = options;
    
    let currentTime = 0;
    let chunkIndex = 0;
    
    while (currentTime < videoInfo.duration) {
      // Determine optimal chunk duration based on complexity
      const chunkDuration = this.calculateOptimalChunkDuration(
        currentTime,
        complexity,
        targetChunkDuration,
        minChunkDuration,
        maxChunkDuration
      );
      
      const endTime = Math.min(currentTime + chunkDuration, videoInfo.duration);
      const actualDuration = endTime - currentTime;
      
      // Determine chunk complexity
      const chunkComplexity = this.getChunkComplexity(currentTime, endTime, complexity);
      
      // Estimate chunk size
      const estimatedSize = this.estimateAdaptiveChunkSize(
        currentTime,
        endTime,
        complexity,
        videoInfo
      );
      
      chunks.push({
        index: chunkIndex,
        startTime: currentTime,
        endTime,
        duration: actualDuration,
        complexity: chunkComplexity,
        estimatedSize,
      });
      
      currentTime = endTime;
      chunkIndex++;
    }
    
    return chunks;
  }
  
  /**
   * Calculate optimal chunk duration based on complexity
   */
  private calculateOptimalChunkDuration(
    startTime: number,
    complexity: ComplexityAnalysis,
    targetDuration: number,
    minDuration: number,
    maxDuration: number
  ): number {
    // Find segments that overlap with this time range
    const relevantSegments = complexity.timeSegments.filter(
      segment => segment.startTime <= startTime + targetDuration && segment.endTime > startTime
    );
    
    if (relevantSegments.length === 0) {
      return targetDuration;
    }
    
    // Calculate average complexity for this range
    const avgComplexity = relevantSegments.reduce((sum, segment) => {
      const overlapStart = Math.max(segment.startTime, startTime);
      const overlapEnd = Math.min(segment.endTime, startTime + targetDuration);
      const overlapDuration = Math.max(0, overlapEnd - overlapStart);
      
      const complexityScore = segment.complexity === 'high' ? 1 : segment.complexity === 'medium' ? 0.6 : 0.3;
      return sum + (complexityScore * overlapDuration);
    }, 0) / targetDuration;
    
    // Adjust duration based on complexity
    let adjustedDuration = targetDuration;
    
    if (avgComplexity > 0.8) {
      // High complexity: use shorter chunks
      adjustedDuration = targetDuration * 0.6;
    } else if (avgComplexity > 0.5) {
      // Medium complexity: slightly shorter chunks
      adjustedDuration = targetDuration * 0.8;
    } else {
      // Low complexity: can use longer chunks
      adjustedDuration = targetDuration * 1.2;
    }
    
    // Ensure duration is within bounds
    return Math.max(minDuration, Math.min(maxDuration, adjustedDuration));
  }
  
  /**
   * Get chunk complexity based on time range
   */
  private getChunkComplexity(
    startTime: number,
    endTime: number,
    complexity: ComplexityAnalysis
  ): 'low' | 'medium' | 'high' {
    const relevantSegments = complexity.timeSegments.filter(
      segment => segment.startTime < endTime && segment.endTime > startTime
    );
    
    if (relevantSegments.length === 0) {
      return 'medium';
    }
    
    // Calculate weighted average complexity
    let totalWeight = 0;
    let weightedComplexity = 0;
    
    for (const segment of relevantSegments) {
      const overlapStart = Math.max(segment.startTime, startTime);
      const overlapEnd = Math.min(segment.endTime, endTime);
      const weight = overlapEnd - overlapStart;
      
      const complexityScore = segment.complexity === 'high' ? 1 : segment.complexity === 'medium' ? 0.6 : 0.3;
      
      totalWeight += weight;
      weightedComplexity += complexityScore * weight;
    }
    
    const avgComplexity = weightedComplexity / totalWeight;
    
    return avgComplexity > 0.8 ? 'high' : avgComplexity > 0.4 ? 'medium' : 'low';
  }
  
  /**
   * Estimate adaptive chunk size based on complexity
   */
  private estimateAdaptiveChunkSize(
    startTime: number,
    endTime: number,
    complexity: ComplexityAnalysis,
    videoInfo: VideoInfo
  ): number {
    const duration = endTime - startTime;
    const baseSizePerSecond = videoInfo.size / videoInfo.duration;
    
    // Find relevant segments
    const relevantSegments = complexity.timeSegments.filter(
      segment => segment.startTime < endTime && segment.endTime > startTime
    );
    
    if (relevantSegments.length === 0) {
      return baseSizePerSecond * duration;
    }
    
    // Calculate size multiplier based on complexity
    let totalWeight = 0;
    let weightedMultiplier = 0;
    
    for (const segment of relevantSegments) {
      const overlapStart = Math.max(segment.startTime, startTime);
      const overlapEnd = Math.min(segment.endTime, endTime);
      const weight = overlapEnd - overlapStart;
      
      // Complexity affects file size
      const multiplier = segment.complexity === 'high' ? 1.5 : segment.complexity === 'medium' ? 1.0 : 0.7;
      
      totalWeight += weight;
      weightedMultiplier += multiplier * weight;
    }
    
    const avgMultiplier = weightedMultiplier / totalWeight;
    
    return baseSizePerSecond * duration * avgMultiplier;
  }
  
  /**
   * Generate processing recommendations
   */
  private generateRecommendations(
    overall: 'low' | 'medium' | 'high',
    timeSegments: ComplexityAnalysis['timeSegments'],
    videoInfo: VideoInfo,
    options: ChunkingOptions
  ): ComplexityAnalysis['recommendations'] {
    // Calculate average motion and scene changes
    const avgMotion = timeSegments.reduce((sum, seg) => sum + seg.motionScore, 0) / timeSegments.length;
    const totalSceneChanges = timeSegments.reduce((sum, seg) => sum + seg.sceneChanges, 0);
    
    let chunkDuration: number;
    let memoryMultiplier: number;
    let processingMode: 'fast' | 'balanced' | 'quality';
    
    if (overall === 'high') {
      chunkDuration = Math.max(30, options.targetChunkDuration || 60) * 0.6;
      memoryMultiplier = 1.5;
      processingMode = 'quality';
    } else if (overall === 'medium') {
      chunkDuration = options.targetChunkDuration || 60;
      memoryMultiplier = 1.0;
      processingMode = 'balanced';
    } else {
      chunkDuration = Math.min(120, (options.targetChunkDuration || 60) * 1.5);
      memoryMultiplier = 0.8;
      processingMode = 'fast';
    }
    
    // Adjust for high motion content
    if (avgMotion > 0.8) {
      chunkDuration *= 0.8;
      memoryMultiplier *= 1.2;
    }
    
    // Adjust for many scene changes
    if (totalSceneChanges > timeSegments.length * 0.5) {
      chunkDuration *= 0.9;
      memoryMultiplier *= 1.1;
    }
    
    return {
      chunkDuration: Math.round(chunkDuration),
      memoryMultiplier: Math.round(memoryMultiplier * 100) / 100,
      processingMode,
    };
  }
  
  // Helper methods for frame analysis
  
  private calculateMotion(frame1: ImageData, frame2: ImageData): number {
    const data1 = frame1.data;
    const data2 = frame2.data;
    let totalDiff = 0;
    let pixelCount = 0;
    
    // Sample every 4th pixel for performance
    for (let i = 0; i < data1.length; i += 16) {
      const r1 = data1[i];
      const g1 = data1[i + 1];
      const b1 = data1[i + 2];
      
      const r2 = data2[i];
      const g2 = data2[i + 1];
      const b2 = data2[i + 2];
      
      const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      totalDiff += diff;
      pixelCount++;
    }
    
    return Math.min(1, (totalDiff / pixelCount) / (255 * 3));
  }
  
  private calculateFrameComplexity(frame: ImageData): number {
    const data = frame.data;
    let variance = 0;
    let mean = 0;
    let pixelCount = 0;
    
    // Calculate mean brightness
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      mean += brightness;
      pixelCount++;
    }
    mean /= pixelCount;
    
    // Calculate variance
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      variance += Math.pow(brightness - mean, 2);
    }
    variance /= pixelCount;
    
    // Normalize variance to 0-1 scale
    return Math.min(1, variance / (255 * 255));
  }
  
  private detectSceneChange(frame1: ImageData, frame2: ImageData): number {
    const motion = this.calculateMotion(frame1, frame2);
    const complexity1 = this.calculateFrameComplexity(frame1);
    const complexity2 = this.calculateFrameComplexity(frame2);
    
    const complexityDiff = Math.abs(complexity1 - complexity2);
    
    // Scene change is likely if both motion and complexity change significantly
    if (motion > 0.5 && complexityDiff > 0.3) {
      return 1;
    }
    
    return 0;
  }
  
  private estimateBitratePeak(motionScore: number, complexityScore: number, baseBitrate: number): number {
    // Higher motion and complexity typically require higher bitrates
    const multiplier = 1 + (motionScore * 0.5) + (complexityScore * 0.3);
    return baseBitrate * multiplier;
  }
  
  private waitForSeek(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      
      video.addEventListener('seeked', onSeeked);
      
      // Fallback timeout
      setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }, 1000);
    });
  }
  
  private estimateDurationFromSize(sizeBytes: number): number {
    // Rough estimate: assume 2 Mbps average bitrate
    const avgBitrateBps = 2 * 1000 * 1000 / 8; // 2 Mbps in bytes per second
    return sizeBytes / avgBitrateBps;
  }
  
  private estimateChunkSize(totalSize: number, chunkDuration: number, totalDuration: number): number {
    return (totalSize * chunkDuration) / totalDuration;
  }
}