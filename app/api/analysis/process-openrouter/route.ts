import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'Video Analysis Tool',
  },
});

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured. Please add OPENROUTER_API_KEY to .env.local' },
        { status: 500 }
      );
    }

    const { videoUrl, videoBase64, prompt, targetDuration } = await request.json();

    if (!videoUrl && !videoBase64) {
      return NextResponse.json(
        { error: 'No video data provided (need either videoUrl or videoBase64)' },
        { status: 400 }
      );
    }

    // Prepare the video content for OpenRouter
    // Note: OpenRouter typically handles images, not full videos
    // For video, you'd usually extract frames or use a video URL
    let videoContent;
    if (videoUrl) {
      // If we have a URL (e.g., from blob storage), use it directly
      videoContent = {
        type: 'image_url' as const,
        image_url: {
          url: videoUrl
        }
      };
    } else {
      // If we have base64, use it (this should be a frame or image, not full video)
      videoContent = {
        type: 'image_url' as const,
        image_url: {
          url: `data:image/jpeg;base64,${videoBase64}`
        }
      };
    }

    const analysisPrompt = `
      Analyze this video frame/image for content that should be REMOVED in a rough cut.
      
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

    console.log('Calling OpenRouter with Gemini 2.5 Pro...');
    
    const completion = await openrouter.chat.completions.create({
      model: 'google/gemini-2.5-pro',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: analysisPrompt
            },
            videoContent
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 8192,
    });

    const responseContent = completion.choices[0].message.content;
    
    // Parse the JSON response
    let analysisResult;
    try {
      // Extract JSON from the response (in case it's wrapped in markdown or text)
      const jsonMatch = responseContent?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else if (responseContent) {
        // Try direct parse if it's already clean JSON
        analysisResult = JSON.parse(responseContent);
      } else {
        throw new Error('No content in response');
      }
    } catch (parseError) {
      console.error('Failed to parse OpenRouter response:', responseContent);
      return NextResponse.json(
        { error: 'Invalid response format from OpenRouter' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis: analysisResult,
      metadata: {
        model: completion.model,
        usage: completion.usage,
        processingTime: Date.now(),
      },
    });

  } catch (error) {
    console.error('OpenRouter analysis error:', error);
    return NextResponse.json(
      { error: `Failed to analyze video: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}