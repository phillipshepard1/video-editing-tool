import { NextRequest, NextResponse } from 'next/server';
import { analyzeVideoWithTakes } from '@/lib/services/gemini';

export async function POST(request: NextRequest) {
  try {
    const { fileUri, supabaseUrl, prompt, targetDuration } = await request.json();

    // Accept either Gemini fileUri or Supabase URL as fallback
    if (!fileUri && !supabaseUrl) {
      return NextResponse.json(
        { error: 'No file URI or URL provided' },
        { status: 400 }
      );
    }
    
    // If only Supabase URL available, skip enhanced analysis
    if (!fileUri && supabaseUrl) {
      console.log('No Gemini URI available, skipping enhanced analysis');
      return NextResponse.json(
        { 
          error: 'Enhanced analysis requires Gemini file upload',
          fallbackAvailable: true,
          message: 'File too large for enhanced analysis. Using standard analysis instead.'
        },
        { status: 422 }
      );
    }

    console.log('Starting enhanced analysis with take detection...');
    console.log('File URI:', fileUri);

    const startTime = Date.now();
    
    try {
      const enhancedResult = await analyzeVideoWithTakes(fileUri, prompt, targetDuration);
      
      console.log('Enhanced analysis completed');
      console.log('Content groups found:', enhancedResult.contentGroups?.length || 0);
      console.log('Total takes analyzed:', enhancedResult.summary?.takesAnalyzed || 0);

      const processingTime = Date.now() - startTime;

      return NextResponse.json({
        success: true,
        analysis: enhancedResult,
        metadata: {
          processingTime,
          analysisType: 'enhanced-takes',
          ...enhancedResult.metadata
        },
      });

    } catch (analysisError: any) {
      console.error('Enhanced analysis error:', analysisError);
      
      // Check for specific error types
      if (analysisError.message?.includes('quota')) {
        return NextResponse.json(
          { error: 'API quota exceeded. Please try again later.' },
          { status: 429 }
        );
      }
      
      if (analysisError.message?.includes('not found')) {
        return NextResponse.json(
          { error: 'Video file not found or expired. Please upload again.' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to analyze video with take detection',
          details: analysisError.message || 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Enhanced analysis route error:', error);
    return NextResponse.json(
      { error: 'Failed to process enhanced analysis request' },
      { status: 500 }
    );
  }
}