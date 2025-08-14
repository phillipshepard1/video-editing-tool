import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { fileUri, prompt, targetDuration, fileSize } = await request.json();

    if (!fileUri) {
      return NextResponse.json(
        { error: 'No file URI provided' },
        { status: 400 }
      );
    }

    // Always use Gemini 2.5 Pro for best results
    // Files over 500MB should be compressed before uploading
    console.log(`Using Gemini 2.5 Pro for file size: ${fileSize}MB`);
    
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: {
        temperature: 0.5, // Higher temperature for more thorough detection
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        // Removed responseMimeType to test if that's causing issues
      },
    });

    // More aggressive prompt for better detection
    const analysisPrompt = `Carefully analyze this ENTIRE video from start to finish and identify ALL segments that should be removed to create a tighter, more professional edit.

BE VERY THOROUGH - Check every second of the video for:
1. ANY pause or silence longer than 1.5 seconds (mark ALL of them!)
2. Filler words: "um", "uh", "like", "you know", "so", "basically", "actually"
3. False starts where speaker begins a sentence then restarts
4. Repeated words or phrases said multiple times
5. Dead air at beginning or end of video
6. Times when speaker is thinking/searching for words
7. Awkward transitions between topics
8. Redundant explanations or repeated information
9. Off-topic tangents or rambling
10. Technical issues (audio problems, video glitches, etc.)
11. Low energy or mumbling sections
12. Coughs, throat clearing, or other interruptions

IMPORTANT: 
- Scan the ENTIRE video from 0:00 to the very end
- Find EVERY pause over 1.5 seconds, not just a few
- Be aggressive - it's better to mark too many segments than too few
- Each pause should be its own segment entry
- Include timestamps for EVERYTHING you find
- Check EVERY minute of the video thoroughly

${prompt ? `Additional instructions: ${prompt}` : ''}

Return only valid JSON in this format:
{
  "segmentsToRemove": [
    {
      "startTime": "0:05",
      "endTime": "0:08", 
      "duration": 3,
      "reason": "Long pause",
      "category": "pause",
      "confidence": 0.9
    },
    {
      "startTime": "0:15",
      "endTime": "0:17", 
      "duration": 2,
      "reason": "Filler word 'um'",
      "category": "filler",
      "confidence": 0.95
    },
    // ... include ALL segments found, could be 20-50+ segments for a 12 minute video
  ],
  "summary": {
    "originalDuration": 720,
    "finalDuration": 650,
    "timeRemoved": 70,
    "segmentCount": 35
  }
}`;

    const startTime = Date.now();
    
    console.log('Starting Gemini analysis...');
    console.log('File URI:', fileUri);
    console.log('Prompt length:', analysisPrompt.length);

    let result;
    try {
      console.log('Sending request to Gemini API...');
      result = await model.generateContent([
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: fileUri,
          },
        },
        { text: analysisPrompt },
      ]);
      console.log('Gemini API request completed');
    } catch (generateError: any) {
      console.error('Error generating content:', generateError);
      console.error('Error details:', generateError.message);
      console.error('Error stack:', generateError.stack);
      
      // Check for specific error types
      if (generateError.message?.includes('quota')) {
        return NextResponse.json(
          { error: 'API quota exceeded. Please try again later.' },
          { status: 429 }
        );
      }
      
      if (generateError.message?.includes('not found')) {
        return NextResponse.json(
          { error: 'Video file not found or expired. Please upload again.' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to generate content from Gemini API',
          details: generateError.message || 'Unknown error'
        },
        { status: 500 }
      );
    }

    const response = await result.response;
    console.log('Response object received');
    
    // Try to get text in different ways
    let text = '';
    try {
      text = response.text();
    } catch (textError) {
      console.error('Error getting text from response:', textError);
      // Try alternative methods
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts) {
          text = candidate.content.parts.map((part: any) => part.text || '').join('');
        }
      }
    }
    
    console.log('Raw Gemini response:', text);
    console.log('Response length:', text.length);
    console.log('Response candidates:', response.candidates?.length);
    
    // Check if response is empty
    if (!text || text.trim().length === 0) {
      console.error('Empty response from Gemini');
      console.error('Full response object:', JSON.stringify(response, null, 2));
      
      // Check if the response was blocked
      if (response.promptFeedback) {
        console.error('Prompt feedback:', response.promptFeedback);
        if (response.promptFeedback.blockReason) {
          return NextResponse.json(
            { error: `Content blocked: ${response.promptFeedback.blockReason}` },
            { status: 400 }
          );
        }
      }
      
      return NextResponse.json(
        { error: 'Empty response from Gemini API. The video might be too large or in an unsupported format.' },
        { status: 500 }
      );
    }
    
    // Parse the JSON response
    let analysisResult;
    try {
      analysisResult = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', text);
      console.error('Parse error:', parseError);
      
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          analysisResult = JSON.parse(jsonMatch[1]);
          console.log('Successfully parsed JSON from markdown block');
        } catch (secondParseError) {
          return NextResponse.json(
            { 
              error: 'Invalid response format from Gemini',
              details: text.substring(0, 500) + (text.length > 500 ? '...' : '')
            },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { 
            error: 'Invalid response format from Gemini',
            details: text.substring(0, 500) + (text.length > 500 ? '...' : '')
          },
          { status: 500 }
        );
      }
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