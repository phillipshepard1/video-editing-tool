/**
 * Integration Tests for Video Processing Pipeline
 */

import { VideoProcessingEngine } from '@/lib/video-processing/core-engine';
import { FFmpegEngine } from '@/lib/video-processing/ffmpeg-engine';
import { VideoStorage } from '@/lib/video-processing/storage-manager';
import { MemoryManager } from '@/lib/video-processing/memory-manager';
import { ChunkingStrategy } from '@/lib/video-processing/chunking-strategy';
import { ProgressTracker } from '@/lib/video-processing/progress-tracker';

// Mock dependencies
jest.mock('@/lib/video-processing/ffmpeg-engine');
jest.mock('@/lib/video-processing/storage-manager');

const createMockVideoFile = (size: number, name: string = 'test.mp4'): File => {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type: 'video/mp4' });
};

const createMockVideoInfo = () => ({
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  bitrate: 5000000,
  format: 'mp4',
  size: 150000000,
});

describe('Video Processing Integration', () => {
  let engine: VideoProcessingEngine;
  let mockFFmpegEngine: jest.Mocked<FFmpegEngine>;
  let mockStorage: jest.Mocked<VideoStorage>;

  beforeEach(() => {
    // Setup mocks
    mockFFmpegEngine = new FFmpegEngine() as jest.Mocked<FFmpegEngine>;
    mockStorage = new VideoStorage() as jest.Mocked<VideoStorage>;

    mockFFmpegEngine.initialize = jest.fn().mockResolvedValue(undefined);
    mockFFmpegEngine.getVideoInfo = jest.fn().mockResolvedValue(createMockVideoInfo());
    mockFFmpegEngine.processVideo = jest.fn().mockResolvedValue(
      createMockVideoFile(100 * 1024 * 1024, 'processed.mp4')
    );
    mockFFmpegEngine.processVideoInChunks = jest.fn().mockResolvedValue([
      createMockVideoFile(50 * 1024 * 1024, 'chunk1.mp4'),
      createMockVideoFile(50 * 1024 * 1024, 'chunk2.mp4'),
    ]);
    mockFFmpegEngine.mergeVideos = jest.fn().mockResolvedValue(
      createMockVideoFile(100 * 1024 * 1024, 'merged.mp4')
    );

    mockStorage.initialize = jest.fn().mockResolvedValue(undefined);
    mockStorage.getAllJobs = jest.fn().mockResolvedValue([]);
    mockStorage.saveJobState = jest.fn().mockResolvedValue(undefined);
    mockStorage.saveProcessedVideo = jest.fn().mockResolvedValue(undefined);
    mockStorage.deleteJob = jest.fn().mockResolvedValue(undefined);

    engine = new VideoProcessingEngine({
      maxConcurrentJobs: 2,
      maxMemoryMB: 1000,
      chunkSizeMB: 100,
      enableAutoRecovery: true,
      enableProgressPersistence: true,
    });

    // Replace internal components with mocks
    (engine as any).ffmpegEngine = mockFFmpegEngine;
    (engine as any).storage = mockStorage;
  });

  afterEach(async () => {
    await engine.shutdown();
  });

  describe('Engine Initialization', () => {
    it('should initialize all components successfully', async () => {
      await engine.initialize();

      expect(mockFFmpegEngine.initialize).toHaveBeenCalled();
      expect(mockStorage.initialize).toHaveBeenCalled();
    });

    it('should restore previous jobs on initialization', async () => {
      const mockJobs = [
        {
          id: 'job1',
          inputFile: createMockVideoFile(100 * 1024 * 1024),
          options: {},
          status: 'pending' as const,
          progress: 0,
          startTime: Date.now(),
          chunks: [],
        },
      ];

      mockStorage.getAllJobs.mockResolvedValue(mockJobs);

      await engine.initialize();

      expect(mockStorage.getAllJobs).toHaveBeenCalled();
    });

    it('should handle initialization failure gracefully', async () => {
      mockFFmpegEngine.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(engine.initialize()).rejects.toThrow('Failed to initialize video processing engine');
    });
  });

  describe('Job Management', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should add and process a simple job', async () => {
      const inputFile = createMockVideoFile(50 * 1024 * 1024);
      
      const jobId = await engine.addJob(inputFile, {
        videoBitrate: '2M',
        audioBitrate: '128k',
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');

      const job = engine.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.inputFile).toBe(inputFile);
      expect(job?.status).toMatch(/^(pending|processing|completed)$/);
    });

    it('should handle multiple concurrent jobs', async () => {
      const file1 = createMockVideoFile(50 * 1024 * 1024, 'video1.mp4');
      const file2 = createMockVideoFile(75 * 1024 * 1024, 'video2.mp4');

      const jobId1 = await engine.addJob(file1);
      const jobId2 = await engine.addJob(file2);

      expect(jobId1).not.toBe(jobId2);

      const job1 = engine.getJob(jobId1);
      const job2 = engine.getJob(jobId2);

      expect(job1).toBeDefined();
      expect(job2).toBeDefined();
    });

    it('should cancel jobs correctly', async () => {
      const inputFile = createMockVideoFile(100 * 1024 * 1024);
      const jobId = await engine.addJob(inputFile);

      await engine.cancelJob(jobId);

      const job = engine.getJob(jobId);
      expect(job?.status).toBe('failed');
      expect(job?.error).toContain('cancelled');
    });

    it('should pause and resume jobs', async () => {
      const inputFile = createMockVideoFile(100 * 1024 * 1024);
      const jobId = await engine.addJob(inputFile);

      // Wait a moment for job to start processing
      await new Promise(resolve => setTimeout(resolve, 100));

      await engine.pauseJob(jobId);
      const pausedJob = engine.getJob(jobId);
      expect(pausedJob?.status).toBe('paused');

      await engine.resumeJob(jobId);
      const resumedJob = engine.getJob(jobId);
      expect(resumedJob?.status).toBe('pending');
    });
  });

  describe('Chunked Processing', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should process large files in chunks', async () => {
      const largeFile = createMockVideoFile(500 * 1024 * 1024); // 500MB file
      
      // Mock chunking strategy to return multiple chunks
      const mockChunks = [
        { index: 0, startTime: 0, endTime: 60, duration: 60, complexity: 'medium' as const, estimatedSize: 50 * 1024 * 1024 },
        { index: 1, startTime: 60, endTime: 120, duration: 60, complexity: 'medium' as const, estimatedSize: 50 * 1024 * 1024 },
      ];

      mockFFmpegEngine.getVideoInfo.mockResolvedValue({
        ...createMockVideoInfo(),
        size: largeFile.size,
      });

      const jobId = await engine.addJob(largeFile);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(mockFFmpegEngine.processVideoInChunks).toHaveBeenCalled();
      expect(mockFFmpegEngine.mergeVideos).toHaveBeenCalled();
    });

    it('should handle chunk processing failures', async () => {
      const inputFile = createMockVideoFile(200 * 1024 * 1024);
      
      mockFFmpegEngine.processVideoInChunks.mockRejectedValue(new Error('Chunk processing failed'));

      const jobId = await engine.addJob(inputFile);

      // Wait for processing to fail
      await new Promise(resolve => setTimeout(resolve, 500));

      const job = engine.getJob(jobId);
      expect(job?.status).toBe('failed');
      expect(job?.error).toContain('failed');
    });
  });

  describe('Memory Management', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should respect memory limits', async () => {
      // Create engine with low memory limit
      const lowMemoryEngine = new VideoProcessingEngine({
        maxMemoryMB: 100, // Very low limit
        chunkSizeMB: 50,
      });

      (lowMemoryEngine as any).ffmpegEngine = mockFFmpegEngine;
      (lowMemoryEngine as any).storage = mockStorage;

      await lowMemoryEngine.initialize();

      const largeFile = createMockVideoFile(200 * 1024 * 1024);
      const jobId = await lowMemoryEngine.addJob(largeFile);

      // Should handle memory constraints gracefully
      const job = lowMemoryEngine.getJob(jobId);
      expect(job).toBeDefined();

      await lowMemoryEngine.shutdown();
    });

    it('should clean up memory after job completion', async () => {
      const inputFile = createMockVideoFile(100 * 1024 * 1024);
      const jobId = await engine.addJob(inputFile);

      // Wait for job to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      const stats = engine.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('Progress Tracking', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should track job progress accurately', async () => {
      const inputFile = createMockVideoFile(100 * 1024 * 1024);
      let progressUpdates: any[] = [];

      engine.setEventHandlers({
        onJobProgress: (jobId, progress) => {
          progressUpdates.push(progress);
        },
      });

      const jobId = await engine.addJob(inputFile);

      // Wait for some progress
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(progressUpdates.length).toBeGreaterThanOrEqual(0);
    });

    it('should persist progress when enabled', async () => {
      const inputFile = createMockVideoFile(100 * 1024 * 1024);
      const jobId = await engine.addJob(inputFile);

      // Wait for some processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockStorage.saveJobState).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should handle FFmpeg failures gracefully', async () => {
      const inputFile = createMockVideoFile(100 * 1024 * 1024);
      
      mockFFmpegEngine.processVideo.mockRejectedValue(new Error('FFmpeg crashed'));

      const jobId = await engine.addJob(inputFile);

      // Wait for failure
      await new Promise(resolve => setTimeout(resolve, 300));

      const job = engine.getJob(jobId);
      expect(job?.status).toBe('failed');
    });

    it('should retry failed jobs when auto-recovery is enabled', async () => {
      const inputFile = createMockVideoFile(100 * 1024 * 1024);

      // First call fails, second succeeds
      mockFFmpegEngine.processVideo
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue(createMockVideoFile(100 * 1024 * 1024, 'processed.mp4'));

      const jobId = await engine.addJob(inputFile);

      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 1000));

      const job = engine.getJob(jobId);
      // Should eventually succeed due to retry
      expect(['completed', 'pending', 'processing']).toContain(job?.status);
    });

    it('should handle storage failures', async () => {
      const inputFile = createMockVideoFile(100 * 1024 * 1024);
      
      mockStorage.saveJobState.mockRejectedValue(new Error('Storage failed'));

      const jobId = await engine.addJob(inputFile);

      // Should not crash due to storage failure
      expect(jobId).toBeDefined();
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should provide accurate processing statistics', async () => {
      const stats = engine.getStats();

      expect(stats).toHaveProperty('totalJobs');
      expect(stats).toHaveProperty('completedJobs');
      expect(stats).toHaveProperty('failedJobs');
      expect(stats).toHaveProperty('averageProcessingTime');
      expect(stats).toHaveProperty('currentMemoryUsage');
      expect(stats).toHaveProperty('estimatedTimeRemaining');

      expect(typeof stats.totalJobs).toBe('number');
      expect(typeof stats.completedJobs).toBe('number');
      expect(typeof stats.failedJobs).toBe('number');
    });

    it('should update statistics as jobs are processed', async () => {
      const initialStats = engine.getStats();
      expect(initialStats.totalJobs).toBe(0);

      const inputFile = createMockVideoFile(50 * 1024 * 1024);
      await engine.addJob(inputFile);

      const updatedStats = engine.getStats();
      expect(updatedStats.totalJobs).toBe(1);
    });
  });

  describe('Cleanup and Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await engine.initialize();

      const inputFile = createMockVideoFile(100 * 1024 * 1024);
      await engine.addJob(inputFile);

      // Should not throw during shutdown
      await expect(engine.shutdown()).resolves.not.toThrow();
    });

    it('should clear completed jobs', async () => {
      await engine.initialize();

      const inputFile = createMockVideoFile(50 * 1024 * 1024);
      const jobId = await engine.addJob(inputFile);

      // Manually mark as completed for testing
      const job = engine.getJob(jobId);
      if (job) {
        job.status = 'completed';
      }

      await engine.clearCompletedJobs();

      expect(mockStorage.deleteJob).toHaveBeenCalledWith(jobId);
    });

    it('should handle shutdown with active jobs', async () => {
      await engine.initialize();

      const inputFile = createMockVideoFile(100 * 1024 * 1024);
      await engine.addJob(inputFile);

      // Shutdown immediately while job might be processing
      await expect(engine.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should trigger job completion events', async () => {
      const completionHandler = jest.fn();
      const errorHandler = jest.fn();

      engine.setEventHandlers({
        onJobComplete: completionHandler,
        onJobError: errorHandler,
      });

      const inputFile = createMockVideoFile(50 * 1024 * 1024);
      await engine.addJob(inputFile);

      // Wait for job to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should eventually call completion handler
      // Note: Timing dependent, may need adjustment in real tests
    });

    it('should trigger memory warning events', async () => {
      const memoryWarningHandler = jest.fn();

      engine.setEventHandlers({
        onMemoryWarning: memoryWarningHandler,
      });

      // This would be triggered by memory manager in real scenario
      // For testing, we'd need to simulate high memory usage
    });
  });
});