-- Create videos table
CREATE TABLE videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  duration FLOAT,
  mime_type TEXT,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'processing',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create video_analysis table
CREATE TABLE video_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL,
  results JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create video_transcripts table
CREATE TABLE video_transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  transcript TEXT,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create video_segments table for storing timeline segments
CREATE TABLE video_segments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  segment_type TEXT,
  content JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create RLS policies
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_segments ENABLE ROW LEVEL SECURITY;

-- Allow public read access (modify as needed for your auth setup)
CREATE POLICY "Public videos are viewable by everyone" ON videos
  FOR SELECT USING (true);

CREATE POLICY "Public can insert videos" ON videos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can update own videos" ON videos
  FOR UPDATE USING (true);

CREATE POLICY "Public can delete own videos" ON videos
  FOR DELETE USING (true);

-- Similar policies for other tables
CREATE POLICY "Public video_analysis are viewable by everyone" ON video_analysis
  FOR SELECT USING (true);

CREATE POLICY "Public can insert video_analysis" ON video_analysis
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public video_transcripts are viewable by everyone" ON video_transcripts
  FOR SELECT USING (true);

CREATE POLICY "Public can insert video_transcripts" ON video_transcripts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public video_segments are viewable by everyone" ON video_segments
  FOR SELECT USING (true);

CREATE POLICY "Public can insert video_segments" ON video_segments
  FOR INSERT WITH CHECK (true);

-- Create storage bucket for videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true);

-- Allow public upload to videos bucket
CREATE POLICY "Public can upload videos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'videos');

CREATE POLICY "Public can view videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'videos');

CREATE POLICY "Public can delete own videos" ON storage.objects
  FOR DELETE USING (bucket_id = 'videos');