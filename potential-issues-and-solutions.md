# Potential Issues & Solutions

## 🚨 Critical Issues to Address Before Implementation

### 1. **Browser Memory Limitations**

**Issue:** Browsers have memory limits (typically 2-4GB for a single tab)
- Chrome: ~2GB per tab
- Firefox: ~2GB per tab  
- Safari: More restrictive, ~1GB

**Impact:** Large video files (>1GB) could crash the browser during processing

**Solutions:**
```javascript
// 1. Stream processing instead of loading entire file
const processVideoStream = async (file: File) => {
  const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
  const stream = file.stream();
  const reader = stream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await processChunk(value);
    
    // Force garbage collection hint
    value = null;
  }
};

// 2. Memory monitoring
const checkMemory = () => {
  if ('memory' in performance) {
    const used = performance.memory.usedJSHeapSize;
    const limit = performance.memory.jsHeapSizeLimit;
    const usage = (used / limit) * 100;
    
    if (usage > 80) {
      console.warn('High memory usage:', usage + '%');
      // Trigger cleanup or pause processing
    }
  }
};

// 3. Blob cleanup after use
const cleanup = (blob: Blob) => {
  if (blob && URL.revokeObjectURL) {
    URL.revokeObjectURL(blob);
  }
};
```

### 2. **FFmpeg.wasm Size & Loading Time**

**Issue:** FFmpeg.wasm is ~30MB, slow initial load
- First load: 5-10 seconds on average connection
- Mobile: Even slower, could timeout

**Solutions:**
```javascript
// 1. Lazy loading with progress
const loadFFmpeg = async (onProgress) => {
  const ffmpeg = new FFmpeg();
  
  ffmpeg.on('log', ({ message }) => {
    console.log(message);
  });
  
  ffmpeg.on('progress', ({ progress }) => {
    onProgress(progress * 100);
  });
  
  await ffmpeg.load({
    coreURL: '/ffmpeg-core.js',
    wasmURL: '/ffmpeg-core.wasm',
    // Use CDN for better performance
    // coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
  });
  
  return ffmpeg;
};

// 2. Cache in Service Worker
// service-worker.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('ffmpeg')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((response) => {
          return caches.open('ffmpeg-cache').then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
  }
});

// 3. Feature detection with fallback
const getVideoConverter = async () => {
  try {
    // Try WebCodecs first (native, no download)
    if ('VideoEncoder' in window) {
      return new WebCodecsConverter();
    }
  } catch (e) {
    console.log('WebCodecs not available');
  }
  
  // Fall back to FFmpeg
  return new FFmpegConverter();
};
```

### 3. **Browser Tab Closure/Refresh**

**Issue:** User closes tab/browser, losing all progress

**Solutions:**
```javascript
// 1. Aggressive auto-save
class ProgressPersistence {
  private saveInterval: NodeJS.Timeout;
  
  startAutoSave(projectId: string) {
    this.saveInterval = setInterval(() => {
      this.saveToIndexedDB(projectId);
    }, 5000); // Save every 5 seconds
  }
  
  async saveToIndexedDB(projectId: string) {
    const db = await this.openDB();
    const tx = db.transaction(['progress'], 'readwrite');
    await tx.objectStore('progress').put({
      id: projectId,
      data: this.currentProgress,
      timestamp: Date.now()
    });
  }
}

// 2. Warn before closing
window.addEventListener('beforeunload', (e) => {
  if (isProcessing) {
    e.preventDefault();
    e.returnValue = 'Video processing in progress. Are you sure you want to leave?';
    
    // Quick save attempt
    navigator.sendBeacon('/api/save-progress', JSON.stringify(progressData));
  }
});

// 3. Resume capability
const resumeProcessing = async (projectId: string) => {
  const saved = await loadFromIndexedDB(projectId);
  if (saved && saved.chunks) {
    const unprocessed = saved.chunks.filter(c => c.status !== 'completed');
    // Resume from first unprocessed chunk
    return processChunks(unprocessed, saved.lastProcessedIndex);
  }
};
```

### 4. **Gemini API Rate Limits**

**Issue:** 
- Rate limits: 60 requests/minute
- Token limits: 1M tokens per request
- Quota limits: Daily/monthly caps

**Solutions:**
```javascript
// 1. Smart rate limiting
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestsPerMinute = 60;
  private minDelay = 60000 / this.requestsPerMinute; // 1 second minimum
  
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.process();
    });
  }
  
  private async process() {
    if (this.processing) return;
    this.processing = true;
    
    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      const start = Date.now();
      
      await fn();
      
      const elapsed = Date.now() - start;
      if (elapsed < this.minDelay) {
        await new Promise(resolve => setTimeout(resolve, this.minDelay - elapsed));
      }
    }
    
    this.processing = false;
  }
}

// 2. Retry with exponential backoff
const retryWithBackoff = async (fn, maxRetries = 3) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (error.status === 429) { // Rate limited
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (error.status === 503) { // Service unavailable
        const delay = 5000 * (i + 1); // 5s, 10s, 15s
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Don't retry other errors
      }
    }
  }
  
  throw lastError;
};
```

### 5. **Cross-Browser Compatibility**

**Issue:** Different API support across browsers

**Solutions:**
```javascript
// Feature detection and polyfills
const checkBrowserSupport = () => {
  const features = {
    webCodecs: 'VideoDecoder' in window && 'VideoEncoder' in window,
    webGL2: !!document.createElement('canvas').getContext('webgl2'),
    sharedArrayBuffer: 'SharedArrayBuffer' in window,
    serviceWorker: 'serviceWorker' in navigator,
    indexedDB: 'indexedDB' in window,
    webAssembly: 'WebAssembly' in window,
    fileSystemAPI: 'showOpenFilePicker' in window
  };
  
  // Determine best strategy
  if (!features.webAssembly) {
    throw new Error('Browser does not support WebAssembly. Please use Chrome, Firefox, Safari 14+ or Edge.');
  }
  
  if (!features.indexedDB) {
    console.warn('No IndexedDB support, using localStorage fallback');
  }
  
  return features;
};

// Progressive enhancement
const getOptimalStrategy = (features) => {
  if (features.webCodecs && features.webGL2) {
    return 'native-accelerated';
  } else if (features.webAssembly && features.sharedArrayBuffer) {
    return 'ffmpeg-multithread';
  } else if (features.webAssembly) {
    return 'ffmpeg-singlethread';
  } else {
    return 'server-fallback';
  }
};
```

### 6. **Mobile Device Limitations**

**Issue:** Mobile browsers have stricter limits
- Lower memory (512MB - 1GB)
- No SharedArrayBuffer on iOS Safari
- Battery drain concerns
- Network instability

**Solutions:**
```javascript
// 1. Detect mobile and adjust
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const getMobileSettings = () => {
  if (isMobile) {
    return {
      maxFileSize: 500 * 1024 * 1024, // 500MB max
      chunkSize: 10 * 1024 * 1024,    // 10MB chunks
      quality: 'low',                  // Lower quality encoding
      concurrent: 1,                   // No parallel processing
      useFFmpeg: false                 // Avoid heavy WASM on mobile
    };
  }
  
  return {
    maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
    chunkSize: 100 * 1024 * 1024,        // 100MB chunks
    quality: 'high',
    concurrent: 3,
    useFFmpeg: true
  };
};

// 2. Battery API monitoring
if ('getBattery' in navigator) {
  navigator.getBattery().then(battery => {
    if (battery.level < 0.15 && !battery.charging) {
      alert('Low battery! Video processing may drain your battery quickly.');
    }
  });
}

// 3. Wake Lock to prevent sleep
const requestWakeLock = async () => {
  if ('wakeLock' in navigator) {
    try {
      const wakeLock = await navigator.wakeLock.request('screen');
      return wakeLock;
    } catch (err) {
      console.log('Wake Lock failed:', err);
    }
  }
};
```

### 7. **Large File Handling (>2GB)**

**Issue:** File API limitations with very large files

**Solutions:**
```javascript
// 1. File slicing for large files
const processLargeFile = async (file: File) => {
  const SLICE_SIZE = 100 * 1024 * 1024; // 100MB slices
  const slices = [];
  
  for (let start = 0; start < file.size; start += SLICE_SIZE) {
    const end = Math.min(start + SLICE_SIZE, file.size);
    const slice = file.slice(start, end);
    slices.push(slice);
  }
  
  // Process slices sequentially to avoid memory overflow
  for (const slice of slices) {
    await processSlice(slice);
    // Allow GC between slices
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};

// 2. Streaming with ReadableStream
const streamLargeFile = async (file: File) => {
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  
  let buffer = new Uint8Array(0);
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    // Combine with existing buffer
    const newBuffer = new Uint8Array(buffer.length + value.length);
    newBuffer.set(buffer);
    newBuffer.set(value, buffer.length);
    buffer = newBuffer;
    
    // Process when buffer reaches threshold
    if (buffer.length >= 50 * 1024 * 1024) {
      await processBuffer(buffer);
      buffer = new Uint8Array(0);
    }
  }
};
```

### 8. **CORS Issues with Gemini API**

**Issue:** Direct API calls from browser may face CORS restrictions

**Solutions:**
```javascript
// 1. Proxy through your server (when you add Vercel)
const callGeminiAPI = async (data) => {
  if (USE_PROXY) {
    // Route through your server
    return fetch('/api/gemini-proxy', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  } else {
    // Direct call with proper headers
    return fetch('https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY // Be careful with key exposure
      },
      body: JSON.stringify(data)
    });
  }
};

// 2. Use official SDK which handles CORS
import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(API_KEY);
```

## 🎯 Pre-Implementation Checklist

### Must Have Before Starting:
- [ ] Browser feature detection implemented
- [ ] Memory monitoring system
- [ ] Progress persistence (IndexedDB)
- [ ] Error boundaries and recovery
- [ ] Rate limiting for API calls
- [ ] Mobile detection and settings

### Nice to Have:
- [ ] Service Worker for caching
- [ ] Wake Lock API
- [ ] Battery monitoring
- [ ] Network speed detection
- [ ] Compression before chunking

## 📊 Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Browser crash (memory) | Medium | High | Stream processing, memory monitoring |
| API rate limits | High | Medium | Queue system, backoff strategy |
| User closes tab | High | High | Auto-save, resume capability |
| Mobile performance | High | Medium | Reduced settings, warnings |
| Network failure | Medium | High | Retry logic, offline queue |
| Browser incompatibility | Low | High | Feature detection, fallbacks |

## 🚀 Recommended Implementation Order

1. **Phase 1: Core Pipeline**
   - Basic file selection
   - MP4 detection (skip conversion initially)
   - Simple chunking (fixed size)
   - Mock API calls

2. **Phase 2: Progress & Persistence**
   - Progress bar UI
   - IndexedDB storage
   - Resume capability
   - Error recovery

3. **Phase 3: Conversion**
   - FFmpeg.wasm integration
   - WebCodecs fallback
   - Format detection

4. **Phase 4: Optimization**
   - Memory management
   - Rate limiting
   - Mobile optimizations
   - Performance monitoring

5. **Phase 5: Polish**
   - Service Worker
   - Advanced error handling
   - Analytics
   - User settings