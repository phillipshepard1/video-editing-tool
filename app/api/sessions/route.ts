import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication (optional for testing)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // For testing: allow anonymous saves with a default user_id
    // TODO: Remove this in production and require authentication
    const userId = user?.id || 'anonymous-user';
    
    if (!userId) {
      console.warn('No authenticated user, using anonymous mode');
    }

    const body = await request.json();
    const {
      sessionName,
      originalFilename,
      videoUrl,
      videoDuration,
      segments,
      clusters,
      clusterSelections,
      filterState,
      currentStep,
      originalDuration
    } = body;

    // Validate required fields
    if (!sessionName || !originalFilename || !videoUrl || !segments || !clusters || !clusterSelections) {
      return NextResponse.json({ 
        error: 'Missing required fields: sessionName, originalFilename, videoUrl, segments, clusters, clusterSelections' 
      }, { status: 400 });
    }

    // Insert session into database
    const { data, error } = await supabase
      .from('video_sessions')
      .insert({
        user_id: userId,
        session_name: sessionName,
        original_filename: originalFilename,
        video_url: videoUrl,
        video_duration: videoDuration || 0,
        segments: segments,
        clusters: clusters,
        cluster_selections: clusterSelections,
        filter_state: filterState || null,
        current_step: currentStep || 3,
        original_duration: originalDuration || videoDuration || 0
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      sessionId: data.id,
      message: 'Session saved successfully' 
    });

  } catch (error) {
    console.error('Error saving session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's sessions ordered by most recent
    const { data: sessions, error } = await supabase
      .from('video_sessions')
      .select('id, session_name, original_filename, video_duration, original_duration, current_step, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    // Format the response with additional metadata
    const formattedSessions = sessions.map(session => ({
      ...session,
      timeRemoved: session.original_duration ? session.original_duration - session.video_duration : 0,
      formattedDuration: formatTime(session.video_duration || 0),
      formattedCreatedAt: new Date(session.created_at).toLocaleDateString(),
      formattedUpdatedAt: getRelativeTime(session.updated_at)
    }));

    return NextResponse.json({ sessions: formattedSessions });

  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to format time in MM:SS format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to get relative time
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) {
    return 'Just now';
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  } else if (diffInHours < 48) {
    return 'Yesterday';
  } else {
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }
}