# Gemini Prompt Engineering for Talking Head Video Analysis

## The Core Challenge

Talking head videos present unique challenges:
1. **Semantic Similarity**: Multiple takes say essentially the same thing with minor variations
2. **Quality Gradients**: Takes aren't just "good" or "bad" - there's a spectrum
3. **Context Preservation**: Removing a take might break narrative flow
4. **Subtle Differences**: Energy level, confidence, pacing may be the only differences

## The Actual Gemini Prompt

```javascript
const TALKING_HEAD_ANALYSIS_PROMPT = `
You are an expert video editor specializing in talking head content. Analyze this video with the following priorities:

STEP 1: CONTENT DETECTION
First pass - identify ALL spoken segments and transcribe key phrases:
- Mark timestamp ranges where someone is speaking
- Note the first 10-15 words of each segment
- Identify silence gaps > 2 seconds

STEP 2: SIMILARITY CLUSTERING
Group segments that appear to be multiple attempts at the same content:
- Compare opening words/phrases
- Look for repeated gestures or positioning
- Identify "restart" signals ("let me try that again", "actually", clearing throat)
- Group by semantic similarity even if wording differs

STEP 3: QUALITY ASSESSMENT
For each segment, score on these specific factors (1-10 scale):
a) Verbal fluency: Absence of "um", "uh", stutters, false starts
b) Pacing: Natural speech rhythm, not too fast/slow
c) Energy: Enthusiasm and engagement level
d) Clarity: Clear pronunciation and articulation
e) Completeness: Did they finish the thought without trailing off
f) Confidence: Voice strength and absence of uncertainty
g) Technical: Audio quality, background noise, visual stability

STEP 4: INTELLIGENT SELECTION
For each content group:
1. Select the BEST take based on combined quality scores
2. Consider narrative flow - does the kept take connect well with surrounding content?
3. If scores are close (within 1.5 points), prefer:
   - Takes that are more concise
   - Takes closer to the middle of recording (speaker warmed up)
   - Takes without technical issues

STEP 5: RELATIONSHIP MAPPING
Explicitly state relationships between segments:
- "Segment A (0:00-0:15) is attempt 1 of introduction"
- "Segment E (1:30-1:45) is attempt 2 of introduction - KEEP THIS ONE"
- "Segment A relates to Segment E - same content, different delivery"

OUTPUT FORMAT:
{
  "metadata": {
    "videoType": "talking_head",
    "speakerCount": 1,
    "recordingStyle": "single_take" | "multiple_takes" | "continuous",
    "overallQuality": 7.5,
    "detectedPatterns": ["multiple_intros", "repeated_explanations", "false_starts"]
  },
  
  "contentGroups": [
    {
      "groupId": "intro_attempts",
      "groupType": "introduction",
      "semanticContent": "Speaker introduces themselves and the topic",
      "bestTakeIndex": 2,
      "selectionReasoning": "Take 3 has best combination of confidence (9/10) and clarity (8.5/10), with no stutters",
      "takes": [
        {
          "segmentId": "seg_001",
          "startTime": "00:00:00",
          "endTime": "00:00:15",
          "transcript": "Hi everyone, I'm... uh... let me start over",
          "status": "remove",
          "scores": {
            "verbalFluency": 3.5,
            "pacing": 5.0,
            "energy": 6.0,
            "clarity": 7.0,
            "completeness": 2.0,
            "confidence": 4.0,
            "technical": 8.0,
            "overall": 5.1
          },
          "issues": [
            "false_start",
            "verbal_filler_uh",
            "incomplete_thought",
            "low_confidence"
          ],
          "positives": [
            "good_audio_quality",
            "proper_framing"
          ],
          "relatedSegments": ["seg_005", "seg_008"]
        },
        {
          "segmentId": "seg_005",
          "startTime": "00:01:30",
          "endTime": "00:01:45",
          "transcript": "Hi everyone, I'm John and today we're going to discuss the three key principles of effective communication",
          "status": "keep",
          "scores": {
            "verbalFluency": 9.0,
            "pacing": 8.5,
            "energy": 8.0,
            "clarity": 8.5,
            "completeness": 10.0,
            "confidence": 9.0,
            "technical": 8.0,
            "overall": 8.7
          },
          "issues": [],
          "positives": [
            "confident_delivery",
            "clear_articulation",
            "complete_thought",
            "good_pacing",
            "engaging_energy"
          ],
          "relatedSegments": ["seg_001", "seg_008"]
        }
      ]
    },
    {
      "groupId": "explanation_point_1",
      "groupType": "main_content",
      "semanticContent": "Explaining the first principle of communication",
      "bestTakeIndex": 1,
      "selectionReasoning": "Second attempt is more concise while maintaining clarity",
      "takes": [...]
    }
  ],
  
  "segmentsToRemove": [
    {
      "startTime": "00:00:00",
      "endTime": "00:00:15",
      "reason": "False start - better version at 01:30",
      "category": "retake",
      "relatedKeptSegment": "00:01:30-00:01:45",
      "confidence": 0.95
    }
  ],
  
  "segmentsToKeep": [
    {
      "startTime": "00:01:30",
      "endTime": "00:01:45",
      "reason": "Best intro take - confident, clear, complete",
      "category": "introduction",
      "relatedRemovedSegments": ["00:00:00-00:00:15", "00:02:15-00:02:30"],
      "confidence": 0.95
    }
  ],
  
  "relationships": [
    {
      "type": "multiple_takes",
      "segments": ["seg_001", "seg_005", "seg_008"],
      "description": "Three attempts at video introduction",
      "keptSegment": "seg_005",
      "reasoning": "Middle take has best energy after speaker warmed up"
    }
  ],
  
  "editingInsights": {
    "patternAnalysis": "Speaker tends to nail it on the 2nd or 3rd take",
    "suggestions": [
      "Consider keeping backup takes for critical segments",
      "Speaker's energy peaks around 1-2 minutes into recording",
      "Audio quality is consistent throughout - no technical issues"
    ],
    "confidenceLevel": 0.92
  }
}

IMPORTANT INSTRUCTIONS:
1. Look for subtle cues that indicate retakes (clearing throat, "okay", "alright", repositioning)
2. Don't just match exact words - understand semantic similarity
3. Consider the flow between kept segments - will the edit feel natural?
4. If unsure whether segments are related, list them separately
5. Always explain WHY one take is better than another with specific factors
6. Include partial transcripts to help user identify segments
7. Consider that speakers often improve after warming up (but may tire later)

Return ONLY valid JSON, no additional text or markdown formatting.
`;
```

## Enhanced Approach: Three-Layer Analysis

### Layer 1: Pattern Recognition
Instead of just looking for similar content, we need to identify **recording patterns**:

```javascript
const identifyRecordingPatterns = (transcript) => {
  const patterns = {
    multipleIntros: /^(hi|hello|hey).{0,50}(i'm|my name|welcome)/gi,
    restartSignals: /(let me|actually|wait|sorry|okay so|alright)/gi,
    falseStarts: /\b(uh+|um+|er+)\b.{0,20}(let me|actually|wait)/gi,
    conclusions: /(thanks|thank you|that's all|see you|bye)/gi,
    transitions: /(now|next|moving on|let's talk about)/gi
  };
  
  return Object.entries(patterns).reduce((acc, [pattern, regex]) => {
    acc[pattern] = [...transcript.matchAll(regex)].map(match => ({
      text: match[0],
      index: match.index
    }));
    return acc;
  }, {});
};
```

### Layer 2: Semantic Grouping Algorithm

```javascript
const groupRelatedContent = (segments) => {
  const groups = [];
  const threshold = 0.7; // Similarity threshold
  
  segments.forEach(segment => {
    let foundGroup = false;
    
    for (const group of groups) {
      // Check semantic similarity with group's first segment
      const similarity = calculateSemanticSimilarity(
        segment.transcript,
        group.takes[0].transcript
      );
      
      if (similarity > threshold) {
        group.takes.push(segment);
        foundGroup = true;
        break;
      }
    }
    
    if (!foundGroup) {
      // Create new group
      groups.push({
        groupId: `group_${groups.length + 1}`,
        takes: [segment],
        commonTheme: extractTheme(segment.transcript)
      });
    }
  });
  
  return groups;
};

// Simplified semantic similarity (in practice, you'd use embeddings)
const calculateSemanticSimilarity = (text1, text2) => {
  // Extract key words (nouns, verbs)
  const keywords1 = extractKeywords(text1);
  const keywords2 = extractKeywords(text2);
  
  // Calculate Jaccard similarity
  const intersection = keywords1.filter(w => keywords2.includes(w));
  const union = [...new Set([...keywords1, ...keywords2])];
  
  return intersection.length / union.length;
};
```

### Layer 3: Quality Scoring Matrix

```javascript
const scoreSegmentQuality = (segment, videoData) => {
  const scores = {
    // Verbal Quality (40% weight)
    verbalFluency: scoreVerbalFluency(segment.transcript),
    clarity: scoreClarity(segment.audioMetrics),
    pacing: scorePacing(segment.duration, segment.wordCount),
    
    // Delivery Quality (35% weight)
    confidence: scoreConfidence(segment.audioMetrics.amplitude),
    energy: scoreEnergy(segment.audioMetrics.variation),
    completeness: scoreCompleteness(segment.transcript),
    
    // Technical Quality (25% weight)
    audioQuality: scoreAudio(segment.audioMetrics.noise),
    visualStability: scoreVisual(segment.videoMetrics),
    lighting: scoreLighting(segment.videoMetrics.brightness)
  };
  
  // Weighted average
  const weights = {
    verbal: 0.40,
    delivery: 0.35,
    technical: 0.25
  };
  
  const verbalAvg = (scores.verbalFluency + scores.clarity + scores.pacing) / 3;
  const deliveryAvg = (scores.confidence + scores.energy + scores.completeness) / 3;
  const technicalAvg = (scores.audioQuality + scores.visualStability + scores.lighting) / 3;
  
  scores.overall = (
    verbalAvg * weights.verbal +
    deliveryAvg * weights.delivery +
    technicalAvg * weights.technical
  );
  
  return scores;
};
```

## Intelligent UI Approach

### Visual Hierarchy for Decision Making

```typescript
interface TakeComparisonView {
  // Primary view: Timeline with relationship arrows
  timeline: {
    segments: Segment[];
    relationships: Arrow[]; // Visual connections between related takes
    heatmap: QualityGradient; // Color-coded quality overlay
  };
  
  // Secondary view: Grouped cards
  groups: {
    layout: 'priority' | 'chronological' | 'quality';
    cards: GroupCard[];
    quickActions: ['swap', 'preview', 'compare'];
  };
  
  // Tertiary view: Detailed comparison
  comparison: {
    mode: 'side-by-side' | 'sequential' | 'overlay';
    syncPoints: TimeMarker[]; // Align similar content moments
    diffHighlight: boolean; // Highlight differences
  };
}
```

### Smart Defaults with Override Capability

```javascript
const smartTakeSelection = {
  // AI recommends based on patterns
  autoSelect: {
    preferMiddleTakes: true, // Speaker usually warmed up
    avoidFirstLast: true,    // Often have issues
    qualityThreshold: 7.0,   // Minimum acceptable score
  },
  
  // User preferences learned over time
  userPreferences: {
    prioritizeBrevity: false,
    preferHighEnergy: true,
    acceptFillers: false,
  },
  
  // Context-aware selection
  contextRules: {
    // If previous segment is high energy, don't follow with low energy
    maintainEnergyFlow: true,
    // If it's an intro, prefer confidence over perfection
    introRequiresConfidence: true,
    // For explanations, clarity > energy
    explanationRequiresClarity: true,
  }
};
```

## Performance Optimization Strategy

### Progressive Enhancement Loading

```javascript
const loadingStrategy = {
  // Phase 1: Immediate (< 100ms)
  immediate: {
    show: 'segmentList',
    data: 'basicSegments',
    interaction: 'click to expand'
  },
  
  // Phase 2: Fast (< 500ms)
  fast: {
    show: 'groupedView',
    data: 'relationships',
    interaction: 'preview on hover'
  },
  
  // Phase 3: Deferred (< 2s)
  deferred: {
    show: 'qualityScores',
    data: 'transcripts',
    interaction: 'side-by-side comparison'
  },
  
  // Phase 4: On-demand
  onDemand: {
    show: 'waveforms',
    data: 'frameThumbnails',
    interaction: 'detailed analysis'
  }
};
```

### Memory-Efficient Video Handling

```javascript
class VideoSegmentManager {
  constructor(videoUrl) {
    this.videoUrl = videoUrl;
    this.cache = new Map();
    this.maxCacheSize = 5; // Max segments in memory
  }
  
  async loadSegment(startTime, endTime) {
    const key = `${startTime}-${endTime}`;
    
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    // Create virtual segment (doesn't duplicate video)
    const segment = {
      start: startTime,
      end: endTime,
      duration: endTime - startTime,
      play: () => this.seekAndPlay(startTime, endTime),
      thumbnail: await this.extractThumbnail(startTime)
    };
    
    // LRU cache management
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, segment);
    return segment;
  }
  
  seekAndPlay(start, end) {
    const video = document.querySelector('video');
    video.currentTime = start;
    video.play();
    
    // Auto-pause at segment end
    const pauseAtEnd = () => {
      if (video.currentTime >= end) {
        video.pause();
        video.removeEventListener('timeupdate', pauseAtEnd);
      }
    };
    video.addEventListener('timeupdate', pauseAtEnd);
  }
}
```

## Real-World Testing Scenarios

### Test Case 1: Complex Multi-Take Introduction
```
00:00-00:10: "Hi, I'm... sorry, let me start again"
00:12-00:25: "Hello everyone, I'm John... wait, that's not right"
00:30-00:45: "Hey there! I'm John and welcome to..." [cough]
01:00-01:15: "Hi everyone! I'm John and today we're diving into..." ✓
01:20-01:32: "Actually, let me redo that intro"
01:35-01:50: "Hi folks, John here, and today..."
```
**Expected**: Groups all 6 attempts, selects 01:00-01:15 based on completeness and energy

### Test Case 2: Subtle Quality Differences
```
05:00-05:30: Explanation with perfect content but low energy
05:35-06:05: Same explanation, one "um", but better energy ✓
06:10-06:40: Same explanation, rushed pacing
```
**Expected**: Selects middle take despite minor filler due to overall better delivery

### Test Case 3: Context-Dependent Selection
```
10:00-10:15: Energetic transition
10:20-10:50: Low energy explanation (technically perfect)
10:55-11:25: High energy explanation (one stutter) ✓
```
**Expected**: Selects high-energy version to maintain flow despite minor imperfection

## Key Differentiators of This Approach

1. **Semantic Understanding**: Groups content by meaning, not just proximity
2. **Multi-Factor Scoring**: Considers 9+ quality dimensions
3. **Context Awareness**: Selections consider surrounding content flow
4. **Pattern Learning**: Identifies speaker habits (improves after warmup, etc.)
5. **Transparent Reasoning**: Explains exactly why each choice was made
6. **Progressive Loading**: UI remains responsive regardless of video length
7. **Smart Caching**: Efficient memory usage even with long videos

## Implementation Priority

1. **Week 1**: Test enhanced Gemini prompt with 5-10 real talking head videos
2. **Week 2**: Build grouped view UI with quality scores
3. **Week 3**: Implement smart segment comparison
4. **Week 4**: Add user preference learning and fine-tuning

This approach transforms the editing experience from "removing bad parts" to "selecting the best performance" - a fundamental shift in how users think about their content.

---
*The key insight: Talking head videos aren't about finding mistakes to remove, but about finding the best performance to keep. This reframing changes everything about the UI and analysis approach.*