-- Add rendered_video_url column to video_sessions table
-- This stores the final rendered video URL from Shotstack/Chillin

ALTER TABLE video_sessions 
ADD COLUMN IF NOT EXISTS rendered_video_url TEXT;

ALTER TABLE video_sessions 
ADD COLUMN IF NOT EXISTS rendered_at TIMESTAMPTZ;

ALTER TABLE video_sessions 
ADD COLUMN IF NOT EXISTS render_service TEXT;

ALTER TABLE video_sessions 
ADD COLUMN IF NOT EXISTS render_settings JSONB;

-- Add comment for documentation
COMMENT ON COLUMN video_sessions.rendered_video_url IS 'URL of the final rendered video from Shotstack/Chillin';
COMMENT ON COLUMN video_sessions.rendered_at IS 'Timestamp when the video was rendered';
COMMENT ON COLUMN video_sessions.render_service IS 'Service used for rendering (shotstack or chillin)';
COMMENT ON COLUMN video_sessions.render_settings IS 'Settings used for rendering (fps, quality, resolution)';