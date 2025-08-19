-- Video Processing Job Queue Schema
-- Production-ready queue-based architecture for video processing

-- Create ENUM types for better type safety
CREATE TYPE job_status AS ENUM (
  'pending',
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'retrying'
);

CREATE TYPE job_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

CREATE TYPE processing_stage AS ENUM (
  'upload',
  'split_chunks',
  'store_chunks',
  'queue_analysis',
  'gemini_processing',
  'assemble_timeline',
  'render_video'
);

-- Main jobs table for tracking video processing jobs
CREATE TABLE processing_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID, -- For authenticated users, null for anonymous
  title TEXT NOT NULL,
  description TEXT,
  
  -- Job management
  status job_status DEFAULT 'pending' NOT NULL,
  priority job_priority DEFAULT 'normal' NOT NULL,
  current_stage processing_stage DEFAULT 'upload' NOT NULL,
  
  -- Progress tracking
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  stage_progress JSONB DEFAULT '{}', -- Progress per stage
  
  -- Job configuration
  processing_options JSONB DEFAULT '{}', -- Quality settings, chunk size, etc.
  metadata JSONB DEFAULT '{}', -- File info, user preferences, etc.
  
  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  
  -- Timing
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Results
  result_data JSONB, -- Analysis results, render URLs, etc.
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video chunks table for storage-first approach
CREATE TABLE video_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE CASCADE,
  
  -- Chunk info
  chunk_index INTEGER NOT NULL,
  chunk_name TEXT NOT NULL,
  
  -- Storage
  storage_path TEXT NOT NULL, -- Supabase storage path
  storage_url TEXT, -- Signed URL for access
  
  -- Chunk details
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  duration FLOAT NOT NULL,
  file_size BIGINT NOT NULL,
  
  -- Processing status
  uploaded BOOLEAN DEFAULT FALSE,
  processed BOOLEAN DEFAULT FALSE,
  analysis_result JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(job_id, chunk_index)
);

-- Job queue for background processing
CREATE TABLE job_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE CASCADE,
  
  -- Queue management
  stage processing_stage NOT NULL,
  priority job_priority DEFAULT 'normal' NOT NULL,
  
  -- Worker assignment
  worker_id TEXT, -- Identifier for the worker processing this
  claimed_at TIMESTAMP WITH TIME ZONE,
  claim_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Retry logic
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Payload
  payload JSONB NOT NULL DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chillin render jobs tracking
CREATE TABLE chillin_render_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE CASCADE,
  
  -- Chillin API details
  chillin_render_id TEXT UNIQUE, -- Render ID from Chillin API
  chillin_status TEXT, -- queued, processing, completed, failed
  
  -- Video details
  source_video_url TEXT NOT NULL, -- Original video URL in Supabase
  output_video_url TEXT, -- Final rendered video URL from Chillin
  
  -- Render configuration
  quality TEXT DEFAULT 'high', -- low, medium, high, ultra, lossless
  resolution_width INTEGER DEFAULT 1920,
  resolution_height INTEGER DEFAULT 1080,
  fps INTEGER DEFAULT 30,
  
  -- Timeline edits
  segments_to_remove JSONB NOT NULL, -- Array of segments to remove
  segments_to_keep JSONB, -- Array of segments to keep
  total_duration_seconds NUMERIC, -- Original duration
  final_duration_seconds NUMERIC, -- After edits
  
  -- Progress tracking
  render_progress INTEGER DEFAULT 0,
  estimated_completion_time TIMESTAMP WITH TIME ZONE,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job logs for debugging and monitoring
CREATE TABLE job_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE CASCADE,
  
  -- Log details
  level TEXT NOT NULL DEFAULT 'info', -- info, warn, error
  stage processing_stage NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  
  -- Context
  worker_id TEXT,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX idx_processing_jobs_created_at ON processing_jobs(created_at DESC);
CREATE INDEX idx_processing_jobs_priority_status ON processing_jobs(priority DESC, status);

CREATE INDEX idx_video_chunks_job_id ON video_chunks(job_id);
CREATE INDEX idx_video_chunks_job_chunk ON video_chunks(job_id, chunk_index);

CREATE INDEX idx_job_queue_stage_priority ON job_queue(stage, priority DESC, next_attempt_at);
CREATE INDEX idx_job_queue_worker ON job_queue(worker_id, claimed_at);
CREATE INDEX idx_job_queue_next_attempt ON job_queue(next_attempt_at) WHERE worker_id IS NULL;

CREATE INDEX idx_chillin_render_jobs_job_id ON chillin_render_jobs(job_id);
CREATE INDEX idx_chillin_render_jobs_render_id ON chillin_render_jobs(chillin_render_id);
CREATE INDEX idx_chillin_render_jobs_status ON chillin_render_jobs(chillin_status);
CREATE INDEX idx_chillin_render_jobs_created ON chillin_render_jobs(created_at DESC);

CREATE INDEX idx_job_logs_job_id ON job_logs(job_id, created_at DESC);
CREATE INDEX idx_job_logs_level ON job_logs(level, created_at DESC);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_chunks_updated_at BEFORE UPDATE ON video_chunks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_queue_updated_at BEFORE UPDATE ON job_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chillin_render_jobs_updated_at BEFORE UPDATE ON chillin_render_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chillin_render_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (adjust based on your auth requirements)
-- Allow users to see their own jobs
CREATE POLICY "Users can view own jobs" ON processing_jobs
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert own jobs" ON processing_jobs
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update own jobs" ON processing_jobs
  FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

-- Video chunks follow job permissions
CREATE POLICY "Users can view chunks for own jobs" ON video_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM processing_jobs 
      WHERE id = video_chunks.job_id 
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

CREATE POLICY "Users can insert chunks for own jobs" ON video_chunks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM processing_jobs 
      WHERE id = video_chunks.job_id 
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

CREATE POLICY "Users can update chunks for own jobs" ON video_chunks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM processing_jobs 
      WHERE id = video_chunks.job_id 
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

-- Service role has full access to queue management
CREATE POLICY "Service role full access to job_queue" ON job_queue
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to job_logs" ON job_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can view logs for their jobs
CREATE POLICY "Users can view logs for own jobs" ON job_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM processing_jobs 
      WHERE id = job_logs.job_id 
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

-- Chillin render jobs policies
CREATE POLICY "Users can view own render jobs" ON chillin_render_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM processing_jobs 
      WHERE id = chillin_render_jobs.job_id 
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

CREATE POLICY "Users can update own render jobs" ON chillin_render_jobs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM processing_jobs 
      WHERE id = chillin_render_jobs.job_id 
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

CREATE POLICY "Service role full access to chillin_render_jobs" ON chillin_render_jobs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Storage bucket for video chunks
INSERT INTO storage.buckets (id, name, public) 
VALUES ('video-chunks', 'video-chunks', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for video chunks
CREATE POLICY "Authenticated users can upload video chunks" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'video-chunks' 
    AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  );

CREATE POLICY "Users can view their video chunks" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'video-chunks' 
    AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  );

CREATE POLICY "Service role can manage video chunks" ON storage.objects
  FOR ALL USING (
    bucket_id = 'video-chunks' 
    AND auth.jwt() ->> 'role' = 'service_role'
  );

-- Helper functions for job management
CREATE OR REPLACE FUNCTION claim_next_job(
  target_stage processing_stage,
  worker_id_param TEXT,
  claim_duration_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
  queue_id UUID,
  job_id UUID,
  payload JSONB
) AS $$
DECLARE
  claimed_queue_id UUID;
  claimed_job_id UUID;
  job_payload JSONB;
BEGIN
  -- Try to claim the next available job
  UPDATE job_queue 
  SET 
    worker_id = worker_id_param,
    claimed_at = NOW(),
    claim_expires_at = NOW() + (claim_duration_minutes || ' minutes')::INTERVAL,
    attempts = attempts + 1,
    updated_at = NOW()
  WHERE id = (
    SELECT id 
    FROM job_queue 
    WHERE stage = target_stage
      AND (worker_id IS NULL OR claim_expires_at < NOW())
      AND next_attempt_at <= NOW()
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, job_queue.job_id, job_queue.payload INTO claimed_queue_id, claimed_job_id, job_payload;
  
  IF claimed_queue_id IS NOT NULL THEN
    RETURN QUERY SELECT claimed_queue_id, claimed_job_id, job_payload;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to release a job claim
CREATE OR REPLACE FUNCTION release_job_claim(queue_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE job_queue 
  SET 
    worker_id = NULL,
    claimed_at = NULL,
    claim_expires_at = NULL,
    updated_at = NOW()
  WHERE id = queue_id_param;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a job stage
CREATE OR REPLACE FUNCTION complete_job_stage(
  queue_id_param UUID,
  result_data_param JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Remove from queue
  DELETE FROM job_queue WHERE id = queue_id_param;
  
  -- Update job with results if provided
  IF result_data_param IS NOT NULL THEN
    UPDATE processing_jobs 
    SET 
      result_data = COALESCE(result_data, '{}'::JSONB) || result_data_param,
      updated_at = NOW()
    WHERE id = (SELECT job_id FROM job_queue WHERE id = queue_id_param);
  END IF;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to fail a job stage with retry logic
CREATE OR REPLACE FUNCTION fail_job_stage(
  queue_id_param UUID,
  error_message TEXT,
  retry_delay_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN AS $$
DECLARE
  queue_record RECORD;
  job_record RECORD;
BEGIN
  -- Get queue record
  SELECT * INTO queue_record FROM job_queue WHERE id = queue_id_param;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Get job record
  SELECT * INTO job_record FROM processing_jobs WHERE id = queue_record.job_id;
  
  -- Check if we should retry
  IF queue_record.attempts < queue_record.max_attempts THEN
    -- Schedule retry
    UPDATE job_queue 
    SET 
      worker_id = NULL,
      claimed_at = NULL,
      claim_expires_at = NULL,
      next_attempt_at = NOW() + (retry_delay_minutes || ' minutes')::INTERVAL,
      updated_at = NOW()
    WHERE id = queue_id_param;
    
    -- Update job status
    UPDATE processing_jobs 
    SET 
      status = 'retrying',
      last_error = error_message,
      retry_count = retry_count + 1,
      updated_at = NOW()
    WHERE id = queue_record.job_id;
  ELSE
    -- Max retries reached, mark as failed
    DELETE FROM job_queue WHERE id = queue_id_param;
    
    UPDATE processing_jobs 
    SET 
      status = 'failed',
      last_error = error_message,
      retry_count = retry_count + 1,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = queue_record.job_id;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;