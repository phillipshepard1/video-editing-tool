-- Create video_sessions table for saving analysis sessions
CREATE TABLE video_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Session Identity
  session_name TEXT NOT NULL,
  description TEXT,
  
  -- Video Reference  
  original_filename TEXT NOT NULL,
  video_url TEXT NOT NULL,
  video_duration REAL NOT NULL,
  
  -- Analysis Results (JSONB for flexibility)
  segments JSONB NOT NULL,              -- EnhancedSegment[]
  clusters JSONB NOT NULL,              -- TakeCluster[]  
  cluster_selections JSONB NOT NULL,    -- ClusterSelection[]
  
  -- Workflow State
  current_step INTEGER DEFAULT 3,
  filter_state JSONB,                   -- FilterState
  final_segments JSONB,                 -- Final export selection
  
  -- Quick Access Metrics (computed from segments)
  original_duration REAL,
  final_duration REAL,
  time_saved REAL,
  segments_count INTEGER,
  
  -- Session Management
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_opened_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_step CHECK (current_step IN (1, 2, 3))
);

-- Performance Indexes
CREATE INDEX idx_sessions_user_recent ON video_sessions(user_id, updated_at DESC);
CREATE INDEX idx_sessions_created ON video_sessions(created_at DESC);

-- Row Level Security (RLS) Policies
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON video_sessions 
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only create sessions for themselves
CREATE POLICY "Users can create own sessions" ON video_sessions 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own sessions
CREATE POLICY "Users can update own sessions" ON video_sessions 
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own sessions
CREATE POLICY "Users can delete own sessions" ON video_sessions 
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_video_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_video_sessions_updated_at_trigger
  BEFORE UPDATE ON video_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_video_sessions_updated_at();