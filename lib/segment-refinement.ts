/**
 * Segment Boundary Refinement for Precise Speech Detection
 * Post-processes Gemini analysis to trim silence from segment boundaries
 */

import { EnhancedAnalysisResult, Take, ContentGroup } from '@/lib/types/takes';
import { timeStringToSeconds, secondsToTimeString } from './audio-analysis';

export interface RefinedSegment {
  id: string;
  originalStart: number;
  originalEnd: number;
  refinedStart: number;
  refinedEnd: number;
  leadingSilenceTrimmed: number;
  trailingSilenceTrimmed: number;
  reason: string;
  category: string;
  confidence: number;
  wasRefined: boolean;
}

export interface RefinedTake extends Take {
  originalStartTime: string;
  originalEndTime: string;
  refinedStartTime: string;
  refinedEndTime: string;
  speechStart?: string;
  speechEnd?: string;
  leadingSilence?: number;
  trailingSilence?: number;
  wasRefined: boolean;
}

export interface RefinedContentGroup extends ContentGroup {
  takes: RefinedTake[];
  refinedTimeRange?: {
    start: string;
    end: string;
  };
}

/**
 * Refines the boundaries of segments based on speech detection data
 * If Gemini provides speechStart/speechEnd, use those; otherwise fall back to segment boundaries
 */
export function refineAnalysisResults(analysis: EnhancedAnalysisResult): EnhancedAnalysisResult {
  const refined: EnhancedAnalysisResult = {
    ...analysis,
    segments: [],
    contentGroups: [],
  };

  // Refine regular segments
  if (analysis.segments) {
    refined.segments = analysis.segments.map(segment => {
      // Check if segment has speech boundary data
      const speechStart = (segment as any).speechStart;
      const speechEnd = (segment as any).speechEnd;
      
      if (speechStart && speechEnd) {
        // Use refined boundaries from Gemini
        return {
          ...segment,
          originalStartTime: segment.startTime,
          originalEndTime: segment.endTime,
          startTime: speechStart,
          endTime: speechEnd,
          wasRefined: true,
          leadingSilence: (segment as any).leadingSilence || 0,
          trailingSilence: (segment as any).trailingSilence || 0,
        };
      } else {
        // No refinement data available
        return {
          ...segment,
          wasRefined: false,
        };
      }
    });
  }

  // Refine content groups
  if (analysis.contentGroups) {
    refined.contentGroups = analysis.contentGroups.map(group => {
      const refinedGroup: RefinedContentGroup = {
        ...group,
        takes: [],
      };

      // Refine each take in the group
      refinedGroup.takes = group.takes.map(take => {
        const refinedTake: RefinedTake = {
          ...take,
          originalStartTime: take.startTime,
          originalEndTime: take.endTime,
          refinedStartTime: take.startTime,
          refinedEndTime: take.endTime,
          wasRefined: false,
        };

        // Check if take has speech boundary data
        const speechStart = (take as any).speechStart;
        const speechEnd = (take as any).speechEnd;
        const leadingSilence = (take as any).leadingSilence;
        const trailingSilence = (take as any).trailingSilence;

        if (speechStart && speechEnd) {
          refinedTake.refinedStartTime = speechStart;
          refinedTake.refinedEndTime = speechEnd;
          refinedTake.speechStart = speechStart;
          refinedTake.speechEnd = speechEnd;
          refinedTake.leadingSilence = leadingSilence || 0;
          refinedTake.trailingSilence = trailingSilence || 0;
          refinedTake.wasRefined = true;

          // Update duration to reflect actual speech duration
          const speechDuration = (take as any).speechDuration;
          if (speechDuration) {
            refinedTake.duration = speechDuration;
          } else {
            // Calculate from refined boundaries
            const startSec = timeStringToSeconds(speechStart);
            const endSec = timeStringToSeconds(speechEnd);
            refinedTake.duration = endSec - startSec;
          }
        }

        return refinedTake;
      });

      // Update group time range based on refined takes
      if (refinedGroup.takes.length > 0) {
        const starts = refinedGroup.takes.map(t => 
          timeStringToSeconds(t.wasRefined ? t.refinedStartTime : t.startTime)
        );
        const ends = refinedGroup.takes.map(t => 
          timeStringToSeconds(t.wasRefined ? t.refinedEndTime : t.endTime)
        );

        refinedGroup.refinedTimeRange = {
          start: secondsToTimeString(Math.min(...starts)),
          end: secondsToTimeString(Math.max(...ends)),
        };
      }

      return refinedGroup;
    });
  }

  return refined;
}

/**
 * Applies silence trimming settings to segment boundaries
 * @param segments Array of segments to process
 * @param trimLeadingSilence Whether to trim silence at the beginning
 * @param trimTrailingSilence Whether to trim silence at the end
 * @param silenceThreshold Minimum silence duration to trim (seconds)
 */
export function applySilenceTrimming(
  segments: any[],
  trimLeadingSilence: boolean = true,
  trimTrailingSilence: boolean = true,
  silenceThreshold: number = 0.5
): any[] {
  return segments.map(segment => {
    const refined = { ...segment };
    
    // Check for leading silence
    if (trimLeadingSilence && segment.leadingSilence > silenceThreshold) {
      const originalStart = timeStringToSeconds(segment.startTime);
      const trimAmount = Math.max(0, segment.leadingSilence - 0.1); // Leave 0.1s buffer
      refined.startTime = secondsToTimeString(originalStart + trimAmount);
      refined.leadingSilenceTrimmed = trimAmount;
    }
    
    // Check for trailing silence
    if (trimTrailingSilence && segment.trailingSilence > silenceThreshold) {
      const originalEnd = timeStringToSeconds(segment.endTime);
      const trimAmount = Math.max(0, segment.trailingSilence - 0.1); // Leave 0.1s buffer
      refined.endTime = secondsToTimeString(originalEnd - trimAmount);
      refined.trailingSilenceTrimmed = trimAmount;
    }
    
    return refined;
  });
}

/**
 * Merges adjacent segments if they're very close together
 * This helps avoid choppy edits when segments are within a threshold
 */
export function mergeAdjacentSegments(
  segments: any[],
  mergeThreshold: number = 0.5 // seconds
): any[] {
  if (segments.length <= 1) return segments;
  
  const sorted = [...segments].sort((a, b) => {
    const aStart = timeStringToSeconds(a.startTime);
    const bStart = timeStringToSeconds(b.startTime);
    return aStart - bStart;
  });
  
  const merged: any[] = [];
  let current = sorted[0];
  
  for (let i = 1; i < sorted.length; i++) {
    const currentEnd = timeStringToSeconds(current.endTime);
    const nextStart = timeStringToSeconds(sorted[i].startTime);
    
    if (nextStart - currentEnd <= mergeThreshold) {
      // Merge segments
      current = {
        ...current,
        endTime: sorted[i].endTime,
        reason: `${current.reason}; ${sorted[i].reason}`,
        wasMerged: true,
        mergedSegments: [
          ...(current.mergedSegments || [current]),
          sorted[i]
        ]
      };
    } else {
      // Keep segments separate
      merged.push(current);
      current = sorted[i];
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * Validates that refined segments don't overlap or have invalid boundaries
 */
export function validateRefinedSegments(segments: any[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Sort segments by start time
  const sorted = [...segments].sort((a, b) => {
    const aStart = timeStringToSeconds(a.startTime);
    const bStart = timeStringToSeconds(b.startTime);
    return aStart - bStart;
  });
  
  for (let i = 0; i < sorted.length; i++) {
    const segment = sorted[i];
    const start = timeStringToSeconds(segment.startTime);
    const end = timeStringToSeconds(segment.endTime);
    
    // Check for invalid boundaries
    if (start >= end) {
      errors.push(`Segment ${i}: Invalid boundaries (start >= end): ${segment.startTime} - ${segment.endTime}`);
    }
    
    // Check for very short segments
    if (end - start < 0.1) {
      warnings.push(`Segment ${i}: Very short duration (< 0.1s): ${segment.startTime} - ${segment.endTime}`);
    }
    
    // Check for overlaps with next segment
    if (i < sorted.length - 1) {
      const nextStart = timeStringToSeconds(sorted[i + 1].startTime);
      if (end > nextStart) {
        errors.push(`Segments ${i} and ${i + 1} overlap: ${segment.endTime} > ${sorted[i + 1].startTime}`);
      }
    }
    
    // Check for excessive silence trimming
    if (segment.leadingSilenceTrimmed > 10) {
      warnings.push(`Segment ${i}: Excessive leading silence trimmed (${segment.leadingSilenceTrimmed}s)`);
    }
    if (segment.trailingSilenceTrimmed > 10) {
      warnings.push(`Segment ${i}: Excessive trailing silence trimmed (${segment.trailingSilenceTrimmed}s)`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Adjusts segment boundaries to ensure smooth transitions
 * Adds small buffers to avoid cutting off speech
 */
export function addTransitionBuffers(
  segments: any[],
  bufferDuration: number = 0.15 // seconds
): any[] {
  return segments.map(segment => {
    const start = timeStringToSeconds(segment.startTime);
    const end = timeStringToSeconds(segment.endTime);
    
    // Add buffer at start (but not before 0)
    const bufferedStart = Math.max(0, start - bufferDuration);
    
    // Add buffer at end
    const bufferedEnd = end + bufferDuration;
    
    return {
      ...segment,
      startTime: secondsToTimeString(bufferedStart),
      endTime: secondsToTimeString(bufferedEnd),
      hasTransitionBuffer: true,
      bufferDuration
    };
  });
}

/**
 * Main function to process and refine analysis results
 */
export function processAnalysisWithRefinement(
  analysis: EnhancedAnalysisResult,
  options: {
    trimSilence?: boolean;
    mergeAdjacent?: boolean;
    addBuffers?: boolean;
    silenceThreshold?: number;
    mergeThreshold?: number;
    bufferDuration?: number;
  } = {}
): EnhancedAnalysisResult {
  const {
    trimSilence = true,
    mergeAdjacent = true,
    addBuffers = true,
    silenceThreshold = 0.5,
    mergeThreshold = 0.5,
    bufferDuration = 0.15
  } = options;
  
  // Step 1: Apply initial refinement from Gemini data
  let refined = refineAnalysisResults(analysis);
  
  // Step 2: Apply silence trimming if enabled
  if (trimSilence && refined.segments) {
    refined.segments = applySilenceTrimming(
      refined.segments,
      true,
      true,
      silenceThreshold
    );
  }
  
  // Step 3: Merge adjacent segments if enabled
  if (mergeAdjacent && refined.segments) {
    refined.segments = mergeAdjacentSegments(refined.segments, mergeThreshold);
  }
  
  // Step 4: Add transition buffers if enabled
  if (addBuffers && refined.segments) {
    refined.segments = addTransitionBuffers(refined.segments, bufferDuration);
  }
  
  // Step 5: Validate the refined segments
  if (refined.segments) {
    const validation = validateRefinedSegments(refined.segments);
    if (!validation.valid) {
      console.error('Segment validation errors:', validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.warn('Segment validation warnings:', validation.warnings);
    }
  }
  
  return refined;
}