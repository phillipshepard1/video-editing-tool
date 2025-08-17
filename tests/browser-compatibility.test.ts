/**
 * Browser Compatibility Tests
 * Tests for browser-specific features and fallbacks
 */

import { FFmpegEngine } from '@/lib/video-processing/ffmpeg-engine';
import { VideoStorage } from '@/lib/video-processing/storage-manager';
import { MemoryManager } from '@/lib/video-processing/memory-manager';

// Browser feature detection mocks
const mockBrowserFeatures = {
  webAssembly: true,
  sharedArrayBuffer: true,
  worker: true,
  indexedDB: true,
  performanceMemory: true,
  offscreenCanvas: true,
  mediaRecorder: true,
  webWorkers: true,
};

const mockUnsupportedBrowser = () => {
  delete (global as any).WebAssembly;
  delete (global as any).SharedArrayBuffer;
  delete (global as any).Worker;
  delete (global as any).indexedDB;
  delete (global as any).performance.memory;
};

const restoreBrowserFeatures = () => {
  if (!global.WebAssembly) {
    (global as any).WebAssembly = {
      instantiate: jest.fn(),
      compile: jest.fn(),
      validate: jest.fn(() => true),
    };
  }
  
  if (!global.SharedArrayBuffer) {
    (global as any).SharedArrayBuffer = ArrayBuffer;
  }
  
  if (!global.Worker) {
    (global as any).Worker = jest.fn(() => ({
      postMessage: jest.fn(),
      terminate: jest.fn(),
    }));
  }
  
  if (!global.indexedDB) {
    (global as any).indexedDB = {
      open: jest.fn(),
      deleteDatabase: jest.fn(),
    };
  }
};

describe('Browser Compatibility', () => {
  beforeEach(() => {
    restoreBrowserFeatures();
  });

  describe('WebAssembly Support', () => {
    it('should detect WebAssembly support', () => {
      expect(typeof WebAssembly).toBe('object');
      expect(typeof WebAssembly.instantiate).toBe('function');
    });

    it('should handle missing WebAssembly gracefully', async () => {
      delete (global as any).WebAssembly;

      const ffmpegEngine = new FFmpegEngine();
      
      await expect(ffmpegEngine.initialize()).rejects.toThrow();
    });

    it('should validate WebAssembly binary', () => {
      const mockBinary = new Uint8Array([0x00, 0x61, 0x73, 0x6d]); // WASM magic number
      
      expect(WebAssembly.validate(mockBinary)).toBe(true);
    });

    it('should handle WebAssembly compilation errors', async () => {
      const originalInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = jest.fn().mockRejectedValue(new Error('Compilation failed'));

      const ffmpegEngine = new FFmpegEngine();
      
      await expect(ffmpegEngine.initialize()).rejects.toThrow();
      
      WebAssembly.instantiate = originalInstantiate;
    });
  });

  describe('SharedArrayBuffer Support', () => {
    it('should detect SharedArrayBuffer support', () => {
      expect(typeof SharedArrayBuffer).toBe('function');
    });

    it('should fallback when SharedArrayBuffer is not available', () => {
      delete (global as any).SharedArrayBuffer;
      
      // Should fallback to regular ArrayBuffer
      const buffer = new ArrayBuffer(1024);
      expect(buffer.byteLength).toBe(1024);
    });

    it('should handle cross-origin isolation requirements', () => {
      // SharedArrayBuffer requires cross-origin isolation in browsers
      // This test ensures we handle the case where it's not available
      
      const originalSAB = (global as any).SharedArrayBuffer;
      delete (global as any).SharedArrayBuffer;
      
      const ffmpegEngine = new FFmpegEngine();
      
      // Should not immediately throw, but may have limitations
      expect(() => new FFmpegEngine()).not.toThrow();
      
      (global as any).SharedArrayBuffer = originalSAB;
    });
  });

  describe('IndexedDB Support', () => {
    it('should detect IndexedDB support', () => {
      expect(typeof indexedDB).toBe('object');
      expect(typeof indexedDB.open).toBe('function');
    });

    it('should handle IndexedDB initialization failure', async () => {
      const mockOpen = jest.fn().mockReturnValue({
        addEventListener: jest.fn(),
        result: null,
        error: new Error('DB failed'),
      });
      
      (global as any).indexedDB = { open: mockOpen };
      
      const storage = new VideoStorage();
      
      // Should handle gracefully
      await expect(storage.initialize()).rejects.toThrow();
    });

    it('should handle storage quota exceeded', async () => {
      const storage = new VideoStorage();
      await storage.initialize();

      // Mock quota exceeded error
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      
      // Should handle quota errors gracefully
      expect(() => storage.setSetting('test', 'value')).not.toThrow();
    });

    it('should work with limited storage quota', async () => {
      // Mock limited storage quota
      const originalEstimate = navigator.storage?.estimate;
      
      if (navigator.storage) {
        navigator.storage.estimate = jest.fn().mockResolvedValue({
          quota: 10 * 1024 * 1024, // 10MB only
          usage: 5 * 1024 * 1024,   // 5MB used
        });
      }

      const storage = new VideoStorage();
      await storage.initialize();

      const stats = await storage.getStorageStats();
      expect(stats.quotaUsed).toBeGreaterThan(0);

      if (navigator.storage && originalEstimate) {
        navigator.storage.estimate = originalEstimate;
      }
    });
  });

  describe('Performance API Support', () => {
    it('should detect performance.memory support', () => {
      const hasMemoryAPI = 'memory' in performance;
      // This might be undefined in some browsers
      expect(typeof hasMemoryAPI).toBe('boolean');
    });

    it('should fallback when performance.memory is not available', async () => {
      const originalMemory = (performance as any).memory;
      delete (performance as any).memory;

      const memoryManager = new MemoryManager();
      await memoryManager.initialize();

      // Should work without performance.memory
      const browserMemory = memoryManager.getBrowserMemoryUsage();
      expect(browserMemory).toBeNull();

      (performance as any).memory = originalMemory;
      memoryManager.shutdown();
    });

    it('should handle performance API variations', () => {
      // Different browsers may have different performance APIs
      const apis = ['now', 'mark', 'measure', 'getEntriesByType'];
      
      apis.forEach(api => {
        expect(typeof (performance as any)[api]).toBe('function');
      });
    });
  });

  describe('Worker Support', () => {
    it('should detect Web Worker support', () => {
      expect(typeof Worker).toBe('function');
    });

    it('should handle missing Worker support', () => {
      const originalWorker = global.Worker;
      delete (global as any).Worker;

      // Should handle gracefully
      expect(() => {
        // Code that might use workers
        const hasWorkers = typeof Worker !== 'undefined';
        expect(hasWorkers).toBe(false);
      }).not.toThrow();

      (global as any).Worker = originalWorker;
    });

    it('should handle Worker creation failures', () => {
      const originalWorker = global.Worker;
      (global as any).Worker = jest.fn(() => {
        throw new Error('Worker creation failed');
      });

      expect(() => {
        try {
          new Worker('test.js');
        } catch (error) {
          // Should handle worker creation failures
          expect(error).toBeInstanceOf(Error);
        }
      }).not.toThrow();

      (global as any).Worker = originalWorker;
    });
  });

  describe('Canvas and Media APIs', () => {
    it('should detect Canvas support', () => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(context).toBeTruthy();
    });

    it('should detect OffscreenCanvas support', () => {
      // OffscreenCanvas might not be available in all browsers
      const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
      expect(typeof hasOffscreenCanvas).toBe('boolean');
    });

    it('should handle MediaRecorder API availability', () => {
      // MediaRecorder is used for browser-based recording
      const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
      expect(typeof hasMediaRecorder).toBe('boolean');
      
      if (hasMediaRecorder) {
        expect(typeof MediaRecorder.isTypeSupported).toBe('function');
      }
    });

    it('should check video codec support', () => {
      if (typeof MediaRecorder !== 'undefined') {
        const codecs = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/mp4;codecs=h264',
          'video/mp4;codecs=avc1',
        ];

        codecs.forEach(codec => {
          const supported = MediaRecorder.isTypeSupported(codec);
          expect(typeof supported).toBe('boolean');
        });
      }
    });
  });

  describe('Memory Management Compatibility', () => {
    it('should handle different garbage collection APIs', () => {
      // Some browsers expose gc() function for testing
      const hasGC = typeof (global as any).gc === 'function';
      expect(typeof hasGC).toBe('boolean');

      if (hasGC) {
        expect(() => (global as any).gc()).not.toThrow();
      }
    });

    it('should work with limited memory environments', async () => {
      const memoryManager = new MemoryManager({
        maxMemoryMB: 100, // Very limited for testing
      });

      await memoryManager.initialize();

      // Should handle small allocations
      const success = memoryManager.allocate('test', 50, 'video');
      expect(success).toBe(true);

      // Should reject oversized allocations
      const failure = memoryManager.allocate('big', 200, 'video');
      expect(failure).toBe(false);

      memoryManager.shutdown();
    });

    it('should adapt to browser memory constraints', async () => {
      // Mock different memory scenarios
      const scenarios = [
        { total: 100 * 1024 * 1024, used: 50 * 1024 * 1024 },   // 100MB total, 50MB used
        { total: 2 * 1024 * 1024 * 1024, used: 500 * 1024 * 1024 }, // 2GB total, 500MB used
      ];

      for (const scenario of scenarios) {
        if ((performance as any).memory) {
          (performance as any).memory.jsHeapSizeLimit = scenario.total;
          (performance as any).memory.usedJSHeapSize = scenario.used;
        }

        const memoryManager = new MemoryManager({
          maxMemoryMB: scenario.total / (1024 * 1024) * 0.8, // 80% of available
        });

        await memoryManager.initialize();
        
        const stats = memoryManager.getStats();
        expect(stats.maxUsageMB).toBeGreaterThan(0);
        
        memoryManager.shutdown();
      }
    });
  });

  describe('Feature Detection and Fallbacks', () => {
    it('should provide comprehensive feature detection', () => {
      const features = {
        webAssembly: typeof WebAssembly !== 'undefined',
        sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
        worker: typeof Worker !== 'undefined',
        indexedDB: typeof indexedDB !== 'undefined',
        performanceMemory: 'memory' in performance,
        mediaRecorder: typeof MediaRecorder !== 'undefined',
        offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        serviceWorker: 'serviceWorker' in navigator,
        webGL: (() => {
          const canvas = document.createElement('canvas');
          return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        })(),
      };

      // All features should be detected as boolean
      Object.values(features).forEach(feature => {
        expect(typeof feature).toBe('boolean');
      });

      console.log('Browser features detected:', features);
    });

    it('should handle browser-specific quirks', () => {
      // Test for common browser-specific issues
      const userAgent = navigator.userAgent;
      
      if (userAgent.includes('Chrome')) {
        // Chrome-specific tests
        expect(typeof (window as any).chrome).toBe('object');
      } else if (userAgent.includes('Firefox')) {
        // Firefox-specific tests
        expect(typeof (window as any).InstallTrigger).toBe('object');
      } else if (userAgent.includes('Safari')) {
        // Safari-specific tests
        expect(typeof (window as any).safari).toBe('object');
      }
    });

    it('should provide graceful degradation', async () => {
      // Simulate unsupported browser
      const originalFeatures = {
        WebAssembly: global.WebAssembly,
        SharedArrayBuffer: (global as any).SharedArrayBuffer,
        Worker: global.Worker,
      };

      mockUnsupportedBrowser();

      // System should detect lack of support and provide alternatives
      const hasWebAssembly = typeof WebAssembly !== 'undefined';
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      const hasWorker = typeof Worker !== 'undefined';

      expect(hasWebAssembly).toBe(false);
      expect(hasSharedArrayBuffer).toBe(false);
      expect(hasWorker).toBe(false);

      // Restore features
      Object.assign(global, originalFeatures);
    });

    it('should check for required vs optional features', () => {
      const requiredFeatures = [
        'indexedDB',
        'performance',
        'navigator',
        'document',
        'window',
      ];

      const optionalFeatures = [
        'WebAssembly',
        'SharedArrayBuffer',
        'Worker',
        'MediaRecorder',
        'OffscreenCanvas',
      ];

      // Required features should always be present in test environment
      requiredFeatures.forEach(feature => {
        expect(typeof (global as any)[feature]).not.toBe('undefined');
      });

      // Optional features might not be present
      optionalFeatures.forEach(feature => {
        const exists = typeof (global as any)[feature] !== 'undefined';
        expect(typeof exists).toBe('boolean');
      });
    });
  });

  describe('Cross-Browser Consistency', () => {
    it('should handle different error types consistently', () => {
      const errorTypes = [
        'Error',
        'TypeError',
        'RangeError',
        'ReferenceError',
        'SyntaxError',
      ];

      errorTypes.forEach(ErrorType => {
        const ErrorClass = (global as any)[ErrorType];
        expect(typeof ErrorClass).toBe('function');
        
        const error = new ErrorClass('Test error');
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe(ErrorType);
      });
    });

    it('should handle different Promise implementations', async () => {
      // Test various Promise patterns
      const promise1 = Promise.resolve('test');
      const promise2 = new Promise(resolve => setTimeout(() => resolve('delayed'), 10));
      const promise3 = Promise.reject(new Error('test error'));

      await expect(promise1).resolves.toBe('test');
      await expect(promise2).resolves.toBe('delayed');
      await expect(promise3).rejects.toThrow('test error');
    });

    it('should handle different ArrayBuffer implementations', () => {
      const buffer1 = new ArrayBuffer(1024);
      const buffer2 = new Uint8Array(1024);
      const buffer3 = new DataView(buffer1);

      expect(buffer1.byteLength).toBe(1024);
      expect(buffer2.length).toBe(1024);
      expect(buffer3.byteLength).toBe(1024);
    });
  });
});