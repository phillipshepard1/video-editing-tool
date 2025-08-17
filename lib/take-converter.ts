import { ContentGroup, Take, EnhancedAnalysisResult } from '@/lib/types/takes';
import { EnhancedSegment } from '@/lib/types/segments';

/**
 * Convert legacy segment analysis to enhanced take groups
 * This is a fallback for when enhanced analysis is not available
 */
export function convertSegmentsToTakeGroups(segments: EnhancedSegment[]): ContentGroup[] {
  const groups: ContentGroup[] = [];
  const processedSegments = new Set<string>();

  // Group segments by proximity and similarity
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    if (processedSegments.has(segment.id)) continue;

    // Look for nearby segments that might be multiple takes
    const nearbySegments = segments.filter((s, idx) => {
      if (processedSegments.has(s.id) || idx === i) return false;
      
      const timeA = parseTime(segment.startTime);
      const timeB = parseTime(s.startTime);
      const timeDiff = Math.abs(timeA - timeB);
      
      // Within 30 seconds and similar content/category
      return timeDiff < 30 && (
        s.category === segment.category ||
        (segment.reason && s.reason && calculateSimilarity(segment.reason, s.reason) > 0.6)
      );
    });

    if (nearbySegments.length > 0) {
      // Create a content group from similar segments
      const groupSegments = [segment, ...nearbySegments];
      const takes = groupSegments.map(convertSegmentToTake);
      
      // Determine best take (highest confidence or shortest duration for similar confidence)
      const bestTake = takes.reduce((best, current) => {
        if (current.confidence > best.confidence) return current;
        if (current.confidence === best.confidence && current.duration < best.duration) return current;
        return best;
      });

      const group: ContentGroup = {
        id: `legacy-group-${groups.length + 1}`,
        name: inferGroupName(segment, groupSegments.length),
        description: `${groupSegments.length} similar attempts detected`,
        takes,
        bestTakeId: bestTake.id,
        reasoning: `Selected based on ${bestTake.confidence > 0.8 ? 'high confidence' : 'shortest duration'} among similar takes`,
        contentType: inferContentType(segment),
        timeRange: {
          start: Math.min(...groupSegments.map(s => parseTime(s.startTime))).toString(),
          end: Math.max(...groupSegments.map(s => parseTime(s.endTime))).toString()
        },
        averageQuality: takes.reduce((sum, t) => sum + t.qualityScore, 0) / takes.length,
        confidence: 0.7 // Lower confidence for converted groups
      };

      groups.push(group);
      
      // Mark all segments as processed
      groupSegments.forEach(s => processedSegments.add(s.id));
    }
  }

  return groups;
}

/**
 * Convert a legacy segment to a take
 */
function convertSegmentToTake(segment: EnhancedSegment): Take {
  // Estimate quality score based on confidence and category
  let qualityScore = Math.max(1, Math.min(10, segment.confidence * 10));
  
  // Adjust based on category
  if (segment.category === 'bad_take') qualityScore *= 0.3;
  else if (segment.category === 'false_start') qualityScore *= 0.4;
  else if (segment.category === 'technical') qualityScore *= 0.2;
  else if (segment.category === 'filler_words') qualityScore *= 0.7;
  
  const issues = [];
  const qualities = [];

  // Infer issues from category and reason
  if (segment.category === 'pause') {
    issues.push({
      type: 'pacing' as const,
      severity: 'medium' as const,
      description: 'Contains long pauses'
    });
  } else if (segment.category === 'filler_words') {
    issues.push({
      type: 'delivery' as const,
      severity: 'low' as const,
      description: 'Contains filler words'
    });
  } else if (segment.category === 'technical') {
    issues.push({
      type: 'technical' as const,
      severity: 'high' as const,
      description: 'Technical issues detected'
    });
  }

  // Add qualities for higher confidence segments
  if (segment.confidence > 0.8) {
    qualities.push({
      type: 'confident_tone' as const,
      description: 'High confidence delivery'
    });
  }

  return {
    id: segment.id,
    startTime: segment.startTime,
    endTime: segment.endTime,
    duration: segment.duration,
    transcript: segment.transcript || segment.reason.substring(0, 100),
    qualityScore: Math.round(qualityScore * 10) / 10,
    issues,
    qualities,
    confidence: segment.confidence
  };
}

/**
 * Parse time string to seconds
 */
function parseTime(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return parseInt(minutes) * 60 + parseFloat(seconds);
  }
  return parseFloat(timeStr);
}

/**
 * Calculate similarity between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Infer group name from segment content
 */
function inferGroupName(segment: EnhancedSegment, takeCount: number): string {
  const time = parseTime(segment.startTime);
  
  if (time < 60) {
    return `Opening Statement (${takeCount} takes)`;
  } else if (segment.reason.toLowerCase().includes('introduction')) {
    return `Introduction (${takeCount} takes)`;
  } else if (segment.reason.toLowerCase().includes('conclusion')) {
    return `Conclusion (${takeCount} takes)`;
  } else {
    const minutes = Math.floor(time / 60);
    return `Content Block ${minutes}m (${takeCount} takes)`;
  }
}

/**
 * Infer content type from segment
 */
function inferContentType(segment: EnhancedSegment): ContentGroup['contentType'] {
  const time = parseTime(segment.startTime);
  const reason = segment.reason.toLowerCase();
  
  if (time < 60 || reason.includes('introduction') || reason.includes('intro')) {
    return 'introduction';
  } else if (reason.includes('conclusion') || reason.includes('ending') || reason.includes('wrap')) {
    return 'conclusion';
  } else if (reason.includes('transition') || reason.includes('moving') || reason.includes('next')) {
    return 'transition';
  } else if (reason.includes('key') || reason.includes('important') || reason.includes('main')) {
    return 'key_point';
  } else if (reason.includes('explain') || reason.includes('describe') || reason.includes('detail')) {
    return 'explanation';
  }
  
  return 'general';
}

/**
 * Create a mock enhanced analysis result from legacy segments
 */
export function createMockEnhancedAnalysis(
  segments: EnhancedSegment[],
  originalDuration: number
): EnhancedAnalysisResult {
  const contentGroups = convertSegmentsToTakeGroups(segments);
  const totalTakes = contentGroups.reduce((sum, group) => sum + group.takes.length, 0);
  
  // Calculate time removed from takes
  const timeRemoved = contentGroups.reduce((sum, group) => {
    const selectedTake = group.takes.find(t => t.id === group.bestTakeId);
    const removedTakes = group.takes.filter(t => t.id !== group.bestTakeId);
    return sum + removedTakes.reduce((s, t) => s + t.duration, 0);
  }, 0);

  // Calculate average quality improvement
  const qualityImprovement = contentGroups.reduce((sum, group) => {
    const bestTake = group.takes.find(t => t.id === group.bestTakeId);
    const avgQuality = group.takes.reduce((s, t) => s + t.qualityScore, 0) / group.takes.length;
    return sum + ((bestTake?.qualityScore || 0) - avgQuality);
  }, 0) / (contentGroups.length || 1);

  return {
    segments: segments,
    contentGroups,
    summary: {
      originalDuration,
      finalDuration: originalDuration - timeRemoved,
      timeRemoved,
      segmentCount: segments.length,
      groupCount: contentGroups.length,
      takesAnalyzed: totalTakes,
      averageQualityImprovement: qualityImprovement
    },
    metadata: {
      processingTime: 0,
      tokenCount: 0,
      estimatedCost: 0,
      analysisVersion: 'legacy-converted-v1.0'
    }
  };
}