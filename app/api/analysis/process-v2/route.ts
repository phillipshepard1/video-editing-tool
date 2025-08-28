import { NextRequest, NextResponse } from 'next/server';
import { analyzeVideoV2, uploadVideoToGeminiV2, getFileStatusV2, deleteFileV2 } from '@/lib/services/gemini-v2';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 V2 Analysis API endpoint hit');
    
    const formData = await request.formData();
    const file = formData.get('video') as File;
    const customInstructions = formData.get('customInstructions') as string;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      );
    }

    console.log(`📹 Processing video: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    console.log(`📝 Custom instructions: ${customInstructions || 'None provided'}`);

    // Step 1: Upload video to Gemini
    console.log('⬆️ Uploading video to Gemini...');
    const fileUri = await uploadVideoToGeminiV2(file);
    console.log(`✅ Video uploaded with URI: ${fileUri}`);

    // Step 2: Wait for file to be processed
    console.log('⏳ Waiting for Gemini to process video...');
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max
    
    while (attempts < maxAttempts) {
      try {
        const status = await getFileStatusV2(fileUri);
        console.log(`📊 File status: ${status.state} (attempt ${attempts + 1})`);
        
        if (status.state === 'ACTIVE') {
          console.log('✅ File is ready for analysis');
          break;
        }
        
        if (status.state === 'FAILED') {
          throw new Error('File processing failed on Gemini side');
        }
        
        // Wait 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
        attempts++;
      } catch (error) {
        console.log(`⚠️ Status check failed (attempt ${attempts + 1}):`, error);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    if (attempts >= maxAttempts) {
      throw new Error('Timeout waiting for file processing');
    }

    // Step 3: Analyze video with V2 prompt
    console.log('🔍 Starting V2 analysis with enhanced flubbed-takes detection...');
    const startTime = Date.now();
    
    const analysisResult = await analyzeVideoV2(fileUri, customInstructions);
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ V2 Analysis complete in ${processingTime}ms`);
    console.log(`📊 Results: ${analysisResult.editingErrors.length} editing errors, ${analysisResult.extendedSilences.length} silences`);

    // Step 4: Cleanup - delete file from Gemini
    try {
      await deleteFileV2(fileUri);
      console.log('🗑️ Cleanup: File deleted from Gemini');
    } catch (error) {
      console.warn('⚠️ Warning: Failed to delete file from Gemini:', error);
    }

    // Step 5: Return enhanced results
    const response = {
      success: true,
      version: 'v2.0-flubbed-takes',
      data: analysisResult,
      processing: {
        uploadTime: 'included in total',
        analysisTime: processingTime,
        totalTime: Date.now() - startTime,
      },
      summary: {
        editingErrorsFound: analysisResult.editingErrors.length,
        silencesFound: analysisResult.extendedSilences.length,
        estimatedTimeSavings: `${analysisResult.summary.totalTimeToRemove}s`,
        confidenceRange: {
          min: Math.min(
            ...analysisResult.editingErrors.map(e => e.confidence),
            ...analysisResult.extendedSilences.map(s => s.confidence)
          ),
          max: Math.max(
            ...analysisResult.editingErrors.map(e => e.confidence),
            ...analysisResult.extendedSilences.map(s => s.confidence)
          )
        }
      }
    };

    console.log('🎉 V2 Analysis API response ready');
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ V2 Analysis API Error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        version: 'v2.0-flubbed-takes',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}