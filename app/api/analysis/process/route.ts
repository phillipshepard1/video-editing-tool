import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { fileUri, prompt, targetDuration } = await request.json();

    if (!fileUri) {
      return NextResponse.json(
        { error: 'No file URI provided' },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro', // Using Gemini 2.5 Pro for best quality analysis
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const analysisPrompt = `
      Analyze this video for content that should be REMOVED in a rough cut.
      
      Focus on identifying:
      1. PAUSES & DEAD AIR
         - Silence longer than 2 seconds
         - "Um", "uh", filler words with long pauses
         - Technical delays or setup time
         
      2. REDUNDANT CONTENT
         - Repeated explanations
         - Restated points without new information
         - Multiple takes of the same content
         
      3. OFF-TOPIC SEGMENTS
         - Tangential discussions
         - Interruptions or distractions
         - Content unrelated to main narrative
      
      4. TECHNICAL ISSUES
         - Audio problems
         - Video glitches
         - Out-of-focus segments
      
      ${targetDuration ? `Target final duration: ${targetDuration} minutes` : ''}
      
      Additional instructions: ${prompt || 'None'}
      
      Return a JSON object with this EXACT structure:
      {
        "segmentsToRemove": [
          {
            "startTime": "MM:SS",
            "endTime": "MM:SS",
            "duration": number (in seconds),
            "reason": "specific explanation",
            "category": "pause" or "filler" or "redundant" or "off-topic" or "technical",
            "confidence": 0.0 to 1.0
          }
        ],
        "summary": {
          "originalDuration": number (total video duration in seconds),
          "finalDuration": number (duration after cuts in seconds),
          "timeRemoved": number (total time removed in seconds),
          "segmentCount": number (total segments to remove)
        }
      }
    `;

    const startTime = Date.now();

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: fileUri,
        },
      },
      { text: analysisPrompt },
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Parse the JSON response
    let analysisResult;
    try {
      analysisResult = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', text);
      return NextResponse.json(
        { error: 'Invalid response format from Gemini' },
        { status: 500 }
      );
    }

    const processingTime = Date.now() - startTime;
    const tokenCount = response.usageMetadata?.totalTokenCount || 0;
    const estimatedCost = (tokenCount / 1000000) * 0.075; // Approximate cost

    return NextResponse.json({
      success: true,
      analysis: analysisResult,
      metadata: {
        processingTime,
        tokenCount,
        estimatedCost,
      },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze video' },
      { status: 500 }
    );
  }
}