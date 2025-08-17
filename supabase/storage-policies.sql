-- Storage policies for video uploads
-- Run this in your Supabase SQL Editor

-- Create the videos bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload videos
CREATE POLICY "Authenticated users can upload videos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'videos' AND 
  auth.role() = 'authenticated'
);

-- Allow authenticated users to view their own videos
CREATE POLICY "Users can view own videos" ON storage.objects
FOR SELECT USING (
  bucket_id = 'videos' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own videos
CREATE POLICY "Users can delete own videos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'videos' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Alternative simpler policy (if the above doesn't work)
-- This allows all authenticated users to upload/view/delete in the videos bucket
-- Uncomment these if you want simpler permissions:

/*
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;

CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR ALL USING (bucket_id = 'videos' AND auth.role() = 'authenticated');
*/