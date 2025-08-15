import { GoogleGenerativeAI } from '@google/generative-ai';
import { ContentGroup, Take, EnhancedAnalysisResult } from '@/lib/types/takes';

// Initialize Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface VideoSegment {
  startTime: string; // "MM:SS" format
  endTime: string;
  duration: number; // in seconds
  reason: string;
  category: 'pause' | 'filler' | 'redundant' | 'off-topic' | 'technical';
  confidence: number; // 0-1
}

export interface AnalysisResult {
  segmentsToRemove: VideoSegment[];
  summary: {
    originalDuration: number;
    finalDuration: number;
    timeRemoved: number;
    segmentCount: number;
  };
  metadata: {
    processingTime: number;
    tokenCount: number;
    estimatedCost: number;
  };
}

// Upload video file to Gemini
export async function uploadVideoToGemini(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload video: ${error}`);
  }

  const result = await response.json();
  return result.file.uri;
}

// Analyze video and get timestamps to remove
export async function analyzeVideo(
  fileUri: string,
  prompt: string,
  targetDuration?: number
): Promise<AnalysisResult> {
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
    
    For EACH segment to remove, provide a JSON array with objects containing:
    {
      "startTime": "MM:SS",
      "endTime": "MM:SS",
      "duration": number (in seconds),
      "reason": "specific explanation",
      "category": "pause" or "filler" or "redundant" or "off-topic" or "technical",
      "confidence": 0.0-1.0
    }
    
    Additional custom instructions:
    ${prompt}
    
    Return ONLY a valid JSON object with this structure:
    {
      "segmentsToRemove": [...array of segments...],
      "summary": {
        "originalDuration": number,
        "finalDuration": number,
        "timeRemoved": number,
        "segmentCount": number
      }
    }
  `;

  const startTime = Date.now();

  try {
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
    const parsed = JSON.parse(text);

    const processingTime = Date.now() - startTime;
    const tokenCount = response.usageMetadata?.totalTokenCount || 0;
    const estimatedCost = calculateCost(tokenCount);

    return {
      ...parsed,
      metadata: {
        processingTime,
        tokenCount,
        estimatedCost,
      },
    };
  } catch (error) {
    console.error('Analysis error:', error);
    throw new Error('Failed to analyze video');
  }
}

// Calculate estimated cost based on token usage
function calculateCost(tokenCount: number): number {
  // Gemini 2.5 Pro pricing (approximate)
  // Input: $1.25 per 1M tokens
  // Output: $5.00 per 1M tokens
  // Using average for estimation
  const costPerMillion = 3.125; // Average of input/output
  return (tokenCount / 1000000) * costPerMillion;
}

// Get file status
export async function getFileStatus(fileUri: string): Promise<any> {
  const fileId = fileUri.split('/').pop();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${process.env.GEMINI_API_KEY}`
  );

  if (!response.ok) {
    throw new Error('Failed to get file status');
  }

  return response.json();
}

// Enhanced analysis with content grouping and take quality assessment
export async function analyzeVideoWithTakes(
  fileUri: string,
  prompt: string,
  targetDuration?: number
): Promise<EnhancedAnalysisResult> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    generationConfig: {
      temperature: 0.2, // Lower temperature for more consistent quality scoring
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 16384, // More tokens for detailed analysis
      responseMimeType: 'application/json',
    },
  });

  const enhancedPrompt = `
    Analyze this talking head video with DEEP FOCUS on identifying multiple takes of the same content and rating their quality.
    
    PRIMARY OBJECTIVES:
    1. IDENTIFY CONTENT GROUPS: Look for segments where the speaker attempts the same content multiple times
    2. QUALITY ASSESSMENT: Rate each take on a 1-10 scale considering delivery, clarity, confidence, and completeness
    3. BEST TAKE SELECTION: Choose the highest quality version of each content group
    4. DETAILED REASONING: Explain why one take is better than others
    
    ANALYSIS CRITERIA FOR TAKES:
    
    QUALITY FACTORS (Rate 1-10):
    - Delivery Clarity: Clear speech, good pace, no stumbling
    - Confidence: Speaker sounds assured and authoritative  
    - Content Completeness: Full thought expressed without cutoffs
    - Audio Quality: Clear audio without technical issues
    - Energy Level: Appropriate energy for the content
    - Naturalness: Flows naturally without seeming forced
    
    CONTENT GROUPING INDICATORS:
    - False starts followed by retry attempts
    - Repeated phrases or explanations
    - Similar content with slight variations
    - "Let me try that again" or similar restart cues
    - Multiple approaches to explaining the same concept
    
    ISSUES TO IDENTIFY:
    - audio_quality: Background noise, unclear audio, levels
    - delivery: Stumbling, unclear speech, pace problems
    - content: Incomplete thoughts, factual errors, unclear explanations
    - technical: Video/audio glitches, lighting issues
    - pacing: Too fast, too slow, awkward pauses
    - energy: Low energy, monotone, lack of enthusiasm
    
    POSITIVE QUALITIES TO IDENTIFY:
    - clear_delivery: Crisp, well-paced speech
    - good_pace: Natural rhythm and timing
    - confident_tone: Assured, authoritative delivery
    - complete_thought: Full, coherent explanations
    - good_audio: Clear, professional audio quality
    
    ${targetDuration ? `Target final duration: ${targetDuration} minutes` : ''}
    
    Additional instructions: ${prompt}
    
    Return ONLY a valid JSON object with this EXACT structure:
    {
      "segments": [
        // Traditional segments to remove (existing format)
        {
          "startTime": "MM:SS",
          "endTime": "MM:SS", 
          "duration": number,
          "reason": "string",
          "category": "pause|filler|redundant|off-topic|technical",
          "confidence": 0.0-1.0
        }
      ],
      "contentGroups": [
        {
          "id": "group-1",
          "name": "Introduction Attempts",
          "description": "Multiple attempts at opening statement",
          "takes": [
            {
              "id": "take-1",
              "startTime": "MM:SS",
              "endTime": "MM:SS",
              "duration": number,
              "transcript": "First 100 chars of what was said...",
              "qualityScore": 1-10,
              "issues": [
                {
                  "type": "delivery|audio_quality|content|technical|pacing|energy",
                  "severity": "low|medium|high", 
                  "description": "Specific issue description"
                }
              ],
              "qualities": [
                {
                  "type": "clear_delivery|good_pace|confident_tone|complete_thought|good_audio",
                  "description": "Specific quality description"
                }
              ],
              "confidence": 0.0-1.0
            }
          ],
          "bestTakeId": "take-id",
          "reasoning": "Detailed explanation of why this take is best",
          "contentType": "introduction|explanation|conclusion|transition|key_point|general",
          "timeRange": {"start": "MM:SS", "end": "MM:SS"},
          "averageQuality": number,
          "confidence": 0.0-1.0
        }
      ],
      "summary": {
        "originalDuration": number,
        "finalDuration": number, 
        "timeRemoved": number,
        "segmentCount": number,
        "groupCount": number,
        "takesAnalyzed": number,
        "averageQualityImprovement": number
      }
    }
    
    CRITICAL: Focus heavily on finding multiple takes of the same content. Look for patterns where speakers restart, rephrase, or re-attempt explanations. Rate each attempt's quality objectively and choose the best version.
  `;

  const startTime = Date.now();

  try {
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: fileUri,
        },
      },
      { text: enhancedPrompt },
    ]);

    const response = await result.response;
    const text = response.text();
    const parsed = JSON.parse(text);

    const processingTime = Date.now() - startTime;
    const tokenCount = response.usageMetadata?.totalTokenCount || 0;
    const estimatedCost = calculateCost(tokenCount);

    return {
      ...parsed,
      metadata: {
        processingTime,
        tokenCount,
        estimatedCost,
        analysisVersion: 'enhanced-v1.0',
      },
    };
  } catch (error) {
    console.error('Enhanced analysis error:', error);
    throw new Error('Failed to analyze video with take detection');
  }
}

// Delete file from Gemini (cleanup)
export async function deleteFile(fileUri: string): Promise<void> {
  const fileId = fileUri.split('/').pop();
  await fetch(
    `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'DELETE',
    }
  );
}