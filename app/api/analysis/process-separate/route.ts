import { NextRequest, NextResponse } from 'next/server';
import { analyzeVideoForClusters, analyzeVideoForSilence } from '@/lib/services/gemini';

export async function POST(request: NextRequest) {
  try {
    const { fileUri, analysisType } = await request.json();

    if (!fileUri) {
      return NextResponse.json(
        { error: 'No file URI provided' },
        { status: 400 }
      );
    }

    if (!analysisType || !['clusters', 'silence', 'both'].includes(analysisType)) {
      return NextResponse.json(
        { error: 'Invalid analysis type. Must be "clusters", "silence", or "both"' },
        { status: 400 }
      );
    }

    console.log(`Starting ${analysisType} analysis...`);

    try {
      let result;

      if (analysisType === 'clusters') {
        // Analyze only for clusters
        result = await analyzeVideoForClusters(fileUri);
      } else if (analysisType === 'silence') {
        // Analyze only for silence
        result = await analyzeVideoForSilence(fileUri);
      } else {
        // Analyze both in parallel
        const [clusterResult, silenceResult] = await Promise.all([
          analyzeVideoForClusters(fileUri),
          analyzeVideoForSilence(fileUri)
        ]);

        result = {
          clusters: clusterResult,
          silence: silenceResult,
          combined: {
            contentGroups: clusterResult.contentGroups,
            segments: silenceResult.segments,
            metadata: {
              clusterAnalysis: clusterResult.metadata,
              silenceAnalysis: silenceResult.metadata,
              totalProcessingTime: 
                clusterResult.metadata.processingTime + silenceResult.metadata.processingTime,
              totalCost: 
                clusterResult.metadata.estimatedCost + silenceResult.metadata.estimatedCost
            }
          }
        };
      }

      return NextResponse.json({
        success: true,
        analysisType,
        result
      });

    } catch (analysisError: any) {
      console.error('Separate analysis error:', analysisError);
      
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
          error: `Failed to perform ${analysisType} analysis`,
          details: analysisError.message || 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Process-separate route error:', error);
    return NextResponse.json(
      { error: 'Failed to process separate analysis request' },
      { status: 500 }
    );
  }
}