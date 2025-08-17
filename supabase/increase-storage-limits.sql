-- Increase storage limits for video uploads
-- Run this in your Supabase SQL Editor

-- Update the videos bucket to allow larger files (500MB)
UPDATE storage.buckets 
SET file_size_limit = 524288000 -- 500MB in bytes
WHERE id = 'videos';

-- If the above doesn't work, you can also try updating the global storage config
-- Note: This might require admin privileges
-- UPDATE storage.config SET value = '524288000' WHERE name = 'fileSizeLimit';

-- Also ensure the bucket allows video mime types
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY['video/mp4', 'video/mov', 'video/avi', 'video/quicktime', 'video/webm']
WHERE id = 'videos';