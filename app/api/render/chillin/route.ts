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

    // Submit the render job with enhanced error handling
    let renderResponse;
    try {
      renderResponse = await submitRenderJob(chillinRequest, apiKey);
      console.log('Chillin API response:', renderResponse);
    } catch (submitError) {
      console.error('Chillin render submission failed:', submitError);
      
      // Check if it's a known server issue
      if (submitError instanceof Error) {
        // Server down errors
        if (submitError.message.includes('EOF') || 
            submitError.message.includes('render servers') ||
            submitError.message.includes('connection')) {
          return NextResponse.json(
            { 
              error: 'Chillin render servers are currently experiencing issues',
              details: 'The Chillin API render farm is down. This is a known issue on their end.',
              serverError: true,
              alternatives: [
                { method: 'export_edl', description: 'Export as EDL for editing in Premiere/DaVinci' },
                { method: 'export_xml', description: 'Export as XML for Final Cut Pro' },
                { method: 'wait', description: 'Wait and try again later' },
                { method: 'contact', description: 'Contact support@chillin.online for updates' }
              ],
              originalError: submitError.message
            },
            { status: 503 }
          );
        }
        
        // Credit errors
        if (submitError.message.includes('credit') || submitError.message.includes('2008')) {
          return NextResponse.json(
            { 
              error: 'Insufficient render credits',
              details: submitError.message,
              creditError: true,
              addCreditsUrl: 'https://chillin.online/render-console'
            },
            { status: 402 }
          );
        }
        
        // Auth errors
        if (submitError.message.includes('401') || submitError.message.includes('403')) {
          return NextResponse.json(
            { 
              error: 'Authentication failed',
              details: 'Your Chillin API key may be invalid or expired',
              authError: true
            },
            { status: 401 }
          );
        }
      }
      
      // Re-throw for generic error handling
      throw submitError;
    }
    
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
    
    // Provide actionable error response
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isServerError = errorMessage.includes('EOF') || errorMessage.includes('connection');
    
    return NextResponse.json(
      { 
        error: 'Failed to submit render job',
        details: errorMessage,
        serverError: isServerError,
        alternatives: isServerError ? [
          'Try exporting as EDL/XML for local editing',
          'Wait for Chillin servers to recover',
          'Contact support@chillin.online'
        ] : undefined
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
      
      // Check if the status indicates server failure
      if (status.error && 
          (status.error.includes('EOF') || 
           status.error.includes('connection') ||
           status.error.includes('server timeout'))) {
        return NextResponse.json({
          success: false,
          renderId,
          status: 'failed',
          error: status.error,
          serverError: true,
          message: 'Render failed due to Chillin server issues. Their render farm is down.',
          alternatives: [
            'Export as EDL/XML for local editing',
            'Wait for server recovery',
            'Contact support@chillin.online'
          ]
        });
      }
      
      return NextResponse.json({
        success: true,
        ...status
      });
    } catch (statusError) {
      console.error('Status check error:', statusError);
      
      // Check for server errors
      if (statusError instanceof Error) {
        const errorMsg = statusError.message;
        
        if (errorMsg.includes('EOF') || 
            errorMsg.includes('connection') ||
            errorMsg.includes('server timeout')) {
          return NextResponse.json({
            success: false,
            renderId,
            status: 'server_error',
            error: 'Chillin render servers are currently down',
            details: errorMsg,
            serverError: true,
            alternatives: [
              'Export your timeline as EDL/XML instead',
              'Try again later when servers recover'
            ]
          });
        }
      }
      
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