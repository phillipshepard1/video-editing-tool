# Implementation Plan: Enhanced Gemini Prompt + Comparison View

## Overview
Combining **Approach 3** (Enhanced Gemini Analysis) with **Approach 4** (Visual Comparison View) to create a comprehensive talking head video editing experience that shows relationships between removed and kept content.

## Phase 1: Enhanced Gemini Prompt (Backend)

### Current Prompt Structure
```javascript
// Current basic prompt
const prompt = `Analyze this video and identify segments to remove...`;
```

### Enhanced Prompt Structure
```javascript
const enhancedPrompt = `
You are analyzing a talking head video where the speaker may record multiple takes of the same content.

ANALYSIS REQUIREMENTS:
1. Identify all segments that appear to be repeated content (multiple attempts)
2. Group related segments together by content type
3. For each group, determine which take is the BEST (to keep)
4. Explain why other takes should be removed
5. Provide quality reasoning for decisions

CONTENT TYPES TO IDENTIFY:
- Introduction/Opening statements
- Main content explanations  
- Conclusions/Closing statements
- Transitions between topics
- Call-to-action segments

QUALITY FACTORS TO CONSIDER:
- Speech clarity and confidence
- Pacing and natural flow
- Technical audio/video quality
- Content completeness and accuracy
- Energy level and engagement
- Absence of filler words (um, uh, like)
- No false starts or restarts

OUTPUT FORMAT:
Return a structured JSON with both individual segments AND grouped relationships:

{
  "segments": [
    // Individual segments (current format)
  ],
  "contentGroups": [
    {
      "groupId": "intro_attempts",
      "contentType": "introduction", 
      "description": "Speaker introducing the topic",
      "commonContent": "What all takes are trying to accomplish",
      "takes": [
        {
          "segmentIndex": 0,
          "startTime": "0:00",
          "endTime": "0:15",
          "status": "remove",
          "qualityScore": 3.2,
          "issues": ["stuttering", "false start", "low confidence"],
          "transcript": "Hi, I'm... uh... let me start over"
        },
        {
          "segmentIndex": 5,
          "startTime": "1:30", 
          "endTime": "1:45",
          "status": "keep",
          "qualityScore": 9.1,
          "qualities": ["clear speech", "confident delivery", "good pacing"],
          "transcript": "Hi everyone, I'm John and today we're discussing..."
        }
      ],
      "recommendedTake": 5,
      "reasoning": "Take at 1:30 has significantly better clarity, confidence, and no hesitation compared to other attempts"
    }
  ],
  "statistics": {
    "totalGroups": 3,
    "multiTakeGroups": 2,
    "qualityImprovement": "68% better pacing and clarity in kept takes"
  }
}
`;
```

### Implementation in API Route

```typescript
// app/api/analysis/process/route.ts - Enhanced
export async function POST(request: NextRequest) {
  // ... existing code ...
  
  const enhancedPrompt = buildTalkingHeadPrompt(customPrompt, targetDuration);
  
  // Send to Gemini with enhanced prompt
  const response = await generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: enhancedPrompt },
        { fileData: { mimeType: 'video/mp4', fileUri } }
      ]
    }]
  });
  
  // Parse enhanced response
  const analysisResult = parseEnhancedResponse(response);
  
  return NextResponse.json({ 
    analysis: analysisResult.segments,      // Backward compatibility
    contentGroups: analysisResult.contentGroups,  // New grouping data
    statistics: analysisResult.statistics
  });
}

function buildTalkingHeadPrompt(customPrompt: string, targetDuration?: number): string {
  return `
${customPrompt ? `USER CONTEXT: ${customPrompt}\n\n` : ''}

You are analyzing a talking head video for editing. The speaker likely recorded multiple takes of similar content.

PRIMARY OBJECTIVES:
1. Identify segments to remove (poor quality takes)
2. Group related segments by content similarity  
3. Identify which take to keep for each group
4. Provide quality reasoning for decisions

DETAILED INSTRUCTIONS:
[Full enhanced prompt here...]

${targetDuration ? `TARGET DURATION: Aim for approximately ${targetDuration} minutes final length.\n` : ''}

Return valid JSON only, no additional text.
`;
}
```

## Phase 2: Enhanced Data Types (Frontend)

### Updated TypeScript Interfaces

```typescript
// lib/types.ts - New file
export interface Take {
  segmentIndex: number;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'keep' | 'remove';
  qualityScore: number;  // 1-10 scale
  issues?: string[];     // What's wrong with this take
  qualities?: string[];  // What's good about this take
  transcript?: string;   // What was said
}

export interface ContentGroup {
  groupId: string;
  contentType: 'introduction' | 'content' | 'conclusion' | 'transition' | 'cta';
  description: string;   // Human readable description
  commonContent: string; // What all takes are trying to say
  takes: Take[];
  recommendedTake: number; // segmentIndex of the kept take
  reasoning: string;     // Why this take was chosen
}

export interface EnhancedAnalysisResult {
  segments: Segment[];        // Original format (backward compatibility)
  contentGroups: ContentGroup[]; // New grouped data
  statistics: {
    totalGroups: number;
    multiTakeGroups: number;
    qualityImprovement: string;
  };
  summary: {
    originalDuration: number;
    finalDuration: number;
    timeRemoved: number;
    segmentCount: number;
  };
}
```

### Updated State Management

```typescript
// app/page.tsx - Additional state
export default function Home() {
  // ... existing state ...
  
  // New state for content groups
  const [contentGroups, setContentGroups] = useState<ContentGroup[]>([]);
  const [viewMode, setViewMode] = useState<'segments' | 'groups'>('segments');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<'single' | 'sidebyside'>('single');
  
  // ... rest of component
}
```

## Phase 3: Comparison View UI Components

### Component 1: Content Groups Panel

```typescript
// components/ContentGroupsPanel.tsx
interface ContentGroupsPanelProps {
  groups: ContentGroup[];
  onGroupSelect: (groupId: string) => void;
  onTakeSwap: (groupId: string, newTakeIndex: number) => void;
  selectedGroup?: string;
}

export function ContentGroupsPanel({ groups, onGroupSelect, onTakeSwap, selectedGroup }: ContentGroupsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Content Groups</h3>
        <span className="text-sm text-gray-500">
          {groups.filter(g => g.takes.length > 1).length} multi-take sections
        </span>
      </div>
      
      {groups.map(group => (
        <ContentGroupCard
          key={group.groupId}
          group={group}
          isSelected={selectedGroup === group.groupId}
          onSelect={() => onGroupSelect(group.groupId)}
          onTakeSwap={(takeIndex) => onTakeSwap(group.groupId, takeIndex)}
        />
      ))}
    </div>
  );
}
```

### Component 2: Content Group Card

```typescript
// components/ContentGroupCard.tsx
interface ContentGroupCardProps {
  group: ContentGroup;
  isSelected: boolean;
  onSelect: () => void;
  onTakeSwap: (takeIndex: number) => void;
}

export function ContentGroupCard({ group, isSelected, onSelect, onTakeSwap }: ContentGroupCardProps) {
  const keptTake = group.takes.find(take => take.status === 'keep');
  const removedTakes = group.takes.filter(take => take.status === 'remove');
  
  return (
    <div 
      className={`border rounded-lg p-4 cursor-pointer transition-all ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      {/* Group Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <ContentTypeIcon type={group.contentType} />
          <div>
            <h4 className="font-medium">{group.description}</h4>
            <p className="text-sm text-gray-500">{group.takes.length} takes</p>
          </div>
        </div>
        
        {group.takes.length > 1 && (
          <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
            Multiple Takes
          </span>
        )}
      </div>
      
      {/* Kept Take */}
      {keptTake && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">KEPT</span>
              <span className="text-sm text-gray-600">
                {keptTake.startTime} - {keptTake.endTime}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <QualityMeter score={keptTake.qualityScore} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Preview this take
                }}
                className="p-1 text-green-600 hover:bg-green-100 rounded"
              >
                <Play className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {keptTake.transcript && (
            <p className="text-sm text-gray-700 mt-2 italic">
              "{keptTake.transcript}"
            </p>
          )}
          
          {keptTake.qualities && keptTake.qualities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {keptTake.qualities.map(quality => (
                <span key={quality} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                  {quality}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Removed Takes */}
      {removedTakes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <X className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-red-700">
              REMOVED ({removedTakes.length})
            </span>
          </div>
          
          {removedTakes.map((take, index) => (
            <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">
                    {take.startTime} - {take.endTime}
                  </span>
                  <QualityMeter score={take.qualityScore} />
                </div>
                
                <div className="flex items-center space-x-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Preview this removed take
                    }}
                    className="p-1 text-red-600 hover:bg-red-100 rounded"
                    title="Preview removed take"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTakeSwap(take.segmentIndex);
                    }}
                    className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                    title="Use this take instead"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
              
              {take.issues && take.issues.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {take.issues.map(issue => (
                    <span key={issue} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                      {issue}
                    </span>
                  ))}
                </div>
              )}
              
              {take.transcript && (
                <p className="text-xs text-gray-600 mt-1 italic">
                  "{take.transcript}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Reasoning */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          <strong>AI Reasoning:</strong> {group.reasoning}
        </p>
      </div>
    </div>
  );
}
```

### Component 3: Quality Meter

```typescript
// components/QualityMeter.tsx
interface QualityMeterProps {
  score: number; // 1-10
  size?: 'sm' | 'md' | 'lg';
}

export function QualityMeter({ score, size = 'sm' }: QualityMeterProps) {
  const percentage = (score / 10) * 100;
  const color = score >= 7 ? 'green' : score >= 5 ? 'yellow' : 'red';
  
  const sizeClasses = {
    sm: 'w-12 h-2',
    md: 'w-16 h-3',
    lg: 'w-20 h-4'
  };
  
  return (
    <div className="flex items-center space-x-2">
      <div className={`bg-gray-200 rounded-full ${sizeClasses[size]}`}>
        <div 
          className={`h-full rounded-full transition-all bg-${color}-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-600 font-medium">
        {score.toFixed(1)}
      </span>
    </div>
  );
}
```

### Component 4: Side-by-Side Comparison

```typescript
// components/SideBySideComparison.tsx
interface SideBySideComparisonProps {
  leftTake: Take;
  rightTake: Take;
  videoUrl: string;
  onClose: () => void;
}

export function SideBySideComparison({ leftTake, rightTake, videoUrl, onClose }: SideBySideComparisonProps) {
  const leftVideoRef = useRef<HTMLVideoElement>(null);
  const rightVideoRef = useRef<HTMLVideoElement>(null);
  const [syncPlayback, setSyncPlayback] = useState(true);
  
  const parseTime = (timeStr: string): number => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  };
  
  const playBoth = () => {
    if (leftVideoRef.current && rightVideoRef.current) {
      leftVideoRef.current.currentTime = parseTime(leftTake.startTime);
      rightVideoRef.current.currentTime = parseTime(rightTake.startTime);
      
      leftVideoRef.current.play();
      rightVideoRef.current.play();
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full mx-4 max-h-[90vh] overflow-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold">Compare Takes</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Controls */}
          <div className="flex items-center justify-center space-x-4 mb-6">
            <button 
              onClick={playBoth}
              className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Play className="w-4 h-4 mr-2" />
              Play Both
            </button>
            
            <label className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                checked={syncPlayback} 
                onChange={(e) => setSyncPlayback(e.target.checked)}
              />
              <span className="text-sm">Sync playback</span>
            </label>
          </div>
          
          {/* Video Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Video */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">
                  {leftTake.status === 'remove' ? 'Removed Take' : 'Kept Take'}
                </h4>
                <QualityMeter score={leftTake.qualityScore} size="md" />
              </div>
              
              <video
                ref={leftVideoRef}
                controls
                className="w-full rounded-lg bg-black"
                src={videoUrl}
                onLoadedMetadata={() => {
                  if (leftVideoRef.current) {
                    leftVideoRef.current.currentTime = parseTime(leftTake.startTime);
                  }
                }}
              />
              
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>Time:</strong> {leftTake.startTime} - {leftTake.endTime}
                </p>
                
                {leftTake.transcript && (
                  <p className="text-sm">
                    <strong>Transcript:</strong> "{leftTake.transcript}"
                  </p>
                )}
                
                {leftTake.issues && leftTake.issues.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-red-700">Issues:</p>
                    <div className="flex flex-wrap gap-1">
                      {leftTake.issues.map(issue => (
                        <span key={issue} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                          {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {leftTake.qualities && leftTake.qualities.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-green-700">Qualities:</p>
                    <div className="flex flex-wrap gap-1">
                      {leftTake.qualities.map(quality => (
                        <span key={quality} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                          {quality}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right Video - Similar structure */}
            <div className="space-y-4">
              {/* Similar structure as left video */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Phase 4: Integration with Existing Features

### Updated Main Page Component

```typescript
// app/page.tsx - Integration
export default function Home() {
  // ... existing state ...
  
  // New state for groups
  const [contentGroups, setContentGroups] = useState<ContentGroup[]>([]);
  const [viewMode, setViewMode] = useState<'segments' | 'groups'>('segments');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonTakes, setComparisonTakes] = useState<[Take, Take] | null>(null);
  
  // Handle analysis response
  const handleAnalysis = async (uri: string) => {
    // ... existing code ...
    
    const result = await response.json();
    setAnalysis(result.analysis);
    
    // New: Handle content groups
    if (result.contentGroups) {
      setContentGroups(result.contentGroups);
      
      // Auto-switch to groups view if there are multi-take groups
      const hasMultiTakes = result.contentGroups.some(g => g.takes.length > 1);
      if (hasMultiTakes) {
        setViewMode('groups');
      }
    }
    
    // ... rest of existing code ...
  };
  
  // Handle take swapping
  const handleTakeSwap = (groupId: string, newTakeIndex: number) => {
    const updatedGroups = contentGroups.map(group => {
      if (group.groupId === groupId) {
        // Update the group's recommended take
        const updatedTakes = group.takes.map(take => ({
          ...take,
          status: take.segmentIndex === newTakeIndex ? 'keep' : 'remove'
        }));
        
        return {
          ...group,
          takes: updatedTakes,
          recommendedTake: newTakeIndex
        };
      }
      return group;
    });
    
    setContentGroups(updatedGroups);
    
    // Also update the original segments data for export compatibility
    // ... update logic ...
  };
  
  // Render function updates
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      {/* ... existing code ... */}
      
      {analysis && (
        <div className="space-y-6">
          {/* Summary stats (existing) */}
          
          {/* View mode toggle */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Analysis Results</h2>
              
              {contentGroups.length > 0 && (
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('segments')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      viewMode === 'segments'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Segments View
                  </button>
                  <button
                    onClick={() => setViewMode('groups')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      viewMode === 'groups'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Groups View
                    {contentGroups.some(g => g.takes.length > 1) && (
                      <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                        {contentGroups.filter(g => g.takes.length > 1).length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
            
            {/* Conditional rendering based on view mode */}
            {viewMode === 'segments' ? (
              // Existing segments view
              <ExistingSegmentsView />
            ) : (
              // New groups view
              <ContentGroupsPanel 
                groups={contentGroups}
                onGroupSelect={setSelectedGroup}
                onTakeSwap={handleTakeSwap}
                selectedGroup={selectedGroup}
              />
            )}
          </div>
        </div>
      )}
      
      {/* Side-by-side comparison modal */}
      {showComparison && comparisonTakes && (
        <SideBySideComparison
          leftTake={comparisonTakes[0]}
          rightTake={comparisonTakes[1]}
          videoUrl={videoUrl!}
          onClose={() => setShowComparison(false)}
        />
      )}
    </main>
  );
}
```

## Phase 5: Testing & Validation Strategy

### Test Cases
1. **Single Take Content** - Verify normal behavior when no multiple takes exist
2. **Multiple Intro Takes** - Test grouping and comparison of intro attempts
3. **Mixed Content** - Video with some single takes, some multiple takes
4. **Quality Scoring** - Verify AI scores align with human perception
5. **Take Swapping** - Ensure user can override AI choices
6. **Export Functionality** - Verify filtered segments include user overrides

### User Testing Script
```
1. Upload a talking head video with multiple intro attempts
2. Verify AI groups similar content together
3. Check that quality scores make sense
4. Try swapping to a different take
5. Use side-by-side comparison
6. Export and verify correct segments are included
```

## Benefits of This Approach

### For Users
- ✅ **Understand AI decisions** - See why certain takes were chosen
- ✅ **Compare quality** - Side-by-side preview of takes
- ✅ **Override AI choices** - Select different takes if needed
- ✅ **Grouped organization** - Related content shown together
- ✅ **Quality transparency** - See scores and reasoning

### For Development
- ✅ **Incremental implementation** - Can build piece by piece
- ✅ **Backward compatibility** - Works with existing segment view
- ✅ **Performance friendly** - Uses single video element with seeking
- ✅ **Extensible** - Easy to add more features later

## Timeline Estimate

### Week 1: Backend Enhancement
- [ ] Enhance Gemini prompt
- [ ] Update API response structure
- [ ] Add new TypeScript interfaces
- [ ] Test with real talking head videos

### Week 2: Core UI Components
- [ ] Build ContentGroupsPanel
- [ ] Create ContentGroupCard with quality display
- [ ] Add view mode toggle
- [ ] Implement basic take swapping

### Week 3: Comparison Features
- [ ] Build SideBySideComparison modal
- [ ] Add synchronized playback
- [ ] Create quality meter component
- [ ] Integrate with existing preview system

### Week 4: Testing & Polish
- [ ] User testing with real videos
- [ ] Performance optimization
- [ ] Bug fixes and edge cases
- [ ] Documentation updates

## Next Steps

1. **Validate the enhanced prompt** - Test with a few talking head videos to see if Gemini can identify and group multiple takes
2. **Create proof of concept** - Build a simple version of the ContentGroupCard
3. **Design feedback loop** - Plan how user take swapping affects the final export

This approach gives users the context they need to understand and improve AI editing decisions while maintaining the performance and simplicity of the current system.

---
*Implementation Priority: High - This directly addresses the core user need for understanding relationships between removed and kept content in talking head videos.*