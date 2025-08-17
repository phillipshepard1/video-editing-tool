# Browser-Based Video Editing & Export System
## Product Requirements Document - Addendum

### 1. Executive Summary

This document extends the browser-based video processing platform to include full video editing and export capabilities, allowing users to create edited videos from AI-approved segments while maintaining original quality, all within the browser.

### 2. Core Functionality

#### 2.1 Video Editing Pipeline

```
Original Video → AI Analysis → Segment Selection → Video Assembly → Export
     ↓              ↓                ↓                   ↓            ↓
  (Preserved)   (Gemini AI)    (User Reviews)    (FFmpeg.wasm)  (Download)
```

#### 2.2 Key Features

- **Lossless Editing**: Maintain original video quality through stream copying
- **Segment Management**: Review, approve, and reorder video segments
- **Real-time Preview**: Preview selected cuts before export
- **Multiple Export Options**: Original quality, compressed, or optimized formats
- **No Upload Required**: Everything processes locally in the browser

### 3. Technical Architecture

#### 3.1 Data Flow Architecture

```javascript
class VideoEditingSystem {
  // Core components
  originalFile: File;              // Original video reference (never modified)
  compressedFile: File;            // Compressed version for AI analysis
  segments: Segment[];             // AI-identified segments with timestamps
  approvedSegments: Segment[];     // User-selected segments
  exportedVideo: Blob;             // Final edited video
  
  // Metadata preservation
  videoMetadata: {
    codec: string;                // Original codec (h264, h265, etc.)
    resolution: string;           // Original resolution
    framerate: number;            // Original FPS
    bitrate: number;              // Original bitrate
    duration: number;             // Total duration
  };
}
```

#### 3.2 Segment Data Structure

```typescript
interface Segment {
  id: string;
  startTime: number;              // Original video timestamp (seconds)
  endTime: number;                // Original video timestamp (seconds)
  duration: number;               // Segment duration
  
  // AI Analysis Results
  transcript: string;             // Speech content
  confidence: number;             // AI confidence score
  category: string;               // Content category
  tags: string[];                 // Relevant tags
  reason: string;                 // Why this segment was identified
  
  // User Interaction
  approved: boolean;              // User approval status
  order: number;                  // Position in final video
  customLabel?: string;           // User-defined label
  
  // Technical Details
  keyframeTimestamp: number;      // Nearest keyframe for clean cut
  thumbnailUrl?: string;          // Preview thumbnail
  audioLevel: number;             // Average audio level
}
```

### 4. Video Export System

#### 4.1 Export Pipeline

```javascript
class VideoExporter {
  async exportVideo(
    originalFile: File,
    segments: Segment[],
    options: ExportOptions
  ): Promise<Blob> {
    // Step 1: Validate segments
    this.validateSegments(segments);
    
    // Step 2: Choose export strategy
    const strategy = this.selectStrategy(originalFile, options);
    
    // Step 3: Process based on strategy
    switch(strategy) {
      case 'stream-copy':
        return await this.streamCopyExport(originalFile, segments);
      case 're-encode':
        return await this.reEncodeExport(originalFile, segments, options);
      case 'keyframe-cut':
        return await this.keyframeCutExport(originalFile, segments);
    }
  }
}

interface ExportOptions {
  quality: 'original' | 'high' | 'medium' | 'low';
  format: 'mp4' | 'webm' | 'mov';
  resolution?: '4k' | '1080p' | '720p' | '480p';
  framerate?: 24 | 30 | 60;
  includeTransitions?: boolean;
  addWatermark?: boolean;
  audioNormalization?: boolean;
}
```

#### 4.2 Stream Copy Method (Lossless, Fast)

```javascript
async streamCopyExport(file: File, segments: Segment[]): Promise<Blob> {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  
  // Load original file
  await ffmpeg.writeFile('input.mp4', await fetchFile(file));
  
  // Extract each segment without re-encoding
  const segmentFiles = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const outputName = `seg_${i}.mp4`;
    
    // Cut segment using stream copy (no quality loss)
    await ffmpeg.exec([
      '-i', 'input.mp4',
      '-ss', segment.startTime.toString(),
      '-to', segment.endTime.toString(),
      '-c', 'copy',           // Copy codecs without re-encoding
      '-avoid_negative_ts', 'make_zero',
      outputName
    ]);
    
    segmentFiles.push(outputName);
  }
  
  // Create concat file
  const concatList = segmentFiles.map(f => `file '${f}'`).join('\n');
  await ffmpeg.writeFile('concat.txt', concatList);
  
  // Concatenate all segments
  await ffmpeg.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat.txt',
    '-c', 'copy',              // No re-encoding during concat
    'output.mp4'
  ]);
  
  const data = await ffmpeg.readFile('output.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}
```

#### 4.3 Memory-Optimized Export for Large Files

```javascript
class LargeFileExporter {
  async export(file: File, segments: Segment[]): Promise<Blob> {
    const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
    
    // Process in chunks to avoid memory overflow
    if (file.size > 1024 * 1024 * 1024) { // > 1GB
      return await this.chunkedExport(file, segments);
    }
    
    return await this.standardExport(file, segments);
  }
  
  async chunkedExport(file: File, segments: Segment[]): Promise<Blob> {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    
    const outputChunks = [];
    
    // Process each segment individually
    for (const segment of segments) {
      // Calculate byte range for segment
      const startByte = this.timeToByteOffset(file, segment.startTime);
      const endByte = this.timeToByteOffset(file, segment.endTime);
      
      // Extract only needed portion
      const slice = file.slice(startByte, endByte);
      await ffmpeg.writeFile('chunk.mp4', await fetchFile(slice));
      
      // Process chunk
      await ffmpeg.exec([
        '-i', 'chunk.mp4',
        '-c', 'copy',
        'output_chunk.mp4'
      ]);
      
      const chunkData = await ffmpeg.readFile('output_chunk.mp4');
      outputChunks.push(new Uint8Array(chunkData));
      
      // Clean up memory
      await ffmpeg.deleteFile('chunk.mp4');
      await ffmpeg.deleteFile('output_chunk.mp4');
      
      // Force garbage collection if available
      if (global.gc) global.gc();
    }
    
    // Combine all chunks
    return new Blob(outputChunks, { type: 'video/mp4' });
  }
}
```

### 5. User Interface Components

#### 5.1 Segment Selection Interface

```tsx
interface SegmentSelectorProps {
  segments: Segment[];
  originalFile: File;
  onExport: (segments: Segment[], options: ExportOptions) => void;
}

export function SegmentSelector({ 
  segments, 
  originalFile, 
  onExport 
}: SegmentSelectorProps) {
  const [selectedSegments, setSelectedSegments] = useState<Segment[]>([]);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    quality: 'original',
    format: 'mp4'
  });
  
  return (
    <div className="segment-editor">
      {/* Timeline View */}
      <VideoTimeline 
        segments={segments}
        selected={selectedSegments}
        onSelect={setSelectedSegments}
      />
      
      {/* Segment List */}
      <div className="segment-list">
        {segments.map(segment => (
          <SegmentCard
            key={segment.id}
            segment={segment}
            selected={selectedSegments.includes(segment)}
            onToggle={(selected) => {
              if (selected) {
                setSelectedSegments([...selectedSegments, segment]);
              } else {
                setSelectedSegments(
                  selectedSegments.filter(s => s.id !== segment.id)
                );
              }
            }}
            onPreview={() => previewSegment(segment)}
          />
        ))}
      </div>
      
      {/* Export Controls */}
      <ExportPanel
        selectedCount={selectedSegments.length}
        totalDuration={calculateDuration(selectedSegments)}
        estimatedSize={estimateFileSize(selectedSegments, originalFile)}
        options={exportOptions}
        onOptionsChange={setExportOptions}
        onExport={() => onExport(selectedSegments, exportOptions)}
      />
    </div>
  );
}
```

#### 5.2 Export Progress Interface

```tsx
export function ExportProgress({ 
  stage,
  progress,
  timeRemaining 
}: ExportProgressProps) {
  return (
    <div className="export-progress">
      <div className="stage-indicator">
        {stage === 'extracting' && '🔪 Extracting segments...'}
        {stage === 'combining' && '🔗 Combining segments...'}
        {stage === 'finalizing' && '✨ Finalizing video...'}
        {stage === 'complete' && '✅ Export complete!'}
      </div>
      
      <Progress value={progress} className="w-full" />
      
      <div className="stats">
        <span>{Math.round(progress)}% complete</span>
        {timeRemaining > 0 && (
          <span>{formatTime(timeRemaining)} remaining</span>
        )}
      </div>
    </div>
  );
}
```

### 6. Performance Specifications

#### 6.1 Export Performance Targets

| File Size | Segments | Quality | Method | Desktop Time | Memory Usage |
|-----------|----------|---------|--------|--------------|--------------|
| 500MB | 10 | Original | Stream Copy | 15-30s | <500MB |
| 1GB | 20 | Original | Stream Copy | 30-60s | <750MB |
| 2GB | 30 | Original | Stream Copy | 1-2min | <1GB |
| 5GB | 50 | Original | Chunked | 3-5min | <1.5GB |
| 500MB | 10 | Compressed | Re-encode | 2-5min | <1GB |
| 1GB | 20 | Compressed | Re-encode | 5-10min | <1.5GB |

#### 6.2 Quality Preservation

```javascript
// Ensure quality preservation
const qualitySettings = {
  original: {
    videoCodec: 'copy',      // No re-encoding
    audioCodec: 'copy',      // No re-encoding
    pixelFormat: 'preserve', // Keep original
    colorSpace: 'preserve'   // Keep original
  },
  high: {
    videoCodec: 'libx264',
    crf: 18,                 // Visually lossless
    preset: 'slow',
    audioCodec: 'aac',
    audioBitrate: '320k'
  },
  medium: {
    videoCodec: 'libx264',
    crf: 23,                 // Good quality
    preset: 'medium',
    audioCodec: 'aac',
    audioBitrate: '192k'
  },
  low: {
    videoCodec: 'libx264',
    crf: 28,                 // Acceptable quality
    preset: 'fast',
    audioCodec: 'aac',
    audioBitrate: '128k'
  }
};
```

### 7. Advanced Export Features

#### 7.1 Transition Support (Optional)

```javascript
class TransitionExporter {
  async addTransitions(
    segments: Segment[],
    transitionType: 'fade' | 'dissolve' | 'wipe' = 'fade',
    duration: number = 0.5
  ) {
    const ffmpeg = new FFmpeg();
    
    // Build complex filter for transitions
    let filter = '';
    for (let i = 0; i < segments.length - 1; i++) {
      filter += `[${i}:v][${i+1}:v]xfade=transition=${transitionType}:duration=${duration}:offset=${segments[i].duration - duration}[v${i}];`;
    }
    
    await ffmpeg.exec([
      ...segments.map(s => ['-i', s.file]).flat(),
      '-filter_complex', filter,
      '-map', '[vout]',
      '-map', '[aout]',
      'output.mp4'
    ]);
  }
}
```

#### 7.2 Smart Cut Detection

```javascript
class SmartCutter {
  async findBestCutPoints(file: File, requestedTime: number): Promise<number> {
    // Find nearest keyframe for clean cut
    const keyframes = await this.extractKeyframes(file);
    
    // Find closest keyframe to requested time
    const nearest = keyframes.reduce((prev, curr) => 
      Math.abs(curr - requestedTime) < Math.abs(prev - requestedTime) 
        ? curr : prev
    );
    
    // Adjust for scene change if within 1 second
    const sceneChange = await this.detectSceneChange(file, nearest);
    
    return sceneChange || nearest;
  }
  
  async detectSceneChange(file: File, timestamp: number): Promise<number> {
    // Use ffmpeg scene detection
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    
    // Detect scene changes within ±1 second
    const result = await ffmpeg.exec([
      '-i', 'input.mp4',
      '-ss', (timestamp - 1).toString(),
      '-t', '2',
      '-vf', 'select=gt(scene\\,0.4)',
      '-f', 'null',
      '-'
    ]);
    
    // Parse scene change timestamps
    return this.parseSceneChanges(result);
  }
}
```

### 8. Error Handling & Recovery

#### 8.1 Export Error Recovery

```javascript
class ExportErrorHandler {
  async handleExportError(error: Error, context: ExportContext) {
    if (error.message.includes('memory')) {
      // Switch to chunked processing
      return await this.retryWithChunking(context);
    }
    
    if (error.message.includes('codec')) {
      // Try re-encoding instead of stream copy
      return await this.retryWithReencode(context);
    }
    
    if (error.message.includes('keyframe')) {
      // Adjust cut points to keyframes
      return await this.retryWithKeyframeAlignment(context);
    }
    
    // Save progress for manual recovery
    await this.saveExportState(context);
    throw error;
  }
  
  async saveExportState(context: ExportContext) {
    // Save to IndexedDB for recovery
    const db = await openDB('video-exports', 1);
    await db.put('export-states', {
      id: context.id,
      originalFile: context.originalFile.name,
      segments: context.segments,
      progress: context.progress,
      timestamp: Date.now()
    });
  }
}
```

### 9. Export Analytics & Monitoring

```javascript
interface ExportMetrics {
  exportId: string;
  startTime: Date;
  endTime?: Date;
  originalFileSize: number;
  exportedFileSize: number;
  segmentCount: number;
  totalDuration: number;
  exportDuration: number;
  method: 'stream-copy' | 're-encode' | 'chunked';
  quality: string;
  memoryPeak: number;
  errors: string[];
  browserInfo: {
    name: string;
    version: string;
    platform: string;
  };
}

class ExportAnalytics {
  track(metrics: ExportMetrics) {
    // Local tracking
    this.saveToIndexedDB(metrics);
    
    // Future: Send to server when online
    if (navigator.onLine) {
      this.sendToAnalytics(metrics);
    }
  }
  
  calculateCompressionRatio(original: number, exported: number): number {
    return ((original - exported) / original) * 100;
  }
  
  estimateExportTime(fileSize: number, segments: number): number {
    // Based on historical data
    const baseTime = 10; // seconds
    const perGBTime = 30; // seconds per GB
    const perSegmentTime = 2; // seconds per segment
    
    return baseTime + 
           (fileSize / (1024 * 1024 * 1024)) * perGBTime + 
           segments * perSegmentTime;
  }
}
```

### 10. Desktop-Only Optimizations

#### 10.1 Hardware Acceleration

```javascript
class HardwareAcceleratedExporter {
  async checkHardwareSupport(): Promise<HardwareSupport> {
    return {
      webGL: !!document.createElement('canvas').getContext('webgl2'),
      webGPU: 'gpu' in navigator,
      threads: navigator.hardwareConcurrency || 1,
      memory: performance.memory?.jsHeapSizeLimit || 0,
      videoEncoder: 'VideoEncoder' in window
    };
  }
  
  async export(file: File, segments: Segment[]) {
    const hardware = await this.checkHardwareSupport();
    
    if (hardware.webGPU && hardware.videoEncoder) {
      // Use native encoding
      return await this.nativeEncode(file, segments);
    } else if (hardware.threads >= 8 && hardware.memory > 8 * 1024 * 1024 * 1024) {
      // Use multi-threaded FFmpeg
      return await this.multiThreadExport(file, segments);
    } else {
      // Standard export
      return await this.standardExport(file, segments);
    }
  }
  
  async multiThreadExport(file: File, segments: Segment[]) {
    const ffmpeg = new FFmpeg();
    
    // Enable multi-threading
    await ffmpeg.load({
      wasmURL: '/ffmpeg-core.wasm',
      workerURL: '/ffmpeg-core.worker.js'
    });
    
    // Use multiple threads
    await ffmpeg.exec([
      '-i', 'input.mp4',
      '-threads', Math.min(navigator.hardwareConcurrency, 8).toString(),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      'output.mp4'
    ]);
  }
}
```

### 11. Future Enhancements

#### 11.1 Cloud Hybrid Export (Future Vercel Integration)

```javascript
class HybridExporter {
  async export(file: File, segments: Segment[], options: ExportOptions) {
    // Check if cloud processing is available and beneficial
    if (this.shouldUseCloud(file, options)) {
      // Upload segments metadata only (not video)
      const exportJob = await this.createCloudJob(segments, options);
      
      // Process locally but save to cloud
      const result = await this.localExport(file, segments);
      await this.uploadResult(exportJob.id, result);
      
      return result;
    }
    
    // Pure local export
    return await this.localExport(file, segments);
  }
  
  shouldUseCloud(file: File, options: ExportOptions): boolean {
    return (
      options.addWatermark ||           // Server-side watermarking
      options.generateSubtitles ||       // Server-side transcription
      options.multipleFormats ||         // Export multiple versions
      file.size > 5 * 1024 * 1024 * 1024 // Very large files
    );
  }
}
```

### 12. Export Presets

```javascript
const exportPresets = {
  'social-media': {
    instagram: {
      resolution: '1080x1080',
      maxDuration: 60,
      format: 'mp4',
      codec: 'h264'
    },
    tiktok: {
      resolution: '1080x1920',
      maxDuration: 180,
      format: 'mp4',
      codec: 'h264'
    },
    youtube: {
      resolution: '1920x1080',
      format: 'mp4',
      codec: 'h264',
      bitrate: '8M'
    }
  },
  'professional': {
    broadcast: {
      resolution: '1920x1080',
      framerate: 30,
      codec: 'prores',
      quality: 'highest'
    },
    archive: {
      codec: 'copy',
      quality: 'original',
      metadata: 'preserve'
    }
  },
  'web-optimized': {
    streaming: {
      codec: 'h264',
      profile: 'baseline',
      fastStart: true,
      adaptive: true
    }
  }
};
```

### 13. Success Metrics

#### 13.1 Export KPIs

- **Export Success Rate**: >95%
- **Quality Preservation**: 100% for stream copy
- **Export Speed**: <2 minutes for 1GB file
- **Memory Efficiency**: <2GB RAM for 5GB file
- **User Satisfaction**: >4.5/5 rating

#### 13.2 Performance Benchmarks

| Operation | Target Time | Acceptable | Maximum |
|-----------|------------|------------|---------|
| 100MB export | 5s | 10s | 30s |
| 1GB export | 30s | 60s | 120s |
| 5GB export | 2min | 5min | 10min |
| Preview generation | 1s | 2s | 5s |
| Segment extraction | 0.5s | 1s | 2s |

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-12  
**Status:** Complete