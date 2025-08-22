import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = params;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Get the specific session
    const { data: session, error } = await supabase
      .from('video_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id) // Ensure user can only access their own sessions
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Return the complete session data
    return NextResponse.json({ 
      session: {
        ...session,
        timeRemoved: session.original_duration ? session.original_duration - session.video_duration : 0,
        formattedDuration: formatTime(session.video_duration || 0),
        formattedCreatedAt: new Date(session.created_at).toLocaleDateString(),
        formattedUpdatedAt: getRelativeTime(session.updated_at)
      }
    });

  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = params;
    const body = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Extract fields to update for rendered video
    const updateData: any = {};
    
    // Handle rendered video update
    if (body.rendered_video_url !== undefined) {
      updateData.rendered_video_url = body.rendered_video_url;
    }
    if (body.rendered_at !== undefined) {
      updateData.rendered_at = body.rendered_at;
    }
    if (body.render_service !== undefined) {
      updateData.render_service = body.render_service;
    }
    if (body.render_settings !== undefined) {
      updateData.render_settings = body.render_settings;
    }

    // Update the session with rendered video info
    const { data: updatedSession, error } = await supabase
      .from('video_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', user.id) // Ensure user can only update their own sessions
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Rendered video saved to session',
      session: updatedSession
    });

  } catch (error) {
    console.error('Error updating session with rendered video:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = params;
    const body = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const {
      sessionName,
      segments,
      clusters,
      clusterSelections,
      filterState,
      currentStep
    } = body;

    // Update the session
    const { data, error } = await supabase
      .from('video_sessions')
      .update({
        session_name: sessionName,
        segments: segments,
        clusters: clusters,
        cluster_selections: clusterSelections,
        filter_state: filterState,
        current_step: currentStep,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id) // Ensure user can only update their own sessions
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      session: data,
      message: 'Session updated successfully' 
    });

  } catch (error) {
    console.error('Error updating session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = params;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Delete the session
    const { error } = await supabase
      .from('video_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id); // Ensure user can only delete their own sessions

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Session deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting session:', error);
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