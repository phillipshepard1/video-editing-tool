import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface EditingError {
  eventNumber: number;
  startOfFlawedTake: string; // MM:SS format
  startOfSuccessfulRetake: string; // MM:SS format  
  description: string;
  confidence: number; // 0-1
  verbalCues?: string[]; // What the speaker said that indicated the error
  nonVerbalCues?: string[]; // Body language or other visual indicators
}

export interface ExtendedSilence {
  eventNumber: number;
  startTime: string; // MM:SS format
  endTime: string; // MM:SS format
  duration: number; // in seconds
  confidence: number; // 0-1
  ambientNoiseLevel?: 'silent' | 'low' | 'moderate'; // Type of silence detected
}

export interface VideoAnalysisResultV2 {
  editingErrors: EditingError[];
  extendedSilences: ExtendedSilence[];
  summary: {
    originalDuration: number;
    totalEditingErrors: number;
    totalSilences: number;
    totalTimeToRemove: number;
    estimatedFinalDuration: number;
  };
  metadata: {
    processingTime: number;
    tokenCount: number;
    estimatedCost: number;
    analysisVersion: string;
  };
}

// Enhanced video analysis with improved prompting
export async function analyzeVideoV2(
  fileUri: string,
  customInstructions?: string
): Promise<VideoAnalysisResultV2> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    generationConfig: {
      temperature: 0.2, // Lower temperature for more consistent analysis
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    },
  });

  const enhancedPrompt = `
    You are an expert video editing assistant. Your task is to analyze the provided video and identify two types of segments for removal:
    1) Editing errors (flubbed takes and re-attempts)
    2) Extended silences (pauses longer than 2 seconds)

    **ANALYSIS TASK 1: Identify Editing Errors and Re-takes**
    
    Scan the video systematically to locate ALL instances where the speaker makes a mistake, acknowledges it, and then re-attempts the content. Focus on identifying BOTH the start of the flawed take AND the beginning of the successful replacement take.

    **Critical Indicators to Watch For:**

    **Verbal Cues (HIGH PRIORITY):**
    - Direct restart phrases: "Let me do that again," "Let me try that again," "Hold on," "Wait," "Actually..."
    - Error acknowledgment: "Oops," "Sorry," "My bad," "Wrong," "Ugh," "Dammit"
    - Production cues: "Cut," "Stop," "Reset," "Take two," "From the top"
    - Restart signals: "Alright, let's restart," "Let me redo this," "Back to..."
    - Frustration sounds: Sighing, clicking tongue, "Ugh," clearing throat repeatedly
    - Self-correction: "No wait, that's not right," "Actually, let me say that differently"

    **Repetition Patterns (MEDIUM PRIORITY):**
    - Same sentence/phrase spoken twice with different delivery
    - Speaker starts a thought, stops mid-sentence, then restarts
    - Identical content delivered with different tone or pace
    - Multiple attempts at explaining the same concept within 30 seconds

    **Non-Verbal Cues (SUPPORTING EVIDENCE):**
    - Sudden posture changes or body language shifts
    - Looking away from camera in frustration or concentration
    - Hand gestures that indicate "stop" or "restart"
    - Sharp clap, snap, or hand movement to mark edit points
    - Facial expressions showing dissatisfaction with delivery
    - Pausing to think followed by restarting with same content

    **ANALYSIS TASK 2: Identify Extended Silences**
    
    Scan the entire audio track to identify ALL segments where there is:
    - Complete silence (no speech) lasting 2+ seconds
    - Only ambient room noise with no meaningful audio
    - Long pauses between words or sentences
    - Dead air during transitions or thinking pauses

    **Classification Guidelines:**
    - **Silent**: Complete absence of sound
    - **Low ambient**: Only very quiet room noise/hum
    - **Moderate ambient**: Noticeable background noise but no speech

    **OUTPUT REQUIREMENTS:**
    
    Return ONLY a valid JSON object with this EXACT structure:

    {
      "editingErrors": [
        {
          "eventNumber": 1,
          "startOfFlawedTake": "MM:SS",
          "startOfSuccessfulRetake": "MM:SS",
          "description": "Detailed explanation of what happened",
          "confidence": 0.0-1.0,
          "verbalCues": ["exact phrases the speaker said"],
          "nonVerbalCues": ["body language or visual indicators observed"]
        }
      ],
      "extendedSilences": [
        {
          "eventNumber": 1,
          "startTime": "MM:SS",
          "endTime": "MM:SS", 
          "duration": number_in_seconds,
          "confidence": 0.0-1.0,
          "ambientNoiseLevel": "silent|low|moderate"
        }
      ],
      "summary": {
        "originalDuration": total_video_length_in_seconds,
        "totalEditingErrors": number_of_errors_found,
        "totalSilences": number_of_silences_found,
        "totalTimeToRemove": estimated_seconds_to_cut,
        "estimatedFinalDuration": original_minus_removed_time
      }
    }

    **CRITICAL INSTRUCTIONS:**
    - Use ONLY MM:SS format for timestamps (e.g., "01:23" not "83" or "1:23.5")
    - Be precise with timing - errors in timestamps make editing impossible
    - For editing errors, ensure startOfSuccessfulRetake comes AFTER startOfFlawedTake
    - Include confidence scores based on how certain you are about each identification
    - In descriptions, be specific about what you observed
    - Don't include minor stumbles or brief hesitations unless there's a clear restart

    **Additional Context:**
    ${customInstructions || 'No additional instructions provided.'}

    **Quality Checks:**
    - Double-check all timestamps are in correct MM:SS format
    - Verify that successful retakes actually contain similar content to flawed takes
    - Ensure silence durations are calculated correctly (endTime - startTime)
    - Confirm confidence scores reflect your certainty level
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
    
    // Handle potential markdown code blocks around JSON
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedText);

    const processingTime = Date.now() - startTime;
    const tokenCount = response.usageMetadata?.totalTokenCount || 0;
    const estimatedCost = calculateCostV2(tokenCount);

    return {
      ...parsed,
      metadata: {
        processingTime,
        tokenCount,
        estimatedCost,
        analysisVersion: 'v2.0-enhanced-flubbed-takes',
      },
    };
  } catch (error) {
    console.error('V2 Analysis error:', error);
    throw new Error(`Failed to analyze video with V2 prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Calculate estimated cost for Gemini 2.5 Pro
function calculateCostV2(tokenCount: number): number {
  // Gemini 2.5 Pro pricing (current rates)
  // Input: $1.25 per 1M tokens
  // Output: $5.00 per 1M tokens  
  // Using weighted average based on typical input/output ratio (70/30)
  const avgCostPerMillion = (1.25 * 0.7) + (5.00 * 0.3); // ~2.375
  return (tokenCount / 1000000) * avgCostPerMillion;
}

// Upload video file to Gemini (reused from original)
export async function uploadVideoToGeminiV2(file: File): Promise<string> {
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

// Get file status (reused from original)
export async function getFileStatusV2(fileUri: string): Promise<any> {
  const fileId = fileUri.split('/').pop();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${process.env.GEMINI_API_KEY}`
  );

  if (!response.ok) {
    throw new Error('Failed to get file status');
  }

  return response.json();
}

// Delete file from Gemini (reused from original)
export async function deleteFileV2(fileUri: string): Promise<void> {
  const fileId = fileUri.split('/').pop();
  await fetch(
    `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'DELETE',
    }
  );
}