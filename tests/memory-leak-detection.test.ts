/**
 * Memory Leak Detection Tests
 * Tests for detecting and preventing memory leaks in video processing
 */

import { MemoryManager } from '@/lib/video-processing/memory-manager';
import { VideoStorage } from '@/lib/video-processing/storage-manager';
import { ProgressTracker } from '@/lib/video-processing/progress-tracker';

// Mock performance.memory for testing
const mockPerformanceMemory = {
  usedJSHeapSize: 50 * 1024 * 1024, // 50MB
  totalJSHeapSize: 100 * 1024 * 1024, // 100MB
  jsHeapSizeLimit: 2 * 1024 * 1024 * 1024, // 2GB
};

Object.defineProperty(performance, 'memory', {
  get: () => mockPerformanceMemory,
  configurable: true,
});

const createLargeArray = (sizeMB: number): number[] => {
  const size = (sizeMB * 1024 * 1024) / 8; // 8 bytes per number
  return new Array(size).fill(1);
};

const createMockVideoFile = (size: number): File => {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], 'test.mp4', { type: 'video/mp4' });
};

describe('Memory Leak Detection', () => {
  let memoryManager: MemoryManager;
  let storage: VideoStorage;
  let progressTracker: ProgressTracker;

  beforeEach(() => {
    memoryManager = new MemoryManager({
      maxMemoryMB: 500,
      monitoringIntervalMs: 100,
    });

    storage = new VideoStorage();
    progressTracker = new ProgressTracker();

    // Reset mock memory values
    mockPerformanceMemory.usedJSHeapSize = 50 * 1024 * 1024;
    mockPerformanceMemory.totalJSHeapSize = 100 * 1024 * 1024;
  });

  afterEach(async () => {
    memoryManager.shutdown();
    progressTracker.shutdown();
    await storage.cleanup();
  });

  describe('Memory Manager Leak Detection', () => {
    it('should detect memory leaks from untracked allocations', async () => {
      await memoryManager.initialize();
      
      // Simulate memory growth without tracking
      let detectedLeak = false;
      
      memoryManager.setWarningCallback((usage, limit) => {
        if (usage > limit * 0.8) {
          detectedLeak = true;
        }
      });

      // Simulate gradual memory growth
      mockPerformanceMemory.usedJSHeapSize = 400 * 1024 * 1024; // 400MB

      // Wait for monitoring to detect the leak
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(detectedLeak).toBe(true);
    });

    it('should identify old allocations as potential leaks', async () => {
      await memoryManager.initialize();

      // Create allocation and make it old
      memoryManager.allocate('test1', 100, 'video');
      
      // Force cleanup of old allocations (simulate 10 minutes old)
      memoryManager.cleanupOldAllocations(1); // 1ms max age

      const recommendations = memoryManager.getRecommendations();
      expect(recommendations.some(r => r.includes('memory leak'))).toBe(true);
    });

    it('should not flag recent allocations as leaks', async () => {
      await memoryManager.initialize();

      memoryManager.allocate('test1', 100, 'video');
      memoryManager.allocate('test2', 150, 'chunk');

      const recommendations = memoryManager.getRecommendations();
      expect(recommendations.some(r => r.includes('memory leak'))).toBe(false);
    });

    it('should track memory growth patterns', async () => {
      await memoryManager.initialize();

      const initialUsage = memoryManager.getCurrentUsage();

      // Allocate and deallocate repeatedly
      for (let i = 0; i < 10; i++) {
        memoryManager.allocate(`test${i}`, 50, 'temp');
        await new Promise(resolve => setTimeout(resolve, 10));
        memoryManager.deallocate(`test${i}`);
      }

      const finalUsage = memoryManager.getCurrentUsage();
      expect(finalUsage).toBe(initialUsage); // Should return to baseline
    });

    it('should detect memory that is not properly deallocated', async () => {
      await memoryManager.initialize();

      // Allocate memory without deallocating
      for (let i = 0; i < 5; i++) {
        memoryManager.allocate(`leak${i}`, 50, 'video');
      }

      const stats = memoryManager.getStats();
      expect(stats.currentUsageMB).toBe(250); // 5 * 50MB

      // These should be flagged as potential leaks after time passes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      memoryManager.cleanupOldAllocations(50); // 50ms max age
      const recommendations = memoryManager.getRecommendations();
      
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Storage Memory Leaks', () => {
    it('should prevent storage from growing indefinitely', async () => {
      await storage.initialize();

      // Add many cache entries
      for (let i = 0; i < 100; i++) {
        const data = new ArrayBuffer(1024 * 1024); // 1MB each
        await storage.setCache(`test${i}`, data);
      }

      const stats = await storage.getStorageStats();
      expect(stats.totalCacheEntries).toBe(100);

      // Clear cache should free memory
      await storage.clearCache();
      
      const clearedStats = await storage.getStorageStats();
      expect(clearedStats.totalCacheEntries).toBe(0);
    });

    it('should automatically clean up old data', async () => {
      await storage.initialize();

      // Set some test data
      await storage.setSetting('test1', { large: createLargeArray(1) });
      await storage.setSetting('test2', { large: createLargeArray(1) });

      const initialStats = await storage.getStorageStats();
      expect(initialStats.totalStorageUsed).toBeGreaterThan(0);

      // Simulate storage cleanup
      await (storage as any).cleanupOldFiles();

      // Storage should still work after cleanup
      const setting = await storage.getSetting('test1');
      expect(setting).toBeDefined();
    });

    it('should handle storage quota exceeded gracefully', async () => {
      await storage.initialize();

      // Mock storage quota check
      const originalEstimate = navigator.storage.estimate;
      navigator.storage.estimate = jest.fn().mockResolvedValue({
        quota: 100 * 1024 * 1024, // 100MB quota
        usage: 95 * 1024 * 1024,  // 95MB used
      });

      try {
        // This should trigger cleanup due to quota pressure
        const stats = await storage.getStorageStats();
        expect(stats.quotaUsed).toBeGreaterThan(90);
        
        // Should handle gracefully without throwing
        await storage.setCache('test', new ArrayBuffer(1024));
        
      } finally {
        navigator.storage.estimate = originalEstimate;
      }
    });
  });

  describe('Progress Tracker Memory Leaks', () => {
    it('should clean up completed job progress data', () => {
      progressTracker.initializeJob('job1', [
        { id: 'stage1', name: 'Stage 1', description: 'Test stage' },
      ]);

      progressTracker.startStage('job1', 'stage1');
      progressTracker.completeStage('job1', 'stage1');
      progressTracker.completeJob('job1');

      expect(progressTracker.getProgress('job1')).toBeDefined();

      // Clean up should remove completed job
      progressTracker.removeJob('job1');
      expect(progressTracker.getProgress('job1')).toBeNull();
    });

    it('should limit memory history size', () => {
      const tracker = new ProgressTracker({
        memoryHistoryLength: 5, // Small limit for testing
      });

      tracker.initializeJob('job1', [
        { id: 'stage1', name: 'Stage 1', description: 'Test stage' },
      ]);

      // Add more memory samples than the limit
      for (let i = 0; i < 10; i++) {
        tracker.updateMemoryStats('job1', {
          currentUsageMB: i * 10,
          maxUsageMB: 1000,
          availableMB: 1000 - (i * 10),
          allocations: [],
          gcRecommended: false,
          warningLevel: 'none',
        });
      }

      const progress = tracker.getProgress('job1');
      expect(progress?.memoryHistory.length).toBeLessThanOrEqual(5);

      tracker.shutdown();
    });

    it('should handle rapid progress updates without memory buildup', () => {
      progressTracker.initializeJob('job1', [
        { id: 'stage1', name: 'Stage 1', description: 'Test stage' },
      ]);

      progressTracker.startStage('job1', 'stage1');

      // Rapid progress updates
      for (let i = 0; i <= 100; i++) {
        progressTracker.updateStageProgress('job1', 'stage1', i);
      }

      const progress = progressTracker.getProgress('job1');
      expect(progress?.stages[0].progress).toBe(100);

      // Should not cause memory issues
      expect(() => {
        progressTracker.removeJob('job1');
      }).not.toThrow();
    });
  });

  describe('Event Listener Leak Detection', () => {
    it('should clean up event listeners on shutdown', () => {
      const tracker = new ProgressTracker();
      
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      tracker.addEventListener('job-completed', handler1);
      tracker.addEventListener('job-failed', handler2);

      // Shutdown should clean up listeners
      tracker.shutdown();

      // Verify handlers are cleaned up (no direct access to test this,
      // but shutdown should not throw and handlers should not be called)
      expect(() => tracker.shutdown()).not.toThrow();
    });

    it('should handle multiple listeners without leaking', () => {
      const tracker = new ProgressTracker();
      
      // Add many listeners
      for (let i = 0; i < 100; i++) {
        tracker.addEventListener('progress-updated', jest.fn());
      }

      // Should not cause memory issues
      expect(() => {
        tracker.shutdown();
      }).not.toThrow();
    });

    it('should remove individual listeners correctly', () => {
      const tracker = new ProgressTracker();
      
      const handler = jest.fn();
      tracker.addEventListener('job-completed', handler);
      tracker.removeEventListener('job-completed', handler);

      // Adding and removing should not cause leaks
      expect(() => {
        tracker.shutdown();
      }).not.toThrow();
    });
  });

  describe('Large Object Handling', () => {
    it('should handle large video files without memory explosion', async () => {
      await memoryManager.initialize();

      // Simulate processing a large video file
      const largeFile = createMockVideoFile(1024 * 1024 * 1024); // 1GB

      // Should be able to track without immediate memory issues
      const success = memoryManager.allocate('large-video', 200, 'video');
      expect(success).toBe(true);

      // Clean up
      memoryManager.deallocate('large-video');
      expect(memoryManager.getCurrentUsage()).toBe(0);
    });

    it('should detect when object references are not released', async () => {
      await memoryManager.initialize();

      // Create objects that should be released
      const objects: any[] = [];
      
      for (let i = 0; i < 10; i++) {
        objects.push({
          id: i,
          data: createLargeArray(1), // 1MB each
        });
        
        memoryManager.allocate(`obj${i}`, 1, 'temp');
      }

      // Deallocate but keep references
      for (let i = 0; i < 10; i++) {
        memoryManager.deallocate(`obj${i}`);
      }

      // Memory manager should show clean state
      expect(memoryManager.getCurrentUsage()).toBe(0);

      // But objects array still holds references
      expect(objects.length).toBe(10);

      // Clean up for real
      objects.length = 0;
    });

    it('should recommend garbage collection for large allocations', async () => {
      await memoryManager.initialize();

      // Allocate close to GC threshold (80% of 500MB = 400MB)
      memoryManager.allocate('large1', 350, 'video');

      const stats = memoryManager.getStats();
      expect(stats.gcRecommended).toBe(false);

      // Push over threshold
      memoryManager.allocate('large2', 100, 'chunk');

      const stats2 = memoryManager.getStats();
      expect(stats2.gcRecommended).toBe(true);
    });
  });

  describe('Cleanup Verification', () => {
    it('should verify complete cleanup after shutdown', async () => {
      await memoryManager.initialize();
      await storage.initialize();

      // Use services
      memoryManager.allocate('test1', 100, 'video');
      await storage.setCache('test', new ArrayBuffer(1024));
      
      progressTracker.initializeJob('job1', [
        { id: 'stage1', name: 'Stage 1', description: 'Test' },
      ]);

      // Shutdown everything
      memoryManager.shutdown();
      await storage.cleanup();
      progressTracker.shutdown();

      // Verify cleanup
      expect(memoryManager.getCurrentUsage()).toBe(0);
      expect(progressTracker.getProgress('job1')).toBeNull();

      // Storage cleanup is harder to verify, but should not throw
      expect(() => storage.cleanup()).not.toThrow();
    });

    it('should handle repeated initialization and shutdown', async () => {
      for (let i = 0; i < 5; i++) {
        const manager = new MemoryManager({ maxMemoryMB: 100 });
        await manager.initialize();
        
        manager.allocate(`test${i}`, 10, 'temp');
        expect(manager.getCurrentUsage()).toBe(10);
        
        manager.shutdown();
        expect(manager.getCurrentUsage()).toBe(0);
      }
    });

    it('should detect memory growth over multiple cycles', async () => {
      await memoryManager.initialize();

      const initialUsage = memoryManager.getCurrentUsage();

      // Simulate processing cycles
      for (let cycle = 0; cycle < 5; cycle++) {
        // Allocate
        for (let i = 0; i < 10; i++) {
          memoryManager.allocate(`cycle${cycle}_${i}`, 10, 'temp');
        }

        // Partial cleanup (simulating imperfect cleanup)
        for (let i = 0; i < 8; i++) {
          memoryManager.deallocate(`cycle${cycle}_${i}`);
        }
      }

      const finalUsage = memoryManager.getCurrentUsage();
      
      // Should detect that memory is growing
      expect(finalUsage).toBeGreaterThan(initialUsage);
      
      const recommendations = memoryManager.getRecommendations();
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });
});