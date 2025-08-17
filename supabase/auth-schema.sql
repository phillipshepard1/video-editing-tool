-- Create user profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Update existing tables to reference user
ALTER TABLE videos ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE video_analysis ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE video_transcripts ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE video_segments ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX videos_user_id_idx ON videos(user_id);
CREATE INDEX video_analysis_user_id_idx ON video_analysis(user_id);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing public policies and create user-specific ones
DROP POLICY IF EXISTS "Public videos are viewable by everyone" ON videos;
DROP POLICY IF EXISTS "Public can insert videos" ON videos;
DROP POLICY IF EXISTS "Public can update own videos" ON videos;
DROP POLICY IF EXISTS "Public can delete own videos" ON videos;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Videos policies (user-specific)
CREATE POLICY "Users can view own videos" ON videos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own videos" ON videos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos" ON videos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos" ON videos
  FOR DELETE USING (auth.uid() = user_id);

-- Video analysis policies
DROP POLICY IF EXISTS "Public video_analysis are viewable by everyone" ON video_analysis;
DROP POLICY IF EXISTS "Public can insert video_analysis" ON video_analysis;

CREATE POLICY "Users can view own video analysis" ON video_analysis
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own video analysis" ON video_analysis
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Video transcripts policies
DROP POLICY IF EXISTS "Public video_transcripts are viewable by everyone" ON video_transcripts;
DROP POLICY IF EXISTS "Public can insert video_transcripts" ON video_transcripts;

CREATE POLICY "Users can view own video transcripts" ON video_transcripts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own video transcripts" ON video_transcripts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Video segments policies
DROP POLICY IF EXISTS "Public video_segments are viewable by everyone" ON video_segments;
DROP POLICY IF EXISTS "Public can insert video_segments" ON video_segments;

CREATE POLICY "Users can view own video segments" ON video_segments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own video segments" ON video_segments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update storage policies for user-specific access
DROP POLICY IF EXISTS "Public can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view videos" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete own videos" ON storage.objects;

CREATE POLICY "Users can upload own videos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own videos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own videos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );