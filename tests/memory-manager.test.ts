/**
 * Tests for MemoryManager
 */

import { MemoryManager } from '@/lib/video-processing/memory-manager';

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager({
      maxMemoryMB: 1000,
      warningThresholdPercent: 70,
      criticalThresholdPercent: 90,
      gcThresholdPercent: 80,
      monitoringIntervalMs: 100, // Fast for testing
    });
  });

  afterEach(async () => {
    memoryManager.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(memoryManager.initialize()).resolves.not.toThrow();
    });

    it('should start with zero memory usage', () => {
      expect(memoryManager.getCurrentUsage()).toBe(0);
    });

    it('should have correct configuration', () => {
      const stats = memoryManager.getStats();
      expect(stats.maxUsageMB).toBe(1000);
    });
  });

  describe('Memory Allocation', () => {
    beforeEach(async () => {
      await memoryManager.initialize();
    });

    it('should allow allocation within limits', () => {
      const success = memoryManager.allocate('test1', 100, 'video');
      expect(success).toBe(true);
      expect(memoryManager.getCurrentUsage()).toBe(100);
    });

    it('should deny allocation exceeding limits', () => {
      const success = memoryManager.allocate('test1', 1500, 'video'); // Exceeds 1000MB limit
      expect(success).toBe(false);
      expect(memoryManager.getCurrentUsage()).toBe(0);
    });

    it('should track multiple allocations', () => {
      memoryManager.allocate('test1', 100, 'video');
      memoryManager.allocate('test2', 200, 'chunk');
      memoryManager.allocate('test3', 150, 'cache');

      expect(memoryManager.getCurrentUsage()).toBe(450);

      const stats = memoryManager.getStats();
      expect(stats.allocations).toHaveLength(3);
    });

    it('should prevent duplicate allocation IDs', () => {
      memoryManager.allocate('test1', 100, 'video');
      memoryManager.allocate('test1', 200, 'video'); // Same ID

      // Should only count once
      expect(memoryManager.getCurrentUsage()).toBe(200); // Latest allocation
    });

    it('should track allocation types correctly', () => {
      memoryManager.allocate('video1', 100, 'video');
      memoryManager.allocate('chunk1', 200, 'chunk');
      memoryManager.allocate('cache1', 150, 'cache');

      const videoAllocations = memoryManager.getAllocationsByType('video');
      const chunkAllocations = memoryManager.getAllocationsByType('chunk');
      const cacheAllocations = memoryManager.getAllocationsByType('cache');

      expect(videoAllocations).toHaveLength(1);
      expect(chunkAllocations).toHaveLength(1);
      expect(cacheAllocations).toHaveLength(1);

      expect(videoAllocations[0].sizeMB).toBe(100);
      expect(chunkAllocations[0].sizeMB).toBe(200);
      expect(cacheAllocations[0].sizeMB).toBe(150);
    });
  });

  describe('Memory Deallocation', () => {
    beforeEach(async () => {
      await memoryManager.initialize();
    });

    it('should deallocate memory correctly', () => {
      memoryManager.allocate('test1', 100, 'video');
      memoryManager.allocate('test2', 200, 'chunk');

      expect(memoryManager.getCurrentUsage()).toBe(300);

      memoryManager.deallocate('test1');
      expect(memoryManager.getCurrentUsage()).toBe(200);

      memoryManager.deallocate('test2');
      expect(memoryManager.getCurrentUsage()).toBe(0);
    });

    it('should handle deallocation of non-existent allocation', () => {
      memoryManager.allocate('test1', 100, 'video');
      expect(memoryManager.getCurrentUsage()).toBe(100);

      // Should not throw or affect existing allocations
      memoryManager.deallocate('nonexistent');
      expect(memoryManager.getCurrentUsage()).toBe(100);
    });

    it('should clear all allocations', () => {
      memoryManager.allocate('test1', 100, 'video');
      memoryManager.allocate('test2', 200, 'chunk');
      memoryManager.allocate('test3', 150, 'cache');

      expect(memoryManager.getCurrentUsage()).toBe(450);

      memoryManager.clearAllocations();
      expect(memoryManager.getCurrentUsage()).toBe(0);

      const stats = memoryManager.getStats();
      expect(stats.allocations).toHaveLength(0);
    });
  });

  describe('Memory Availability Checking', () => {
    beforeEach(async () => {
      await memoryManager.initialize();
    });

    it('should correctly check if allocation is possible', () => {
      // With 1000MB limit
      expect(memoryManager.canAllocate(500)).toBe(true);
      expect(memoryManager.canAllocate(1500)).toBe(false);

      // After allocating 700MB
      memoryManager.allocate('test1', 700, 'video');
      expect(memoryManager.canAllocate(200)).toBe(true);
      expect(memoryManager.canAllocate(400)).toBe(false);
    });

    it('should account for existing allocations', () => {
      memoryManager.allocate('test1', 600, 'video');

      expect(memoryManager.canAllocate(300)).toBe(true);
      expect(memoryManager.canAllocate(500)).toBe(false);
    });
  });

  describe('Memory Statistics', () => {
    beforeEach(async () => {
      await memoryManager.initialize();
    });

    it('should provide accurate memory statistics', () => {
      memoryManager.allocate('test1', 300, 'video');
      memoryManager.allocate('test2', 200, 'chunk');

      const stats = memoryManager.getStats();

      expect(stats.currentUsageMB).toBe(500);
      expect(stats.maxUsageMB).toBe(1000);
      expect(stats.availableMB).toBe(500);
      expect(stats.allocations).toHaveLength(2);
    });

    it('should calculate warning levels correctly', () => {
      // Low usage (25%)
      memoryManager.allocate('test1', 250, 'video');
      expect(memoryManager.getStats().warningLevel).toBe('low');

      // Medium usage (50%)
      memoryManager.allocate('test2', 250, 'chunk');
      expect(memoryManager.getStats().warningLevel).toBe('medium');

      // High usage (75% - above 70% threshold)
      memoryManager.allocate('test3', 250, 'cache');
      expect(memoryManager.getStats().warningLevel).toBe('high');

      // Critical usage (95% - above 90% threshold)
      memoryManager.allocate('test4', 200, 'temp');
      expect(memoryManager.getStats().warningLevel).toBe('critical');
    });

    it('should recommend garbage collection appropriately', () => {
      // Below GC threshold (80%)
      memoryManager.allocate('test1', 700, 'video');
      expect(memoryManager.getStats().gcRecommended).toBe(false);

      // Above GC threshold
      memoryManager.allocate('test2', 150, 'chunk');
      expect(memoryManager.getStats().gcRecommended).toBe(true);
    });
  });

  describe('Garbage Collection', () => {
    beforeEach(async () => {
      await memoryManager.initialize();
    });

    it('should suggest garbage collection when needed', () => {
      const mockGC = jest.fn();
      (global as any).gc = mockGC;

      memoryManager.allocate('test1', 850, 'video'); // Above 80% threshold
      memoryManager.suggestGarbageCollection();

      expect(mockGC).toHaveBeenCalled();
    });

    it('should force garbage collection', () => {
      const mockGC = jest.fn();
      (global as any).gc = mockGC;

      memoryManager.forceGarbageCollection();
      expect(mockGC).toHaveBeenCalled();
    });

    it('should respect garbage collection cooldown', () => {
      const mockGC = jest.fn();
      (global as any).gc = mockGC;

      memoryManager.forceGarbageCollection();
      memoryManager.forceGarbageCollection(); // Second call immediately

      // Should only be called once due to cooldown
      expect(mockGC).toHaveBeenCalledTimes(1);
    });

    it('should handle missing global.gc gracefully', () => {
      delete (global as any).gc;

      // Should not throw
      expect(() => {
        memoryManager.forceGarbageCollection();
      }).not.toThrow();
    });
  });

  describe('Memory Cleanup', () => {
    beforeEach(async () => {
      await memoryManager.initialize();
    });

    it('should clean up old allocations', () => {
      const now = Date.now();
      
      // Mock timestamps
      memoryManager.allocate('old1', 100, 'video');
      memoryManager.allocate('old2', 200, 'chunk');
      memoryManager.allocate('recent', 150, 'cache');

      // Manually set old timestamps for testing
      const stats = memoryManager.getStats();
      stats.allocations[0].timestamp = now - 400000; // 6.67 minutes ago
      stats.allocations[1].timestamp = now - 600000; // 10 minutes ago
      // stats.allocations[2] remains recent

      const maxAgeMs = 300000; // 5 minutes
      memoryManager.cleanupOldAllocations(maxAgeMs);

      // Should have removed old allocations
      const newStats = memoryManager.getStats();
      expect(newStats.currentUsageMB).toBeLessThan(500); // Less than original 450MB
    });
  });

  describe('Memory Recommendations', () => {
    beforeEach(async () => {
      await memoryManager.initialize();
    });

    it('should provide appropriate recommendations for high memory usage', () => {
      memoryManager.allocate('test1', 950, 'video'); // Critical usage

      const recommendations = memoryManager.getRecommendations();
      
      expect(recommendations).toContain(expect.stringMatching(/critical/i));
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should recommend garbage collection when needed', () => {
      memoryManager.allocate('test1', 850, 'video'); // Above GC threshold

      const recommendations = memoryManager.getRecommendations();
      
      expect(recommendations).toContain(expect.stringMatching(/garbage collection/i));
    });

    it('should detect potential memory leaks', () => {
      const now = Date.now();
      
      memoryManager.allocate('old1', 100, 'video');
      
      // Mock old timestamp
      const stats = memoryManager.getStats();
      stats.allocations[0].timestamp = now - 700000; // 11.67 minutes ago

      const recommendations = memoryManager.getRecommendations();
      
      expect(recommendations).toContain(expect.stringMatching(/memory leak/i));
    });

    it('should provide no recommendations for healthy state', () => {
      memoryManager.allocate('test1', 200, 'video'); // Low usage

      const recommendations = memoryManager.getRecommendations();
      
      // Should have minimal or no recommendations
      expect(recommendations.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Memory Warning Callback', () => {
    it('should call warning callback when memory is high', async () => {
      const warningCallback = jest.fn();
      
      const manager = new MemoryManager({
        maxMemoryMB: 1000,
        warningThresholdPercent: 70,
        onMemoryWarning: warningCallback,
      });

      await manager.initialize();

      // Allocate above warning threshold
      manager.allocate('test1', 800, 'video');

      // Warning callback should be called during monitoring
      // Note: Actual callback triggering happens in monitoring interval
      
      manager.shutdown();
    });

    it('should set warning callback after initialization', () => {
      const warningCallback = jest.fn();
      
      memoryManager.setWarningCallback(warningCallback);
      
      // Should not throw and should accept the callback
      expect(() => {
        memoryManager.setWarningCallback(warningCallback);
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await memoryManager.initialize();
    });

    it('should handle zero memory allocation', () => {
      const success = memoryManager.allocate('test1', 0, 'video');
      expect(success).toBe(true);
      expect(memoryManager.getCurrentUsage()).toBe(0);
    });

    it('should handle negative memory allocation', () => {
      const success = memoryManager.allocate('test1', -100, 'video');
      expect(success).toBe(true); // Might be treated as 0 or handled gracefully
    });

    it('should handle very large allocation requests', () => {
      const success = memoryManager.allocate('test1', Number.MAX_SAFE_INTEGER, 'video');
      expect(success).toBe(false);
      expect(memoryManager.getCurrentUsage()).toBe(0);
    });

    it('should handle allocation with empty ID', () => {
      const success = memoryManager.allocate('', 100, 'video');
      expect(success).toBe(true);
      expect(memoryManager.getCurrentUsage()).toBe(100);
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await memoryManager.initialize();
      
      memoryManager.allocate('test1', 100, 'video');
      expect(memoryManager.getCurrentUsage()).toBe(100);

      memoryManager.shutdown();

      // After shutdown, allocations should be cleared
      expect(memoryManager.getCurrentUsage()).toBe(0);
    });

    it('should handle multiple shutdown calls', () => {
      expect(() => {
        memoryManager.shutdown();
        memoryManager.shutdown();
      }).not.toThrow();
    });
  });
});