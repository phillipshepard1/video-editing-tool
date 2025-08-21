import { NextRequest, NextResponse } from 'next/server';
import { 
  submitShotstackRender, 
  checkShotstackRender
} from '@/lib/services/shotstack-v2';
import { checkShotstackHealth } from '@/lib/services/shotstack';
import { EnhancedSegment } from '@/lib/types/segments';

/**
 * POST /api/render/shotstack - Submit render job
 */
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
      quality 
    } = body;

    // Validate required fields
    if (!videoUrl || !segmentsToRemove || !videoDuration) {
      return NextResponse.json(
        { error: 'Missing required fields: videoUrl, segmentsToRemove, or videoDuration' },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.SHOTSTACK_API_KEY;
    if (!apiKey) {
      console.error('SHOTSTACK_API_KEY not configured');
      return NextResponse.json(
        { 
          error: 'Shotstack API not configured',
          details: 'Please add SHOTSTACK_API_KEY to environment variables',
          setupUrl: 'https://dashboard.shotstack.io/register'
        },
        { status: 500 }
      );
    }

    console.log('Processing Shotstack render request:', {
      videoUrl,
      segments: segmentsToRemove.length,
      duration: videoDuration,
      dimensions: `${videoWidth || 1920}x${videoHeight || 1080}`,
      quality: quality || 'high'
    });

    // Submit the render job using v2 implementation
    const renderResponse = await submitShotstackRender(
      videoUrl,
      segmentsToRemove as EnhancedSegment[],
      videoDuration,
      apiKey,
      process.env.SHOTSTACK_ENV || 'v1'
    );

    if (!renderResponse.success || !renderResponse.response?.id) {
      console.error('Shotstack submission failed:', renderResponse);
      return NextResponse.json(
        { 
          error: 'Failed to submit render job',
          details: renderResponse.message || 'No render ID returned'
        },
        { status: 500 }
      );
    }

    console.log('Shotstack render submitted successfully:', {
      renderId: renderResponse.response.id,
      status: renderResponse.response.status
    });

    return NextResponse.json({
      success: true,
      renderId: renderResponse.response.id,
      status: renderResponse.response.status,
      message: 'Render job submitted successfully to Shotstack'
    });

  } catch (error) {
    console.error('Shotstack render error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: 'Failed to submit render job',
        details: errorMessage,
        recommendation: errorMessage.includes('401') 
          ? 'Check your Shotstack API key' 
          : 'Check your video URL is publicly accessible'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/render/shotstack?renderId=xxx - Check render status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const renderId = searchParams.get('renderId');
    const health = searchParams.get('health');

    // Health check endpoint
    if (health === 'true') {
      const apiKey = process.env.SHOTSTACK_API_KEY;
      if (!apiKey) {
        return NextResponse.json({
          healthy: false,
          message: 'SHOTSTACK_API_KEY not configured'
        });
      }

      const healthStatus = await checkShotstackHealth(apiKey);
      return NextResponse.json(healthStatus);
    }

    // Render status check
    if (!renderId) {
      return NextResponse.json(
        { error: 'Missing renderId parameter' },
        { status: 400 }
      );
    }

    const apiKey = process.env.SHOTSTACK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Shotstack API not configured' },
        { status: 500 }
      );
    }

    const statusResponse = await checkShotstackRender(renderId, apiKey, process.env.SHOTSTACK_ENV || 'v1');

    if (!statusResponse.success || !statusResponse.response) {
      return NextResponse.json({
        success: false,
        error: statusResponse.message || 'Failed to get status'
      });
    }

    const status = statusResponse.response;

    // Map Shotstack status to our format
    let mappedStatus: 'queued' | 'processing' | 'completed' | 'failed';
    
    switch (status.status) {
      case 'queued':
      case 'fetching':
        mappedStatus = 'queued';
        break;
      case 'rendering':
      case 'saving':
        mappedStatus = 'processing';
        break;
      case 'done':
        mappedStatus = 'completed';
        break;
      case 'failed':
        mappedStatus = 'failed';
        break;
      default:
        mappedStatus = 'processing';
    }

    // Calculate progress percentage
    let progress = 0;
    switch (status.status) {
      case 'queued': progress = 5; break;
      case 'fetching': progress = 10; break;
      case 'rendering': progress = 50; break;
      case 'saving': progress = 90; break;
      case 'done': progress = 100; break;
      case 'failed': progress = 0; break;
    }

    return NextResponse.json({
      success: true,
      renderId,
      status: mappedStatus,
      outputUrl: status.url || undefined,
      thumbnailUrl: status.thumbnail || undefined,
      posterUrl: status.poster || undefined,
      progress,
      duration: status.duration,
      renderTime: status.render_time,
      error: status.error || undefined,
      originalStatus: status.status // Include original Shotstack status
    });

  } catch (error) {
    console.error('Error checking Shotstack render status:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to check render status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}