/**
 * Production-ready Job Queue Service
 * Handles video processing jobs with database storage and retry logic
 */

import { createClient } from '@supabase/supabase-js';

// Job-related types
export type JobStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'retrying';
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ProcessingStage = 'upload' | 'split_chunks' | 'store_chunks' | 'queue_analysis' | 'gemini_processing' | 'assemble_timeline' | 'render_video';

export interface ProcessingJob {
  id: string;
  user_id?: string;
  title: string;
  description?: string;
  status: JobStatus;
  priority: JobPriority;
  current_stage: ProcessingStage;
  progress_percentage: number;
  stage_progress: Record<string, any>;
  processing_options: Record<string, any>;
  metadata: Record<string, any>;
  retry_count: number;
  max_retries: number;
  last_error?: string;
  scheduled_at: string;
  started_at?: string;
  completed_at?: string;
  result_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface VideoChunk {
  id: string;
  job_id: string;
  chunk_index: number;
  chunk_name: string;
  storage_path: string;
  storage_url?: string;
  start_time: number;
  end_time: number;
  duration: number;
  file_size: number;
  uploaded: boolean;
  processed: boolean;
  analysis_result?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface QueueItem {
  id: string;
  job_id: string;
  stage: ProcessingStage;
  priority: JobPriority;
  worker_id?: string;
  claimed_at?: string;
  claim_expires_at?: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  payload: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface JobLog {
  id: string;
  job_id: string;
  level: 'info' | 'warn' | 'error';
  stage: ProcessingStage;
  message: string;
  details?: Record<string, any>;
  worker_id?: string;
  created_at: string;
}

export interface CreateJobOptions {
  title: string;
  description?: string;
  user_id?: string;
  priority?: JobPriority;
  processing_options?: Record<string, any>;
  metadata?: Record<string, any>;
  max_retries?: number;
}

export interface ClaimedJob {
  queue_id: string;
  job_id: string;
  payload: Record<string, any>;
}

export class JobQueueService {
  private supabase;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase = createClient(
      supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey || serviceKey!
    );
  }

  /**
   * Create a new processing job
   */
  async createJob(options: CreateJobOptions): Promise<ProcessingJob> {
    const jobData: any = {
      title: options.title,
      description: options.description,
      priority: options.priority || 'normal',
      processing_options: options.processing_options || {},
      metadata: options.metadata || {},
      max_retries: options.max_retries || 3,
      status: 'pending' as JobStatus,
      current_stage: 'upload' as ProcessingStage,
      progress_percentage: 0,
      stage_progress: {},
      retry_count: 0,
      scheduled_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Only add user_id if it's provided and valid
    if (options.user_id) {
      jobData.user_id = options.user_id;
    }

    const { data, error } = await this.supabase
      .from('processing_jobs')
      .insert([jobData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create job: ${error.message}`);
    }

    return data as ProcessingJob;
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<ProcessingJob | null> {
    const { data, error } = await this.supabase
      .from('processing_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Job not found
      }
      throw new Error(`Failed to get job: ${error.message}`);
    }

    return data as ProcessingJob;
  }

  /**
   * Update job status and progress
   */
  async updateJob(
    jobId: string, 
    updates: Partial<Pick<ProcessingJob, 'status' | 'current_stage' | 'progress_percentage' | 'stage_progress' | 'result_data' | 'last_error'>>
  ): Promise<ProcessingJob> {
    const updateData: any = { ...updates };
    
    if (updates.status === 'processing' && !updateData.started_at) {
      updateData.started_at = new Date().toISOString();
    }
    
    if (updates.status === 'completed' || updates.status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('processing_jobs')
      .update(updateData)
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update job: ${error.message}`);
    }

    return data as ProcessingJob;
  }

  /**
   * Add video chunks to a job
   */
  async addVideoChunks(jobId: string, chunks: Omit<VideoChunk, 'id' | 'job_id' | 'created_at' | 'updated_at'>[]): Promise<VideoChunk[]> {
    const chunkData = chunks.map(chunk => ({
      ...chunk,
      job_id: jobId,
    }));

    const { data, error } = await this.supabase
      .from('video_chunks')
      .insert(chunkData)
      .select();

    if (error) {
      throw new Error(`Failed to add video chunks: ${error.message}`);
    }

    return data as VideoChunk[];
  }

  /**
   * Get video chunks for a job
   */
  async getVideoChunks(jobId: string): Promise<VideoChunk[]> {
    const { data, error } = await this.supabase
      .from('video_chunks')
      .select('*')
      .eq('job_id', jobId)
      .order('chunk_index');

    if (error) {
      throw new Error(`Failed to get video chunks: ${error.message}`);
    }

    return data as VideoChunk[];
  }

  /**
   * Update video chunk
   */
  async updateVideoChunk(chunkId: string, updates: Partial<VideoChunk>): Promise<VideoChunk> {
    const { data, error } = await this.supabase
      .from('video_chunks')
      .update(updates)
      .eq('id', chunkId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update video chunk: ${error.message}`);
    }

    return data as VideoChunk;
  }

  /**
   * Add job to queue for processing
   */
  async enqueueJob(jobId: string, stage: ProcessingStage, payload: Record<string, any> = {}, priority: JobPriority = 'normal'): Promise<void> {
    const queueData = {
      job_id: jobId,
      stage,
      priority,
      payload,
      max_attempts: 3,
    };

    const { error } = await this.supabase
      .from('job_queue')
      .insert([queueData]);

    if (error) {
      throw new Error(`Failed to enqueue job: ${error.message}`);
    }

    // Update job status
    await this.updateJob(jobId, { status: 'queued', current_stage: stage });
  }

  /**
   * Claim next job from queue (for workers)
   */
  async claimNextJob(stage: ProcessingStage, workerId: string): Promise<ClaimedJob | null> {
    const { data, error } = await this.supabase
      .rpc('claim_next_job', {
        target_stage: stage,
        worker_id_param: workerId,
        claim_duration_minutes: 30
      });

    if (error) {
      throw new Error(`Failed to claim job: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const claimed = data[0];
    return {
      queue_id: claimed.queue_id,
      job_id: claimed.job_id,
      payload: claimed.payload
    };
  }

  /**
   * Release job claim (if worker can't process it)
   */
  async releaseJobClaim(queueId: string): Promise<void> {
    const { error } = await this.supabase
      .rpc('release_job_claim', {
        queue_id_param: queueId
      });

    if (error) {
      throw new Error(`Failed to release job claim: ${error.message}`);
    }
  }

  /**
   * Complete job stage
   */
  async completeJobStage(queueId: string, resultData?: Record<string, any>): Promise<void> {
    const { error } = await this.supabase
      .rpc('complete_job_stage', {
        queue_id_param: queueId,
        result_data_param: resultData || null
      });

    if (error) {
      throw new Error(`Failed to complete job stage: ${error.message}`);
    }
  }

  /**
   * Fail job stage with retry logic
   */
  async failJobStage(queueId: string, errorMessage: string, retryDelayMinutes: number = 5): Promise<void> {
    const { error } = await this.supabase
      .rpc('fail_job_stage', {
        queue_id_param: queueId,
        error_message: errorMessage,
        retry_delay_minutes: retryDelayMinutes
      });

    if (error) {
      throw new Error(`Failed to fail job stage: ${error.message}`);
    }
  }

  /**
   * Add log entry
   */
  async addLog(jobId: string, level: 'info' | 'warn' | 'error', stage: ProcessingStage, message: string, details?: Record<string, any>, workerId?: string): Promise<void> {
    const logData = {
      job_id: jobId,
      level,
      stage,
      message,
      details,
      worker_id: workerId,
    };

    const { error } = await this.supabase
      .from('job_logs')
      .insert([logData]);

    if (error) {
      throw new Error(`Failed to add log: ${error.message}`);
    }
  }

  /**
   * Get job logs
   */
  async getJobLogs(jobId: string, limit: number = 100): Promise<JobLog[]> {
    const { data, error } = await this.supabase
      .from('job_logs')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get job logs: ${error.message}`);
    }

    return data as JobLog[];
  }

  /**
   * Get jobs for a user
   */
  async getUserJobs(userId?: string, limit: number = 50): Promise<ProcessingJob[]> {
    let query = this.supabase
      .from('processing_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.is('user_id', null);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get user jobs: ${error.message}`);
    }

    return data as ProcessingJob[];
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<void> {
    // Remove from queue if queued
    await this.supabase
      .from('job_queue')
      .delete()
      .eq('job_id', jobId);

    // Update job status
    await this.updateJob(jobId, { 
      status: 'cancelled',
      completed_at: new Date().toISOString()
    });
  }

  /**
   * Clean up old completed/failed jobs
   */
  async cleanupOldJobs(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
    
    const { data, error } = await this.supabase
      .from('processing_jobs')
      .delete()
      .in('status', ['completed', 'failed', 'cancelled'])
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      throw new Error(`Failed to cleanup old jobs: ${error.message}`);
    }

    return data ? data.length : 0;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    total: number;
    by_stage: Record<ProcessingStage, number>;
    by_priority: Record<JobPriority, number>;
    processing: number;
    pending_retry: number;
  }> {
    const { data, error } = await this.supabase
      .from('job_queue')
      .select('stage, priority, worker_id, next_attempt_at');

    if (error) {
      throw new Error(`Failed to get queue stats: ${error.message}`);
    }

    const stats = {
      total: data.length,
      by_stage: {} as Record<ProcessingStage, number>,
      by_priority: {} as Record<JobPriority, number>,
      processing: 0,
      pending_retry: 0,
    };

    // Initialize counters
    const stages: ProcessingStage[] = ['upload', 'split_chunks', 'store_chunks', 'queue_analysis', 'gemini_processing', 'assemble_timeline', 'render_video'];
    const priorities: JobPriority[] = ['low', 'normal', 'high', 'urgent'];
    
    stages.forEach(stage => stats.by_stage[stage] = 0);
    priorities.forEach(priority => stats.by_priority[priority] = 0);

    data.forEach((item: any) => {
      stats.by_stage[item.stage as ProcessingStage]++;
      stats.by_priority[item.priority as JobPriority]++;
      
      if (item.worker_id) {
        stats.processing++;
      }
      
      if (!item.worker_id && new Date(item.next_attempt_at) > new Date()) {
        stats.pending_retry++;
      }
    });

    return stats;
  }

  /**
   * Subscribe to job status changes (for real-time updates)
   */
  subscribeToJob(jobId: string, callback: (job: ProcessingJob) => void) {
    return this.supabase
      .channel(`job-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'processing_jobs',
        filter: `id=eq.${jobId}`,
      }, (payload) => {
        callback(payload.new as ProcessingJob);
      })
      .subscribe();
  }

  /**
   * Subscribe to job logs (for real-time updates)
   */
  subscribeToJobLogs(jobId: string, callback: (log: JobLog) => void) {
    return this.supabase
      .channel(`job-logs-${jobId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'job_logs',
        filter: `job_id=eq.${jobId}`,
      }, (payload) => {
        callback(payload.new as JobLog);
      })
      .subscribe();
  }
}

// Singleton instance
let jobQueueInstance: JobQueueService | null = null;

export function getJobQueueService(): JobQueueService {
  if (!jobQueueInstance) {
    jobQueueInstance = new JobQueueService();
  }
  return jobQueueInstance;
}

export default JobQueueService;