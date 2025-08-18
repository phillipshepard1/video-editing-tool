# Video Processing API Documentation

## Overview

The Video Processing API provides a comprehensive browser-based video processing pipeline with memory management, chunking, error recovery, and quality preservation. This system handles videos up to 5GB entirely in the browser without server uploads.

## Core Components

### 1. VideoProcessingEngine

The main orchestrator for video processing operations.

```typescript
import { VideoProcessingEngine } from '@/lib/video-processing/core-engine';

const engine = new VideoProcessingEngine({
  maxConcurrentJobs: 2,
  maxMemoryMB: 4096,
  chunkSizeMB: 500,
  enableAutoRecovery: true,
  enableProgressPersistence: true,
});

await engine.initialize();
```

#### Configuration Options

- `maxConcurrentJobs`: Maximum number of simultaneous processing jobs (default: 2)
- `maxMemoryMB`: Maximum memory usage in MB (default: 4096)
- `chunkSizeMB`: Size of video chunks in MB (default: 500)
- `enableAutoRecovery`: Enable automatic error recovery (default: true)
- `enableProgressPersistence`: Save progress to storage (default: true)

#### Methods

##### `addJob(inputFile: File, options?: ProcessingOptions): Promise<string>`

Add a new video processing job.

```typescript
const jobId = await engine.addJob(videoFile, {
  videoBitrate: '2M',
  audioBitrate: '128k',
  maxWidth: 1920,
  maxHeight: 1080,
  crf: 23,
  preset: 'medium',
});
```

##### `getJob(jobId: string): VideoProcessingJob | undefined`

Get job status and details.

```typescript
const job = engine.getJob(jobId);
console.log(`Job ${jobId} status: ${job?.status}`);
```

##### `cancelJob(jobId: string): Promise<void>`

Cancel a running job.

```typescript
await engine.cancelJob(jobId);
```

##### `pauseJob(jobId: string): Promise<void>` / `resumeJob(jobId: string): Promise<void>`

Pause and resume jobs.

```typescript
await engine.pauseJob(jobId);
// Later...
await engine.resumeJob(jobId);
```

##### `getStats(): ProcessingStats`

Get processing statistics.

```typescript
const stats = engine.getStats();
console.log(`${stats.completedJobs}/${stats.totalJobs} jobs completed`);
```

### 2. FFmpegEngine

Browser-based FFmpeg integration using WebAssembly.

```typescript
import { FFmpegEngine } from '@/lib/video-processing/ffmpeg-engine';

const ffmpeg = new FFmpegEngine({
  onProgress: (progress) => {
    console.log(`Processing: ${progress.progress}%`);
  },
});

await ffmpeg.initialize();
```

#### Methods

##### `processVideo(inputFile: File, options?: ProcessingOptions): Promise<File>`

Process a single video file.

```typescript
const processedVideo = await ffmpeg.processVideo(inputFile, {
  maxWidth: 1920,
  maxHeight: 1080,
  videoBitrate: '2M',
  audioBitrate: '128k',
  crf: 23,
  preset: 'medium',
  outputFormat: 'mp4',
  videoCodec: 'libx264',
  audioCodec: 'aac',
});
```

##### `processVideoInChunks(inputFile: File, chunks: ChunkInfo[], options?: ProcessingOptions): Promise<File[]>`

Process video in chunks for memory efficiency.

```typescript
const chunks = await chunkingStrategy.analyzeAndChunk(inputFile, videoInfo, options);
const processedChunks = await ffmpeg.processVideoInChunks(inputFile, chunks, options);
```

##### `mergeVideos(videoFiles: File[], outputName?: string): Promise<File>`

Merge multiple video files.

```typescript
const mergedVideo = await ffmpeg.mergeVideos(processedChunks, 'final_output.mp4');
```

##### `getVideoInfo(file: File): Promise<VideoInfo>`

Get video metadata.

```typescript
const info = await ffmpeg.getVideoInfo(videoFile);
console.log(`Duration: ${info.duration}s, Resolution: ${info.width}x${info.height}`);
```

### 3. MemoryManager

Monitors and manages memory usage to prevent browser crashes.

```typescript
import { MemoryManager } from '@/lib/video-processing/memory-manager';

const memoryManager = new MemoryManager({
  maxMemoryMB: 4096,
  warningThresholdPercent: 70,
  criticalThresholdPercent: 90,
  onMemoryWarning: (usage, limit) => {
    console.warn(`Memory usage: ${usage}MB / ${limit}MB`);
  },
});

await memoryManager.initialize();
```

#### Methods

##### `allocate(id: string, sizeMB: number, type?: string): boolean`

Allocate memory for an operation.

```typescript
const success = memoryManager.allocate('video-processing', 500, 'video');
if (!success) {
  console.error('Insufficient memory');
}
```

##### `deallocate(id: string): void`

Release allocated memory.

```typescript
memoryManager.deallocate('video-processing');
```

##### `getStats(): MemoryStats`

Get current memory statistics.

```typescript
const stats = memoryManager.getStats();
console.log(`Memory usage: ${stats.currentUsageMB}MB / ${stats.maxUsageMB}MB`);
console.log(`Warning level: ${stats.warningLevel}`);
```

##### `forceGarbageCollection(): void`

Trigger garbage collection if available.

```typescript
memoryManager.forceGarbageCollection();
```

### 4. VideoStorage

IndexedDB-based storage for persistence and recovery.

```typescript
import { VideoStorage } from '@/lib/video-processing/storage-manager';

const storage = new VideoStorage();
await storage.initialize();
```

#### Methods

##### `saveJobState(job: VideoProcessingJob): Promise<void>`

Save job state for recovery.

```typescript
await storage.saveJobState(job);
```

##### `getAllJobs(): Promise<VideoProcessingJob[]>`

Load all saved jobs.

```typescript
const jobs = await storage.getAllJobs();
```

##### `saveProcessedVideo(jobId: string, videoFile: File): Promise<void>`

Save processed video to storage.

```typescript
await storage.saveProcessedVideo(jobId, processedVideo);
```

##### `getStorageStats(): Promise<StorageStats>`

Get storage usage statistics.

```typescript
const stats = await storage.getStorageStats();
console.log(`Storage used: ${stats.totalStorageUsed} bytes`);
console.log(`Quota used: ${stats.quotaUsed}%`);
```

### 5. ChunkingStrategy

Adaptive video chunking for optimal processing.

```typescript
import { ChunkingStrategy } from '@/lib/video-processing/chunking-strategy';

const chunker = new ChunkingStrategy();
```

#### Methods

##### `analyzeAndChunk(videoFile: File, videoInfo: VideoInfo, options: ChunkingOptions): Promise<ChunkInfo[]>`

Analyze video and create optimal chunks.

```typescript
const chunks = await chunker.analyzeAndChunk(videoFile, videoInfo, {
  maxChunkSizeMB: 500,
  memoryLimit: 4096,
  targetChunkDuration: 60,
  enableSceneDetection: true,
});
```

##### `createDefaultChunks(videoFile: File, options?: ChunkingOptions): Promise<ChunkInfo[]>`

Create default chunks without analysis.

```typescript
const chunks = await chunker.createDefaultChunks(videoFile, {
  targetChunkDuration: 60,
});
```

### 6. VideoExporter

High-quality video export with format options.

```typescript
import { VideoExporter } from '@/lib/video-processing/video-exporter';

const exporter = new VideoExporter(ffmpegEngine, memoryManager, progressTracker);
```

#### Methods

##### `exportVideo(inputFile: File, options: ExportOptions): Promise<string>`

Export video with specified quality settings.

```typescript
const jobId = await exporter.exportVideo(inputFile, {
  quality: 'high',
  preserveOriginalQuality: true,
  outputFormat: 'mp4',
  videoCodec: 'h264',
  audioCodec: 'aac',
  enableTwoPass: true,
  optimizeForStreaming: true,
});
```

##### `getOptimalSettings(inputFile: File, targetQuality: string): Promise<ExportOptions>`

Get recommended export settings.

```typescript
const settings = await exporter.getOptimalSettings(inputFile, 'high');
```

### 7. ProgressTracker

Unified progress tracking with detailed metrics.

```typescript
import { ProgressTracker } from '@/lib/video-processing/progress-tracker';

const tracker = new ProgressTracker({
  updateIntervalMs: 1000,
  enableDetailedLogging: true,
});
```

#### Methods

##### `initializeJob(jobId: string, stages: StageDefinition[]): void`

Initialize progress tracking for a job.

```typescript
tracker.initializeJob(jobId, [
  { id: 'upload', name: 'Upload', description: 'Uploading video' },
  { id: 'process', name: 'Process', description: 'Processing video' },
  { id: 'export', name: 'Export', description: 'Exporting result' },
]);
```

##### `updateStageProgress(jobId: string, stageId: string, progress: number): void`

Update stage progress.

```typescript
tracker.updateStageProgress(jobId, 'process', 75);
```

##### `addEventListener(type: ProgressEventType, handler: Function): void`

Listen for progress events.

```typescript
tracker.addEventListener('progress-updated', (event) => {
  console.log(`Job ${event.jobId}: ${event.data.progress}%`);
});
```

### 8. ErrorRecoveryManager

Comprehensive error handling and crash prevention.

```typescript
import { ErrorRecoveryManager } from '@/lib/video-processing/error-recovery';

const recovery = new ErrorRecoveryManager(storage, memoryManager, progressTracker, {
  enableAutoSave: true,
  enablePreventiveActions: true,
});

await recovery.initialize();
```

#### Methods

##### `handleError(error: Error, type: ErrorType, severity: string, jobId?: string): Promise<boolean>`

Handle errors with automatic recovery.

```typescript
const recovered = await recovery.handleError(
  new Error('Processing failed'),
  'processing-timeout',
  'medium',
  jobId
);
```

##### `checkSystemHealth(): Promise<HealthReport>`

Check system health and prevent crashes.

```typescript
const health = await recovery.checkSystemHealth();
if (!health.healthy) {
  console.warn('System health issues:', health.warnings);
}
```

## Processing Options

### Basic Options

```typescript
interface ProcessingOptions {
  // Video settings
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
}
```

### Export Options

```typescript
interface ExportOptions {
  quality: 'lossless' | 'high' | 'medium' | 'low' | 'custom';
  preserveOriginalQuality: boolean;
  outputFormat: 'mp4' | 'webm' | 'mov' | 'avi' | 'mkv';
  videoCodec: 'h264' | 'h265' | 'vp9' | 'av1' | 'prores';
  audioCodec: 'aac' | 'opus' | 'flac' | 'wav';
  enableTwoPass: boolean;
  optimizeForStreaming: boolean;
  exportAsChunks: boolean;
}
```

## Event Handling

### Progress Events

```typescript
// Listen for job progress
engine.setEventHandlers({
  onJobProgress: (jobId: string, progress: ProcessingProgress) => {
    console.log(`Job ${jobId}: ${progress.progress}%`);
    console.log(`Stage: ${progress.stage}`);
    console.log(`Speed: ${progress.speed}x`);
  },
  
  onJobComplete: (jobId: string, result: File) => {
    console.log(`Job ${jobId} completed`);
    console.log(`Output size: ${result.size} bytes`);
  },
  
  onJobError: (jobId: string, error: string) => {
    console.error(`Job ${jobId} failed: ${error}`);
  },
  
  onMemoryWarning: (usage: number, limit: number) => {
    console.warn(`Memory warning: ${usage}MB / ${limit}MB`);
  },
});
```

### Progress Tracking Events

```typescript
progressTracker.addEventListener('stage-completed', (event) => {
  console.log(`Stage ${event.data.stageId} completed for job ${event.jobId}`);
});

progressTracker.addEventListener('memory-warning', (event) => {
  console.warn(`Memory warning: ${event.data.warningLevel}`);
});
```

## Error Handling

### Error Types

- `memory-overflow`: Memory usage exceeded limits
- `ffmpeg-crash`: FFmpeg engine crashed
- `file-corruption`: Input file is corrupted
- `network-failure`: Network-related error
- `storage-quota`: Storage quota exceeded
- `processing-timeout`: Processing took too long
- `browser-compatibility`: Browser feature not supported

### Recovery Actions

- `retry`: Retry the operation
- `reduce-quality`: Lower quality settings
- `split-chunks`: Process in smaller chunks
- `clear-memory`: Force garbage collection
- `reload-engine`: Restart FFmpeg engine
- `save-progress`: Save current progress
- `fallback-mode`: Use alternative processing method

### Example Error Handling

```typescript
try {
  const jobId = await engine.addJob(videoFile, options);
  // ... processing
} catch (error) {
  if (error.message.includes('memory')) {
    // Handle memory-related errors
    await memoryManager.forceGarbageCollection();
    // Retry with reduced quality
    const reducedOptions = { ...options, crf: 28, preset: 'fast' };
    const jobId = await engine.addJob(videoFile, reducedOptions);
  } else if (error.message.includes('quota')) {
    // Handle storage quota errors
    await storage.clearCache();
    // Retry operation
  }
}
```

## Performance Optimization

### Memory Management

```typescript
// Monitor memory usage
const stats = memoryManager.getStats();
if (stats.warningLevel === 'high') {
  // Reduce processing load
  await engine.pauseJob(lowPriorityJobId);
  memoryManager.forceGarbageCollection();
}
```

### Chunking Optimization

```typescript
// Adjust chunk size based on available memory
const memoryStats = memoryManager.getStats();
const optimalChunkSize = Math.min(
  500, // Default max
  memoryStats.availableMB * 0.8 // 80% of available memory
);

const chunks = await chunker.analyzeAndChunk(videoFile, videoInfo, {
  maxChunkSizeMB: optimalChunkSize,
});
```

### Quality vs Performance Trade-offs

```typescript
// Automatic quality adjustment based on system capabilities
const systemCapabilities = await recovery.checkSystemHealth();
const options: ProcessingOptions = {
  preset: systemCapabilities.healthy ? 'medium' : 'fast',
  crf: systemCapabilities.healthy ? 23 : 28,
  videoBitrate: systemCapabilities.healthy ? '2M' : '1M',
};
```

## Browser Compatibility

### Required Features

- WebAssembly support
- IndexedDB support
- Web Workers support
- Canvas API support

### Optional Features

- SharedArrayBuffer (for better performance)
- OffscreenCanvas (for background processing)
- Performance Memory API (for precise memory monitoring)

### Feature Detection

```typescript
const hasRequiredFeatures = 
  typeof WebAssembly !== 'undefined' &&
  typeof indexedDB !== 'undefined' &&
  typeof Worker !== 'undefined';

if (!hasRequiredFeatures) {
  console.error('Browser does not support required features');
  // Provide fallback or error message
}
```

## Best Practices

### 1. Memory Management

- Always deallocate memory after processing
- Monitor memory usage regularly
- Use chunking for large files (>500MB)
- Enable garbage collection when needed

### 2. Error Handling

- Always wrap operations in try-catch blocks
- Enable auto-recovery for production use
- Save progress for long-running operations
- Provide user feedback for errors

### 3. Performance

- Process videos in chunks for large files
- Use appropriate quality settings for target use case
- Enable hardware acceleration when available
- Monitor system health during processing

### 4. User Experience

- Show detailed progress information
- Provide time estimates
- Allow pausing and resuming operations
- Implement proper cleanup on page unload

## Troubleshooting

### Common Issues

1. **Out of Memory Errors**
   - Reduce chunk size
   - Lower video quality settings
   - Enable garbage collection
   - Close other browser tabs

2. **Processing Timeouts**
   - Split video into smaller chunks
   - Use faster preset (ultrafast/fast)
   - Reduce video resolution
   - Check system resources

3. **Storage Quota Exceeded**
   - Clear old cached data
   - Reduce video quality
   - Process in smaller chunks
   - Use temporary storage only

4. **Browser Compatibility**
   - Check WebAssembly support
   - Verify SharedArrayBuffer availability
   - Test in different browsers
   - Provide fallback options

### Debugging

Enable detailed logging:

```typescript
const engine = new VideoProcessingEngine({
  // ... other options
});

// Enable debug logging
console.debug = console.log;

// Monitor all events
progressTracker.addEventListener('progress-updated', console.log);
progressTracker.addEventListener('stage-completed', console.log);
progressTracker.addEventListener('memory-warning', console.warn);
```