# Product Requirements Document: Cloud-Based Video Processing System V2
## 500MB Chunk Processing with Format Conversion

---

## Executive Summary

Cloud-based video processing system that handles videos up to **5GB** by splitting them into **500MB chunks** for optimal Gemini API processing. Includes automatic format conversion (MOV→MP4, AVI→MP4) to ensure compatibility.

**Key Updates from V1:**
- Maximum chunk size: **500MB** (more reliable for Gemini)
- Maximum file size: **5GB** (manageable for users)
- Automatic format conversion to MP4
- More chunks = more granular processing

---

## Core Specifications

### File Limits
```yaml
Maximum Upload Size: 5GB (5,368,709,120 bytes)
Maximum Chunk Size: 500MB (524,288,000 bytes)
Supported Input Formats: MP4, MOV, AVI, MKV, WEBM, M4V
Output Format: MP4 (H.264 + AAC)
Chunks Per 5GB Video: ~10-12 chunks
Processing Time Estimate: 15-20 minutes for 5GB
```

---

## Updated Architecture

### Processing Flow
```
1. Upload (up to 5GB, any format)
   ↓
2. Format Detection & Conversion
   - If not MP4 → Convert to MP4
   - Optimize for processing
   ↓
3. Chunk Creation (500MB max)
   - Calculate optimal chunk duration
   - Split at keyframes
   ↓
4. Parallel Gemini Processing
   - Process all chunks simultaneously
   - 10-12 API calls for 5GB video
   ↓
5. Result Aggregation
   - Merge all chunk results
   - Handle boundary overlaps
   ↓
6. Final Output
```

---

## Technical Specifications

### 1. Format Conversion Pipeline

```typescript
interface ConversionJob {
  inputPath: string;
  inputFormat: 'mov' | 'avi' | 'mkv' | 'webm' | 'm4v' | 'mp4';
  outputPath: string;
  settings: ConversionSettings;
}

interface ConversionSettings {
  targetCodec: 'h264';
  audioCodec: 'aac';
  preserveQuality: boolean;
  maxBitrate?: number;
}
```

#### FFmpeg Conversion Commands
```bash
# MOV to MP4 (preserve quality)
ffmpeg -i input.mov -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k -movflags +faststart output.mp4

# AVI to MP4 (older format, may need deinterlacing)
ffmpeg -i input.avi -vf yadif -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k output.mp4

# MKV to MP4 (often just needs remuxing)
ffmpeg -i input.mkv -c:v copy -c:a aac -b:a 192k output.mp4

# WEBM to MP4 (VP9/VP8 to H.264)
ffmpeg -i input.webm -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k output.mp4

# Universal conversion with optimization
ffmpeg -i input.{any} \
  -c:v libx264 \
  -preset fast \
  -crf 22 \
  -maxrate 5M \
  -bufsize 10M \
  -c:a aac \
  -b:a 192k \
  -ar 48000 \
  -movflags +faststart \
  -pix_fmt yuv420p \
  output.mp4
```

### 2. 500MB Chunking Strategy

```typescript
const chunkVideo500MB = async (videoPath: string, metadata: VideoMetadata) => {
  const MAX_CHUNK_SIZE = 500 * 1024 * 1024; // 500MB
  const SAFETY_MARGIN = 0.95; // Use 95% of max size for safety
  const TARGET_CHUNK_SIZE = MAX_CHUNK_SIZE * SAFETY_MARGIN; // ~475MB
  
  // Calculate chunk duration based on bitrate
  const fileSizeBytes = metadata.size;
  const durationSeconds = metadata.duration;
  const avgBitrate = fileSizeBytes / durationSeconds; // bytes per second
  
  // Calculate optimal chunk duration
  const secondsPerChunk = Math.floor(TARGET_CHUNK_SIZE / avgBitrate);
  
  // For a 5GB video at 10Mbps:
  // - Total duration: ~60-70 minutes
  // - Chunk duration: ~6-7 minutes each
  // - Total chunks: 10-12
  
  const chunks: VideoChunk[] = [];
  let currentTime = 0;
  let chunkIndex = 0;
  
  while (currentTime < durationSeconds) {
    // Find next keyframe after target duration
    const targetEnd = Math.min(
      currentTime + secondsPerChunk,
      durationSeconds
    );
    
    // Adjust to keyframe for clean cut
    const actualEnd = await findNearestKeyframe(videoPath, targetEnd);
    
    chunks.push({
      index: chunkIndex,
      startTime: currentTime,
      endTime: actualEnd,
      startTimecode: secondsToTimecode(currentTime),
      endTimecode: secondsToTimecode(actualEnd),
      estimatedSize: avgBitrate * (actualEnd - currentTime),
      fileName: `chunk_${String(chunkIndex).padStart(3, '0')}.mp4`
    });
    
    currentTime = actualEnd;
    chunkIndex++;
  }
  
  console.log(`Video will be split into ${chunks.length} chunks`);
  console.log(`Average chunk duration: ${secondsPerChunk} seconds`);
  console.log(`Average chunk size: ${(TARGET_CHUNK_SIZE / 1024 / 1024).toFixed(0)}MB`);
  
  return chunks;
};
```

#### FFmpeg Chunking Commands
```bash
# Create 500MB chunks with precise splitting
# Chunk 1 (0:00:00 to 0:06:00)
ffmpeg -i converted.mp4 -ss 00:00:00 -t 00:06:00 \
  -c copy -avoid_negative_ts make_zero \
  -movflags +faststart chunk_001.mp4

# Chunk 2 (0:06:00 to 0:12:00)  
ffmpeg -i converted.mp4 -ss 00:06:00 -t 00:06:00 \
  -c copy -avoid_negative_ts make_zero \
  -movflags +faststart chunk_002.mp4

# Smart chunking with size limit
ffmpeg -i converted.mp4 -ss 00:00:00 \
  -fs 500M \
  -c copy -avoid_negative_ts make_zero \
  -movflags +faststart chunk_001.mp4
```

### 3. Parallel Processing Optimization

```typescript
// Process multiple chunks simultaneously
const processChunksInParallel = async (
  chunks: VideoChunk[],
  jobId: string
) => {
  const MAX_PARALLEL = 5; // Process 5 chunks at once
  const results: ChunkResult[] = [];
  
  // Create batches for parallel processing
  const batches = [];
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
    batches.push(chunks.slice(i, i + MAX_PARALLEL));
  }
  
  // Process each batch
  for (const batch of batches) {
    const batchPromises = batch.map(chunk => 
      processChunkWithGemini(chunk, jobId)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Update progress after each batch
    await updateJobProgress(jobId, {
      chunksComplete: results.length,
      totalChunks: chunks.length
    });
  }
  
  return results;
};
```

### 4. Updated Gemini Prompt for Small Chunks

```typescript
const analyzeSmallChunk = async (
  chunk: VideoChunk,
  totalChunks: number
): Promise<ChunkAnalysis> => {
  
  const prompt = `
    Analyze this video segment (Part ${chunk.index + 1} of ${totalChunks}).
    
    CHUNK CONTEXT:
    - Duration: ${chunk.endTime - chunk.startTime} seconds
    - Time range: ${chunk.startTimecode} to ${chunk.endTimecode}
    - This is a SMALL chunk (~6 minutes), be VERY thorough
    - Total video has ${totalChunks} parts
    
    Since this is a short segment, examine EVERY SECOND carefully for:
    
    1. ALL pauses over 1 second (don't miss any!)
    2. Every "um", "uh", "like", "you know"
    3. Any false starts or restarts
    4. Technical issues (audio pops, video glitches)
    5. Dead air at beginning/end of THIS chunk
    
    IMPORTANT: 
    - Timestamps are relative to THIS CHUNK (0:00 to ${formatDuration(chunk.endTime - chunk.startTime)})
    - Be aggressive - mark everything questionable
    - A 6-minute chunk might have 20-30 cuts
    
    Return JSON with timestamps relative to full video:
    {
      "segmentsToRemove": [
        {
          "startTime": "${chunk.startTimecode} + offset",
          "endTime": "${chunk.startTimecode} + offset",
          "duration": seconds,
          "reason": "specific reason",
          "category": "pause|filler_words|false_start|technical",
          "confidence": 0.0-1.0
        }
      ],
      "metadata": {
        "chunkIndex": ${chunk.index},
        "cheskedDuration": ${chunk.endTime - chunk.startTime},
        "cutsFound": count
      }
    }
  `;
  
  return await geminiAPI.analyze(chunk.filePath, prompt);
};
```

---

## Database Schema Updates

```sql
-- Updated video_jobs table with format conversion
CREATE TABLE video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  original_filename VARCHAR(255),
  original_format VARCHAR(10), -- 'mov', 'avi', 'mp4', etc.
  file_size BIGINT,
  file_size_mb INTEGER GENERATED ALWAYS AS (file_size / 1048576) STORED,
  duration_seconds INTEGER,
  status VARCHAR(50), -- 'converting', 'chunking', 'processing', etc.
  conversion_required BOOLEAN DEFAULT FALSE,
  converted_path VARCHAR(500),
  chunk_count INTEGER,
  chunk_size_mb INTEGER DEFAULT 500,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Chunk tracking with smaller sizes
CREATE TABLE video_chunks_500mb (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES video_jobs(id),
  chunk_index INTEGER,
  chunk_size_bytes BIGINT,
  chunk_size_mb INTEGER GENERATED ALWAYS AS (chunk_size_bytes / 1048576) STORED,
  duration_seconds NUMERIC(10,2),
  start_timecode VARCHAR(20),
  end_timecode VARCHAR(20),
  storage_path VARCHAR(500),
  gemini_upload_status VARCHAR(50),
  gemini_file_uri VARCHAR(500),
  analysis_result JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  CONSTRAINT chunk_size_limit CHECK (chunk_size_bytes <= 524288000)
);
```

---

## Cost Analysis Update

### Processing Costs for 5GB Video

```yaml
Video Specifications:
  File Size: 5GB
  Duration: ~60 minutes (at 10Mbps)
  Chunks: 10-12 (500MB each)
  
Gemini API Costs:
  Per Chunk: ~$0.20 (6 minutes of video)
  Total Chunks: 12
  Total API Cost: $2.40 per 5GB video
  
  Monthly Estimates:
    10 videos/day: $720/month
    50 videos/day: $3,600/month
    100 videos/day: $7,200/month

Infrastructure (Digital Ocean):
  Droplet: $96/month
  Storage (500GB): $50/month  
  Spaces (1TB): $20/month
  Bandwidth: $0 (10TB included)
  Total: $166/month

Per-Video Breakdown:
  API Cost: $2.40
  Storage: $0.10 (temporary)
  Processing: $0.05
  Total: ~$2.55 per 5GB video
```

### Comparison: 500MB vs 2GB Chunks

```yaml
500MB Chunks (Recommended):
  Pros:
    - More reliable Gemini processing
    - Faster individual chunk processing (2-3 min)
    - Better error recovery (smaller retries)
    - More granular progress tracking
  Cons:
    - More API calls (12 vs 3)
    - Slightly higher cost ($2.40 vs $1.20)
    - More complex aggregation

2GB Chunks:
  Pros:
    - Fewer API calls
    - Lower cost
    - Simpler aggregation
  Cons:
    - Risk of Gemini timeouts
    - Longer processing per chunk (10+ min)
    - Larger retry cost if fails
```

---

## User Interface Updates

### Upload Component with Format Detection

```tsx
const VideoUploadWithConversion = () => {
  const [file, setFile] = useState<File | null>(null);
  const [needsConversion, setNeedsConversion] = useState(false);
  
  const handleFileSelect = (file: File) => {
    // Check file size
    if (file.size > 5 * 1024 * 1024 * 1024) {
      alert('File too large. Maximum size is 5GB.');
      return;
    }
    
    // Check format
    const extension = file.name.split('.').pop()?.toLowerCase();
    const mp4Formats = ['mp4', 'm4v'];
    const supportedFormats = ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm'];
    
    if (!supportedFormats.includes(extension || '')) {
      alert('Unsupported format. Please upload MP4, MOV, AVI, MKV, or WEBM.');
      return;
    }
    
    setNeedsConversion(!mp4Formats.includes(extension || ''));
    setFile(file);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Video (Max 5GB)</CardTitle>
        <CardDescription>
          Supported: MP4, MOV, AVI, MKV, WEBM
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DropZone onFileSelect={handleFileSelect} />
        
        {file && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileIcon />
              <span>{file.name}</span>
              <Badge>{(file.size / 1024 / 1024 / 1024).toFixed(2)} GB</Badge>
            </div>
            
            {needsConversion && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This file will be converted to MP4 format before processing.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="text-sm text-muted-foreground">
              Will be split into ~{Math.ceil(file.size / (500 * 1024 * 1024))} chunks for processing
            </div>
            
            <Button onClick={startUpload} className="w-full">
              {needsConversion ? 'Convert & Process' : 'Start Processing'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

### Chunk Progress Visualization

```tsx
const ChunkProgressGrid = ({ chunks }: { chunks: ChunkStatus[] }) => {
  return (
    <div className="grid grid-cols-6 gap-2">
      {chunks.map((chunk, i) => (
        <div
          key={i}
          className={`
            relative aspect-square rounded-lg border-2 p-2
            ${chunk.status === 'complete' ? 'bg-green-50 border-green-500' : ''}
            ${chunk.status === 'processing' ? 'bg-yellow-50 border-yellow-500' : ''}
            ${chunk.status === 'pending' ? 'bg-gray-50 border-gray-300' : ''}
            ${chunk.status === 'failed' ? 'bg-red-50 border-red-500' : ''}
          `}
        >
          <div className="text-center">
            <div className="text-2xl font-bold">{i + 1}</div>
            <div className="text-xs mt-1">{chunk.duration}s</div>
            <div className="text-xs">{(chunk.size / 1024 / 1024).toFixed(0)}MB</div>
          </div>
          
          {chunk.status === 'processing' && (
            <Loader className="absolute top-1 right-1 h-3 w-3 animate-spin" />
          )}
          {chunk.status === 'complete' && (
            <CheckCircle className="absolute top-1 right-1 h-3 w-3 text-green-600" />
          )}
          {chunk.status === 'failed' && (
            <XCircle className="absolute top-1 right-1 h-3 w-3 text-red-600" />
          )}
        </div>
      ))}
    </div>
  );
};
```

---

## Processing Pipeline Updates

### Complete Processing Flow

```typescript
class VideoProcessor {
  async processVideo(file: File, sessionId: string): Promise<JobResult> {
    // Step 1: Validate file
    if (file.size > 5 * 1024 * 1024 * 1024) {
      throw new Error('File exceeds 5GB limit');
    }
    
    // Step 2: Upload to cloud storage
    const uploadPath = await this.uploadToStorage(file, sessionId);
    
    // Step 3: Create job
    const job = await this.createJob({
      sessionId,
      originalFilename: file.name,
      fileSize: file.size,
      originalFormat: this.detectFormat(file.name)
    });
    
    // Step 4: Check if conversion needed
    const needsConversion = !['mp4', 'm4v'].includes(job.originalFormat);
    
    if (needsConversion) {
      job.status = 'converting';
      await this.updateJob(job);
      
      const convertedPath = await this.convertToMp4(uploadPath);
      job.convertedPath = convertedPath;
      job.conversionRequired = true;
    }
    
    // Step 5: Analyze video metadata
    const metadata = await this.getVideoMetadata(
      job.convertedPath || uploadPath
    );
    
    // Step 6: Create chunking plan (500MB chunks)
    job.status = 'chunking';
    await this.updateJob(job);
    
    const chunks = await this.createChunkPlan(metadata, 500 * 1024 * 1024);
    job.chunkCount = chunks.length;
    
    // Step 7: Execute chunking
    const chunkFiles = await this.splitIntoChunks(
      job.convertedPath || uploadPath,
      chunks
    );
    
    // Step 8: Process chunks in parallel
    job.status = 'processing';
    await this.updateJob(job);
    
    const results = await this.processChunksInParallel(chunkFiles, job.id);
    
    // Step 9: Aggregate results
    job.status = 'aggregating';
    await this.updateJob(job);
    
    const aggregated = await this.aggregateResults(results);
    
    // Step 10: Complete
    job.status = 'complete';
    job.results = aggregated;
    await this.updateJob(job);
    
    // Step 11: Cleanup temporary files
    await this.cleanupTempFiles(job.id);
    
    return job;
  }
}
```

---

## Implementation Priorities

### Phase 1: Core 500MB Chunking (Week 1)
- [ ] Update chunking algorithm for 500MB limit
- [ ] Test with various bitrate videos
- [ ] Implement keyframe detection
- [ ] Validate chunk sizes stay under limit

### Phase 2: Format Conversion (Week 1)
- [ ] Implement MOV → MP4 conversion
- [ ] Implement AVI → MP4 conversion  
- [ ] Add format detection
- [ ] Test quality preservation

### Phase 3: Parallel Processing (Week 2)
- [ ] Set up parallel chunk processing
- [ ] Implement progress tracking
- [ ] Add retry logic for failed chunks
- [ ] Test with 5GB files (10-12 chunks)

### Phase 4: UI Updates (Week 2)
- [ ] Update upload component for 5GB limit
- [ ] Add format conversion indicator
- [ ] Create chunk grid visualization
- [ ] Show per-chunk progress

### Phase 5: Testing & Optimization (Week 3)
- [ ] Load test with multiple 5GB videos
- [ ] Optimize chunk processing order
- [ ] Fine-tune parallel processing limits
- [ ] Monitor memory usage

---

## Benefits of 500MB Chunks

1. **Reliability**: Gemini processes smaller chunks more reliably
2. **Speed**: Each chunk processes in 2-3 minutes vs 10+ minutes
3. **Granularity**: Better progress tracking (10 steps vs 3)
4. **Recovery**: Failed chunks are smaller to retry
5. **Memory**: Lower memory footprint on servers
6. **Parallel**: Can process more chunks simultaneously

---

## Risk Mitigation

### Potential Issues & Solutions

```yaml
Issue: More API calls increase failure points
Solution: Robust retry logic with exponential backoff

Issue: Aggregation complexity with 10+ chunks  
Solution: Overlap detection and smart merging

Issue: Higher costs from more API calls
Solution: Batch processing discounts, caching

Issue: Format conversion quality loss
Solution: Use high-quality encoding settings (CRF 22)

Issue: 5GB uploads failing
Solution: Resumable upload protocol, chunked uploads
```

---

## Success Metrics

- Process 5GB video in <20 minutes
- 95% successful chunk processing rate
- <5% quality loss in format conversion
- Support 50 concurrent 5GB uploads
- Keep per-video cost under $3

---

*Document Version: 2.0*  
*Last Updated: January 2025*  
*Key Changes: 500MB chunks, 5GB limit, format conversion*