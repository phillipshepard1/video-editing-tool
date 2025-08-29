import { NextRequest, NextResponse } from 'next/server';
import { 
  analyzeVideoAIStudioMode, 
  convertAIStudioToStandardFormat,
  getFileStatus 
} from '@/lib/services/gemini';

// Default AI Studio prompt
const DEFAULT_AI_STUDIO_PROMPT = `You are an expert video editing assistant. Your task is to analyze the provided video and identify two types of segments for removal:
Editing errors (flubbed takes)
Extended silences

Analysis Task 1: Identify Editing Errors and Re-takes
Scan the video to locate all instances where the speaker makes a mistake, acknowledges it, and then re-attempts the line. The goal is to identify:
The start of the flawed take
The beginning of the successful replacement take

Pay close attention to these indicators:
Verbal Cues: Phrases such as "Let me do that again," "Oops," "Hold on," "Cut," "Alright, let's restart," or any expletives/sounds of frustration (e.g., heavy sighing).
Repetition Pattern: A sentence/phrase spoken, followed by a pause, then spoken again with slightly different intonation or wording. The first attempt is the flubbed take.
Non-Verbal Cues: Sudden posture changes, looking away from the camera in frustration, repeatedly clearing the throat before restarting, or a sharp clap/snap to mark the edit point.

Analysis Task 2: Identify Extended Silences
Scan the audio track to identify all segments of complete silence or near-silence (e.g., only ambient room noise) lasting longer than 2 seconds.

Output Format
Present findings in two separate, clearly labeled lists. Use timestamps in the format MM:SS.

Editing Errors Found
Error Event [Number]:
Start of Flawed Take: [Timestamp]
Start of Successful Re-take: [Timestamp]
Description: Brief explanation (e.g., "Speaker stumbled on words and restarted sentence" or "Speaker explicitly said 'do it again'").

Extended Silences Found
Silence Event [Number]:
Start Time: [Timestamp]
End Time: [Timestamp]
Duration: [Number] seconds`;

export async function POST(request: NextRequest) {
  try {
    const { fileUri, prompt, useAIStudioMode, videoDuration } = await request.json();

    if (!fileUri) {
      return NextResponse.json(
        { error: 'No file URI provided' },
        { status: 400 }
      );
    }

    // Check if AI Studio mode is requested
    if (!useAIStudioMode) {
      return NextResponse.json(
        { error: 'This endpoint is for AI Studio mode only. Set useAIStudioMode: true' },
        { status: 400 }
      );
    }

    console.log('[AI Studio Mode] Processing with custom prompt');

    // Check file status first
    const fileStatus = await getFileStatus(fileUri);
    console.log('[AI Studio Mode] File status:', fileStatus);

    if (fileStatus.state !== 'ACTIVE' && fileStatus.state !== 'PROCESSING') {
      return NextResponse.json(
        { error: `File not ready. Current state: ${fileStatus.state}` },
        { status: 400 }
      );
    }

    // Use custom prompt or default
    const analysisPrompt = prompt && prompt.trim() ? prompt : DEFAULT_AI_STUDIO_PROMPT;

    // Run AI Studio mode analysis
    const aiStudioResult = await analyzeVideoAIStudioMode(fileUri, analysisPrompt);

    console.log('[AI Studio Mode] Analysis complete:', {
      editingErrors: aiStudioResult.editingErrors.length,
      silences: aiStudioResult.silences.length
    });

    // Convert to standard format for UI compatibility
    const standardResult = convertAIStudioToStandardFormat(
      aiStudioResult, 
      videoDuration || 120 // Default to 2 minutes if not provided
    );

    // Also include the raw response for debugging
    return NextResponse.json({
      analysis: standardResult,
      aiStudioMode: true,
      rawAnalysis: {
        editingErrors: aiStudioResult.editingErrors,
        silences: aiStudioResult.silences,
        rawResponse: aiStudioResult.rawResponse
      },
      metadata: {
        processingTime: Date.now(),
        model: 'gemini-2.5-pro',
        mode: 'ai-studio-compatible',
        fileUri: fileUri,
        promptUsed: analysisPrompt.substring(0, 200) + '...'
      }
    });

  } catch (error) {
    console.error('[AI Studio Mode] Analysis error:', error);
    
    return NextResponse.json(
      { 
        error: 'AI Studio mode analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        suggestion: 'Ensure your prompt follows the AI Studio format exactly'
      },
      { status: 500 }
    );
  }
}