-- CRITICAL FIX: Create and configure storage buckets for video rendering
-- Run this IMMEDIATELY in your Supabase SQL Editor

-- 1. Create videos bucket as PUBLIC (required for Chillin API access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos', 
  'videos', 
  true, -- CRITICAL: Must be public for external API access
  524288000, -- 500MB limit
  ARRAY['video/mp4', 'video/mov', 'video/avi', 'video/quicktime', 'video/webm', 'video/x-msvideo']
)
ON CONFLICT (id) DO UPDATE SET
  public = true, -- Ensure it's public
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['video/mp4', 'video/mov', 'video/avi', 'video/quicktime', 'video/webm', 'video/x-msvideo'];

-- 2. Create fallback public bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public', 
  'public', 
  true,
  524288000,
  ARRAY['video/mp4', 'video/mov', 'video/avi', 'video/quicktime', 'video/webm', 'video/x-msvideo']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['video/mp4', 'video/mov', 'video/avi', 'video/quicktime', 'video/webm', 'video/x-msvideo'];

-- 3. Remove restrictive policies that prevent public access
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;

-- 4. Create permissive policies for video rendering
CREATE POLICY "Allow authenticated uploads to videos bucket" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'videos' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated uploads to public bucket" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'public' AND 
  auth.role() = 'authenticated'
);

-- 5. CRITICAL: Allow public READ access for external APIs (Chillin)
CREATE POLICY "Allow public read access to videos bucket" ON storage.objects
FOR SELECT USING (bucket_id = 'videos');

CREATE POLICY "Allow public read access to public bucket" ON storage.objects
FOR SELECT USING (bucket_id = 'public');

-- 6. Allow cleanup of old videos
CREATE POLICY "Allow authenticated users to delete videos" ON storage.objects
FOR DELETE USING (
  (bucket_id = 'videos' OR bucket_id = 'public') AND 
  auth.role() = 'authenticated'
);

-- 7. Verify bucket creation (this will show an error if buckets don't exist)
SELECT id, name, public, file_size_limit, allowed_mime_types 
FROM storage.buckets 
WHERE id IN ('videos', 'public');