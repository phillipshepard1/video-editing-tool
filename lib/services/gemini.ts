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

// Enhanced timestamp parsing for better accuracy
export function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  
  // Remove any whitespace
  timeStr = timeStr.trim();
  
  // Handle decimal seconds format (MM:SS.S)
  if (timeStr.includes('.')) {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      // MM:SS.S format
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    } else if (parts.length === 3) {
      // HH:MM:SS.S format
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const seconds = parseFloat(parts[2]) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
  }
  
  // Handle standard formats
  const parts = timeStr.split(':');
  
  if (parts.length === 2) {
    // MM:SS format
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // Could be HH:MM:SS or MM:SS:FF (frames)
    const first = parseInt(parts[0]) || 0;
    const second = parseInt(parts[1]) || 0;
    const third = parseFloat(parts[2]) || 0;
    
    // If first number is >= 60, it's likely seconds, not minutes
    // This handles edge cases like "83:45" which should be 83 seconds + 45 frames
    if (first >= 60) {
      // Treat as seconds:frames
      return first + (second / 30); // Assuming 30fps
    }
    
    // If third number is > 60, it's frames
    if (third > 60) {
      // MM:SS:FF format
      return first * 60 + second + (third / 30); // Convert frames to seconds (30fps)
    }
    
    // Standard HH:MM:SS or MM:SS:FF
    if (first < 24) {
      // Likely MM:SS:FF for short videos
      return first * 60 + second + (third / 100); // Centiseconds
    }
    
    // HH:MM:SS for longer videos
    return first * 3600 + second * 60 + third;
  }
  
  // Simple number format
  return parseFloat(timeStr) || 0;
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

// Analyze video for content clusters (multiple takes)
export async function analyzeVideoForClusters(
  fileUri: string
): Promise<{ contentGroups: ContentGroup[], metadata: any }> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    generationConfig: {
      temperature: 0.3, // Slightly higher for better understanding
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  const clusterPrompt = `
    TASK: Find ALL instances where someone attempts to deliver the same content multiple times (multiple "takes").
    
    WHAT TO LOOK FOR:
    1. FALSE STARTS: Speaker begins, then stops and restarts the same topic
       Example: "Today we're going to... actually, let me start over. Today we're discussing..."
    
    2. MULTIPLE ATTEMPTS: Same information delivered 2+ times with variations
       Example: First take: "The API allows you to..." (stumbles)
                Second take: "The API enables developers to..." (clearer)
    
    3. RETAKES INDICATORS: Look for verbal cues like:
       - "Let me try that again"
       - "Actually, wait"
       - "Sorry, let me rephrase"
       - "OK, take two"
       - Sudden stops followed by restarts
    
    4. CONTENT REPETITION: Same core message with different wording
       - Must be within 2 minutes of each other
       - Look for similar intent even if words differ
    
    ANALYSIS INSTRUCTIONS:
    - Scan the ENTIRE video from start to finish
    - Pay special attention to the first 2 minutes (often has most retakes)
    - Group all attempts at the same content into ONE cluster
    - Include partial attempts, not just complete ones
    - Capture the actual spoken words in transcript field (first 150 chars)
    
    CRITICAL RULES:
    - Each cluster = one piece of content with multiple attempts
    - Takes within a cluster should be attempts at the SAME message
    - If no clusters found, return empty contentGroups array
    - Be thorough - don't miss subtle retakes
    
    Return ONLY a valid JSON object with this EXACT structure:
    {
      "contentGroups": [
        {
          "id": "cluster-1",
          "name": "Brief description of what they're trying to say",
          "description": "More detailed description of the content",
          "takes": [
            {
              "id": "take-1",
              "startTime": "00:08",
              "endTime": "00:29",
              "duration": 21,
              "transcript": "First 100 chars of what was said...",
              "qualityScore": 0,
              "issues": ["stumbling", "unclear"],
              "qualities": [],
              "confidence": 0.9
            },
            {
              "id": "take-2",
              "startTime": "00:32",
              "endTime": "00:53",
              "duration": 21,
              "transcript": "First 100 chars of what was said...",
              "qualityScore": 0,
              "issues": [],
              "qualities": ["clear", "complete"],
              "confidence": 0.9
            }
          ],
          "bestTakeId": "",
          "reasoning": "User will select best take",
          "contentType": "general",
          "timeRange": {"start": "00:08", "end": "00:53"},
          "averageQuality": 0,
          "confidence": 0.9
        }
      ],
      "metadata": {
        "totalClusters": 1,
        "totalTakes": 2
      }
    }
    
    CRITICAL:
    - Use MM:SS format for timestamps (e.g., "00:08" not "8" or "0:08")
    - timeRange should span from first take start to last take end
    - Focus ONLY on finding clusters, ignore silence detection
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
      { text: clusterPrompt },
    ]);

    const response = await result.response;
    const text = response.text();
    
    console.log('[Cluster Analysis] Raw AI response:', text);
    
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      console.error('[Cluster Analysis] Failed to parse AI response:', parseError);
      console.error('[Cluster Analysis] Raw text:', text);
      // Return empty result if parsing fails
      return {
        contentGroups: [],
        metadata: {
          processingTime: Date.now() - startTime,
          tokenCount: 0,
          estimatedCost: 0,
          analysisType: 'clusters-only',
          error: 'Failed to parse AI response'
        }
      };
    }

    const processingTime = Date.now() - startTime;
    const tokenCount = response.usageMetadata?.totalTokenCount || 0;
    const estimatedCost = calculateCost(tokenCount);
    
    // Validate and log the content groups
    const contentGroups = parsed.contentGroups || [];
    console.log(`[Cluster Analysis] Found ${contentGroups.length} clusters`);
    if (contentGroups.length > 0) {
      console.log('[Cluster Analysis] First cluster:', JSON.stringify(contentGroups[0], null, 2));
    }

    return {
      contentGroups,
      metadata: {
        processingTime,
        tokenCount,
        estimatedCost,
        analysisType: 'clusters-only',
        ...parsed.metadata
      },
    };
  } catch (error) {
    console.error('Cluster analysis error:', error);
    throw new Error('Failed to analyze video for clusters');
  }
}

// Analyze video for silence detection
export async function analyzeVideoForSilence(
  fileUri: string
): Promise<{ segments: VideoSegment[], metadata: any }> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    generationConfig: {
      temperature: 0.05, // Even lower for precise detection
      topP: 0.8,
      topK: 20,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  const silencePrompt = `
    TASK: Detect ALL silence periods in this video with precise timestamps.
    
    SILENCE DEFINITION:
    - ANY period with NO speech/talking for 2+ seconds
    - Dead air between sentences
    - Long pauses mid-sentence
    - Beginning/ending silence
    - Gaps between topics
    
    DETECTION RULES:
    1. Mark the EXACT moment speech stops (startTime)
    2. Mark the EXACT moment speech resumes (endTime)
    3. Calculate duration = endTime - startTime
    4. Only report if duration >= 2.0 seconds
    5. Round timestamps to nearest 0.1 second for accuracy
    
    TIMESTAMP FORMAT:
    - Use MM:SS.S format (e.g., "00:05.3", "01:23.7")
    - For videos under 1 hour, never use HH:MM:SS
    - Be precise to deciseconds (0.1 second)
    
    IMPORTANT:
    - Scan ENTIRE video from 00:00.0 to end
    - Don't merge adjacent silences - report each separately
    - Include silence at video start/end if >= 2 seconds
    - Focus ONLY on silence, ignore speech content
    
    Return ONLY a valid JSON object with this EXACT structure:
    {
      "segments": [
        {
          "startTime": "00:05.0",
          "endTime": "00:08.2",
          "duration": 3.2,
          "reason": "3.2-second silence between introduction and main content",
          "category": "pause",
          "confidence": 0.95
        }
      ],
      "metadata": {
        "totalSilences": 1,
        "totalSilenceDuration": 3.2,
        "videoScanned": true,
        "scanRange": "full"
      }
    }
    
    CRITICAL:
    - Timestamps MUST align with actual silence in video
    - Duration MUST equal endTime - startTime
    - Report ALL silences >= 2.0 seconds
    - Be extre
    mely precise with timing
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
      { text: silencePrompt },
    ]);

    const response = await result.response;
    const text = response.text();
    
    console.log('[Silence Detection] Raw AI response:', text);
    
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      console.error('[Silence Detection] Failed to parse AI response:', parseError);
      console.error('[Silence Detection] Raw text:', text);
      return {
        segments: [],
        metadata: {
          processingTime: Date.now() - startTime,
          tokenCount: 0,
          estimatedCost: 0,
          analysisType: 'silence-only',
          error: 'Failed to parse AI response'
        }
      };
    }

    const processingTime = Date.now() - startTime;
    const tokenCount = response.usageMetadata?.totalTokenCount || 0;
    const estimatedCost = calculateCost(tokenCount);
    
    // Convert timestamps to seconds for consistency
    const segments = (parsed.segments || []).map((seg: any) => ({
      ...seg,
      startTimeSeconds: parseTimeToSeconds(seg.startTime),
      endTimeSeconds: parseTimeToSeconds(seg.endTime),
      // Keep original format for display
      originalStart: seg.startTime,
      originalEnd: seg.endTime
    }));
    
    console.log(`[Silence Detection] Found ${segments.length} silence segments`);
    if (segments.length > 0) {
      console.log('[Silence Detection] First segment:', segments[0]);
    }

    return {
      segments,
      metadata: {
        processingTime,
        tokenCount,
        estimatedCost,
        analysisType: 'silence-only',
        ...parsed.metadata
      },
    };
  } catch (error) {
    console.error('Silence analysis error:', error);
    throw new Error('Failed to analyze video for silence');
  }
}

// Combined analysis using separate API calls
export async function analyzeVideoWithTakes(
  fileUri: string,
  prompt: string,
  targetDuration?: number
): Promise<EnhancedAnalysisResult> {
  console.log('Starting separate analysis for clusters and silence...');
  
  try {
    // Run both analyses in parallel for efficiency
    const [clusterResult, silenceResult] = await Promise.all([
      analyzeVideoForClusters(fileUri),
      analyzeVideoForSilence(fileUri)
    ]);

    console.log('Cluster analysis complete:', clusterResult.contentGroups.length, 'clusters found');
    console.log('Cluster details:', JSON.stringify(clusterResult.contentGroups, null, 2));
    console.log('Silence analysis complete:', silenceResult.segments.length, 'silences found');
    console.log('Silence details:', JSON.stringify(silenceResult.segments, null, 2));

    // Calculate summary statistics
    const totalTakes = clusterResult.contentGroups.reduce((sum, group) => 
      sum + group.takes.length, 0
    );
    
    const totalSilenceDuration = silenceResult.segments.reduce((sum, seg) => 
      sum + seg.duration, 0
    );

    // Build metadata object using Object.assign to avoid TS issues
    const metadata = Object.assign(
      {},
      {
        processingTime: clusterResult.metadata.processingTime + silenceResult.metadata.processingTime,
        tokenCount: clusterResult.metadata.tokenCount + silenceResult.metadata.tokenCount,
        estimatedCost: clusterResult.metadata.estimatedCost + silenceResult.metadata.estimatedCost,
        analysisVersion: 'enhanced-v2.0-separate'
      },
      {
        clusterAnalysis: clusterResult.metadata,
        silenceAnalysis: silenceResult.metadata
      }
    );

    // Combine results
    const combinedResult: EnhancedAnalysisResult = {
      segments: silenceResult.segments,
      contentGroups: clusterResult.contentGroups,
      summary: {
        originalDuration: 0, // Will be set by caller
        finalDuration: 0, // Will be calculated later
        timeRemoved: totalSilenceDuration,
        segmentCount: silenceResult.segments.length,
        groupCount: clusterResult.contentGroups.length,
        takesAnalyzed: totalTakes,
        averageQualityImprovement: 0
      },
      metadata
    };

    return combinedResult;
  } catch (error) {
    console.error('Combined analysis error:', error);
    throw new Error('Failed to perform combined analysis');
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