# AI Studio Video Analysis Prompt

## Default Prompt (Gemini-Generated)

```
You are an expert video editing assistant. Your task is to analyze the provided video and identify two types of segments for removal:
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
Duration: [Number] seconds
```

## Usage Instructions

1. This prompt is designed to match exactly what Google AI Studio uses
2. It focuses on two main tasks:
   - Finding editing errors (bad takes that are redone)
   - Finding extended silences (>2 seconds)
3. The output format is strict and must be parsed correctly

## Important Configuration

When using this prompt with the video editor:
- Temperature: 0.1 (low for consistent timestamps)
- Model: gemini-2.5-pro
- Response format: Text (not JSON)

## How to Use in Video Editor

1. Set `useAIStudioMode: true` in the API call
2. Pass this prompt in the `prompt` field
3. The system will parse the text response and convert to standard format

## Debugging Tips

If timestamps don't match AI Studio:
1. Check that temperature is set to 0.1
2. Ensure the prompt is exactly the same
3. Verify the video file format is MP4
4. Check console logs for raw response