import { NextRequest, NextResponse } from 'next/server';
import { 
  renderVideoWithOptimalQuality, 
  assessVideoQuality,
  QUALITY_PRESETS,
  RenderQualityOptions
} from '@/lib/services/chillin';
import { EnhancedSegment } from '@/lib/types/segments';

interface EnhancedRenderRequest {
  videoUrl: string;
  videoDuration: number;
  videoInfo: {
    width: number;
    height: number;
    fps: number;
    bitrate?: number;
  };
  segmentsToRemove: EnhancedSegment[];
  qualityPreference?: 'speed' | 'balanced' | 'quality';
  customQualityOptions?: RenderQualityOptions;
}

export async function POST(request: NextRequest) {
  try {
    const body: EnhancedRenderRequest = await request.json();
    
    const {
      videoUrl,
      videoDuration,
      videoInfo,
      segmentsToRemove,
      qualityPreference = 'quality',
      customQualityOptions
    } = body;

    // Validate required fields
    if (!videoUrl || !videoDuration || !videoInfo || !segmentsToRemove) {
      return NextResponse.json(
        { error: 'Missing required fields: videoUrl, videoDuration, videoInfo, or segmentsToRemove' },
        { status: 400 }
      );
    }

    const chillinApiKey = process.env.CHILLIN_API_KEY;
    if (!chillinApiKey) {
      return NextResponse.json(
        { error: 'Chillin API key not configured' },
        { status: 500 }
      );
    }

    console.log('Enhanced render request:');
    console.log(`- Video: ${videoUrl}`);
    console.log(`- Duration: ${videoDuration}s`);
    console.log(`- Resolution: ${videoInfo.width}x${videoInfo.height}@${videoInfo.fps}fps`);
    console.log(`- Segments to remove: ${segmentsToRemove.length}`);
    console.log(`- Quality preference: ${qualityPreference}`);
    
    // Assess video quality and provide recommendations
    const qualityAssessment = assessVideoQuality(
      videoInfo.width,
      videoInfo.height,
      videoInfo.bitrate || 0
    );
    
    console.log('Quality assessment:', qualityAssessment);
    
    // Start render with optimal quality settings
    const renderStartTime = Date.now();
    
    try {
      const renderResult = await renderVideoWithOptimalQuality(
        videoUrl,
        segmentsToRemove,
        videoDuration,
        {
          width: videoInfo.width,
          height: videoInfo.height,
          fps: videoInfo.fps
        },
        chillinApiKey,
        qualityPreference
      );
      
      const renderTime = Date.now() - renderStartTime;
      
      console.log(`Render submission completed in ${renderTime}ms`);
      console.log('Render result:', renderResult);
      
      return NextResponse.json({
        success: true,
        renderResult,
        qualityAssessment,
        recommendedSettings: {
          quality: qualityAssessment.recommendedRenderQuality,
          shouldUpscale: qualityAssessment.shouldUpscale,
          estimatedTime: qualityAssessment.estimatedRenderTime
        },
        renderTime,
        availablePresets: QUALITY_PRESETS
      });
      
    } catch (renderError) {
      console.error('Render submission failed:', renderError);
      
      return NextResponse.json(
        {
          error: 'Render submission failed',
          details: renderError instanceof Error ? renderError.message : String(renderError),
          qualityAssessment,
          suggestions: [
            'Try reducing the quality preset',
            'Consider shorter video duration',
            'Check if video URL is accessible',
            'Verify segments are properly formatted'
          ]
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Enhanced render API error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve quality presets and recommendations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const width = parseInt(searchParams.get('width') || '1920');
    const height = parseInt(searchParams.get('height') || '1080');
    const bitrate = parseInt(searchParams.get('bitrate') || '0');
    
    const qualityAssessment = assessVideoQuality(width, height, bitrate);
    
    return NextResponse.json({
      qualityPresets: QUALITY_PRESETS,
      assessment: qualityAssessment,
      recommendations: {
        speed: {
          quality: 'medium',
          description: 'Fast render, good for previews',
          estimatedTime: '50% of balanced'
        },
        balanced: {
          quality: 'high',
          description: 'Good balance of quality and speed',
          estimatedTime: qualityAssessment.estimatedRenderTime
        },
        quality: {
          quality: qualityAssessment.recommendedRenderQuality,
          description: 'Best possible quality, slower render',
          estimatedTime: '150% of balanced'
        }
      }
    });
    
  } catch (error) {
    console.error('Quality info API error:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to get quality information',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
