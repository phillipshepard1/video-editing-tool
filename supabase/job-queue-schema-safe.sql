-- Video Processing Job Queue Schema (Safe Migration)
-- Production-ready queue-based architecture for video processing
-- This version checks for existing types and tables

-- Drop existing types if needed (careful in production!)
-- Uncomment these lines if you need to recreate the schema completely:
-- DROP TABLE IF EXISTS chillin_render_jobs CASCADE;
-- DROP TABLE IF EXISTS job_logs CASCADE;
-- DROP TABLE IF EXISTS job_queue CASCADE;
-- DROP TABLE IF EXISTS video_chunks CASCADE;
-- DROP TABLE IF EXISTS processing_jobs CASCADE;
-- DROP TYPE IF EXISTS processing_stage CASCADE;
-- DROP TYPE IF EXISTS job_priority CASCADE;
-- DROP TYPE IF EXISTS job_status CASCADE;

-- Create ENUM types only if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE job_status AS ENUM (
      'pending',
      'queued',
      'processing',
      'completed',
      'failed',
      'cancelled',
      'retrying'
    );
  END IF;
END$$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_priority') THEN
    CREATE TYPE job_priority AS ENUM (
      'low',
      'normal',
      'high',
      'urgent'
    );
  END IF;
END$$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_stage') THEN
    CREATE TYPE processing_stage AS ENUM (
      'upload',
      'split_chunks',
      'store_chunks',
      'queue_analysis',
      'gemini_processing',
      'assemble_timeline',
      'render_video'
    );
  END IF;
END$$;

-- Main jobs table for tracking video processing jobs
CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  
  -- Job management
  status job_status DEFAULT 'pending' NOT NULL,
  priority job_priority DEFAULT 'normal' NOT NULL,
  current_stage processing_stage DEFAULT 'upload' NOT NULL,
  
  -- Progress tracking
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  stage_progress JSONB DEFAULT '{}',
  
  -- Job configuration
  processing_options JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  
  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  
  -- Timing
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Results
  result_data JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video chunks table
CREATE TABLE IF NOT EXISTS video_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE CASCADE,
  
  -- Chunk details
  chunk_index INTEGER NOT NULL,
  chunk_url TEXT NOT NULL,
  chunk_size_bytes BIGINT,
  
  -- Timing info
  start_time_seconds NUMERIC,
  end_time_seconds NUMERIC,
  duration_seconds NUMERIC,
  
  -- Analysis results for this chunk
  analysis_result JSONB,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(job_id, chunk_index)
);

-- Job queue for background processing
CREATE TABLE IF NOT EXISTS job_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE CASCADE,
  
  -- Queue management
  stage processing_stage NOT NULL,
  priority job_priority DEFAULT 'normal' NOT NULL,
  
  -- Worker assignment
  worker_id TEXT,
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

-- Chillin render jobs tracking (NEW!)
CREATE TABLE IF NOT EXISTS chillin_render_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE CASCADE,
  
  -- Chillin API details
  chillin_render_id TEXT UNIQUE,
  chillin_status TEXT,
  
  -- Video details
  source_video_url TEXT NOT NULL,
  output_video_url TEXT,
  
  -- Render configuration
  quality TEXT DEFAULT 'high',
  resolution_width INTEGER DEFAULT 1920,
  resolution_height INTEGER DEFAULT 1080,
  fps INTEGER DEFAULT 30,
  
  -- Timeline edits
  segments_to_remove JSONB NOT NULL,
  segments_to_keep JSONB,
  total_duration_seconds NUMERIC,
  final_duration_seconds NUMERIC,
  
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

-- Job logs for debugging
CREATE TABLE IF NOT EXISTS job_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE CASCADE,
  
  -- Log details
  level TEXT NOT NULL DEFAULT 'info',
  stage processing_stage NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  
  -- Context
  worker_id TEXT,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes only if they don't exist
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON processing_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_priority_status ON processing_jobs(priority DESC, status);

CREATE INDEX IF NOT EXISTS idx_video_chunks_job_id ON video_chunks(job_id);
CREATE INDEX IF NOT EXISTS idx_video_chunks_job_chunk ON video_chunks(job_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_job_queue_stage_priority ON job_queue(stage, priority DESC, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_worker ON job_queue(worker_id, claimed_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_next_attempt ON job_queue(next_attempt_at) WHERE worker_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_chillin_render_jobs_job_id ON chillin_render_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_chillin_render_jobs_render_id ON chillin_render_jobs(chillin_render_id);
CREATE INDEX IF NOT EXISTS idx_chillin_render_jobs_status ON chillin_render_jobs(chillin_status);
CREATE INDEX IF NOT EXISTS idx_chillin_render_jobs_created ON chillin_render_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_logs_level ON job_logs(level, created_at DESC);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers only if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_processing_jobs_updated_at') THEN
    CREATE TRIGGER update_processing_jobs_updated_at 
      BEFORE UPDATE ON processing_jobs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_video_chunks_updated_at') THEN
    CREATE TRIGGER update_video_chunks_updated_at 
      BEFORE UPDATE ON video_chunks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_job_queue_updated_at') THEN
    CREATE TRIGGER update_job_queue_updated_at 
      BEFORE UPDATE ON job_queue
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_chillin_render_jobs_updated_at') THEN
    CREATE TRIGGER update_chillin_render_jobs_updated_at 
      BEFORE UPDATE ON chillin_render_jobs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END$$;

-- Enable RLS (if not already enabled)
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chillin_render_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (create only if they don't exist)
DO $$
BEGIN
  -- Processing jobs policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'processing_jobs' 
    AND policyname = 'Users can view own jobs'
  ) THEN
    CREATE POLICY "Users can view own jobs" ON processing_jobs
      FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'processing_jobs' 
    AND policyname = 'Users can update own jobs'
  ) THEN
    CREATE POLICY "Users can update own jobs" ON processing_jobs
      FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);
  END IF;
  
  -- Chillin render jobs policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chillin_render_jobs' 
    AND policyname = 'Users can view own render jobs'
  ) THEN
    CREATE POLICY "Users can view own render jobs" ON chillin_render_jobs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM processing_jobs 
          WHERE id = chillin_render_jobs.job_id 
          AND (user_id = auth.uid() OR user_id IS NULL)
        )
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chillin_render_jobs' 
    AND policyname = 'Users can update own render jobs'
  ) THEN
    CREATE POLICY "Users can update own render jobs" ON chillin_render_jobs
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM processing_jobs 
          WHERE id = chillin_render_jobs.job_id 
          AND (user_id = auth.uid() OR user_id IS NULL)
        )
      );
  END IF;
END$$;

-- Service role policies (create only if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'job_queue' 
    AND policyname = 'Service role full access to job_queue'
  ) THEN
    CREATE POLICY "Service role full access to job_queue" ON job_queue
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'job_logs' 
    AND policyname = 'Service role full access to job_logs'
  ) THEN
    CREATE POLICY "Service role full access to job_logs" ON job_logs
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chillin_render_jobs' 
    AND policyname = 'Service role full access to chillin_render_jobs'
  ) THEN
    CREATE POLICY "Service role full access to chillin_render_jobs" ON chillin_render_jobs
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END$$;

-- Storage buckets (create if not exists)
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('video-chunks', 'video-chunks', false),
  ('processed-videos', 'processed-videos', false),
  ('raw-videos', 'raw-videos', false),
  ('rendered-videos', 'rendered-videos', false)
ON CONFLICT (id) DO NOTHING;

-- Helper functions for queue management
CREATE OR REPLACE FUNCTION claim_next_job(
  p_worker_id TEXT,
  p_stage processing_stage DEFAULT NULL
)
RETURNS job_queue AS $$
DECLARE
  v_job job_queue;
BEGIN
  SELECT * INTO v_job
  FROM job_queue
  WHERE worker_id IS NULL
    AND next_attempt_at <= NOW()
    AND (p_stage IS NULL OR stage = p_stage)
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_job.id IS NOT NULL THEN
    UPDATE job_queue
    SET 
      worker_id = p_worker_id,
      claimed_at = NOW(),
      claim_expires_at = NOW() + INTERVAL '10 minutes',
      attempts = attempts + 1
    WHERE id = v_job.id;
  END IF;
  
  RETURN v_job;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a job stage
CREATE OR REPLACE FUNCTION complete_job_stage(
  p_queue_id UUID,
  p_worker_id TEXT,
  p_result JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  queue_record job_queue;
  job_record processing_jobs;
BEGIN
  -- Get queue record
  SELECT * INTO queue_record FROM job_queue 
  WHERE id = p_queue_id AND worker_id = p_worker_id;
  
  IF queue_record.id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Update job with result
  UPDATE processing_jobs
  SET 
    result_data = COALESCE(result_data, '{}'::jsonb) || COALESCE(p_result, '{}'::jsonb),
    updated_at = NOW()
  WHERE id = queue_record.job_id
  RETURNING * INTO job_record;
  
  -- Remove from queue
  DELETE FROM job_queue WHERE id = p_queue_id;
  
  -- Add next stage to queue if needed
  CASE queue_record.stage
    WHEN 'upload' THEN
      INSERT INTO job_queue (job_id, stage, priority)
      VALUES (queue_record.job_id, 'split_chunks', job_record.priority);
    WHEN 'split_chunks' THEN
      INSERT INTO job_queue (job_id, stage, priority)
      VALUES (queue_record.job_id, 'store_chunks', job_record.priority);
    WHEN 'store_chunks' THEN
      INSERT INTO job_queue (job_id, stage, priority)
      VALUES (queue_record.job_id, 'gemini_processing', job_record.priority);
    WHEN 'gemini_processing' THEN
      INSERT INTO job_queue (job_id, stage, priority)
      VALUES (queue_record.job_id, 'assemble_timeline', job_record.priority);
    WHEN 'assemble_timeline' THEN
      INSERT INTO job_queue (job_id, stage, priority)
      VALUES (queue_record.job_id, 'render_video', job_record.priority);
    WHEN 'render_video' THEN
      UPDATE processing_jobs
      SET status = 'completed', completed_at = NOW()
      WHERE id = queue_record.job_id;
  END CASE;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;