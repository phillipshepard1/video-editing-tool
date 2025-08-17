# Talking Head Video Comparison Feature - Planning Document

## Problem Statement
In talking head videos, creators often record multiple takes of the same content (intros, explanations, outros). While Gemini successfully identifies which takes to remove, users need to see:
1. **What's being removed** (bad takes)
2. **What's being kept** (good takes)
3. **The relationship between them** (which good take replaces which bad takes)

### User Quote
> "A lot of the videos that we edited with the software will be called talking head videos and often times we repeat the intros multiple times or redo things multiple times and obviously Gemini is picking out the best ones. Is there a way to show obviously the segments of the removing, but it's almost as important to show the segments that are comparison to the ones that are being removed to the ones that they're keeping."

## Use Case Examples

### Example 1: Multiple Intro Takes
```
Timeline:
0:00-0:15 - "Hi, I'm... uh... let me start over" [REMOVE]
0:45-0:58 - "Hi everyone, I'm... wait, that's not right" [REMOVE]  
1:30-1:45 - "Hi everyone, I'm John and today we're discussing..." [KEEP] ✅
2:15-2:28 - "Hi, I'm John... *cough* sorry" [REMOVE]
```

### Example 2: Multiple Explanation Attempts
```
5:00-5:45 - First explanation (too technical) [REMOVE]
6:00-6:35 - Second explanation (stumbled) [REMOVE]
7:00-7:40 - Third explanation (clear and concise) [KEEP] ✅
```

## Proposed Solutions

### Solution 1: Smart Segment Pairing
**Concept:** Automatically identify and group similar content segments

**Implementation:**
```javascript
interface SegmentGroup {
  type: 'intro' | 'outro' | 'explanation' | 'transition';
  segments: Array<{
    startTime: string;
    endTime: string;
    status: 'keep' | 'remove';
    reason?: string;
    quality_score?: number;
  }>;
  bestTake: number; // Index of kept segment
}
```

**Benefits:**
- Clear relationship between takes
- Easy comparison interface
- Users understand why certain takes were chosen

### Solution 2: Enhanced Gemini Analysis Prompt
**Current Prompt Structure:**
```
Identify segments to remove from this video
```

**Enhanced Prompt Structure:**
```
For this talking head video:
1. Identify all repeated content (multiple takes of same material)
2. For each group of repeated content:
   - Mark which take to KEEP
   - Mark which takes to REMOVE
   - Explain why the kept take is superior
   - Provide relationship mapping between takes
3. Return structured data showing these relationships
```

**Expected Response Structure:**
```json
{
  "contentGroups": [
    {
      "groupId": "intro_takes",
      "contentType": "introduction",
      "description": "Speaker introducing themselves",
      "takes": [
        {
          "index": 0,
          "startTime": "0:00",
          "endTime": "0:15",
          "status": "remove",
          "reason": "Stuttering and false start",
          "transcript": "Hi, I'm... uh... let me start over"
        },
        {
          "index": 1,
          "startTime": "1:30",
          "endTime": "1:45", 
          "status": "keep",
          "reason": "Clear, confident delivery",
          "transcript": "Hi everyone, I'm John and today we're discussing..."
        }
      ],
      "keptTakeIndex": 1,
      "comparisonNotes": "Take 2 has better pacing, no stutters, confident tone"
    }
  ]
}
```

### Solution 3: Visual Comparison Interface

#### Option A: Grouped Segment View
```
┌─────────────────────────────────────────────┐
│ 📹 Introduction Section (4 takes)            │
├─────────────────────────────────────────────┤
│ ❌ Take 1 | 0:00-0:15 | "Stuttering"        │
│ ❌ Take 2 | 0:45-0:58 | "Wrong name"        │
│ ✅ Take 3 | 1:30-1:45 | "Perfect delivery"  │ <- KEPT
│ ❌ Take 4 | 2:15-2:28 | "Background noise"  │
├─────────────────────────────────────────────┤
│ [▶ Play All] [Compare Side-by-Side] [Stats] │
└─────────────────────────────────────────────┘
```

#### Option B: Side-by-Side Comparison
```
┌──────────────────┬──────────────────┐
│   REMOVED TAKE   │    KEPT TAKE     │
├──────────────────┼──────────────────┤
│  [Video Preview] │  [Video Preview] │
│   0:00 - 0:15    │   1:30 - 1:45    │
│   "Hi, I'm...    │  "Hi everyone,   │
│    uh... let     │   I'm John and   │
│    me start"     │   today we're"   │
├──────────────────┼──────────────────┤
│ Issues:          │ Qualities:       │
│ • Stuttering     │ • Clear speech   │
│ • False start    │ • Good pacing    │
│ • Low confidence │ • Confident      │
└──────────────────┴──────────────────┘
```

#### Option C: Timeline Visualization
```
Timeline View:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[❌]--[❌]----[✅]----[❌]--[content]--[❌]-[✅]
 ↑     ↑      ↑       ↑                ↑    ↑
Intro Intro  GOOD   Intro            Outro GOOD
Take1 Take2  INTRO  Take4            Take1 OUTRO

Legend: ❌ = Removed, ✅ = Kept
```

### Solution 4: Interactive Comparison Features

#### Feature 1: A/B Preview
- Click "Compare Takes" button
- Video splits into two panels
- Left panel: Plays removed take
- Right panel: Plays kept take
- Synchronized playback option

#### Feature 2: Take Swapping
```javascript
// Allow users to choose different takes
function swapTake(groupId: string, newTakeIndex: number) {
  // Update which take is marked as "keep"
  // Recalculate final video duration
  // Update export data
}
```

#### Feature 3: Quality Metrics Display
```
Take Quality Analysis:
┌────────────────────────────────┐
│ Take 1: ████░░░░░░ 40%        │
│ Take 2: ██████░░░░ 60%        │
│ Take 3: ██████████ 100% ✅    │
│ Take 4: ███░░░░░░░ 30%        │
└────────────────────────────────┘

Factors: Clarity, Pacing, Confidence, Audio Quality
```

## Implementation Plan

### Phase 1: Data Structure Enhancement
1. Modify Gemini API prompt to return grouped segments
2. Update `AnalysisResult` interface to include relationships
3. Add content type classification

### Phase 2: UI Components
1. Create `SegmentGroupPanel` component
2. Add comparison mode toggle to main interface
3. Build side-by-side video preview

### Phase 3: Interaction Features
1. Implement take swapping functionality
2. Add synchronized playback for comparisons
3. Create quality metrics visualization

## Technical Requirements

### Backend Changes
```typescript
interface EnhancedAnalysisResult {
  segmentsToRemove: Segment[]; // Existing
  segmentsToKeep: Segment[];    // New
  contentGroups: ContentGroup[]; // New
  relationships: SegmentRelationship[]; // New
}

interface ContentGroup {
  id: string;
  type: 'intro' | 'outro' | 'content' | 'transition';
  takes: Take[];
  keptTakeId: string;
  metadata: {
    averageDuration: number;
    qualityScores: Record<string, number>;
    commonContent: string; // What they're all trying to say
  };
}

interface Take {
  id: string;
  segmentIndex: number;
  startTime: string;
  endTime: string;
  status: 'keep' | 'remove';
  issues?: string[];
  qualities?: string[];
  transcript?: string;
}
```

### Frontend Components Needed
1. `TakeComparisonView.tsx` - Main comparison interface
2. `SegmentGroupPanel.tsx` - Shows grouped takes
3. `SideBySidePreview.tsx` - Dual video preview
4. `TakeQualityMeter.tsx` - Visual quality indicators
5. `TakeSwapper.tsx` - Interface for choosing different takes

### API Prompt Enhancement
```
You are analyzing a talking head video where the speaker may have multiple takes of the same content.

For each section of repeated content:
1. Group all attempts/takes together
2. Identify which take is the best (to keep)
3. Explain why other takes should be removed
4. Provide quality scores for each take

Consider these factors:
- Speech clarity and confidence
- Pacing and flow
- Technical issues (audio, video)
- Content completeness
- Energy and engagement

Return structured JSON with clear relationships between takes.
```

## User Benefits

### Current Experience
- ❌ See segments to remove without context
- ❌ Don't know what's replacing removed content
- ❌ Can't compare quality between takes
- ❌ No way to choose alternate takes

### Enhanced Experience
- ✅ See removed segments grouped with kept versions
- ✅ Understand why certain takes were chosen
- ✅ Compare takes side-by-side
- ✅ Option to select different takes
- ✅ Clear visualization of content relationships

## Open Questions

1. **Auto-detection**: Should we automatically detect talking head videos or require user to specify?
2. **Granularity**: How similar must segments be to group them? (80% similarity? Same duration?)
3. **User Override**: Should users be able to manually group/ungroup segments?
4. **Export Format**: How should grouped segments appear in exports?
5. **Performance**: How many segments can we reasonably compare at once?

## Next Steps

1. **Validate Concept**: Test enhanced prompt with real talking head videos
2. **Prototype UI**: Create mockups of comparison interfaces
3. **User Testing**: Get feedback on which visualization is most helpful
4. **Performance Testing**: Ensure smooth playback with multiple video previews
5. **Integration Planning**: Determine how this fits with existing preview features

## Resources & References

### Similar Products
- Adobe Premiere Pro - Multi-camera editing view
- Final Cut Pro - Audition clips feature
- DaVinci Resolve - Take selector
- Descript - Overdub and take management

### Technical References
- Web Video API for synchronized playback
- React patterns for complex state management
- Canvas API for waveform visualization
- WebRTC for potential real-time comparison

## Conclusion

This feature would transform the editing experience for talking head videos by:
1. Providing context for why segments are removed
2. Showing what content is being kept
3. Allowing comparison between takes
4. Enabling users to make different choices

The key is understanding that in talking head videos, removed segments often have a "kept" counterpart, and seeing both is essential for making good editing decisions.

---
*Last Updated: January 12, 2025*
*Status: Planning Phase - Awaiting User Feedback*