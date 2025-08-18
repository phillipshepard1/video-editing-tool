import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export async function GET(request: NextRequest) {
  try {
    // Get user email from query params
    const searchParams = request.nextUrl.searchParams;
    const userEmail = searchParams.get('userEmail');
    
    if (!userEmail) {
      return NextResponse.json(
        { error: 'User email is required' },
        { status: 400 }
      );
    }

    // Create Supabase client with service key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false
      }
    });

    // Fetch user's sessions, ordered by most recent first
    const { data: sessions, error } = await supabase
      .from('analysis_sessions')
      .select(`
        id,
        session_name,
        session_description,
        created_at,
        updated_at,
        video_filename,
        video_duration,
        video_size_mb,
        supabase_url,
        total_segments,
        segments_to_remove,
        original_duration,
        final_duration,
        time_saved,
        status,
        rendered_video_url
      `)
      .eq('user_email', userEmail)
      .order('created_at', { ascending: false })
      .limit(50); // Limit to 50 most recent sessions

    if (error) {
      console.error('Error fetching sessions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch sessions', details: error.message },
        { status: 500 }
      );
    }

    // Format the sessions for the UI
    const formattedSessions = sessions?.map(session => ({
      id: session.id,
      name: session.session_name,
      description: session.session_description,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      videoFilename: session.video_filename,
      videoDuration: session.video_duration,
      videoSizeMb: session.video_size_mb,
      thumbnailUrl: session.supabase_url, // Can be used for video thumbnail
      stats: {
        totalSegments: session.total_segments,
        segmentsToRemove: session.segments_to_remove,
        originalDuration: session.original_duration,
        finalDuration: session.final_duration,
        timeSaved: session.time_saved
      },
      status: session.status,
      hasRenderedVideo: !!session.rendered_video_url
    })) || [];

    console.log(`Found ${formattedSessions.length} sessions for user ${userEmail}`);

    return NextResponse.json({
      success: true,
      sessions: formattedSessions,
      count: formattedSessions.length
    });

  } catch (error) {
    console.error('Error in list sessions API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}