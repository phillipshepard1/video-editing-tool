import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase client with service key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false
      }
    });

    // Fetch the complete session data
    const { data: session, error } = await supabase
      .from('analysis_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('Error loading session:', error);
      return NextResponse.json(
        { error: 'Failed to load session', details: error.message },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    console.log(`Loading session ${sessionId}:`, {
      name: session.session_name,
      segments: session.total_segments,
      duration: session.video_duration
    });

    // Format the response to match what the UI expects
    const formattedSession = {
      id: session.id,
      sessionName: session.session_name,
      sessionDescription: session.session_description,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      
      // Video information
      videoUrl: session.video_url,
      supabaseUrl: session.supabase_url,
      videoFilename: session.video_filename,
      videoDuration: session.video_duration,
      videoWidth: session.video_width,
      videoHeight: session.video_height,
      videoFps: session.video_fps,
      videoSizeMb: session.video_size_mb,
      
      // Analysis results
      geminiFileUri: session.gemini_file_uri,
      segments: session.segments,
      clusters: session.clusters,
      clusterSelections: session.cluster_selections,
      
      // Metadata
      totalSegments: session.total_segments,
      segmentsToRemove: session.segments_to_remove,
      originalDuration: session.original_duration,
      finalDuration: session.final_duration,
      timeSaved: session.time_saved,
      
      // Status
      status: session.status,
      lastRenderId: session.last_render_id,
      renderedVideoUrl: session.rendered_video_url
    };

    return NextResponse.json({
      success: true,
      session: formattedSession,
      message: 'Session loaded successfully'
    });

  } catch (error) {
    console.error('Error in load session API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}