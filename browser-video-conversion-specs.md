# Browser-Based Video Conversion Specifications
## MP4 Conversion & Processing Capabilities

### 1. Browser-Based Video Conversion Options

#### 1.1 FFmpeg.wasm (Most Powerful)

**Overview**
FFmpeg compiled to WebAssembly runs entirely in the browser, providing full video conversion capabilities.

**Implementation**
```javascript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

class VideoConverter {
  constructor() {
    this.ffmpeg = new FFmpeg();
    this.loaded = false;
  }

  async load() {
    if (!this.loaded) {
      await this.ffmpeg.load({
        coreURL: '/ffmpeg-core.js',
        wasmURL: '/ffmpeg-core.wasm',
        workerURL: '/ffmpeg-core.worker.js'
      });
      this.loaded = true;
    }
  }

  async convertToMP4(inputFile, options = {}) {
    await this.load();
    
    const {
      codec = 'libx264',
      quality = 23,
      preset = 'medium',
      resolution = null,
      bitrate = null,
      fps = null
    } = options;

    // Write input file to FFmpeg filesystem
    await this.ffmpeg.writeFile('input', await fetchFile(inputFile));

    // Build FFmpeg command
    const commands = [
      '-i', 'input',
      '-c:v', codec,
      '-preset', preset,
      '-crf', quality.toString(),
      '-c:a', 'aac',
      '-b:a', '128k'
    ];

    if (resolution) {
      commands.push('-vf', `scale=${resolution}`);
    }
    if (bitrate) {
      commands.push('-b:v', bitrate);
    }
    if (fps) {
      commands.push('-r', fps.toString());
    }

    commands.push('output.mp4');

    // Execute conversion
    await this.ffmpeg.exec(commands);

    // Read the output file
    const data = await this.ffmpeg.readFile('output.mp4');
    
    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  async convertWithProgress(inputFile, options, onProgress) {
    await this.load();

    // Set up progress callback
    this.ffmpeg.on('progress', ({ progress, time }) => {
      onProgress({
        percent: progress * 100,
        time: time
      });
    });

    return await this.convertToMP4(inputFile, options);
  }
}
```

**Supported Input Formats**
- AVI, MKV, MOV, WMV, FLV
- WebM, OGV, 3GP, M4V
- MPEG, MPG, TS
- Basically any format FFmpeg supports

**Performance Characteristics**
```javascript
// Conversion speed estimates (on modern hardware)
const conversionSpeeds = {
  '1080p_30min': '5-10 minutes',
  '720p_30min': '3-5 minutes',
  '480p_30min': '1-3 minutes',
  '4K_30min': '15-30 minutes'
};

// Memory usage
const memoryRequirements = {
  'under_100MB': '512MB RAM',
  '100MB_1GB': '1-2GB RAM',
  '1GB_5GB': '2-4GB RAM',
  'over_5GB': '4-8GB RAM'
};
```

#### 1.2 WebCodecs API (Native & Fast)

**Overview**
Modern browser API for hardware-accelerated encoding/decoding.

**Implementation**
```javascript
class WebCodecsConverter {
  async convertToMP4(inputFile) {
    const videoDecoder = new VideoDecoder({
      output: (frame) => this.processFrame(frame),
      error: (e) => console.error(e)
    });

    const videoEncoder = new VideoEncoder({
      output: (chunk, metadata) => this.handleEncodedChunk(chunk, metadata),
      error: (e) => console.error(e)
    });

    // Configure encoder for MP4/H.264
    videoEncoder.configure({
      codec: 'avc1.42001E', // H.264 Baseline Profile
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware',
      avc: { format: 'annexb' }
    });

    // Process video stream
    const videoStream = await this.demuxVideo(inputFile);
    
    for (const chunk of videoStream) {
      videoDecoder.decode(chunk);
    }

    await videoDecoder.flush();
    await videoEncoder.flush();

    return this.muxToMP4();
  }

  async muxToMP4() {
    // Use MP4Box.js for muxing
    const mp4box = MP4Box.createFile();
    
    // Add video track
    const videoTrack = mp4box.addTrack({
      timescale: 90000,
      width: 1920,
      height: 1080,
      type: 'avc1',
      avcDecoderConfigRecord: this.getAVCConfig()
    });

    // Add audio track
    const audioTrack = mp4box.addTrack({
      timescale: 48000,
      samplerate: 48000,
      channel_count: 2,
      type: 'mp4a'
    });

    // Write samples and finalize
    return mp4box.getBuffer();
  }
}
```

**Hardware Acceleration**
```javascript
// Check for hardware support
const checkHardwareSupport = async () => {
  const support = {
    encode: {},
    decode: {}
  };

  // Check H.264 encoding
  const h264Config = {
    codec: 'avc1.42001E',
    width: 1920,
    height: 1080,
    bitrate: 5_000_000,
    framerate: 30
  };

  support.encode.h264 = await VideoEncoder.isConfigSupported(h264Config);

  // Check VP9 encoding
  const vp9Config = {
    codec: 'vp09.00.10.08',
    width: 1920,
    height: 1080,
    bitrate: 5_000_000,
    framerate: 30
  };

  support.encode.vp9 = await VideoEncoder.isConfigSupported(vp9Config);

  return support;
};
```

### 2. Integrated Conversion Pipeline

#### 2.1 Smart Conversion Strategy

```javascript
class SmartVideoConverter {
  constructor() {
    this.strategy = this.selectStrategy();
  }

  selectStrategy() {
    // Priority order based on availability and performance
    if (this.isWebCodecsSupported()) {
      return 'webcodecs';
    } else if (this.isFFmpegCompatible()) {
      return 'ffmpeg';
    } else {
      return 'cloud-fallback';
    }
  }

  async convert(file, targetFormat = 'mp4') {
    const strategy = this.strategy;
    
    switch(strategy) {
      case 'webcodecs':
        return await this.convertWithWebCodecs(file, targetFormat);
      case 'ffmpeg':
        return await this.convertWithFFmpeg(file, targetFormat);
      case 'cloud-fallback':
        return await this.requestCloudConversion(file, targetFormat);
    }
  }

  async convertWithChunking(file) {
    // For large files, convert in chunks
    const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
    const chunks = [];
    
    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      const convertedChunk = await this.convert(chunk, 'mp4');
      chunks.push(convertedChunk);
      
      // Update progress
      this.onProgress({
        converted: end,
        total: file.size,
        percent: (end / file.size) * 100
      });
    }
    
    // Concatenate chunks
    return await this.concatenateChunks(chunks);
  }
}
```

#### 2.2 Conversion + Processing Workflow

```javascript
class VideoProcessingPipeline {
  async processVideo(inputFile, options) {
    const pipeline = [
      // Step 1: Convert to MP4 if needed
      async (video) => {
        if (!this.isMP4(video)) {
          console.log('Converting to MP4...');
          return await this.convertToMP4(video);
        }
        return video;
      },
      
      // Step 2: Optimize for processing
      async (video) => {
        if (this.needsOptimization(video)) {
          console.log('Optimizing video...');
          return await this.optimizeVideo(video, {
            targetBitrate: '2M',
            maxResolution: '1080p',
            fps: 30
          });
        }
        return video;
      },
      
      // Step 3: Chunk for Gemini
      async (video) => {
        console.log('Chunking video...');
        return await this.chunkVideo(video, {
          chunkDuration: 30, // seconds
          format: 'mp4'
        });
      },
      
      // Step 4: Process with Gemini
      async (chunks) => {
        console.log('Processing with Gemini...');
        return await this.processWithGemini(chunks);
      }
    ];

    let result = inputFile;
    for (const step of pipeline) {
      result = await step(result);
    }
    
    return result;
  }
}
```

### 3. Performance Optimization

#### 3.1 Web Worker Implementation

```javascript
// video-converter.worker.js
importScripts('/ffmpeg-core.js');

let ffmpeg = null;

self.addEventListener('message', async (e) => {
  const { command, data } = e.data;
  
  switch(command) {
    case 'load':
      ffmpeg = new FFmpeg();
      await ffmpeg.load();
      self.postMessage({ status: 'loaded' });
      break;
      
    case 'convert':
      const { input, options } = data;
      const result = await convertVideo(input, options);
      self.postMessage({ 
        status: 'complete', 
        output: result 
      });
      break;
  }
});

// Main thread
class WorkerVideoConverter {
  constructor() {
    this.worker = new Worker('/video-converter.worker.js');
    this.ready = this.init();
  }
  
  async init() {
    return new Promise((resolve) => {
      this.worker.postMessage({ command: 'load' });
      this.worker.addEventListener('message', (e) => {
        if (e.data.status === 'loaded') {
          resolve();
        }
      });
    });
  }
  
  async convert(file, options) {
    await this.ready;
    
    return new Promise((resolve) => {
      this.worker.postMessage({
        command: 'convert',
        data: { input: file, options }
      });
      
      this.worker.addEventListener('message', (e) => {
        if (e.data.status === 'complete') {
          resolve(e.data.output);
        }
      });
    });
  }
}
```

#### 3.2 Memory Management

```javascript
class MemoryEfficientConverter {
  async convertLargeFile(file) {
    // Stream processing for large files
    const stream = file.stream();
    const reader = stream.getReader();
    
    // Process in chunks to avoid memory overflow
    const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB
    let processedSize = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Process chunk
      await this.processChunk(value);
      
      processedSize += value.byteLength;
      
      // Garbage collection hint
      if (processedSize % (CHUNK_SIZE * 10) === 0) {
        await this.cleanupMemory();
      }
    }
  }
  
  async cleanupMemory() {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Clear caches
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    }
  }
}
```

### 4. Format Support Matrix

| Input Format | Output MP4 | WebCodecs | FFmpeg.wasm | Performance |
|-------------|------------|-----------|-------------|-------------|
| MOV | ✅ | ✅ | ✅ | Fast |
| AVI | ✅ | ❌ | ✅ | Medium |
| MKV | ✅ | ❌ | ✅ | Medium |
| WebM | ✅ | ✅ | ✅ | Fast |
| WMV | ✅ | ❌ | ✅ | Slow |
| FLV | ✅ | ❌ | ✅ | Medium |
| 3GP | ✅ | ❌ | ✅ | Fast |
| OGV | ✅ | ❌ | ✅ | Medium |
| HEVC/H.265 | ✅ | Partial | ✅ | Slow |
| ProRes | ✅ | ❌ | ✅ | Very Slow |

### 5. UI Integration

```javascript
// React component for conversion
const VideoConverter = () => {
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputFile, setOutputFile] = useState(null);
  
  const handleConvert = async (file) => {
    setConverting(true);
    
    const converter = new SmartVideoConverter();
    
    converter.onProgress = (p) => {
      setProgress(p.percent);
    };
    
    try {
      const mp4File = await converter.convert(file, 'mp4');
      setOutputFile(mp4File);
      
      // Auto-proceed to chunking
      await processWithGemini(mp4File);
    } catch (error) {
      console.error('Conversion failed:', error);
    } finally {
      setConverting(false);
    }
  };
  
  return (
    <div>
      <DropZone 
        accept="video/*"
        onDrop={handleConvert}
      />
      
      {converting && (
        <ProgressBar 
          value={progress} 
          label="Converting to MP4..."
        />
      )}
      
      {outputFile && (
        <VideoPreview 
          file={outputFile}
          onProceed={() => startProcessing(outputFile)}
        />
      )}
    </div>
  );
};
```

### 6. Browser Compatibility

```javascript
const getBrowserCapabilities = () => {
  return {
    ffmpeg: {
      supported: 'WebAssembly' in window,
      sharedMemory: 'SharedArrayBuffer' in window,
      threads: navigator.hardwareConcurrency || 1
    },
    webCodecs: {
      supported: 'VideoEncoder' in window,
      hardware: navigator.gpu !== undefined
    },
    memory: {
      available: performance.memory?.jsHeapSizeLimit || null,
      recommended: 4 * 1024 * 1024 * 1024 // 4GB
    }
  };
};
```

### 7. Error Handling & Fallbacks

```javascript
class RobustConverter {
  async convertWithFallbacks(file) {
    const strategies = [
      { name: 'WebCodecs', fn: () => this.webCodecsConvert(file) },
      { name: 'FFmpeg.wasm', fn: () => this.ffmpegConvert(file) },
      { name: 'Cloud API', fn: () => this.cloudConvert(file) }
    ];
    
    for (const strategy of strategies) {
      try {
        console.log(`Trying ${strategy.name}...`);
        return await strategy.fn();
      } catch (error) {
        console.warn(`${strategy.name} failed:`, error);
        continue;
      }
    }
    
    throw new Error('All conversion strategies failed');
  }
}
```

---

**Key Takeaways:**

1. **FFmpeg.wasm** is the most versatile - handles virtually any format
2. **WebCodecs** is fastest but limited format support
3. **Web Workers** prevent UI blocking during conversion
4. **Streaming** approach handles large files without memory issues
5. **Progressive enhancement** ensures it works across browsers

The conversion happens entirely in the browser before chunking and sending to Gemini, maintaining the fully client-side processing approach.