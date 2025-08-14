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
  id: string;
  selected: boolean;
  startTime: string;
  endTime: string;
  duration: number;
  reason: string;
  confidence: number;
  
  // Category can be old string format or new enum
  category: SegmentCategory | 'pause' | 'filler' | 'redundant' | 'redundancy' | 'off-topic' | 'off_topic' | 'technical' | 'dead_air';
  severity?: SeverityLevel;
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