-- Create table for storing video analysis sessions
-- This allows users to save and reload their work without re-processing videos

-- Drop existing table if needed (be careful in production!)
-- DROP TABLE IF EXISTS analysis_sessions CASCADE;

-- Create the analysis_sessions table
CREATE TABLE IF NOT EXISTS analysis_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  
  -- Session metadata
  session_name TEXT NOT NULL,
  session_description TEXT,
  
  -- Video information
  video_url TEXT, -- Original video URL (blob or data URL)
  supabase_url TEXT NOT NULL, -- Supabase storage URL
  video_filename TEXT NOT NULL,
  video_duration NUMERIC NOT NULL,
  video_width INTEGER DEFAULT 1920,
  video_height INTEGER DEFAULT 1080,
  video_fps INTEGER DEFAULT 30,
  video_size_mb NUMERIC,
  
  -- Gemini analysis results
  gemini_file_uri TEXT, -- Gemini file URI for reference
  segments JSONB NOT NULL, -- Array of segment objects with timestamps and reasons
  clusters JSONB, -- Take clusters if workflow includes clustering
  cluster_selections JSONB, -- User's cluster selections
  
  -- Analysis metadata
  total_segments INTEGER,
  segments_to_remove INTEGER,
  original_duration NUMERIC,
  final_duration NUMERIC,
  time_saved NUMERIC,
  
  -- Processing status
  status TEXT DEFAULT 'saved' CHECK (status IN ('saved', 'processing', 'rendered', 'error')),
  last_render_id TEXT, -- Last Chillin render ID if any
  rendered_video_url TEXT -- Final rendered video URL if completed
);

-- Create indexes for faster queries
CREATE INDEX idx_sessions_user_email ON analysis_sessions(user_email);
CREATE INDEX idx_sessions_created_at ON analysis_sessions(created_at DESC);
CREATE INDEX idx_sessions_status ON analysis_sessions(status);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_analysis_sessions_updated_at 
  BEFORE UPDATE ON analysis_sessions 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE analysis_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON analysis_sessions
  FOR SELECT USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Policy: Users can insert their own sessions
CREATE POLICY "Users can insert own sessions" ON analysis_sessions
  FOR INSERT WITH CHECK (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Policy: Users can update their own sessions
CREATE POLICY "Users can update own sessions" ON analysis_sessions
  FOR UPDATE USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Policy: Users can delete their own sessions
CREATE POLICY "Users can delete own sessions" ON analysis_sessions
  FOR DELETE USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Grant permissions to authenticated users
GRANT ALL ON analysis_sessions TO authenticated;
GRANT USAGE ON SEQUENCE analysis_sessions_id_seq TO authenticated;

-- Add helpful comments
COMMENT ON TABLE analysis_sessions IS 'Stores video analysis sessions to avoid re-processing';
COMMENT ON COLUMN analysis_sessions.segments IS 'JSON array of segments with startTime, endTime, reason, etc';
COMMENT ON COLUMN analysis_sessions.clusters IS 'JSON array of take clusters for workflow management';
COMMENT ON COLUMN analysis_sessions.supabase_url IS 'Public URL to the video in Supabase storage';