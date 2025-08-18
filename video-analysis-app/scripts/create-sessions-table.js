// Script to create the analysis_sessions table via Supabase API
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
});

const SQL = `
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
  video_url TEXT,
  supabase_url TEXT NOT NULL,
  video_filename TEXT NOT NULL,
  video_duration NUMERIC NOT NULL,
  video_width INTEGER DEFAULT 1920,
  video_height INTEGER DEFAULT 1080,
  video_fps INTEGER DEFAULT 30,
  video_size_mb NUMERIC,
  
  -- Gemini analysis results
  gemini_file_uri TEXT,
  segments JSONB NOT NULL,
  clusters JSONB,
  cluster_selections JSONB,
  
  -- Analysis metadata
  total_segments INTEGER,
  segments_to_remove INTEGER,
  original_duration NUMERIC,
  final_duration NUMERIC,
  time_saved NUMERIC,
  
  -- Processing status
  status TEXT DEFAULT 'saved' CHECK (status IN ('saved', 'processing', 'rendered', 'error')),
  last_render_id TEXT,
  rendered_video_url TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_email ON analysis_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON analysis_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON analysis_sessions(status);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_analysis_sessions_updated_at ON analysis_sessions;
CREATE TRIGGER update_analysis_sessions_updated_at 
  BEFORE UPDATE ON analysis_sessions 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE analysis_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own sessions" ON analysis_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON analysis_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON analysis_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON analysis_sessions;

-- Create RLS policies
CREATE POLICY "Users can view own sessions" ON analysis_sessions
  FOR SELECT USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can insert own sessions" ON analysis_sessions
  FOR INSERT WITH CHECK (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can update own sessions" ON analysis_sessions
  FOR UPDATE USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can delete own sessions" ON analysis_sessions
  FOR DELETE USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Grant permissions
GRANT ALL ON analysis_sessions TO authenticated;

-- Add comments
COMMENT ON TABLE analysis_sessions IS 'Stores video analysis sessions to avoid re-processing';
`;

async function createTable() {
  console.log('🚀 Creating analysis_sessions table in Supabase...\n');
  
  try {
    // Execute the SQL using the service key which bypasses RLS
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: SQL
    }).single();

    // If the RPC doesn't exist, try a direct approach
    if (error && error.message.includes('exec_sql')) {
      console.log('⚠️  Direct SQL execution not available via RPC');
      console.log('📝 Please run the following SQL manually in Supabase:\n');
      console.log('URL: https://supabase.com/dashboard/project/leeslkgwtmgfewsbxwyu/sql/new\n');
      console.log('========== COPY SQL BELOW ==========\n');
      console.log(SQL);
      console.log('\n========== END SQL ==========\n');
      return;
    }

    if (error) {
      console.error('❌ Error creating table:', error);
      console.log('\n📝 Alternatively, run this SQL manually in Supabase dashboard:');
      console.log('URL: https://supabase.com/dashboard/project/leeslkgwtmgfewsbxwyu/sql/new');
      return;
    }

    console.log('✅ Table created successfully!');
    
    // Test the table by trying to query it
    const { data: testData, error: testError } = await supabase
      .from('analysis_sessions')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('⚠️  Table created but test query failed:', testError);
    } else {
      console.log('✅ Table verified and working!');
      console.log('🎉 You can now use the session management system!');
    }
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
    console.log('\n📝 Please run the SQL manually in Supabase dashboard:');
    console.log('URL: https://supabase.com/dashboard/project/leeslkgwtmgfewsbxwyu/sql/new');
  }
}

createTable();