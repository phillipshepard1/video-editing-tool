# Complete Product Requirements Document: Cloud Video Processing System
## Comprehensive Implementation Guide with 500MB Chunking

---

# Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Technical Specifications](#technical-specifications)
4. [Implementation Guide](#implementation-guide)
5. [Code Examples](#code-examples)
6. [API Documentation](#api-documentation)
7. [Database Design](#database-design)
8. [Docker & Deployment](#docker--deployment)
9. [Frontend Implementation](#frontend-implementation)
10. [Testing Strategy](#testing-strategy)
11. [Troubleshooting Guide](#troubleshooting-guide)
12. [Cost Analysis](#cost-analysis)
13. [Security Implementation](#security-implementation)
14. [Monitoring & Logging](#monitoring--logging)
15. [Migration Path](#migration-path)

---

# Executive Summary

## Project Overview
Transform the current client-side video analysis app into a robust **cloud-based system** that processes videos up to **5GB** by splitting them into **500MB chunks** for Gemini API analysis. The system automatically converts various formats (MOV, AVI, MKV) to MP4 and processes everything asynchronously in the cloud.

## Key Specifications
```yaml
Maximum File Size: 5GB (5,368,709,120 bytes)
Chunk Size: 500MB maximum (524,288,000 bytes)
Input Formats: MP4, MOV, AVI, MKV, WEBM, M4V
Output Format: MP4 (H.264 video + AAC audio)
Expected Chunks per 5GB: 10-12 chunks
Processing Time: 15-20 minutes for 5GB video
Parallel Processing: 5 chunks simultaneously
Infrastructure: Docker on Digital Ocean
Storage: Digital Ocean Spaces (S3-compatible)
Database: PostgreSQL
Queue System: Redis with BullMQ
Session Duration: 30 days (no login required)
```

## Core Features
1. **No Authentication Required** - Session-based system with 30-day persistence
2. **Background Processing** - Users can close browser, processing continues
3. **Format Conversion** - Automatic MOV/AVI/MKV → MP4 conversion
4. **Smart Chunking** - Split at keyframes, 500MB max per chunk
5. **Parallel Processing** - Process 5 chunks simultaneously
6. **Progress Tracking** - Real-time updates per chunk
7. **Result Aggregation** - Intelligent merging of chunk results
8. **Shareable Links** - Direct links to processing results

---

# System Architecture

## High-Level Architecture Diagram
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  Next.js App    │────▶│  Node.js API     │────▶│  Processing     │
│  (Frontend)     │     │  (Backend)       │     │  Workers        │
│                 │     │                  │     │  (Docker)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                        │
         │                       ▼                        ▼
         │              ┌──────────────────┐     ┌─────────────────┐
         │              │                  │     │                 │
         └─────────────▶│  PostgreSQL      │     │  Redis Queue    │
                        │  (Metadata)      │     │  (Jobs)         │
                        │                  │     │                 │
                        └──────────────────┘     └─────────────────┘
                                 │                        │
                                 ▼                        ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │                  │     │                 │
                        │  DO Spaces       │     │  Gemini API     │
                        │  (Video Storage) │     │  (Analysis)     │
                        │                  │     │                 │
                        └──────────────────┘     └─────────────────┘
```

## Component Breakdown

### 1. Frontend (Next.js 15.4)
- Handles file uploads up to 5GB
- Shows real-time processing progress
- Displays aggregated results
- Manages session persistence

### 2. Backend API (Node.js/Next.js)
- Receives video uploads
- Manages conversion pipeline
- Coordinates chunk processing
- Aggregates results

### 3. Processing Workers (Docker)
- FFmpeg for video operations
- Format conversion (MOV→MP4)
- Video chunking (500MB splits)
- Parallel processing coordination

### 4. Data Storage
- **PostgreSQL**: Job metadata, session info, results
- **Redis**: Job queue, progress tracking
- **DO Spaces**: Video files, chunks, converted files

### 5. External Services
- **Gemini API**: Video analysis
- **Digital Ocean**: Infrastructure hosting

---

# Technical Specifications

## Video Processing Pipeline

### Step 1: File Upload & Validation
```typescript
interface UploadValidation {
  maxSize: 5 * 1024 * 1024 * 1024, // 5GB
  allowedFormats: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
  chunkSize: 10 * 1024 * 1024, // 10MB upload chunks for resumable
}

const validateUpload = (file: File): ValidationResult => {
  // Check size
  if (file.size > 5 * 1024 * 1024 * 1024) {
    return { valid: false, error: 'File exceeds 5GB limit' };
  }
  
  // Check format
  const extension = file.name.split('.').pop()?.toLowerCase();
  const supportedFormats = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'];
  
  if (!supportedFormats.includes(extension || '')) {
    return { valid: false, error: 'Unsupported format' };
  }
  
  return { valid: true };
};
```

### Step 2: Format Detection & Conversion
```typescript
interface ConversionPipeline {
  detectFormat(filePath: string): Promise<VideoFormat>;
  needsConversion(format: VideoFormat): boolean;
  convertToMp4(input: string, output: string): Promise<void>;
}

class VideoConverter implements ConversionPipeline {
  async detectFormat(filePath: string): Promise<VideoFormat> {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${filePath}"`
    );
    const info = JSON.parse(stdout);
    return info.format.format_name;
  }
  
  needsConversion(format: VideoFormat): boolean {
    const mp4Formats = ['mp4', 'mov,mp4,m4a,3gp,3g2,mj2'];
    return !mp4Formats.some(f => format.includes(f));
  }
  
  async convertToMp4(input: string, output: string): Promise<void> {
    // Universal conversion command with quality preservation
    const command = `
      ffmpeg -i "${input}" \
        -c:v libx264 \
        -preset fast \
        -crf 22 \
        -profile:v high \
        -level 4.0 \
        -pix_fmt yuv420p \
        -c:a aac \
        -b:a 192k \
        -ar 48000 \
        -ac 2 \
        -movflags +faststart \
        -max_muxing_queue_size 9999 \
        "${output}" -y
    `.trim().replace(/\s+/g, ' ');
    
    await execAsync(command);
  }
}
```

### Step 3: 500MB Chunking Algorithm
```typescript
interface ChunkPlan {
  chunks: VideoChunk[];
  totalDuration: number;
  averageChunkSize: number;
  estimatedProcessingTime: number;
}

class VideoChunker {
  private readonly MAX_CHUNK_SIZE = 500 * 1024 * 1024; // 500MB
  private readonly SAFETY_MARGIN = 0.95; // Use 95% of max size
  
  async createChunkPlan(videoPath: string): Promise<ChunkPlan> {
    // Get video metadata
    const metadata = await this.getVideoMetadata(videoPath);
    const { duration, bitrate, size } = metadata;
    
    // Calculate optimal chunk duration
    const targetChunkSize = this.MAX_CHUNK_SIZE * this.SAFETY_MARGIN;
    const secondsPerChunk = Math.floor(targetChunkSize / (bitrate / 8));
    
    const chunks: VideoChunk[] = [];
    let currentTime = 0;
    let chunkIndex = 0;
    
    while (currentTime < duration) {
      // Find next keyframe after target duration
      const targetEnd = Math.min(currentTime + secondsPerChunk, duration);
      const keyframeEnd = await this.findNextKeyframe(videoPath, targetEnd);
      
      // Create chunk with 2-second overlap for boundary detection
      const overlapStart = Math.max(0, currentTime - 2);
      const overlapEnd = Math.min(duration, keyframeEnd + 2);
      
      chunks.push({
        index: chunkIndex,
        startTime: currentTime,
        endTime: keyframeEnd,
        overlapStart: overlapStart,
        overlapEnd: overlapEnd,
        startTimecode: this.secondsToTimecode(currentTime),
        endTimecode: this.secondsToTimecode(keyframeEnd),
        duration: keyframeEnd - currentTime,
        estimatedSize: (bitrate / 8) * (keyframeEnd - currentTime),
        outputPath: `chunk_${String(chunkIndex).padStart(3, '0')}.mp4`
      });
      
      currentTime = keyframeEnd;
      chunkIndex++;
    }
    
    return {
      chunks,
      totalDuration: duration,
      averageChunkSize: targetChunkSize,
      estimatedProcessingTime: chunks.length * 180 // 3 min per chunk
    };
  }
  
  async executeChunking(videoPath: string, chunk: VideoChunk): Promise<string> {
    const outputPath = `/tmp/chunks/${chunk.outputPath}`;
    
    // FFmpeg command with keyframe alignment
    const command = `
      ffmpeg -i "${videoPath}" \
        -ss ${chunk.startTimecode} \
        -to ${chunk.endTimecode} \
        -c copy \
        -avoid_negative_ts make_zero \
        -movflags +faststart \
        "${outputPath}" -y
    `.trim().replace(/\s+/g, ' ');
    
    await execAsync(command);
    
    // Verify chunk size
    const stats = await fs.stat(outputPath);
    if (stats.size > this.MAX_CHUNK_SIZE) {
      // Re-encode with compression if too large
      await this.reencodeChunk(outputPath, chunk);
    }
    
    return outputPath;
  }
  
  private async findNextKeyframe(videoPath: string, targetTime: number): Promise<number> {
    const command = `
      ffprobe -read_intervals ${targetTime}%+60 \
        -select_streams v:0 \
        -show_frames \
        -show_entries frame=pkt_pts_time,key_frame \
        -of json \
        "${videoPath}"
    `.trim().replace(/\s+/g, ' ');
    
    const { stdout } = await execAsync(command);
    const frames = JSON.parse(stdout).frames;
    
    // Find first keyframe after target time
    for (const frame of frames) {
      if (frame.key_frame === 1 && frame.pkt_pts_time >= targetTime) {
        return parseFloat(frame.pkt_pts_time);
      }
    }
    
    return targetTime; // Fallback to target if no keyframe found
  }
}
```

### Step 4: Parallel Processing with Gemini
```typescript
class GeminiProcessor {
  private readonly MAX_PARALLEL = 5;
  private readonly RETRY_ATTEMPTS = 3;
  
  async processChunksInParallel(
    chunks: VideoChunk[],
    jobId: string
  ): Promise<ChunkResult[]> {
    const results: ChunkResult[] = [];
    const queue = [...chunks];
    const processing = new Map<number, Promise<ChunkResult>>();
    
    while (queue.length > 0 || processing.size > 0) {
      // Start new chunks if under parallel limit
      while (processing.size < this.MAX_PARALLEL && queue.length > 0) {
        const chunk = queue.shift()!;
        const promise = this.processChunkWithRetry(chunk, jobId);
        
        processing.set(chunk.index, promise);
        
        // Remove from processing when done
        promise.then(result => {
          processing.delete(chunk.index);
          results[chunk.index] = result;
          this.updateProgress(jobId, results.length, chunks.length);
        }).catch(error => {
          processing.delete(chunk.index);
          console.error(`Chunk ${chunk.index} failed:`, error);
        });
      }
      
      // Wait for at least one to complete
      if (processing.size > 0) {
        await Promise.race(processing.values());
      }
    }
    
    return results;
  }
  
  private async processChunkWithRetry(
    chunk: VideoChunk,
    jobId: string,
    attempt = 1
  ): Promise<ChunkResult> {
    try {
      // Upload chunk to Gemini
      const fileUri = await this.uploadToGemini(chunk.outputPath);
      
      // Analyze with Gemini
      const analysis = await this.analyzeWithGemini(fileUri, chunk);
      
      return {
        chunkIndex: chunk.index,
        segments: analysis.segmentsToRemove,
        metadata: {
          duration: chunk.duration,
          cutsFound: analysis.segmentsToRemove.length,
          processingTime: Date.now() - startTime
        }
      };
    } catch (error) {
      if (attempt < this.RETRY_ATTEMPTS) {
        console.log(`Retrying chunk ${chunk.index} (attempt ${attempt + 1})`);
        await this.delay(1000 * attempt); // Exponential backoff
        return this.processChunkWithRetry(chunk, jobId, attempt + 1);
      }
      throw error;
    }
  }
  
  private async analyzeWithGemini(
    fileUri: string,
    chunk: VideoChunk
  ): Promise<GeminiAnalysis> {
    const prompt = `
      Analyze this video segment (Part ${chunk.index + 1}).
      Time range: ${chunk.startTimecode} to ${chunk.endTimecode}
      Duration: ${chunk.duration} seconds
      
      This is a SHORT segment (~6 minutes). Examine EVERY SECOND for:
      
      1. ALL pauses or silence over 1 second
      2. Filler words: "um", "uh", "like", "you know", "so", "basically"
      3. False starts (speaker restarts sentence)
      4. Technical issues (audio problems, video glitches)
      5. Repeated words or phrases
      6. Dead air at beginning/end
      7. Coughs, throat clearing, interruptions
      
      BE THOROUGH - A 6-minute chunk might have 20-30 cuts.
      
      For EACH segment found, provide:
      - Exact timestamps (relative to chunk start)
      - Duration in seconds
      - Specific reason for removal
      - Category: pause|filler_words|false_start|technical|redundant
      - Confidence score (0.0-1.0)
      
      Add ${chunk.startTime} seconds to all timestamps for absolute position.
      
      Return JSON only:
      {
        "segmentsToRemove": [
          {
            "startTime": "HH:MM:SS",
            "endTime": "HH:MM:SS",
            "duration": seconds,
            "reason": "specific description",
            "category": "category_name",
            "confidence": 0.95,
            "transcript": "first 50 chars of speech"
          }
        ],
        "chunkMetadata": {
          "totalDuration": ${chunk.duration},
          "cutsFound": count,
          "processingNotes": "any special observations"
        }
      }
    `;
    
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 8192
      }
    });
    
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: fileUri
        }
      },
      { text: prompt }
    ]);
    
    return JSON.parse(result.response.text());
  }
}
```

### Step 5: Result Aggregation
```typescript
class ResultAggregator {
  async aggregateChunkResults(
    chunkResults: ChunkResult[],
    chunkPlans: VideoChunk[]
  ): Promise<AggregatedResult> {
    const allSegments: EnhancedSegment[] = [];
    const boundaryIssues: BoundaryIssue[] = [];
    
    // Process each chunk's results
    for (let i = 0; i < chunkResults.length; i++) {
      const currentChunk = chunkResults[i];
      const currentPlan = chunkPlans[i];
      const nextChunk = chunkResults[i + 1];
      
      if (!currentChunk) continue;
      
      // Add segments from current chunk
      for (const segment of currentChunk.segments) {
        // Check for boundary overlaps
        if (nextChunk && this.isNearBoundary(segment, currentPlan)) {
          const overlap = this.checkBoundaryOverlap(
            segment,
            nextChunk.segments[0],
            currentPlan,
            chunkPlans[i + 1]
          );
          
          if (overlap) {
            // Merge overlapping segments
            const merged = this.mergeSegments(segment, nextChunk.segments[0]);
            allSegments.push(merged);
            nextChunk.segments.shift(); // Remove duplicate
            boundaryIssues.push({
              type: 'merged',
              chunks: [i, i + 1],
              description: `Merged cut spanning chunks ${i}-${i + 1}`
            });
            continue;
          }
        }
        
        allSegments.push(segment);
      }
    }
    
    // Sort and deduplicate
    const finalSegments = this.deduplicateSegments(
      this.sortSegments(allSegments)
    );
    
    // Calculate summary statistics
    const summary = this.calculateSummary(finalSegments);
    
    return {
      segmentsToRemove: finalSegments,
      summary,
      processingMetadata: {
        totalChunks: chunkResults.length,
        successfulChunks: chunkResults.filter(r => r !== null).length,
        boundaryIssuesResolved: boundaryIssues.length,
        totalCutsFound: finalSegments.length
      }
    };
  }
  
  private isNearBoundary(
    segment: EnhancedSegment,
    chunk: VideoChunk
  ): boolean {
    const segmentEnd = this.timecodeToSeconds(segment.endTime);
    const chunkEnd = chunk.endTime;
    return Math.abs(segmentEnd - chunkEnd) < 3; // Within 3 seconds
  }
  
  private checkBoundaryOverlap(
    segment1: EnhancedSegment,
    segment2: EnhancedSegment,
    chunk1: VideoChunk,
    chunk2: VideoChunk
  ): boolean {
    const seg1End = this.timecodeToSeconds(segment1.endTime);
    const seg2Start = this.timecodeToSeconds(segment2.startTime);
    
    // Check if segments are continuous across boundary
    return Math.abs(seg1End - seg2Start) < 1 && 
           segment1.category === segment2.category;
  }
  
  private mergeSegments(
    seg1: EnhancedSegment,
    seg2: EnhancedSegment
  ): EnhancedSegment {
    return {
      startTime: seg1.startTime,
      endTime: seg2.endTime,
      duration: seg1.duration + seg2.duration,
      reason: `${seg1.reason} (continues from previous chunk)`,
      category: seg1.category,
      confidence: Math.min(seg1.confidence, seg2.confidence),
      transcript: seg1.transcript
    };
  }
}
```

---

# Implementation Guide

## Phase 1: Infrastructure Setup (Days 1-3)

### 1.1 Digital Ocean Setup
```bash
# Create Droplet
doctl compute droplet create video-processor \
  --size s-8vcpu-16gb \
  --image docker-20-04 \
  --region nyc3 \
  --ssh-keys YOUR_SSH_KEY_ID

# Create Spaces bucket
doctl spaces create video-storage --region nyc3

# Create Managed Database
doctl databases create video-db \
  --engine pg \
  --version 15 \
  --size db-s-2vcpu-4gb \
  --region nyc3
```

### 1.2 Docker Environment
```dockerfile
# Dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg python3 py3-pip

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

### 1.3 Docker Compose Configuration
```yaml
version: '3.8'

services:
  app:
    build: 
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/videodb
      - REDIS_URL=redis://redis:6379
      - DO_SPACES_KEY=${DO_SPACES_KEY}
      - DO_SPACES_SECRET=${DO_SPACES_SECRET}
      - DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
      - DO_SPACES_BUCKET=video-storage
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - SESSION_SECRET=${SESSION_SECRET}
    depends_on:
      - postgres
      - redis
    volumes:
      - /tmp/video-processing:/tmp/video-processing

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/videodb
      - REDIS_URL=redis://redis:6379
      - DO_SPACES_KEY=${DO_SPACES_KEY}
      - DO_SPACES_SECRET=${DO_SPACES_SECRET}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    depends_on:
      - postgres
      - redis
    volumes:
      - /tmp/video-processing:/tmp/video-processing
    deploy:
      replicas: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=videodb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app

volumes:
  postgres_data:
  redis_data:
```

## Phase 2: Backend Implementation (Days 4-7)

### 2.1 Project Structure
```
video-analysis-app/
├── app/
│   ├── api/
│   │   ├── sessions/
│   │   │   ├── create/route.ts
│   │   │   └── [sessionId]/route.ts
│   │   ├── videos/
│   │   │   ├── upload/route.ts
│   │   │   ├── [jobId]/
│   │   │   │   ├── status/route.ts
│   │   │   │   ├── results/route.ts
│   │   │   │   └── chunks/route.ts
│   │   └── export/
│   │       └── [jobId]/[format]/route.ts
│   └── page.tsx
├── lib/
│   ├── services/
│   │   ├── video-converter.ts
│   │   ├── video-chunker.ts
│   │   ├── gemini-processor.ts
│   │   ├── result-aggregator.ts
│   │   └── storage-service.ts
│   ├── queue/
│   │   ├── job-queue.ts
│   │   ├── workers/
│   │   │   ├── conversion-worker.ts
│   │   │   ├── chunking-worker.ts
│   │   │   └── processing-worker.ts
│   │   └── queue-manager.ts
│   ├── db/
│   │   ├── schema.sql
│   │   ├── client.ts
│   │   └── migrations/
│   └── utils/
│       ├── ffmpeg-helpers.ts
│       ├── timecode-utils.ts
│       └── validation.ts
├── worker/
│   ├── index.ts
│   └── processors/
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   └── docker-compose.yml
└── config/
    ├── nginx.conf
    └── redis.conf
```

### 2.2 Core Services Implementation

#### Storage Service
```typescript
// lib/services/storage-service.ts
import AWS from 'aws-sdk';

export class StorageService {
  private s3: AWS.S3;
  private bucket: string;
  
  constructor() {
    this.s3 = new AWS.S3({
      endpoint: process.env.DO_SPACES_ENDPOINT,
      accessKeyId: process.env.DO_SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET,
      s3ForcePathStyle: false,
      signatureVersion: 'v4'
    });
    this.bucket = process.env.DO_SPACES_BUCKET!;
  }
  
  async uploadVideo(
    filePath: string,
    key: string
  ): Promise<string> {
    const fileStream = fs.createReadStream(filePath);
    const uploadParams = {
      Bucket: this.bucket,
      Key: key,
      Body: fileStream,
      ACL: 'private',
      ContentType: 'video/mp4'
    };
    
    const result = await this.s3.upload(uploadParams).promise();
    return result.Location;
  }
  
  async getSignedUrl(key: string, expires = 3600): Promise<string> {
    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucket,
      Key: key,
      Expires: expires
    });
  }
  
  async deleteVideo(key: string): Promise<void> {
    await this.s3.deleteObject({
      Bucket: this.bucket,
      Key: key
    }).promise();
  }
  
  async uploadChunk(
    chunkPath: string,
    jobId: string,
    chunkIndex: number
  ): Promise<string> {
    const key = `chunks/${jobId}/chunk_${String(chunkIndex).padStart(3, '0')}.mp4`;
    return this.uploadVideo(chunkPath, key);
  }
}
```

#### Job Queue Manager
```typescript
// lib/queue/job-queue.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL!);

export const videoQueue = new Queue('video-processing', { connection });
export const chunkQueue = new Queue('chunk-analysis', { connection });
export const aggregationQueue = new Queue('result-aggregation', { connection });

export class JobManager {
  async createVideoJob(data: VideoJobData): Promise<string> {
    const job = await videoQueue.add('process-video', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
    return job.id!;
  }
  
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const job = await videoQueue.getJob(jobId);
    if (!job) throw new Error('Job not found');
    
    const state = await job.getState();
    const progress = job.progress;
    
    return {
      id: jobId,
      state,
      progress,
      data: job.data,
      result: job.returnvalue
    };
  }
  
  async createChunkJobs(
    chunks: VideoChunk[],
    parentJobId: string
  ): Promise<void> {
    const chunkJobs = chunks.map(chunk => ({
      name: 'analyze-chunk',
      data: {
        chunk,
        parentJobId,
        totalChunks: chunks.length
      },
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    }));
    
    await chunkQueue.addBulk(chunkJobs);
  }
}
```

### 2.3 API Routes Implementation

#### Upload Route
```typescript
// app/api/videos/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import formidable from 'formidable';
import { JobManager } from '@/lib/queue/job-queue';
import { StorageService } from '@/lib/services/storage-service';
import { validateUpload } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const sessionId = request.headers.get('x-session-id');
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }
    
    // Validate file
    const validation = validateUpload(file);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }
    
    // Save file temporarily
    const tempPath = `/tmp/uploads/${Date.now()}_${file.name}`;
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.writeFile(tempPath, buffer);
    
    // Upload to cloud storage
    const storage = new StorageService();
    const cloudKey = `uploads/${sessionId}/${Date.now()}_${file.name}`;
    const cloudUrl = await storage.uploadVideo(tempPath, cloudKey);
    
    // Create processing job
    const jobManager = new JobManager();
    const jobId = await jobManager.createVideoJob({
      sessionId,
      originalFilename: file.name,
      fileSize: file.size,
      cloudKey,
      cloudUrl,
      tempPath
    });
    
    // Clean up temp file
    await fs.unlink(tempPath);
    
    return NextResponse.json({
      success: true,
      jobId,
      sessionId,
      message: 'Video uploaded and processing started'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}

// Configuration for large uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5gb',
    },
  },
};
```

#### Status Route
```typescript
// app/api/videos/[jobId]/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    
    // Get job status from database
    const job = await db.query(
      `SELECT * FROM video_jobs WHERE id = $1`,
      [jobId]
    );
    
    if (!job.rows[0]) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }
    
    // Get chunk statuses
    const chunks = await db.query(
      `SELECT * FROM video_chunks_500mb 
       WHERE job_id = $1 
       ORDER BY chunk_index`,
      [jobId]
    );
    
    const jobData = job.rows[0];
    const chunkData = chunks.rows;
    
    // Calculate progress
    const totalChunks = jobData.chunk_count || 0;
    const completeChunks = chunkData.filter(
      c => c.status === 'complete'
    ).length;
    const progress = totalChunks > 0 
      ? (completeChunks / totalChunks) * 100 
      : 0;
    
    return NextResponse.json({
      jobId,
      status: jobData.status,
      progress: Math.round(progress),
      fileName: jobData.original_filename,
      fileSize: jobData.file_size,
      originalFormat: jobData.original_format,
      conversionRequired: jobData.conversion_required,
      chunks: {
        total: totalChunks,
        complete: completeChunks,
        processing: chunkData.filter(c => c.status === 'processing').length,
        failed: chunkData.filter(c => c.status === 'failed').length
      },
      estimatedCompletion: this.estimateCompletion(
        completeChunks,
        totalChunks,
        jobData.created_at
      ),
      createdAt: jobData.created_at,
      completedAt: jobData.completed_at
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    );
  }
}

function estimateCompletion(
  complete: number,
  total: number,
  startTime: Date
): Date | null {
  if (complete === 0 || total === 0) return null;
  
  const elapsed = Date.now() - startTime.getTime();
  const perChunk = elapsed / complete;
  const remaining = (total - complete) * perChunk;
  
  return new Date(Date.now() + remaining);
}
```

---

# Database Design

## PostgreSQL Schema

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions table (no auth required)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  settings JSONB DEFAULT '{}',
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
  total_videos INTEGER DEFAULT 0,
  total_storage_mb INTEGER DEFAULT 0
);

-- Indexes for sessions
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_last_accessed ON sessions(last_accessed);

-- Video jobs table
CREATE TABLE video_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  original_filename VARCHAR(255) NOT NULL,
  original_format VARCHAR(10),
  file_size BIGINT NOT NULL,
  file_size_mb INTEGER GENERATED ALWAYS AS (file_size / 1048576) STORED,
  duration_seconds NUMERIC(10,2),
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'uploading',
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  
  -- Conversion info
  conversion_required BOOLEAN DEFAULT FALSE,
  converted_path VARCHAR(500),
  conversion_time_ms INTEGER,
  
  -- Chunking info
  chunk_count INTEGER,
  chunk_size_mb INTEGER DEFAULT 500,
  chunking_time_ms INTEGER,
  
  -- Storage paths
  original_storage_path VARCHAR(500),
  cloud_storage_key VARCHAR(500),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes for video_jobs
CREATE INDEX idx_jobs_session ON video_jobs(session_id);
CREATE INDEX idx_jobs_status ON video_jobs(status);
CREATE INDEX idx_jobs_created ON video_jobs(created_at DESC);

-- Video chunks table
CREATE TABLE video_chunks_500mb (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES video_jobs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  
  -- Size and duration
  chunk_size_bytes BIGINT,
  chunk_size_mb INTEGER GENERATED ALWAYS AS (chunk_size_bytes / 1048576) STORED,
  duration_seconds NUMERIC(10,2),
  
  -- Timecodes
  start_time NUMERIC(10,2),
  end_time NUMERIC(10,2),
  start_timecode VARCHAR(20),
  end_timecode VARCHAR(20),
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  
  -- Storage
  storage_path VARCHAR(500),
  cloud_storage_key VARCHAR(500),
  
  -- Gemini processing
  gemini_file_uri VARCHAR(500),
  gemini_upload_status VARCHAR(50),
  analysis_result JSONB,
  segments_found INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  processing_time_ms INTEGER,
  
  -- Constraints
  CONSTRAINT chunk_size_limit CHECK (chunk_size_bytes <= 524288000),
  UNIQUE(job_id, chunk_index)
);

-- Indexes for chunks
CREATE INDEX idx_chunks_job ON video_chunks_500mb(job_id);
CREATE INDEX idx_chunks_status ON video_chunks_500mb(status);
CREATE INDEX idx_chunks_job_index ON video_chunks_500mb(job_id, chunk_index);

-- Analysis results table
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES video_jobs(id) ON DELETE CASCADE,
  
  -- Aggregated segments
  segments JSONB NOT NULL,
  segment_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(segments)) STORED,
  
  -- Summary statistics
  original_duration NUMERIC(10,2),
  final_duration NUMERIC(10,2),
  time_removed NUMERIC(10,2),
  
  -- Processing metadata
  total_chunks_processed INTEGER,
  successful_chunks INTEGER,
  failed_chunks INTEGER,
  boundary_issues_resolved INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  
  -- Quality metrics
  average_confidence NUMERIC(3,2),
  high_confidence_cuts INTEGER,
  low_confidence_cuts INTEGER
);

-- Indexes for results
CREATE INDEX idx_results_job ON analysis_results(job_id);
CREATE INDEX idx_results_created ON analysis_results(created_at DESC);

-- Processing logs table
CREATE TABLE processing_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES video_jobs(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES video_chunks_500mb(id) ON DELETE CASCADE,
  
  level VARCHAR(20), -- 'info', 'warning', 'error'
  message TEXT,
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for logs
CREATE INDEX idx_logs_job ON processing_logs(job_id);
CREATE INDEX idx_logs_level ON processing_logs(level);
CREATE INDEX idx_logs_created ON processing_logs(created_at DESC);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() 
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to update job progress
CREATE OR REPLACE FUNCTION update_job_progress(
  p_job_id UUID
) RETURNS void AS $$
DECLARE
  v_total_chunks INTEGER;
  v_complete_chunks INTEGER;
  v_progress INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_chunks 
  FROM video_chunks_500mb 
  WHERE job_id = p_job_id;
  
  SELECT COUNT(*) INTO v_complete_chunks 
  FROM video_chunks_500mb 
  WHERE job_id = p_job_id AND status = 'complete';
  
  IF v_total_chunks > 0 THEN
    v_progress := (v_complete_chunks * 100) / v_total_chunks;
    
    UPDATE video_jobs 
    SET progress = v_progress,
        status = CASE 
          WHEN v_progress = 100 THEN 'aggregating'
          WHEN v_progress > 0 THEN 'processing'
          ELSE status
        END
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update progress when chunk status changes
CREATE OR REPLACE FUNCTION trigger_update_progress() 
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_job_progress(NEW.job_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chunk_status_change
AFTER UPDATE OF status ON video_chunks_500mb
FOR EACH ROW
EXECUTE FUNCTION trigger_update_progress();
```

---

# Frontend Implementation

## React Components

### Main Upload Component
```tsx
// components/CloudVideoUploader.tsx
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  FileVideo, 
  AlertCircle, 
  CheckCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';

interface UploadState {
  file: File | null;
  status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number;
  jobId?: string;
  error?: string;
  needsConversion: boolean;
  estimatedChunks: number;
}

export const CloudVideoUploader: React.FC = () => {
  const [state, setState] = useState<UploadState>({
    file: null,
    status: 'idle',
    progress: 0,
    needsConversion: false,
    estimatedChunks: 0
  });
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    
    if (!file) return;
    
    // Validate file size (5GB max)
    if (file.size > 5 * 1024 * 1024 * 1024) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'File size exceeds 5GB limit'
      }));
      return;
    }
    
    // Check if conversion needed
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const needsConversion = !['mp4', 'm4v'].includes(extension);
    
    // Estimate chunks
    const estimatedChunks = Math.ceil(file.size / (500 * 1024 * 1024));
    
    setState({
      file,
      status: 'idle',
      progress: 0,
      needsConversion,
      estimatedChunks,
      error: undefined
    });
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024 * 1024 // 5GB
  });
  
  const handleUpload = async () => {
    if (!state.file) return;
    
    setState(prev => ({ ...prev, status: 'uploading', progress: 0 }));
    
    try {
      // Get or create session
      const sessionId = localStorage.getItem('sessionId') || await createSession();
      
      // Upload file with progress tracking
      const formData = new FormData();
      formData.append('file', state.file);
      
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setState(prev => ({ ...prev, progress }));
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setState(prev => ({
            ...prev,
            status: 'processing',
            jobId: response.jobId,
            progress: 0
          }));
          
          // Start polling for status
          startStatusPolling(response.jobId);
        } else {
          throw new Error('Upload failed');
        }
      });
      
      xhr.addEventListener('error', () => {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: 'Upload failed'
        }));
      });
      
      xhr.open('POST', '/api/videos/upload');
      xhr.setRequestHeader('X-Session-Id', sessionId);
      xhr.send(formData);
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error.message
      }));
    }
  };
  
  const startStatusPolling = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/videos/${jobId}/status`);
        const data = await response.json();
        
        setState(prev => ({
          ...prev,
          progress: data.progress
        }));
        
        if (data.status === 'complete') {
          clearInterval(interval);
          setState(prev => ({
            ...prev,
            status: 'complete',
            progress: 100
          }));
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setState(prev => ({
            ...prev,
            status: 'error',
            error: data.error || 'Processing failed'
          }));
        }
      } catch (error) {
        console.error('Status polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  };
  
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileVideo className="h-5 w-5" />
          Cloud Video Processing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dropzone */}
        {state.status === 'idle' && (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200
              ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
              hover:border-blue-400 hover:bg-gray-50
            `}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            {isDragActive ? (
              <p className="text-blue-600">Drop your video here...</p>
            ) : (
              <div>
                <p className="text-gray-600 mb-2">
                  Drag & drop a video here, or click to select
                </p>
                <p className="text-sm text-gray-500">
                  Maximum file size: 5GB
                </p>
                <p className="text-sm text-gray-500">
                  Supported: MP4, MOV, AVI, MKV, WEBM
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* File info */}
        {state.file && state.status === 'idle' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileVideo className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="font-medium">{state.file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(state.file.size / (1024 * 1024 * 1024)).toFixed(2)} GB
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {state.needsConversion && (
                  <Badge variant="secondary">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Needs Conversion
                  </Badge>
                )}
                <Badge variant="outline">
                  ~{state.estimatedChunks} chunks
                </Badge>
              </div>
            </div>
            
            {state.needsConversion && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This file will be converted to MP4 format before processing.
                  This may add a few minutes to the total processing time.
                </AlertDescription>
              </Alert>
            )}
            
            <Button onClick={handleUpload} className="w-full">
              Start Processing
            </Button>
          </div>
        )}
        
        {/* Upload progress */}
        {state.status === 'uploading' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Uploading...</span>
              <span className="text-sm text-gray-500">{state.progress}%</span>
            </div>
            <Progress value={state.progress} className="h-2" />
            <p className="text-sm text-gray-500">
              Please don't close this window during upload
            </p>
          </div>
        )}
        
        {/* Processing status */}
        {state.status === 'processing' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span className="font-medium">Processing video...</span>
            </div>
            <Progress value={state.progress} className="h-2" />
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your video is being processed in the cloud. You can safely close
                this window and return later to view results.
                <br />
                <br />
                Processing URL:{' '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                  {window.location.origin}/results/{state.jobId}
                </code>
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        {/* Complete */}
        {state.status === 'complete' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Processing complete!</span>
            </div>
            <Button
              onClick={() => window.location.href = `/results/${state.jobId}`}
              className="w-full"
            >
              View Results
            </Button>
          </div>
        )}
        
        {/* Error */}
        {state.status === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
```

### Chunk Progress Visualization
```tsx
// components/ChunkProgress.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  Loader2, 
  XCircle, 
  Clock,
  Film
} from 'lucide-react';

interface ChunkStatus {
  index: number;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  duration: number;
  size: number;
  progress?: number;
  error?: string;
  segmentsFound?: number;
}

interface ChunkProgressProps {
  chunks: ChunkStatus[];
  totalDuration: number;
}

export const ChunkProgress: React.FC<ChunkProgressProps> = ({
  chunks,
  totalDuration
}) => {
  const getStatusIcon = (status: ChunkStatus['status']) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };
  
  const getStatusColor = (status: ChunkStatus['status']) => {
    switch (status) {
      case 'complete': return 'bg-green-50 border-green-200';
      case 'processing': return 'bg-blue-50 border-blue-200 animate-pulse';
      case 'failed': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };
  
  const completeChunks = chunks.filter(c => c.status === 'complete').length;
  const overallProgress = (completeChunks / chunks.length) * 100;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            Chunk Processing Status
          </span>
          <Badge variant="outline">
            {completeChunks} / {chunks.length} Complete
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span className="font-medium">{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
        
        {/* Chunk grid */}
        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
          {chunks.map((chunk) => (
            <div
              key={chunk.index}
              className={`
                relative p-3 rounded-lg border-2 transition-all
                ${getStatusColor(chunk.status)}
              `}
            >
              <div className="text-center space-y-1">
                <div className="font-bold text-lg">
                  {chunk.index + 1}
                </div>
                <div className="text-xs text-gray-600">
                  {Math.round(chunk.duration)}s
                </div>
                <div className="text-xs text-gray-500">
                  {(chunk.size / 1024 / 1024).toFixed(0)}MB
                </div>
                {chunk.segmentsFound !== undefined && (
                  <div className="text-xs font-medium text-blue-600">
                    {chunk.segmentsFound} cuts
                  </div>
                )}
              </div>
              <div className="absolute top-1 right-1">
                {getStatusIcon(chunk.status)}
              </div>
              {chunk.status === 'processing' && chunk.progress && (
                <div className="absolute bottom-0 left-0 right-0">
                  <div 
                    className="h-1 bg-blue-600 rounded-b-md transition-all"
                    style={{ width: `${chunk.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        
        {/* Status summary */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">
              {chunks.filter(c => c.status === 'pending').length}
            </div>
            <div className="text-xs text-gray-500">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {chunks.filter(c => c.status === 'processing').length}
            </div>
            <div className="text-xs text-gray-500">Processing</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {chunks.filter(c => c.status === 'complete').length}
            </div>
            <div className="text-xs text-gray-500">Complete</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {chunks.filter(c => c.status === 'failed').length}
            </div>
            <div className="text-xs text-gray-500">Failed</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
```

---

# Testing Strategy

## Unit Tests

```typescript
// tests/chunking.test.ts
import { VideoChunker } from '@/lib/services/video-chunker';

describe('VideoChunker', () => {
  const chunker = new VideoChunker();
  
  test('should create correct number of chunks for 5GB file', async () => {
    const mockMetadata = {
      size: 5 * 1024 * 1024 * 1024, // 5GB
      duration: 3600, // 1 hour
      bitrate: 11650844 // ~11.6 Mbps
    };
    
    const plan = await chunker.createChunkPlan(mockMetadata);
    
    expect(plan.chunks.length).toBeGreaterThanOrEqual(10);
    expect(plan.chunks.length).toBeLessThanOrEqual(12);
    
    // Each chunk should be under 500MB
    plan.chunks.forEach(chunk => {
      expect(chunk.estimatedSize).toBeLessThanOrEqual(500 * 1024 * 1024);
    });
  });
  
  test('should handle videos smaller than chunk size', async () => {
    const mockMetadata = {
      size: 100 * 1024 * 1024, // 100MB
      duration: 300, // 5 minutes
      bitrate: 2796202 // ~2.8 Mbps
    };
    
    const plan = await chunker.createChunkPlan(mockMetadata);
    
    expect(plan.chunks.length).toBe(1);
    expect(plan.chunks[0].duration).toBe(300);
  });
});
```

## Integration Tests

```typescript
// tests/integration/processing.test.ts
import { VideoProcessor } from '@/lib/services/video-processor';

describe('Video Processing Pipeline', () => {
  test('should process MOV file end-to-end', async () => {
    const processor = new VideoProcessor();
    const testFile = new File(
      [await fs.readFile('test-videos/sample.mov')],
      'sample.mov'
    );
    
    const job = await processor.processVideo(testFile, 'test-session');
    
    expect(job.status).toBe('complete');
    expect(job.conversionRequired).toBe(true);
    expect(job.chunkCount).toBeGreaterThan(0);
    expect(job.results).toBeDefined();
    expect(job.results.segmentsToRemove.length).toBeGreaterThan(0);
  }, 120000); // 2 minute timeout
});
```

---

# Troubleshooting Guide

## Common Issues & Solutions

### Issue: FFmpeg "width not divisible by 2" error
```bash
# Solution: Add padding filter
ffmpeg -i input.mp4 -vf "scale=w:h,pad=ceil(iw/2)*2:ceil(ih/2)*2" output.mp4
```

### Issue: Gemini API timeout on chunk processing
```typescript
// Solution: Implement retry with smaller chunk
if (error.message.includes('timeout')) {
  // Split chunk in half and retry
  const halfChunks = await splitChunkInHalf(failedChunk);
  for (const half of halfChunks) {
    await processChunkWithRetry(half);
  }
}
```

### Issue: Upload fails for large files
```typescript
// Solution: Implement resumable upload
class ResumableUpload {
  async upload(file: File, chunkSize = 10 * 1024 * 1024) {
    const chunks = Math.ceil(file.size / chunkSize);
    
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      
      await this.uploadChunk(chunk, i, chunks);
    }
  }
}
```

### Issue: Memory issues with multiple parallel chunks
```typescript
// Solution: Limit parallel processing
const MAX_PARALLEL = Math.min(
  5,
  Math.floor(availableMemory / 500) // 500MB per chunk
);
```

---

# Monitoring & Logging

## Monitoring Setup

```typescript
// lib/monitoring/metrics.ts
import { StatsD } from 'node-statsd';

const metrics = new StatsD({
  host: 'localhost',
  port: 8125,
  prefix: 'video_processor.'
});

export const trackMetric = (name: string, value: number) => {
  metrics.gauge(name, value);
};

export const trackTiming = (name: string, duration: number) => {
  metrics.timing(name, duration);
};

export const incrementCounter = (name: string) => {
  metrics.increment(name);
};

// Usage
trackTiming('chunk.processing.duration', processingTime);
incrementCounter('api.gemini.calls');
trackMetric('queue.length', queueLength);
```

## Logging Configuration

```typescript
// lib/logging/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: '/var/log/video-processor/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: '/var/log/video-processor/combined.log' 
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

---

# Security Implementation

## Security Measures

```typescript
// lib/security/validation.ts
import sanitize from 'sanitize-filename';
import { createHash } from 'crypto';

export const sanitizeFilename = (filename: string): string => {
  return sanitize(filename).substring(0, 255);
};

export const generateSessionId = (): string => {
  return createHash('sha256')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex');
};

export const validateSession = async (sessionId: string): Promise<boolean> => {
  const session = await db.query(
    'SELECT * FROM sessions WHERE id = $1 AND expires_at > NOW()',
    [sessionId]
  );
  return session.rows.length > 0;
};

// Rate limiting
import rateLimit from 'express-rate-limit';

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  message: 'Too many uploads, please try again later'
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100 // 100 requests per minute
});
```

---

# Cost Analysis

## Detailed Cost Breakdown

```yaml
Infrastructure Costs (Monthly):
  Digital Ocean Droplet:
    - 8 vCPU, 16GB RAM: $96
    - Additional storage (500GB): $50
  
  Digital Ocean Spaces:
    - Storage (1TB): $20
    - Transfer (first 10TB): $0
    - Additional transfer: $0.02/GB
  
  PostgreSQL (Managed):
    - Basic cluster: $15
  
  Total Infrastructure: $181/month

API Costs (Per Video):
  5GB Video Processing:
    - Duration: ~60 minutes
    - Chunks: 10-12 (500MB each)
    - Gemini cost per chunk: ~$0.20
    - Total Gemini cost: $2.00-2.40
  
  Processing Time:
    - Conversion: 3-5 minutes
    - Chunking: 2-3 minutes
    - Parallel processing: 10-15 minutes
    - Total: ~20 minutes

Monthly Projections:
  10 videos/day (300/month):
    - Infrastructure: $181
    - Gemini API: $720
    - Total: $901/month
    - Cost per video: $3.00
  
  50 videos/day (1500/month):
    - Infrastructure: $181
    - Gemini API: $3,600
    - Total: $3,781/month
    - Cost per video: $2.52
  
  100 videos/day (3000/month):
    - Infrastructure: $362 (scaled)
    - Gemini API: $7,200
    - Total: $7,562/month
    - Cost per video: $2.52
```

---

# Migration Path

## From Current App to Cloud System

### Phase 1: Parallel Deployment
```typescript
// Add feature flag
const USE_CLOUD_PROCESSING = process.env.ENABLE_CLOUD === 'true';

if (USE_CLOUD_PROCESSING && file.size > 2 * 1024 * 1024 * 1024) {
  // Use cloud processing for files > 2GB
  return processInCloud(file);
} else {
  // Use existing local processing
  return processLocally(file);
}
```

### Phase 2: Gradual Migration
- Week 1: Enable for files > 2GB
- Week 2: Enable for all files > 500MB
- Week 3: Enable for all users with toggle
- Week 4: Make cloud default, local optional

### Phase 3: Complete Migration
- Move all processing to cloud
- Remove local processing code
- Optimize cloud infrastructure

---

# Appendix: Complete Environment Variables

```bash
# .env.production
# Database
DATABASE_URL=postgresql://user:pass@db.digitalocean.com:5432/videodb
REDIS_URL=redis://default:pass@redis.digitalocean.com:6379

# Storage
DO_SPACES_KEY=DO00KEY123456789
DO_SPACES_SECRET=secretkey123456789abcdef
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_BUCKET=video-storage

# APIs
GEMINI_API_KEY=AIzaSy...
OPENROUTER_API_KEY=sk-or-v1-...

# App Config
SESSION_SECRET=randomsecretkey123456
MAX_FILE_SIZE=5368709120
MAX_CHUNK_SIZE=524288000
PARALLEL_CHUNKS=5

# Monitoring
DATADOG_API_KEY=dd123456789
SENTRY_DSN=https://key@sentry.io/project

# Feature Flags
ENABLE_CLOUD_PROCESSING=true
ENABLE_FORMAT_CONVERSION=true
ENABLE_PARALLEL_PROCESSING=true
```

---

# Conclusion

This comprehensive PRD provides everything needed to implement the cloud-based video processing system with 500MB chunking. The system will handle videos up to 5GB, automatically convert formats, process in parallel, and provide a seamless user experience without requiring authentication.

**Key Deliverables:**
1. Cloud infrastructure on Digital Ocean
2. 500MB chunking algorithm
3. Format conversion pipeline
4. Parallel Gemini processing
5. Result aggregation system
6. Session-based access (no login)
7. Real-time progress tracking
8. Shareable result links

**Timeline:** 3-4 weeks for complete implementation

**Budget:** ~$200-500/month depending on usage

---

*Document Version: 3.0 - COMPLETE*  
*Last Updated: January 2025*  
*Status: Ready for Implementation*  
*Total Length: ~1500 lines of implementation details*