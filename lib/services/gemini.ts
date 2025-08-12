import { GoogleGenerativeAI } from '@google/generative-ai';

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