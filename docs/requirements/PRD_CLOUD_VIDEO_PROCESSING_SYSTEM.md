# Product Requirements Document: Cloud-Based Video Processing System
## Large File Support with Chunked Processing

---

## Executive Summary

Transform the current client-side video analysis app into a robust cloud-based system that can handle videos of ANY size (2GB, 10GB, 50GB+) by intelligently chunking them for Gemini API processing. Users can upload massive files, close their browser, and return later to see results.

**Key Innovation**: Split large videos into <2GB chunks → Process each chunk through Gemini → Aggregate all segments into unified timeline.

---

## Core Problem Statement

### Current Limitations
1. **Gemini API limit**: 2GB max file size
2. **Browser limitations**: Can't handle 10GB+ files in memory
3. **User experience**: Must keep browser open during processing
4. **Processing time**: Large files take 30+ minutes
5. **Network issues**: Upload failures lose all progress

### Solution
Cloud-based processing pipeline that:
- Accepts videos of unlimited size
- Splits them into processable chunks
- Runs analysis asynchronously
- Persists results for later retrieval
- Works without active browser session

---

## System Architecture

### High-Level Flow
```
User Upload (any size) → Cloud Storage → FFmpeg Chunking → 
→ Parallel Gemini Processing → Result Aggregation → 
→ Persistent Storage → User Interface
```

### Component Architecture

#### 1. Frontend (Next.js App)
- **Upload Interface**: Resumable uploads with progress tracking
- **Session Management**: Unique session IDs (no login required initially)
- **Status Dashboard**: Shows processing progress for all user videos
- **Results Viewer**: Aggregated segments from all chunks

#### 2. Backend API (Node.js/Next.js API Routes)
- **Upload Handler**: Receives files, stores to cloud
- **Job Queue Manager**: Manages processing pipeline
- **Chunk Coordinator**: Tracks chunk processing status
- **Result Aggregator**: Combines chunk results

#### 3. Processing Service (Docker on Digital Ocean)
- **FFmpeg Container**: Handles video operations
- **Chunk Splitter**: Intelligent splitting algorithm
- **Format Converter**: MOV→MP4, AVI→MP4, etc.
- **Compression Engine**: Reduces file sizes when needed

#### 4. Storage Layer
- **Digital Ocean Spaces** (S3-compatible):
  - Original videos
  - Processed chunks
  - Analysis results
- **PostgreSQL Database**:
  - Session metadata
  - Processing status
  - Chunk mappings
  - Aggregated results

#### 5. Queue System (Redis/BullMQ)
- Job queuing for chunk processing
- Retry logic for failed chunks
- Progress tracking
- Result aggregation triggers

---

## Detailed Technical Specifications

### 1. Video Chunking Algorithm

#### Intelligent Splitting Strategy
```javascript
// Chunking Logic
const chunkVideo = async (videoPath, duration) => {
  const MAX_CHUNK_SIZE = 1.8 * 1024 * 1024 * 1024; // 1.8GB (safety margin)
  const TARGET_CHUNK_DURATION = 600; // 10 minutes ideal
  
  // Calculate optimal chunk duration based on file size
  const fileSize = await getFileSize(videoPath);
  const bitrate = fileSize / duration;
  const optimalChunkDuration = Math.min(
    MAX_CHUNK_SIZE / bitrate,
    TARGET_CHUNK_DURATION
  );
  
  // Create chunks at scene boundaries when possible
  const chunks = [];
  let currentTime = 0;
  
  while (currentTime < duration) {
    const chunkEnd = Math.min(
      currentTime + optimalChunkDuration,
      duration
    );
    
    // Adjust to nearest keyframe for clean cuts
    const adjustedEnd = await findNearestKeyframe(videoPath, chunkEnd);
    
    chunks.push({
      start: currentTime,
      end: adjustedEnd,
      index: chunks.length
    });
    
    currentTime = adjustedEnd;
  }
  
  return chunks;
};
```

#### FFmpeg Chunking Commands
```bash
# Split video into chunks with overlap for context
ffmpeg -i input.mp4 -ss 00:00:00 -t 00:10:00 -c copy chunk_001.mp4
ffmpeg -i input.mp4 -ss 00:09:50 -t 00:10:10 -c copy chunk_002.mp4
# 10-second overlap ensures no missed cuts at boundaries
```

### 2. Session Management System

#### No-Login Architecture (Phase 1)
```typescript
interface UserSession {
  sessionId: string;        // UUID generated client-side
  createdAt: Date;
  lastAccessed: Date;
  videos: VideoJob[];
  settings: {
    autoDelete: boolean;     // Delete after 30 days
    emailNotification?: string; // Optional
  };
}

interface VideoJob {
  jobId: string;
  originalFileName: string;
  fileSize: number;
  uploadedAt: Date;
  status: 'uploading' | 'chunking' | 'processing' | 'aggregating' | 'complete' | 'failed';
  chunks: ChunkStatus[];
  progress: number;        // 0-100
  estimatedCompletion?: Date;
  results?: AggregatedResults;
  error?: string;
}

interface ChunkStatus {
  chunkId: string;
  index: number;
  startTime: string;      // "00:10:00"
  endTime: string;        // "00:20:00"
  status: 'pending' | 'processing' | 'complete' | 'failed';
  geminiResponse?: any;
  retryCount: number;
}
```

#### Session Persistence
- Store sessionId in localStorage
- Server stores session for 30 days
- Shareable links: `app.com/results/{sessionId}/{jobId}`

### 3. Processing Pipeline

#### Job Queue Architecture
```typescript
// BullMQ job definitions
const videoQueue = new Queue('video-processing');
const chunkQueue = new Queue('chunk-analysis');
const aggregationQueue = new Queue('result-aggregation');

// Main video job
videoQueue.process(async (job) => {
  const { videoPath, sessionId, jobId } = job.data;
  
  // Step 1: Analyze video metadata
  const metadata = await ffprobe(videoPath);
  
  // Step 2: Create chunking plan
  const chunks = await createChunkPlan(metadata);
  
  // Step 3: Execute chunking
  for (const chunk of chunks) {
    await ffmpegSplit(videoPath, chunk);
    
    // Queue chunk for Gemini processing
    await chunkQueue.add('analyze-chunk', {
      chunkPath: chunk.outputPath,
      chunkIndex: chunk.index,
      jobId,
      sessionId,
      totalChunks: chunks.length
    });
  }
});

// Chunk processing job
chunkQueue.process(async (job) => {
  const { chunkPath, chunkIndex, jobId } = job.data;
  
  // Upload to Gemini
  const fileUri = await uploadToGemini(chunkPath);
  
  // Analyze with context
  const analysis = await geminiAnalyze(fileUri, {
    chunkIndex,
    isFirstChunk: chunkIndex === 0,
    isLastChunk: chunkIndex === totalChunks - 1
  });
  
  // Store results
  await storeChunkResults(jobId, chunkIndex, analysis);
  
  // Check if all chunks complete
  if (await allChunksComplete(jobId)) {
    aggregationQueue.add('aggregate-results', { jobId });
  }
});
```

### 4. Gemini API Integration

#### Chunk Processing Strategy
```typescript
const analyzeChunk = async (
  fileUri: string, 
  context: ChunkContext
): Promise<ChunkAnalysis> => {
  
  const prompt = `
    Analyze this video chunk (Part ${context.chunkIndex + 1} of ${context.totalChunks}).
    
    IMPORTANT CONTEXT:
    - This is ${context.isFirstChunk ? 'the FIRST' : context.isLastChunk ? 'the LAST' : 'a MIDDLE'} chunk
    - Video timestamps are offset by ${context.timeOffset} seconds
    - Look for cuts that may span chunk boundaries
    
    ${context.isFirstChunk ? 'Check for dead air at video start.' : ''}
    ${context.isLastChunk ? 'Check for dead air at video end.' : ''}
    
    Identify ALL segments to remove:
    [Standard prompt continues...]
    
    CRITICAL: Add ${context.timeOffset} to all timestamps in your response.
    
    Return JSON with absolute timestamps:
    {
      "segmentsToRemove": [...],
      "boundaryWarnings": [
        {
          "timestamp": "09:58",
          "type": "potential_cut_continuation",
          "description": "Pause may continue into next chunk"
        }
      ]
    }
  `;
  
  return await geminiProcess(fileUri, prompt);
};
```

### 5. Result Aggregation

#### Intelligent Chunk Merging
```typescript
const aggregateChunkResults = async (
  chunks: ChunkAnalysis[]
): Promise<AggregatedResults> => {
  
  const allSegments: EnhancedSegment[] = [];
  const boundaryIssues: BoundaryIssue[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const nextChunk = chunks[i + 1];
    
    // Add all segments from this chunk
    allSegments.push(...chunk.segmentsToRemove);
    
    // Handle boundary overlaps
    if (nextChunk && chunk.boundaryWarnings?.length > 0) {
      // Check if a cut spans chunks
      const lastSegmentThisChunk = chunk.segmentsToRemove[chunk.segmentsToRemove.length - 1];
      const firstSegmentNextChunk = nextChunk.segmentsToRemove[0];
      
      if (shouldMergeSegments(lastSegmentThisChunk, firstSegmentNextChunk)) {
        // Merge the segments
        const merged = mergeSegments(lastSegmentThisChunk, firstSegmentNextChunk);
        allSegments[allSegments.length - 1] = merged;
        // Remove first segment from next chunk to avoid duplication
        nextChunk.segmentsToRemove.shift();
      }
    }
  }
  
  // Sort by timestamp and remove duplicates
  const finalSegments = deduplicateAndSort(allSegments);
  
  return {
    segmentsToRemove: finalSegments,
    summary: calculateSummary(finalSegments),
    processingMetadata: {
      totalChunks: chunks.length,
      boundaryIssuesResolved: boundaryIssues.length
    }
  };
};
```

---

## Docker Deployment Specifications

### Docker Container Structure
```dockerfile
# Dockerfile for processing service
FROM node:20-alpine

# Install FFmpeg with all codecs
RUN apk add --no-cache \
  ffmpeg \
  python3 \
  py3-pip \
  git

# Install Node dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3001
CMD ["node", "worker.js"]
```

### Docker Compose Configuration
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379
      - DO_SPACES_KEY=${DO_SPACES_KEY}
      - DO_SPACES_SECRET=${DO_SPACES_SECRET}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    depends_on:
      - postgres
      - redis
      - worker

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    environment:
      - REDIS_URL=redis://redis:6379
      - DO_SPACES_ENDPOINT=${DO_SPACES_ENDPOINT}
    depends_on:
      - redis
      - postgres
    deploy:
      replicas: 3  # Scale workers as needed

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=video_processor
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Digital Ocean Deployment

#### Droplet Specifications
```yaml
Server Requirements:
  Type: CPU-Optimized Droplet
  Size: 8 vCPUs, 16GB RAM (minimum)
  Storage: 500GB SSD
  Region: NYC3 or SFO3
  
Scaling Strategy:
  - Start with 1 droplet
  - Add worker droplets as needed
  - Use DO Load Balancer for multiple instances
  
Storage:
  - DO Spaces for video storage (S3-compatible)
  - 10TB transfer included
  - $0.02/GB beyond that
```

---

## Database Schema

### PostgreSQL Tables
```sql
-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW(),
  settings JSONB DEFAULT '{}',
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
);

-- Video jobs table
CREATE TABLE video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  original_filename VARCHAR(255),
  file_size BIGINT,
  duration_seconds INTEGER,
  status VARCHAR(50),
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  error_message TEXT,
  storage_path VARCHAR(500),
  metadata JSONB
);

-- Chunks table
CREATE TABLE video_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES video_jobs(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  start_time VARCHAR(20),
  end_time VARCHAR(20),
  status VARCHAR(50),
  storage_path VARCHAR(500),
  gemini_file_uri VARCHAR(500),
  analysis_result JSONB,
  retry_count INTEGER DEFAULT 0,
  processed_at TIMESTAMP
);

-- Aggregated results table
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES video_jobs(id) ON DELETE CASCADE,
  segments JSONB,
  summary JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- Indexes for performance
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_jobs_session ON video_jobs(session_id);
CREATE INDEX idx_jobs_status ON video_jobs(status);
CREATE INDEX idx_chunks_job ON video_chunks(job_id);
CREATE INDEX idx_chunks_status ON video_chunks(status);
```

---

## API Endpoints

### RESTful API Design
```typescript
// Session Management
POST   /api/sessions/create
GET    /api/sessions/:sessionId/status
DELETE /api/sessions/:sessionId

// Video Upload & Processing
POST   /api/videos/upload
  Body: FormData with video file
  Response: { jobId, uploadUrl, sessionId }

POST   /api/videos/upload-chunk  // For resumable uploads
  Headers: X-Upload-Offset, X-Session-Id
  Body: Binary chunk data

GET    /api/videos/:jobId/status
  Response: {
    status: 'processing',
    progress: 45,
    chunksComplete: 5,
    totalChunks: 11,
    estimatedCompletion: '2024-01-15T10:30:00Z'
  }

GET    /api/videos/:jobId/results
  Response: {
    segmentsToRemove: [...],
    summary: {...},
    processingTime: 1823,
    chunks: [...]
  }

// Chunk Management  
GET    /api/chunks/:jobId
  Response: Array of chunk statuses

POST   /api/chunks/:chunkId/retry
  Response: { retrying: true }

// Export & Download
GET    /api/export/:jobId/json
GET    /api/export/:jobId/csv
GET    /api/export/:jobId/edl
GET    /api/export/:jobId/fcpxml
```

---

## User Interface Updates

### New Components Needed

#### 1. Upload Progress Component
```tsx
interface UploadProgressProps {
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'complete';
  estimatedTime?: number;
  jobId?: string;
}

const UploadProgress = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Uploading: {file.name}</CardTitle>
        <CardDescription>
          {formatFileSize(file.size)} • {status}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Progress value={progress} />
        {status === 'processing' && (
          <div className="mt-4">
            <p>You can safely close this window.</p>
            <p>Your video is processing in the cloud.</p>
            <Button onClick={copyShareLink}>
              Copy Link to Results
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

#### 2. Processing Dashboard
```tsx
const ProcessingDashboard = () => {
  const { sessionId } = useSession();
  const jobs = useVideoJobs(sessionId);
  
  return (
    <div className="grid gap-4">
      <h2>Your Videos</h2>
      {jobs.map(job => (
        <JobCard key={job.id}>
          <JobHeader>
            <FileName>{job.originalFileName}</FileName>
            <JobStatus status={job.status} />
          </JobHeader>
          <JobProgress>
            {job.status === 'chunking' && (
              <p>Splitting into {job.estimatedChunks} chunks...</p>
            )}
            {job.status === 'processing' && (
              <ChunkProgress 
                complete={job.chunksComplete}
                total={job.totalChunks}
              />
            )}
            {job.status === 'complete' && (
              <Button onClick={() => viewResults(job.id)}>
                View Results ({job.segmentCount} cuts found)
              </Button>
            )}
          </JobProgress>
        </JobCard>
      ))}
    </div>
  );
};
```

#### 3. Chunk Visualization
```tsx
const ChunkTimeline = ({ chunks }) => {
  return (
    <div className="chunk-timeline">
      {chunks.map((chunk, i) => (
        <div 
          key={i}
          className={`chunk-block ${chunk.status}`}
          style={{
            width: `${chunk.duration / totalDuration * 100}%`
          }}
        >
          <span className="chunk-number">{i + 1}</span>
          {chunk.status === 'complete' && (
            <CheckIcon className="chunk-status" />
          )}
          {chunk.status === 'processing' && (
            <Loader className="chunk-status animate-spin" />
          )}
        </div>
      ))}
    </div>
  );
};
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Set up Digital Ocean droplet
- [ ] Deploy Docker containers
- [ ] Configure PostgreSQL & Redis
- [ ] Set up DO Spaces for storage
- [ ] Basic session management (no auth)
- [ ] Implement chunking algorithm
- [ ] Test FFmpeg splitting

### Phase 2: Processing Pipeline (Week 2-3)
- [ ] Build job queue system
- [ ] Implement chunk processor
- [ ] Gemini API integration for chunks
- [ ] Result aggregation logic
- [ ] Error handling & retries
- [ ] Progress tracking

### Phase 3: User Interface (Week 3-4)
- [ ] Resumable upload component
- [ ] Processing dashboard
- [ ] Real-time progress updates (WebSocket/SSE)
- [ ] Results viewer with chunk info
- [ ] Share links for results

### Phase 4: Optimization (Week 4-5)
- [ ] Parallel chunk processing
- [ ] Smart chunking at scene boundaries
- [ ] Caching frequently accessed results
- [ ] CDN for video playback
- [ ] Cost optimization

### Phase 5: Polish & Launch (Week 5-6)
- [ ] Email notifications (optional)
- [ ] Processing time estimates
- [ ] Batch video upload
- [ ] Admin dashboard
- [ ] Usage analytics

### Phase 6: Future Enhancements
- [ ] User accounts & authentication
- [ ] Team workspaces
- [ ] Custom AI prompts per chunk
- [ ] Video preview of chunks
- [ ] Automated editing (export edited video)
- [ ] API for third-party integration

---

## Cost Analysis

### Digital Ocean Costs (Monthly)
```
Droplet (8 vCPU, 16GB RAM):        $96/month
Additional storage (500GB):         $50/month
Spaces (1TB storage):              $20/month
Bandwidth (10TB included):         $0
Load Balancer (if needed):         $10/month
Managed Database (optional):       $15/month
-------------------------------------------
Total Infrastructure:              ~$191/month
```

### Gemini API Costs
```
Gemini 1.5 Pro pricing:
- Input: $3.50 per 1M tokens
- Output: $10.50 per 1M tokens
- Video: ~$0.04 per minute processed

Example for 1-hour video:
- Split into 6 chunks (10 min each)
- 6 API calls × $0.40 = $2.40
- Monthly (100 hours): ~$240
```

### Scaling Considerations
- Each worker can process ~10 chunks simultaneously
- 1 droplet = ~50-100 videos/day depending on size
- Scale horizontally by adding workers
- Use spot instances for cost savings

---

## Security Considerations

### Data Protection
1. **Encryption at rest**: All videos encrypted in DO Spaces
2. **Encryption in transit**: HTTPS/TLS for all connections
3. **Temporary files**: Auto-delete after processing
4. **Session isolation**: Videos only accessible via session ID

### Rate Limiting
```typescript
const rateLimits = {
  upload: '10 per hour per session',
  processing: '50 chunks per hour per session',
  download: '100 requests per hour per session'
};
```

### Content Moderation
- Implement file type validation
- Maximum file size limits (initially 50GB)
- Virus scanning for uploaded files
- NSFW content detection (optional)

---

## Monitoring & Observability

### Key Metrics
```typescript
const metrics = {
  // System Health
  'droplet.cpu.usage': 'percentage',
  'droplet.memory.usage': 'percentage',
  'droplet.disk.usage': 'percentage',
  
  // Processing Pipeline
  'jobs.queued': 'count',
  'jobs.processing': 'count',
  'jobs.completed.today': 'count',
  'jobs.failed.today': 'count',
  'chunks.average.process.time': 'seconds',
  
  // User Metrics
  'sessions.active': 'count',
  'videos.uploaded.today': 'count',
  'videos.total.size.today': 'gigabytes',
  
  // API Performance
  'api.response.time.p95': 'milliseconds',
  'api.error.rate': 'percentage',
  
  // Costs
  'gemini.api.calls.today': 'count',
  'storage.used': 'terabytes',
  'bandwidth.used.today': 'gigabytes'
};
```

### Logging Strategy
- Structured logging with JSON
- Centralized log aggregation
- Error tracking with Sentry
- Performance monitoring with DataDog

---

## Migration Strategy

### From Current App to Cloud System

#### Step 1: Parallel Operation
- Keep existing app running
- Deploy cloud system alongside
- Add toggle for "Process in Cloud" option

#### Step 2: Gradual Migration
- Files <2GB: Use existing flow
- Files >2GB: Force cloud processing
- Monitor performance & costs

#### Step 3: Full Migration
- All processing moves to cloud
- Client becomes thin UI layer
- Deprecate local processing

---

## Success Criteria

### Performance Targets
- Support videos up to 50GB
- Process 10-minute chunks in <3 minutes
- 99.9% uptime for processing service
- <5 second response time for status checks

### User Experience Goals
- Zero lost uploads due to connection issues
- Process videos 3x faster than real-time
- Results available within 30 minutes for 2-hour videos
- Share results without requiring account

### Business Metrics
- Support 1000 concurrent users
- Process 10TB of video per month
- Keep infrastructure costs <$500/month
- Maintain Gemini API costs <$0.05 per video minute

---

## Conclusion

This cloud-based architecture solves all current limitations while providing a foundation for future growth. The chunking strategy cleverly works around Gemini's 2GB limit, while cloud processing ensures reliability and scalability. The session-based approach avoids authentication complexity while still providing a personalized experience.

**Next Steps**:
1. Review and approve this PRD
2. Set up Digital Ocean infrastructure
3. Begin Phase 1 implementation
4. Create detailed technical specifications for each component

---

*Document Version: 1.0*  
*Last Updated: January 2025*  
*Status: Ready for Implementation*