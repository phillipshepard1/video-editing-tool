# Production-Ready Video Processing Queue System

This document describes the new production-ready queue-based architecture for video processing that replaces the previous synchronous approach.

## Architecture Overview

The new system implements a complete queue-based workflow:
1. **Upload** → 2. **Split & Store** → 3. **Queue Process** → 4. **Gemini Analysis** → 5. **Assemble Timeline** → 6. **Render**

### Key Components

#### 1. Database Schema (`supabase/job-queue-schema.sql`)
- **processing_jobs**: Main job tracking with status and progress
- **video_chunks**: Storage-first approach for video chunks
- **job_queue**: Background job queue with worker assignment
- **job_logs**: Comprehensive logging for debugging and monitoring

#### 2. Job Queue Service (`lib/services/job-queue.ts`)
- Complete job lifecycle management
- Real-time status updates via Supabase subscriptions
- Retry logic with exponential backoff
- Comprehensive logging and error handling

#### 3. Storage Manager (`lib/services/storage-manager.ts`)
- Chunked video uploads with progress tracking
- Resumable uploads for large files
- Signed URL management for secure access
- Automatic cleanup of expired chunks

#### 4. Background Workers
- **Base Worker** (`lib/workers/base-worker.ts`): Foundation for all workers
- **Upload Worker** (`lib/workers/upload-worker.ts`): Handles video processing
- **Storage Worker** (`lib/workers/storage-worker.ts`): Manages chunk storage
- **Analysis Worker** (`lib/workers/analysis-worker.ts`): Gemini AI processing

#### 5. Worker Manager (`lib/workers/worker-manager.ts`)
- Orchestrates all background workers
- Health monitoring and statistics
- Dynamic worker scaling
- Graceful shutdown handling

## Key Features

### 🔄 Reliable Processing
- Jobs are persisted in database before processing
- Automatic retry with exponential backoff
- Dead letter queue for failed jobs
- Comprehensive error tracking

### 📊 Real-time Updates
- Live progress tracking via Supabase subscriptions
- WebSocket-based status updates
- Real-time worker health monitoring
- Sound notifications for job completion

### 🚀 Scalable Architecture
- Multiple workers per processing stage
- Concurrent job processing
- Database-backed queue with ACID properties
- Horizontal scaling ready

### 💾 Storage-First Approach
- All video chunks stored in Supabase
- Resumable uploads for large files
- Signed URLs for secure access
- Automatic cleanup of old data

### 🔧 Production Ready
- Comprehensive error handling
- Structured logging with correlation IDs
- Health checks and monitoring
- Graceful shutdown procedures

## API Endpoints

### Job Management
- `POST /api/jobs` - Create new job
- `GET /api/jobs` - List jobs
- `GET /api/jobs/{jobId}` - Get job details
- `PATCH /api/jobs/{jobId}` - Update job
- `DELETE /api/jobs/{jobId}` - Cancel job

### Job Monitoring
- `GET /api/jobs/{jobId}/logs` - Get job logs
- `GET /api/jobs/{jobId}/chunks` - Get video chunks
- `POST /api/jobs/{jobId}/chunks/refresh` - Refresh chunk URLs

### System Management
- `GET /api/queue/stats` - Queue statistics
- `GET /api/workers` - Worker status
- `POST /api/workers` - Worker management

### Upload Endpoint
- `POST /api/upload/queue` - Queue-based video upload

## Frontend Components

### JobVideoUploader (`components/job-video-uploader.tsx`)
- Drag-and-drop file upload
- Progress tracking
- Job creation with options
- Error handling

### JobStatusTracker (`components/job-status-tracker.tsx`)
- Real-time job status display
- Progress visualization
- Log viewing
- Job management actions

### RealtimeJobTracker (`components/realtime-job-tracker.tsx`)
- Live job list with Supabase subscriptions
- Sound notifications
- Bulk operations
- Queue statistics

## Database Migration

1. Run the queue system schema:
```sql
-- Execute supabase/job-queue-schema.sql
```

2. Update your environment variables:
```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

## Worker Configuration

Default worker configuration in production:
- **Upload Workers**: 3 (concurrent file processing)
- **Storage Workers**: 4 (high-throughput chunk storage)
- **Analysis Workers**: 3 (limited by Gemini API quotas)
- **Queue Workers**: 2 (simple job passing)

## Usage Examples

### Basic Job Creation
```typescript
import { getJobQueueService } from '@/lib/services/job-queue';

const jobQueue = getJobQueueService();
const job = await jobQueue.createJob({
  title: 'My Video Analysis',
  user_id: 'user-123',
  priority: 'high',
  processing_options: {
    quality: 'high',
    chunkSize: 50 * 1024 * 1024, // 50MB
  }
});

await jobQueue.enqueueJob(job.id, 'upload', {
  videoFile: { /* file data */ }
});
```

### Real-time Status Updates
```typescript
// Subscribe to job updates
const subscription = jobQueue.subscribeToJob(jobId, (job) => {
  console.log('Job status:', job.status, job.progress_percentage + '%');
});

// Subscribe to logs
const logSub = jobQueue.subscribeToJobLogs(jobId, (log) => {
  console.log(`[${log.level}] ${log.message}`);
});
```

### Worker Management
```typescript
import { getWorkerManager } from '@/lib/workers/worker-manager';

const workerManager = getWorkerManager();
await workerManager.start();

// Add more workers
await workerManager.addWorker('gemini_processing');

// Check system health
const health = workerManager.getSystemHealth();
console.log(`${health.runningWorkers}/${health.totalWorkers} workers running`);
```

## Monitoring and Debugging

### Job Logs
All processing stages generate detailed logs:
```typescript
const logs = await jobQueue.getJobLogs(jobId);
logs.forEach(log => {
  console.log(`[${log.created_at}] ${log.level}: ${log.message}`);
});
```

### Queue Statistics
```typescript
const stats = await jobQueue.getQueueStats();
console.log('Jobs by stage:', stats.by_stage);
console.log('Jobs by priority:', stats.by_priority);
```

### Worker Health
```typescript
const workers = workerManager.getWorkerStatuses();
workers.forEach(worker => {
  console.log(`${worker.workerId}: ${worker.stats.jobsProcessed} processed`);
});
```

## Error Handling

The system includes comprehensive error handling:

### Job-Level Errors
- Automatic retry with exponential backoff
- Error details stored in job record
- Failed jobs moved to failed state with error message

### Worker-Level Errors
- Individual worker error tracking
- Automatic worker restart on critical errors
- Error statistics and reporting

### System-Level Errors
- Graceful degradation on partial failures
- Health check failures trigger alerts
- Automatic cleanup of stale data

## Performance Considerations

### Database Optimization
- Indexes on frequently queried columns
- Partitioning for large job tables
- Regular cleanup of old jobs and logs

### Memory Management
- Streaming file processing for large videos
- Chunk-based storage to limit memory usage
- Automatic garbage collection of temporary data

### Concurrency
- Worker-level concurrency limits
- Database connection pooling
- Rate limiting for external APIs

## Security

### Access Control
- Row Level Security (RLS) policies
- User-based job isolation
- Service role authentication for workers

### Data Protection
- Encrypted storage for sensitive data
- Signed URLs with expiration
- Audit logging for all operations

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### Load Tests
```bash
npm run test:load
```

## Deployment

### Environment Setup
1. Configure Supabase project with required tables
2. Set up storage buckets with proper policies
3. Configure environment variables
4. Deploy worker processes

### Monitoring
- Set up health check endpoints
- Configure alerting for failed jobs
- Monitor queue depth and processing times

## Migration from Legacy System

1. **Database Migration**: Run queue schema SQL
2. **API Migration**: Update endpoints to use queue system
3. **Frontend Migration**: Replace components with queue-based versions
4. **Worker Deployment**: Start background worker processes
5. **Monitoring**: Set up new monitoring dashboards

## Troubleshooting

### Common Issues

**Jobs Stuck in Queue**
- Check worker health status
- Verify database connectivity
- Review worker logs for errors

**Upload Failures**
- Check storage bucket policies
- Verify file size limits
- Review network connectivity

**Processing Failures**
- Check Gemini API quotas
- Verify API credentials
- Review error logs for details

### Debug Commands
```typescript
// Check system status
const status = await getQueueSystemStatus();

// Review recent errors
const errors = await jobQueue.getJobLogs(jobId, 50)
  .then(logs => logs.filter(log => log.level === 'error'));

// Worker diagnostics
const health = workerManager.getSystemHealth();
```

## Future Enhancements

### Planned Features
- Timeline assembly workers
- Video rendering workers  
- Advanced retry strategies
- Job prioritization algorithms
- Enhanced monitoring dashboard

### Scaling Considerations
- Multi-region deployment
- External job queue (Redis/RabbitMQ)
- Kubernetes orchestration
- Auto-scaling based on queue depth

This production-ready queue system provides a solid foundation for reliable, scalable video processing with comprehensive monitoring and error handling capabilities.