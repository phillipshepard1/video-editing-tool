import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Reconstruct the file path from URL segments
    const filePath = params.path.join('/');
    console.log('Proxying video request for:', filePath);

    // Initialize Supabase client with service key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      { auth: { persistSession: false } }
    );

    // Download the file from Supabase
    const { data, error } = await supabase.storage
      .from('videos')
      .download(filePath);

    if (error) {
      console.error('Failed to download from Supabase:', error);
      return NextResponse.json(
        { error: 'Failed to fetch video' },
        { status: 404 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Determine content type based on file extension
    const contentType = filePath.endsWith('.mp4') 
      ? 'video/mp4' 
      : filePath.endsWith('.mov')
      ? 'video/quicktime'
      : 'application/octet-stream';

    // Stream the video data back to the client
    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}