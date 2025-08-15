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

    // Enhanced categorization prompt for sophisticated segment analysis
    const analysisPrompt = `Carefully analyze this ENTIRE video from start to finish and identify ALL segments that should be removed to create a tighter, more professional edit.

CATEGORIZATION SYSTEM - Use these EXACT category values (NO OTHER VALUES ALLOWED):
- "bad_take": Multiple attempts where this one is clearly worse (include alternativeSegment reference)
- "pause": Silence longer than 2 seconds (NOT "dead_air") 
- "false_start": Incomplete thoughts, restarts
- "filler_words": Excessive "um", "uh", "like", "you know", "so", "basically", "actually" (NOT "filler")
- "technical": Audio/video issues, glitches, technical problems
- "redundant": Repeated information already covered
- "tangent": Off-topic content that doesn't serve the main message (NOT "off_topic" or "off-topic")
- "low_energy": Noticeably quieter delivery, mumbling, low enthusiasm
- "long_explanation": Extended sections that could be condensed
- "weak_transition": Awkward topic changes, poor flow between ideas

CRITICAL: Only use the exact strings above. Do not use "off_topic", "filler", "dead_air" or any other variations.

ANALYSIS REQUIREMENTS:
- Scan the ENTIRE video from 0:00 to the very end
- Find EVERY pause over 2 seconds, not just a few
- Include the first 50 characters of spoken content as "transcript"
- Assign severity: "high" (definitely remove), "medium" (probably remove), "low" (consider keeping)
- Provide contextNote explaining why this segment might be kept or removed
- For "bad_take" category, include alternativeSegment reference to better version
- Be thorough but thoughtful - quality over quantity

SEVERITY GUIDELINES:
- HIGH: Clear issues that hurt video quality (long pauses, technical problems, bad takes)
- MEDIUM: Content that could be improved but isn't terrible (some filler words, minor redundancy)
- LOW: Borderline cases where removal might hurt flow (brief pauses, stylistic choices)

${prompt ? `Additional instructions: ${prompt}` : ''}

Return only valid JSON in this format:
{
  "segmentsToRemove": [
    {
      "startTime": "0:05",
      "endTime": "0:08", 
      "duration": 3,
      "reason": "Long uncomfortable pause",
      "category": "pause",
      "severity": "high",
      "confidence": 0.95,
      "transcript": "So... [long pause] ...what I want to say is",
      "contextNote": "Pause disrupts flow and adds no value"
    },
    {
      "startTime": "0:15",
      "endTime": "0:17", 
      "duration": 2,
      "reason": "Multiple filler words in succession",
      "category": "filler_words",
      "severity": "medium", 
      "confidence": 0.85,
      "transcript": "Um, uh, like, you know what I mean?",
      "contextNote": "Could be cleaned up but doesn't completely break flow"
    },
    {
      "startTime": "2:30",
      "endTime": "2:45", 
      "duration": 15,
      "reason": "This attempt was clearly worse than the previous take",
      "category": "bad_take",
      "severity": "high",
      "confidence": 0.90,
      "transcript": "Let me... no wait... actually let me start over",
      "contextNote": "Speaker self-corrects, indicating this wasn't the intended delivery",
      "alternativeSegment": {
        "startTime": "2:50",
        "endTime": "3:05",
        "reason": "Cleaner delivery of the same content"
      }
    }
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

    // Enhance segments with required fields for UI compatibility
    if (analysisResult?.segmentsToRemove) {
      analysisResult.segmentsToRemove = analysisResult.segmentsToRemove.map((segment: any, index: number) => {
        // Normalize legacy category names to proper enum values
        let normalizedCategory = segment.category;
        if (segment.category === 'off_topic' || segment.category === 'off-topic') {
          normalizedCategory = 'tangent';
        } else if (segment.category === 'filler') {
          normalizedCategory = 'filler_words';
        } else if (segment.category === 'dead_air') {
          normalizedCategory = 'pause';
        }
        
        return {
          ...segment,
          id: `segment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`, // Add unique ID
          selected: true, // Default to selected for removal
          category: normalizedCategory, // Use normalized category
          // Ensure all enhanced fields are present with defaults
          severity: segment.severity || 'medium',
          transcript: segment.transcript || '',
          contextNote: segment.contextNote || '',
          alternativeSegment: segment.alternativeSegment || undefined
        };
      });
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