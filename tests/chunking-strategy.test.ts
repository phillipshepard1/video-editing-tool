/**
 * Tests for ChunkingStrategy
 */

import { ChunkingStrategy } from '@/lib/video-processing/chunking-strategy';

// Mock File API
const createMockVideoFile = (size: number, name: string = 'test.mp4'): File => {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type: 'video/mp4' });
};

const createMockVideoInfo = (overrides = {}) => ({
  duration: 120, // 2 minutes
  width: 1920,
  height: 1080,
  fps: 30,
  bitrate: 5000000, // 5 Mbps
  format: 'mp4',
  size: 150000000, // 150 MB
  ...overrides,
});

describe('ChunkingStrategy', () => {
  let chunkingStrategy: ChunkingStrategy;

  beforeEach(() => {
    chunkingStrategy = new ChunkingStrategy();
  });

  describe('createDefaultChunks', () => {
    it('should create default chunks for a video file', async () => {
      const file = createMockVideoFile(100 * 1024 * 1024); // 100 MB
      const options = {
        maxChunkSizeMB: 50,
        targetChunkDuration: 60,
      };

      const chunks = await chunkingStrategy.createDefaultChunks(file, options);

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toHaveProperty('index');
      expect(chunks[0]).toHaveProperty('startTime');
      expect(chunks[0]).toHaveProperty('endTime');
      expect(chunks[0]).toHaveProperty('duration');
      expect(chunks[0]).toHaveProperty('complexity');
      expect(chunks[0]).toHaveProperty('estimatedSize');
    });

    it('should create chunks with correct duration', async () => {
      const file = createMockVideoFile(200 * 1024 * 1024); // 200 MB
      const targetDuration = 30; // 30 seconds
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: targetDuration,
      });

      // Each chunk should be approximately the target duration
      chunks.forEach((chunk, index) => {
        if (index < chunks.length - 1) {
          expect(chunk.duration).toBeCloseTo(targetDuration, 0);
        }
      });
    });

    it('should handle small files with single chunk', async () => {
      const file = createMockVideoFile(10 * 1024 * 1024); // 10 MB
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: 120, // 2 minutes
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].startTime).toBe(0);
    });

    it('should assign sequential indices to chunks', async () => {
      const file = createMockVideoFile(150 * 1024 * 1024); // 150 MB
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: 30,
      });

      chunks.forEach((chunk, index) => {
        expect(chunk.index).toBe(index);
      });
    });

    it('should estimate reasonable chunk sizes', async () => {
      const file = createMockVideoFile(100 * 1024 * 1024); // 100 MB
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: 60,
      });

      const totalEstimatedSize = chunks.reduce((sum, chunk) => sum + chunk.estimatedSize, 0);
      
      // Estimated total should be close to original file size
      expect(totalEstimatedSize).toBeCloseTo(file.size, -6); // Within 1MB
    });
  });

  describe('analyzeAndChunk', () => {
    it('should analyze video and create adaptive chunks', async () => {
      const file = createMockVideoFile(200 * 1024 * 1024);
      const videoInfo = createMockVideoInfo();
      const options = {
        maxChunkSizeMB: 100,
        memoryLimit: 2048,
        targetChunkDuration: 60,
      };

      // Since we can't actually analyze video in tests, this should fall back to default chunking
      const chunks = await chunkingStrategy.analyzeAndChunk(file, videoInfo, options);

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].complexity).toMatch(/^(low|medium|high)$/);
    });

    it('should handle analysis failure gracefully', async () => {
      const file = createMockVideoFile(100 * 1024 * 1024);
      const videoInfo = createMockVideoInfo();
      const options = {
        maxChunkSizeMB: 50,
        memoryLimit: 1024,
      };

      // Should not throw and should fall back to default chunking
      const chunks = await chunkingStrategy.analyzeAndChunk(file, videoInfo, options);

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should adjust chunk size based on video duration', async () => {
      const file = createMockVideoFile(500 * 1024 * 1024);
      const shortVideo = createMockVideoInfo({ duration: 60 }); // 1 minute
      const longVideo = createMockVideoInfo({ duration: 1800 }); // 30 minutes

      const shortChunks = await chunkingStrategy.analyzeAndChunk(file, shortVideo, {
        maxChunkSizeMB: 100,
        memoryLimit: 2048,
      });

      const longChunks = await chunkingStrategy.analyzeAndChunk(file, longVideo, {
        maxChunkSizeMB: 100,
        memoryLimit: 2048,
      });

      // Long video should have more chunks
      expect(longChunks.length).toBeGreaterThan(shortChunks.length);
    });

    it('should respect memory limits when creating chunks', async () => {
      const file = createMockVideoFile(1000 * 1024 * 1024); // 1GB
      const videoInfo = createMockVideoInfo({ size: file.size });
      const options = {
        maxChunkSizeMB: 100,
        memoryLimit: 512, // Low memory limit
      };

      const chunks = await chunkingStrategy.analyzeAndChunk(file, videoInfo, options);

      // Should create smaller chunks due to memory limit
      chunks.forEach(chunk => {
        expect(chunk.estimatedSize).toBeLessThanOrEqual(options.maxChunkSizeMB * 1024 * 1024);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle zero-duration video', async () => {
      const file = createMockVideoFile(1024 * 1024);
      const videoInfo = createMockVideoInfo({ duration: 0 });

      const chunks = await chunkingStrategy.analyzeAndChunk(file, videoInfo, {
        maxChunkSizeMB: 50,
        memoryLimit: 1024,
      });

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle very large files', async () => {
      const file = createMockVideoFile(5 * 1024 * 1024 * 1024); // 5GB
      const videoInfo = createMockVideoInfo({ 
        size: file.size,
        duration: 7200, // 2 hours
      });

      const chunks = await chunkingStrategy.analyzeAndChunk(file, videoInfo, {
        maxChunkSizeMB: 500,
        memoryLimit: 4096,
      });

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(5); // Should be split into multiple chunks
    });

    it('should handle very small files', async () => {
      const file = createMockVideoFile(1024); // 1KB
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: 60,
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].estimatedSize).toBe(file.size);
    });

    it('should handle files with unusual aspect ratios', async () => {
      const file = createMockVideoFile(100 * 1024 * 1024);
      const videoInfo = createMockVideoInfo({
        width: 3840,  // 4K width
        height: 720,  // HD height (unusual aspect ratio)
      });

      const chunks = await chunkingStrategy.analyzeAndChunk(file, videoInfo, {
        maxChunkSizeMB: 50,
        memoryLimit: 2048,
      });

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Chunk properties validation', () => {
    it('should create chunks with non-overlapping time ranges', async () => {
      const file = createMockVideoFile(150 * 1024 * 1024);
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: 30,
      });

      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].startTime).toBeGreaterThanOrEqual(chunks[i - 1].endTime);
      }
    });

    it('should create chunks with positive durations', async () => {
      const file = createMockVideoFile(100 * 1024 * 1024);
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: 45,
      });

      chunks.forEach(chunk => {
        expect(chunk.duration).toBeGreaterThan(0);
        expect(chunk.endTime).toBeGreaterThan(chunk.startTime);
      });
    });

    it('should create chunks with reasonable estimated sizes', async () => {
      const file = createMockVideoFile(200 * 1024 * 1024);
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: 60,
      });

      chunks.forEach(chunk => {
        expect(chunk.estimatedSize).toBeGreaterThan(0);
        expect(chunk.estimatedSize).toBeLessThanOrEqual(file.size);
      });
    });

    it('should assign valid complexity levels', async () => {
      const file = createMockVideoFile(100 * 1024 * 1024);
      const videoInfo = createMockVideoInfo();
      
      const chunks = await chunkingStrategy.analyzeAndChunk(file, videoInfo, {
        maxChunkSizeMB: 50,
        memoryLimit: 1024,
      });

      const validComplexities = ['low', 'medium', 'high'];
      
      chunks.forEach(chunk => {
        expect(validComplexities).toContain(chunk.complexity);
      });
    });
  });

  describe('Options handling', () => {
    it('should respect minChunkDuration option', async () => {
      const file = createMockVideoFile(50 * 1024 * 1024);
      const minDuration = 10;
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: 5, // Smaller than min
        minChunkDuration: minDuration,
      });

      chunks.forEach(chunk => {
        expect(chunk.duration).toBeGreaterThanOrEqual(minDuration - 1); // Allow small tolerance
      });
    });

    it('should respect maxChunkDuration option', async () => {
      const file = createMockVideoFile(500 * 1024 * 1024);
      const maxDuration = 30;
      
      const chunks = await chunkingStrategy.createDefaultChunks(file, {
        targetChunkDuration: 120, // Larger than max
        maxChunkDuration: maxDuration,
      });

      chunks.forEach(chunk => {
        expect(chunk.duration).toBeLessThanOrEqual(maxDuration + 1); // Allow small tolerance
      });
    });

    it('should handle missing options gracefully', async () => {
      const file = createMockVideoFile(100 * 1024 * 1024);
      
      // Should not throw with minimal options
      const chunks = await chunkingStrategy.createDefaultChunks(file);

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});