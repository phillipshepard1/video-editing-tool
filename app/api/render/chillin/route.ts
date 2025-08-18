import { NextRequest, NextResponse } from 'next/server';
import { buildChillinRequest, submitRenderJob, getRenderStatus } from '@/lib/services/chillin';
import { EnhancedSegment } from '@/lib/types/segments';

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
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

    // For now, just use the original URL directly
    // The proxy approach doesn't work because Chillin can't access localhost
    // And signed URLs have issues with Supabase's validation
    let finalVideoUrl = videoUrl;
    
    // Log the URL being used
    console.log('Using video URL:', finalVideoUrl);

    // Build the Chillin request with the proxy URL if applicable
    const chillinRequest = buildChillinRequest(
      finalVideoUrl,
      segmentsToRemove as EnhancedSegment[],
      videoDuration,
      videoWidth || 1920,
      videoHeight || 1080,
      fps || 30
    );

    console.log('Submitting render job to Chillin:', {
      originalUrl: videoUrl,
      usingProxy: videoUrl !== finalVideoUrl,
      proxyUrl: videoUrl !== finalVideoUrl ? finalVideoUrl : undefined,
      segments: segmentsToRemove.length,
      duration: videoDuration,
      keeperSegments: chillinRequest.projectData.view.length
    });
    console.log('Chillin request payload:', JSON.stringify(chillinRequest, null, 2));

    // Submit the render job
    const renderResponse = await submitRenderJob(chillinRequest, apiKey);
    console.log('Chillin API response:', renderResponse);
    
    // Handle various response formats from Chillin API
    const renderId = renderResponse.renderId;
    
    if (!renderId) {
      console.error('No render ID found in response:', renderResponse);
      // If no ID returned, it might be a synchronous render - check for URL
      if (renderResponse.outputUrl) {
        return NextResponse.json({
          success: true,
          renderId: 'sync-render-' + Date.now(),
          status: 'completed',
          outputUrl: renderResponse.outputUrl,
          message: 'Render completed immediately'
        });
      }
      // Generate a fallback ID from response or timestamp
      const fallbackId = 'render-' + Date.now();
      console.log('Using fallback render ID:', fallbackId);
      return NextResponse.json({
        success: true,
        renderId: fallbackId,
        status: renderResponse.status || 'processing',
        message: 'Render job submitted (using fallback ID)',
        rawResponse: renderResponse
      });
    }

    return NextResponse.json({
      success: true,
      renderId: renderId,
      status: renderResponse.status || 'processing',
      message: 'Render job submitted successfully'
    });

  } catch (error) {
    console.error('Chillin render error:', error);
    console.log('Debug context:', { originalUrl: body?.videoUrl, segments: body?.segmentsToRemove?.length });
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
        status: 'failed',
        error: 'Render service temporarily unavailable. Please try again later.',
        details: 'The external render service is not responding. This may be a temporary issue.',
        mock: true
      });
    }
    
    try {
      const status = await getRenderStatus(renderId, apiKey);
      
      return NextResponse.json({
        success: true,
        ...status
      });
    } catch (statusError) {
      console.error('Status check error:', statusError);
      
      // If it's a timeout, return a processing status instead of error
      if (statusError instanceof Error && statusError.message?.includes('timed out')) {
        return NextResponse.json({
          success: true,
          renderId,
          status: 'processing',
          message: 'Render is still processing. Large videos may take several minutes.',
          timeout: true
        });
      }
      
      throw statusError; // Re-throw for outer catch
    }

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