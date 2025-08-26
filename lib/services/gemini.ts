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

  const simplifiedPrompt = `
    Analyze this video for exactly TWO things:

    1. REPEATED CONTENT CLUSTERS (within 45-second windows):
       - Find segments where the speaker says SIMILAR OR IDENTICAL content multiple times
       - Look for these specific patterns:
         * False starts: speaker begins, stops, then restarts with same content
         * Retakes: "let's redo that", "do that again", "let me try that again"
         * Repeated phrases: speaker repeats the same words/sentences
         * Multiple attempts: trying to explain the same concept differently
       - ONLY group segments that contain actually similar content/words
       - Group ONLY if attempts occur within 45 seconds of each other
       - Do NOT group just because segments are close in time
       - Include brief transcript of what was said (first 50 characters)
       - DO NOT rank quality or pick winners - user will decide
       - IMPORTANT: For timeRange, use the EARLIEST start time and LATEST end time of the actual takes in the cluster (tight boundaries only)

    2. SILENCE DETECTION:
       - Mark every silence/pause longer than 2 seconds
       - Be precise about start and end timestamps
       - Include both dead air and long pauses between words

    Return ONLY a valid JSON object with this EXACT structure:
    {
      "segments": [
        {
          "startTime": "MM:SS",
          "endTime": "MM:SS", 
          "duration": number,
          "reason": "X-second silence",
          "category": "silence",
          "confidence": 0.0-1.0
        }
      ],
      "contentGroups": [
        {
          "id": "cluster-X",
          "name": "Brief description of content",
          "description": "What the speaker is trying to say",
          "takes": [
            {
              "id": "take-X",
              "startTime": "MM:SS",
              "endTime": "MM:SS",
              "duration": number,
              "transcript": "First 50 chars of what was said...",
              "qualityScore": 0,
              "issues": [],
              "qualities": [],
              "confidence": 0.0-1.0
            }
          ],
          "bestTakeId": "",
          "reasoning": "",
          "contentType": "general",
          "timeRange": {"start": "MM:SS", "end": "MM:SS"},
          "averageQuality": 0,
          "confidence": 0.0-1.0
        }
      ],
      "summary": {
        "originalDuration": number,
        "finalDuration": number, 
        "timeRemoved": 0,
        "segmentCount": number,
        "groupCount": number,
        "takesAnalyzed": number,
        "averageQualityImprovement": 0
      }
    }

    CRITICAL INSTRUCTIONS for timeRange and timestamps:
    - timeRange.start = earliest startTime of any take in this cluster
    - timeRange.end = latest endTime of any take in this cluster
    - Do NOT extend timeRange beyond actual take boundaries
    - Each cluster should have tight, precise boundaries around actual content
    - Use ONLY MM:SS format for ALL timestamps (e.g., "01:23" not "83" or "01:23.00")
    - Be consistent - don't mix seconds and MM:SS formats
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
      { text: simplifiedPrompt },
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