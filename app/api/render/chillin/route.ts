import { NextRequest, NextResponse } from 'next/server';
import { buildChillinRequest, submitRenderJob, getRenderStatus } from '@/lib/services/chillin';
import { EnhancedSegment } from '@/lib/types/segments';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      videoUrl, 
      segmentsToRemove, 
      videoDuration,
      videoWidth,
      videoHeight,
      fps 
    } = body;

    // Validate required fields
    if (!videoUrl || !segmentsToRemove || !videoDuration) {
      return NextResponse.json(
        { error: 'Missing required fields: videoUrl, segmentsToRemove, or videoDuration' },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.CHILLIN_API_KEY;
    if (!apiKey) {
      console.error('CHILLIN_API_KEY not configured');
      return NextResponse.json(
        { error: 'Chillin API not configured. Please add CHILLIN_API_KEY to environment variables.' },
        { status: 500 }
      );
    }

    // Build the Chillin request
    const chillinRequest = buildChillinRequest(
      videoUrl,
      segmentsToRemove as EnhancedSegment[],
      videoDuration,
      videoWidth || 1920,
      videoHeight || 1080,
      fps || 30
    );

    console.log('Submitting render job to Chillin:', {
      videoUrl,
      segments: segmentsToRemove.length,
      duration: videoDuration,
      keeperSegments: chillinRequest.project.elements.length
    });
    console.log('Chillin request payload:', JSON.stringify(chillinRequest, null, 2));

    // Submit the render job
    const renderResponse = await submitRenderJob(chillinRequest, apiKey);

    return NextResponse.json({
      success: true,
      renderId: renderResponse.renderId,
      status: renderResponse.status,
      message: 'Render job submitted successfully'
    });

  } catch (error) {
    console.error('Chillin render error:', error);
    console.log('Debug context:', { videoUrl, segments: segmentsToRemove?.length });
    return NextResponse.json(
      { 
        error: 'Failed to submit render job',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check render status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const renderId = searchParams.get('renderId');

    if (!renderId) {
      return NextResponse.json(
        { error: 'Missing renderId parameter' },
        { status: 400 }
      );
    }

    const apiKey = process.env.CHILLIN_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chillin API not configured' },
        { status: 500 }
      );
    }

    // Handle mock render IDs
    if (renderId.startsWith('mock-render-')) {
      console.log('Handling mock render status check for:', renderId);
      return NextResponse.json({
        status: 'completed',
        outputUrl: 'https://example.com/mock-video.mp4',
        message: 'Mock render completed - external service unavailable',
        mock: true
      });
    }
    
    const status = await getRenderStatus(renderId, apiKey);

    return NextResponse.json({
      success: true,
      ...status
    });

  } catch (error) {
    console.error('Failed to get render status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get render status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}