import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.userEmail || !body.supabaseUrl || !body.segments) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create Supabase client with service key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false
      }
    });

    // Prepare session data
    const sessionData = {
      user_email: body.userEmail,
      session_name: body.sessionName || `Session ${new Date().toLocaleDateString()}`,
      session_description: body.sessionDescription || null,
      
      // Video information
      video_url: body.videoUrl || null,
      supabase_url: body.supabaseUrl,
      video_filename: body.videoFilename || 'video.mp4',
      video_duration: body.videoDuration || 0,
      video_width: body.videoWidth || 1920,
      video_height: body.videoHeight || 1080,
      video_fps: body.videoFps || 30,
      video_size_mb: body.videoSizeMb || null,
      
      // Gemini analysis results
      gemini_file_uri: body.geminiFileUri || null,
      segments: body.segments,
      clusters: body.clusters || null,
      cluster_selections: body.clusterSelections || null,
      
      // Analysis metadata
      total_segments: body.totalSegments || body.segments.length,
      segments_to_remove: body.segmentsToRemove || body.segments.filter((s: any) => s.shouldRemove).length,
      original_duration: body.originalDuration || body.videoDuration,
      final_duration: body.finalDuration || null,
      time_saved: body.timeSaved || null,
      
      // Status
      status: 'saved',
      last_render_id: body.lastRenderId || null,
      rendered_video_url: body.renderedVideoUrl || null
    };

    console.log('Saving analysis session:', {
      name: sessionData.session_name,
      segments: sessionData.total_segments,
      duration: sessionData.video_duration
    });

    // Insert into database
    const { data, error } = await supabase
      .from('analysis_sessions')
      .insert([sessionData])
      .select()
      .single();

    if (error) {
      console.error('Error saving session:', error);
      return NextResponse.json(
        { error: 'Failed to save session', details: error.message },
        { status: 500 }
      );
    }

    console.log('Session saved successfully:', data.id);

    return NextResponse.json({
      success: true,
      sessionId: data.id,
      sessionName: data.session_name,
      message: 'Session saved successfully'
    });

  } catch (error) {
    console.error('Error in save session API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}