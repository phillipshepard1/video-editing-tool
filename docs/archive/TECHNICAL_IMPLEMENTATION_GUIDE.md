# Technical Implementation Guide
# Smart Filtering System - Developer Specifications

**For:** Sonnet/Developer Implementation  
**Prerequisite:** Read PRD_SMART_FILTERING_SYSTEM.md first  
**Date:** January 12, 2025

---

## 1. Quick Start for Sonnet

```markdown
CONTEXT: 
- We have a working video editor that shows segments to remove
- Currently shows ALL segments equally (overwhelming)
- Need to add smart filtering with categories and priorities

YOUR TASK:
1. Update Gemini API prompt to categorize segments
2. Add filter state management to app/page.tsx
3. Create FilterPanel component with checkboxes
4. Update segment display to respect active filters
5. Add category badges to segment cards

KEY FILES TO MODIFY:
- app/api/analysis/process/route.ts (Gemini prompt)
- app/page.tsx (filter state)
- components/FilterPanel.tsx (NEW)
- components/SegmentCard.tsx (NEW/UPDATE)
```

---

## 2. Exact Code Structure Changes

### 2.1 Updated TypeScript Interfaces

```typescript
// lib/types/segments.ts (NEW FILE)
export enum SegmentCategory {
  // Primary categories (shown by default)
  BAD_TAKE = 'bad_take',
  PAUSE = 'pause', 
  FALSE_START = 'false_start',
  FILLER_WORDS = 'filler_words',
  TECHNICAL = 'technical',
  
  // Secondary categories (hidden by default)
  REDUNDANT = 'redundant',
  TANGENT = 'tangent',
  LOW_ENERGY = 'low_energy',
  LONG_EXPLANATION = 'long_explanation',
  WEAK_TRANSITION = 'weak_transition'
}

export type SeverityLevel = 'high' | 'medium' | 'low';

export interface EnhancedSegment {
  // Existing fields (keep these)
  startTime: string;
  endTime: string;
  duration: number;
  reason: string;
  confidence: number;
  
  // NEW fields to add
  category: SegmentCategory;
  severity: SeverityLevel;
  contextNote?: string; // e.g., "May be intentional for emphasis"
  alternativeSegment?: {
    startTime: string;
    endTime: string;
    reason: string;
  }; // For bad takes, reference to good take
  transcript?: string; // First 50 chars of what was said
}

export interface FilterState {
  // Primary filters (default true)
  [SegmentCategory.BAD_TAKE]: boolean;
  [SegmentCategory.PAUSE]: boolean;
  [SegmentCategory.FALSE_START]: boolean;
  [SegmentCategory.FILLER_WORDS]: boolean;
  [SegmentCategory.TECHNICAL]: boolean;
  
  // Secondary filters (default false)
  [SegmentCategory.REDUNDANT]: boolean;
  [SegmentCategory.TANGENT]: boolean;
  [SegmentCategory.LOW_ENERGY]: boolean;
  [SegmentCategory.LONG_EXPLANATION]: boolean;
  [SegmentCategory.WEAK_TRANSITION]: boolean;
  
  // Meta filters
  showOnlyHighSeverity: boolean;
  minConfidence: number;
}

// Default filter state factory
export const createDefaultFilterState = (): FilterState => ({
  [SegmentCategory.BAD_TAKE]: true,
  [SegmentCategory.PAUSE]: true,
  [SegmentCategory.FALSE_START]: true,
  [SegmentCategory.FILLER_WORDS]: true,
  [SegmentCategory.TECHNICAL]: true,
  [SegmentCategory.REDUNDANT]: false,
  [SegmentCategory.TANGENT]: false,
  [SegmentCategory.LOW_ENERGY]: false,
  [SegmentCategory.LONG_EXPLANATION]: false,
  [SegmentCategory.WEAK_TRANSITION]: false,
  showOnlyHighSeverity: false,
  minConfidence: 0.7
});
```

### 2.2 Updated Gemini Prompt

```typescript
// app/api/analysis/process/route.ts - UPDATE THIS SECTION

const buildEnhancedPrompt = (customPrompt?: string, targetDuration?: number) => {
  return `
You are analyzing a video for editing. Categorize each segment to remove into specific types.

SEGMENT CATEGORIES:

PRIMARY (Usually should be cut):
- BAD_TAKE: Multiple attempts where this one is clearly worse
- PAUSE: Silence longer than 2 seconds
- FALSE_START: Incomplete thoughts, "let me start over", restarts
- FILLER_WORDS: Excessive "um", "uh", "like" (more than 3 in 10 seconds)
- TECHNICAL: Audio pops, video issues, focus problems

SECONDARY (Context-dependent, might be intentional):
- REDUNDANT: Repeated information (note if it might be for emphasis)
- TANGENT: Off-topic content (note if it adds personality/context)
- LOW_ENERGY: Quieter delivery (note if appropriate for content)
- LONG_EXPLANATION: Extended detailed sections (note if necessary)
- WEAK_TRANSITION: Awkward topic changes (note if natural conversation)

For each segment to remove, provide:
{
  "startTime": "00:00:00",
  "endTime": "00:00:15",
  "duration": 15,
  "category": "FALSE_START" (use exact enum values above),
  "severity": "high" | "medium" | "low",
  "confidence": 0.95,
  "reason": "Speaker says 'um, let me start over' and restarts introduction",
  "transcript": "Um, let me start over. Hi everyone...",
  "contextNote": "No reason to keep this false start",
  "alternativeSegment": {
    "startTime": "00:01:30",
    "endTime": "00:01:45", 
    "reason": "Clean introduction with no stutters"
  } // Include for BAD_TAKE category
}

${customPrompt ? `\nUSER CONTEXT: ${customPrompt}` : ''}
${targetDuration ? `\nTARGET DURATION: ${targetDuration} minutes` : ''}

IMPORTANT:
- Use EXACT category names from the enum
- Always include severity and confidence
- For BAD_TAKE, always include alternativeSegment
- For SECONDARY categories, always include contextNote explaining when to keep
- Include first 50 characters of transcript when available

Return ONLY valid JSON array of segments.
`;
};
```

### 2.3 Filter Panel Component

```typescript
// components/FilterPanel.tsx (NEW FILE)
import { useState } from 'react';
import { SegmentCategory, FilterState, createDefaultFilterState } from '@/lib/types/segments';

interface FilterPanelProps {
  segments: EnhancedSegment[];
  filterState: FilterState;
  onFilterChange: (newState: FilterState) => void;
  onBulkAction: (category: SegmentCategory, action: 'keep' | 'remove') => void;
}

const CATEGORY_META = {
  [SegmentCategory.BAD_TAKE]: { 
    icon: '🔄', 
    label: 'Bad Takes', 
    color: 'red',
    description: 'Inferior versions of content'
  },
  [SegmentCategory.PAUSE]: { 
    icon: '⏸️', 
    label: 'Pauses', 
    color: 'yellow',
    description: 'Silence > 2 seconds'
  },
  [SegmentCategory.FALSE_START]: { 
    icon: '🔁', 
    label: 'False Starts', 
    color: 'orange',
    description: 'Incomplete attempts'
  },
  [SegmentCategory.FILLER_WORDS]: { 
    icon: '💬', 
    label: 'Filler Words', 
    color: 'purple',
    description: 'Excessive um, uh, like'
  },
  [SegmentCategory.TECHNICAL]: { 
    icon: '⚠️', 
    label: 'Technical Issues', 
    color: 'gray',
    description: 'Audio/video problems'
  },
  [SegmentCategory.REDUNDANT]: { 
    icon: '♻️', 
    label: 'Redundant', 
    color: 'blue',
    description: 'Repeated content (may be intentional)'
  },
  [SegmentCategory.TANGENT]: { 
    icon: '↗️', 
    label: 'Tangents', 
    color: 'green',
    description: 'Off-topic (may add personality)'
  },
  [SegmentCategory.LOW_ENERGY]: { 
    icon: '📉', 
    label: 'Low Energy', 
    color: 'indigo',
    description: 'Quiet delivery (may fit mood)'
  },
  [SegmentCategory.LONG_EXPLANATION]: { 
    icon: '📝', 
    label: 'Long Explanations', 
    color: 'pink',
    description: 'Extended sections (may be needed)'
  },
  [SegmentCategory.WEAK_TRANSITION]: { 
    icon: '🔀', 
    label: 'Weak Transitions', 
    color: 'teal',
    description: 'Awkward changes (may be natural)'
  }
};

export function FilterPanel({ segments, filterState, onFilterChange, onBulkAction }: FilterPanelProps) {
  const [showSecondary, setShowSecondary] = useState(false);
  
  // Count segments by category and severity
  const getCategoryCount = (category: SegmentCategory) => {
    return segments.filter(s => s.category === category).length;
  };
  
  const getSeverityBreakdown = (category: SegmentCategory) => {
    const categorySegments = segments.filter(s => s.category === category);
    return {
      high: categorySegments.filter(s => s.severity === 'high').length,
      medium: categorySegments.filter(s => s.severity === 'medium').length,
      low: categorySegments.filter(s => s.severity === 'low').length
    };
  };
  
  const primaryCategories = [
    SegmentCategory.BAD_TAKE,
    SegmentCategory.PAUSE,
    SegmentCategory.FALSE_START,
    SegmentCategory.FILLER_WORDS,
    SegmentCategory.TECHNICAL
  ];
  
  const secondaryCategories = [
    SegmentCategory.REDUNDANT,
    SegmentCategory.TANGENT,
    SegmentCategory.LOW_ENERGY,
    SegmentCategory.LONG_EXPLANATION,
    SegmentCategory.WEAK_TRANSITION
  ];
  
  const activeSegmentCount = segments.filter(segment => {
    if (!filterState[segment.category]) return false;
    if (filterState.showOnlyHighSeverity && segment.severity !== 'high') return false;
    if (segment.confidence < filterState.minConfidence) return false;
    return true;
  }).length;
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Smart Filters</h3>
        <span className="text-sm text-gray-500">
          Showing {activeSegmentCount} of {segments.length} segments
        </span>
      </div>
      
      {/* Primary Filters */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">STANDARD CUTS (Recommended)</h4>
        {primaryCategories.map(category => {
          const count = getCategoryCount(category);
          const severity = getSeverityBreakdown(category);
          const meta = CATEGORY_META[category];
          
          return (
            <div key={category} className="flex items-center justify-between">
              <label className="flex items-center space-x-3 flex-1">
                <input
                  type="checkbox"
                  checked={filterState[category]}
                  onChange={(e) => {
                    onFilterChange({
                      ...filterState,
                      [category]: e.target.checked
                    });
                  }}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="text-sm">
                  {meta.icon} {meta.label} ({count})
                </span>
              </label>
              
              {count > 0 && (
                <div className="flex items-center space-x-2">
                  {/* Severity indicators */}
                  <div className="flex space-x-1">
                    {severity.high > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                        {severity.high}H
                      </span>
                    )}
                    {severity.medium > 0 && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                        {severity.medium}M
                      </span>
                    )}
                    {severity.low > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {severity.low}L
                      </span>
                    )}
                  </div>
                  
                  <button
                    onClick={() => onBulkAction(category, 'remove')}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove all
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Secondary Filters (Collapsible) */}
      <div className="mt-6">
        <button
          onClick={() => setShowSecondary(!showSecondary)}
          className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <span>{showSecondary ? '▼' : '▶'}</span>
          <span>OPTIONAL CUTS ({secondaryCategories.reduce((sum, cat) => sum + getCategoryCount(cat), 0)} available)</span>
        </button>
        
        {showSecondary && (
          <div className="mt-3 space-y-3 pl-6">
            {secondaryCategories.map(category => {
              const count = getCategoryCount(category);
              const meta = CATEGORY_META[category];
              
              return (
                <div key={category} className="flex items-center justify-between">
                  <label className="flex items-center space-x-3 flex-1">
                    <input
                      type="checkbox"
                      checked={filterState[category]}
                      onChange={(e) => {
                        onFilterChange({
                          ...filterState,
                          [category]: e.target.checked
                        });
                      }}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <div>
                      <span className="text-sm">
                        {meta.icon} {meta.label} ({count})
                      </span>
                      <p className="text-xs text-gray-500">{meta.description}</p>
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Advanced Filters */}
      <div className="mt-6 pt-6 border-t space-y-3">
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={filterState.showOnlyHighSeverity}
            onChange={(e) => {
              onFilterChange({
                ...filterState,
                showOnlyHighSeverity: e.target.checked
              });
            }}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <span className="text-sm">Show only high severity issues</span>
        </label>
        
        <div className="flex items-center space-x-3">
          <span className="text-sm">Min confidence:</span>
          <input
            type="range"
            min="0.5"
            max="1"
            step="0.1"
            value={filterState.minConfidence}
            onChange={(e) => {
              onFilterChange({
                ...filterState,
                minConfidence: parseFloat(e.target.value)
              });
            }}
            className="flex-1"
          />
          <span className="text-sm font-medium">{(filterState.minConfidence * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
```

### 2.4 Updated Main Page Integration

```typescript
// app/page.tsx - ADD these imports and state
import { FilterPanel } from '@/components/FilterPanel';
import { EnhancedSegment, FilterState, createDefaultFilterState, SegmentCategory } from '@/lib/types/segments';

export default function Home() {
  // ... existing state ...
  
  // ADD: Filter state
  const [filterState, setFilterState] = useState<FilterState>(createDefaultFilterState());
  const [bulkActions, setBulkActions] = useState<Map<string, 'keep' | 'remove'>>(new Map());
  
  // UPDATE: Analysis state to use EnhancedSegment
  const [analysis, setAnalysis] = useState<{
    segmentsToRemove: EnhancedSegment[];
    summary: any; // existing summary type
  } | null>(null);
  
  // ADD: Filtered segments computation
  const getFilteredSegments = () => {
    if (!analysis) return [];
    
    return analysis.segmentsToRemove.filter(segment => {
      // Check bulk actions first
      const segmentKey = `${segment.startTime}-${segment.endTime}`;
      if (bulkActions.has(segmentKey)) {
        return bulkActions.get(segmentKey) === 'remove';
      }
      
      // Check category filter
      if (!filterState[segment.category]) return false;
      
      // Check severity filter
      if (filterState.showOnlyHighSeverity && segment.severity !== 'high') {
        return false;
      }
      
      // Check confidence filter
      if (segment.confidence < filterState.minConfidence) {
        return false;
      }
      
      return true;
    });
  };
  
  // ADD: Bulk action handler
  const handleBulkAction = (category: SegmentCategory, action: 'keep' | 'remove') => {
    const newBulkActions = new Map(bulkActions);
    
    analysis?.segmentsToRemove
      .filter(segment => segment.category === category)
      .forEach(segment => {
        const key = `${segment.startTime}-${segment.endTime}`;
        if (action === 'remove') {
          newBulkActions.delete(key); // Use default filtering
        } else {
          newBulkActions.set(key, action);
        }
      });
    
    setBulkActions(newBulkActions);
  };
  
  // ... rest of component ...
  
  return (
    <main>
      {/* ... existing UI ... */}
      
      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filter Panel - Left sidebar on desktop */}
          <div className="lg:col-span-1">
            <FilterPanel
              segments={analysis.segmentsToRemove}
              filterState={filterState}
              onFilterChange={setFilterState}
              onBulkAction={handleBulkAction}
            />
          </div>
          
          {/* Segments List - Main content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold mb-4">
                Segments to Review
                <span className="ml-2 text-sm text-gray-500">
                  ({getFilteredSegments().length} matching filters)
                </span>
              </h3>
              
              <div className="space-y-3">
                {getFilteredSegments().map((segment, index) => (
                  <SegmentCard
                    key={index}
                    segment={segment}
                    onKeep={() => handleSegmentAction(segment, 'keep')}
                    onRemove={() => handleSegmentAction(segment, 'remove')}
                    onPreview={() => handleSegmentPreview(segment)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
```

### 2.5 Segment Card with Categories

```typescript
// components/SegmentCard.tsx (NEW/UPDATE)
import { EnhancedSegment, SegmentCategory } from '@/lib/types/segments';

interface SegmentCardProps {
  segment: EnhancedSegment;
  onKeep: () => void;
  onRemove: () => void;
  onPreview: () => void;
}

const CATEGORY_STYLES = {
  [SegmentCategory.BAD_TAKE]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: '🔄'
  },
  [SegmentCategory.PAUSE]: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: '⏸️'
  },
  // ... add all categories ...
};

export function SegmentCard({ segment, onKeep, onRemove, onPreview }: SegmentCardProps) {
  const style = CATEGORY_STYLES[segment.category];
  
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
      {/* Category Badge */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${style.bg} ${style.text}`}>
            {style.icon} {segment.category.replace('_', ' ')}
          </span>
          
          {/* Severity Badge */}
          <span className={`px-2 py-1 text-xs rounded ${
            segment.severity === 'high' ? 'bg-red-100 text-red-700' :
            segment.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {segment.severity}
          </span>
          
          {/* Confidence */}
          <span className="text-xs text-gray-500">
            {(segment.confidence * 100).toFixed(0)}% confident
          </span>
        </div>
        
        <span className="text-sm font-medium">
          {segment.startTime} - {segment.endTime}
        </span>
      </div>
      
      {/* Reason */}
      <p className="text-sm text-gray-700 mb-2">{segment.reason}</p>
      
      {/* Transcript Preview */}
      {segment.transcript && (
        <p className="text-xs text-gray-500 italic mb-2">
          "{segment.transcript}..."
        </p>
      )}
      
      {/* Alternative Segment (for bad takes) */}
      {segment.alternativeSegment && (
        <div className="bg-green-50 border border-green-200 rounded p-2 mb-2">
          <p className="text-xs text-green-700">
            ✅ Better version at: {segment.alternativeSegment.startTime} - {segment.alternativeSegment.endTime}
          </p>
        </div>
      )}
      
      {/* Context Note */}
      {segment.contextNote && (
        <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
          <p className="text-xs text-blue-700">
            💡 {segment.contextNote}
          </p>
        </div>
      )}
      
      {/* Actions */}
      <div className="flex space-x-2 mt-3">
        <button
          onClick={onPreview}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
        >
          Preview
        </button>
        <button
          onClick={onKeep}
          className="px-3 py-1 text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded"
        >
          Keep
        </button>
        <button
          onClick={onRemove}
          className="px-3 py-1 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
```

---

## 3. Step-by-Step Implementation for Sonnet

### Step 1: Create Type Definitions
1. Create `lib/types/segments.ts` with all interfaces and enums
2. Export all types and the default filter state factory

### Step 2: Update API Route
1. Open `app/api/analysis/process/route.ts`
2. Replace the prompt builder with the enhanced version
3. Ensure response parsing handles new fields

### Step 3: Create FilterPanel Component
1. Create `components/FilterPanel.tsx`
2. Copy the complete component code
3. Ensure all imports are correct

### Step 4: Update Main Page
1. Add filter state to `app/page.tsx`
2. Import new types and components
3. Add filter panel to layout
4. Update segment display logic

### Step 5: Create/Update SegmentCard
1. Create or update `components/SegmentCard.tsx`
2. Add category badges and styling
3. Include alternative segment display for bad takes

### Step 6: Test Flow
1. Upload a video
2. Check that segments have categories
3. Toggle filters and verify list updates
4. Test bulk actions
5. Verify export respects filters

---

## 4. Common Issues & Solutions

### Issue: Gemini not returning categories
**Solution:** Check prompt format, ensure using exact enum values

### Issue: Filters not updating UI
**Solution:** Verify getFilteredSegments() is called in render

### Issue: TypeScript errors
**Solution:** Ensure all imports include proper types

### Issue: Performance with many segments
**Solution:** Use React.memo on SegmentCard, virtualize list if >100 items

---

## 5. Testing Checklist

- [ ] Categories appear on all segments
- [ ] Primary filters default to ON
- [ ] Secondary filters default to OFF
- [ ] Filter toggles update segment count
- [ ] Bulk actions work per category
- [ ] Alternative segments show for bad takes
- [ ] Context notes appear for secondary categories
- [ ] Export respects current filter state
- [ ] Performance acceptable with 100+ segments

---

This guide provides Sonnet with:
1. Exact code to copy/paste
2. Clear file locations
3. Step-by-step implementation order
4. Common issues to watch for
5. Testing criteria

Sonnet should be able to implement this feature completely with this level of detail.