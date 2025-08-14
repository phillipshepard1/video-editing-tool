import { EnhancedSegment } from '@/lib/types/segments';

export interface TakeCluster {
  id: string;
  name: string;
  attempts: EnhancedSegment[]; // Failed attempts
  winner?: {
    startTime: string;
    endTime: string;
    isGap: boolean; // True if winner is the gap between segments
    confidence: number;
  };
  pattern: 'repeated_intro' | 'multiple_takes' | 'practice_run' | 'retake';
  confidence: number;
  timeRange: {
    start: string;
    end: string;
  };
}

export interface ClusterSelection {
  clusterId: string;
  selectedWinner: 'gap' | number; // 'gap' or index of attempt
  removedSegments: string[]; // IDs of segments to remove
  keptSegments: string[]; // IDs of segments to keep
}

export interface OverlapInfo {
  segmentId: string;
  coveredBy: {
    type: 'cluster' | 'segment';
    id: string;
    name: string;
    timeRange: { start: string; end: string };
  };
  reason: string;
}

// Convert time string to seconds
function parseTime(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    // MM:SS.mmm format
    const [minutes, seconds] = parts;
    return parseInt(minutes) * 60 + parseFloat(seconds);
  } else if (parts.length === 3) {
    // HH:MM:SS.mmm format
    const [hours, minutes, seconds] = parts;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
  }
  return parseFloat(timeStr);
}

// Format seconds to time string
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
}

// Calculate text similarity between two strings
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

// Check if two time ranges overlap
function timeRangesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = parseTime(start1);
  const e1 = parseTime(end1);
  const s2 = parseTime(start2);
  const e2 = parseTime(end2);
  
  return s1 < e2 && s2 < e1;
}

// Detect clusters of repeated takes
export function detectClusters(segments: EnhancedSegment[]): TakeCluster[] {
  const clusters: TakeCluster[] = [];
  const sorted = [...segments].sort((a, b) => 
    parseTime(a.startTime) - parseTime(b.startTime)
  );
  
  console.log('detectClusters: Analyzing', sorted.length, 'segments');
  
  let currentCluster: EnhancedSegment[] = [];
  let clusterStart = '';
  
  for (let i = 0; i < sorted.length; i++) {
    const segment = sorted[i];
    const nextSegment = sorted[i + 1];
    
    // Indicators of repeated takes
    const isRetake = 
      segment.category === 'false_start' ||
      segment.reason.toLowerCase().includes('restart') ||
      segment.reason.toLowerCase().includes('try again') ||
      segment.reason.toLowerCase().includes('false start') ||
      segment.reason.toLowerCase().includes('multiple attempts');
    
    console.log(`Segment ${i}: category="${segment.category}", reason="${segment.reason}", isRetake=${isRetake}`);
    
    if (isRetake) {
      if (currentCluster.length === 0) {
        clusterStart = segment.startTime;
      }
      currentCluster.push(segment);
      
      // Check if next segment is close enough to be part of cluster
      if (nextSegment) {
        const gap = parseTime(nextSegment.startTime) - parseTime(segment.endTime);
        
        // If gap is more than 15 seconds, likely a different topic
        if (gap > 15) {
          if (currentCluster.length >= 2) {
            // Find the winner (the gap after failed attempts)
            const lastAttempt = currentCluster[currentCluster.length - 1];
            const winnerStart = lastAttempt.endTime;
            let winnerEnd = nextSegment ? nextSegment.startTime : '';
            
            // If there's a clean delivery after the attempts
            if (winnerEnd && parseTime(winnerEnd) - parseTime(winnerStart) > 2) {
              clusters.push({
                id: `cluster-${clusters.length + 1}`,
                name: inferClusterName(currentCluster),
                attempts: [...currentCluster],
                winner: {
                  startTime: winnerStart,
                  endTime: winnerEnd,
                  isGap: true,
                  confidence: 0.95
                },
                pattern: determinePattern(currentCluster),
                confidence: calculateClusterConfidence(currentCluster),
                timeRange: {
                  start: clusterStart,
                  end: winnerEnd
                }
              });
            }
          }
          currentCluster = [];
          clusterStart = '';
        }
      } else {
        // Last segment in the list
        if (currentCluster.length >= 2) {
          const lastAttempt = currentCluster[currentCluster.length - 1];
          clusters.push({
            id: `cluster-${clusters.length + 1}`,
            name: inferClusterName(currentCluster),
            attempts: [...currentCluster],
            pattern: determinePattern(currentCluster),
            confidence: calculateClusterConfidence(currentCluster),
            timeRange: {
              start: clusterStart,
              end: lastAttempt.endTime
            }
          });
        }
      }
    }
  }
  
  // Also detect clusters based on similar content even if not marked as false starts
  const similarityGroups = detectSimilarityGroups(sorted);
  clusters.push(...similarityGroups);
  
  console.log('detectClusters: Found', clusters.length, 'clusters total');
  clusters.forEach((c, i) => {
    console.log(`  Cluster ${i + 1}: ${c.name}, ${c.attempts.length} attempts, pattern: ${c.pattern}`);
  });
  
  return clusters;
}

// Detect groups based on content similarity
function detectSimilarityGroups(segments: EnhancedSegment[]): TakeCluster[] {
  const clusters: TakeCluster[] = [];
  const used = new Set<string>();
  
  for (let i = 0; i < segments.length; i++) {
    if (used.has(segments[i].id)) continue;
    
    const similar: EnhancedSegment[] = [segments[i]];
    used.add(segments[i].id);
    
    for (let j = i + 1; j < segments.length; j++) {
      if (used.has(segments[j].id)) continue;
      
      // Check if segments are within 30 seconds of each other
      const timeDiff = Math.abs(
        parseTime(segments[j].startTime) - parseTime(segments[i].endTime)
      );
      
      if (timeDiff < 30) {
        // Check reason similarity
        const similarity = calculateSimilarity(
          segments[i].reason,
          segments[j].reason
        );
        
        if (similarity > 0.6) {
          similar.push(segments[j]);
          used.add(segments[j].id);
        }
      }
    }
    
    if (similar.length >= 2) {
      const firstSegment = similar[0];
      const lastSegment = similar[similar.length - 1];
      
      clusters.push({
        id: `cluster-similar-${clusters.length + 1}`,
        name: `Repeated Content (${similar.length} takes)`,
        attempts: similar,
        pattern: 'retake',
        confidence: 0.85,
        timeRange: {
          start: firstSegment.startTime,
          end: lastSegment.endTime
        }
      });
    }
  }
  
  return clusters;
}

// Infer a name for the cluster based on content
function inferClusterName(segments: EnhancedSegment[]): string {
  const firstSegment = segments[0];
  const timeStart = parseTime(firstSegment.startTime);
  
  if (timeStart < 60) {
    return 'Opening Statement';
  } else if (segments.some(s => s.reason.toLowerCase().includes('introduction'))) {
    return 'Introduction';
  } else if (segments.some(s => s.reason.toLowerCase().includes('conclusion'))) {
    return 'Closing Remarks';
  } else if (segments.some(s => s.reason.toLowerCase().includes('product'))) {
    return 'Product Description';
  } else if (segments.some(s => s.reason.toLowerCase().includes('feature'))) {
    return 'Feature Explanation';
  } else {
    return `Content Block (${formatTime(timeStart)})`;
  }
}

// Determine the pattern type
function determinePattern(segments: EnhancedSegment[]): TakeCluster['pattern'] {
  if (segments.some(s => s.reason.toLowerCase().includes('introduction'))) {
    return 'repeated_intro';
  } else if (segments.some(s => s.reason.toLowerCase().includes('practice'))) {
    return 'practice_run';
  } else if (segments.length > 3) {
    return 'multiple_takes';
  }
  return 'retake';
}

// Calculate overall cluster confidence
function calculateClusterConfidence(segments: EnhancedSegment[]): number {
  const avgConfidence = segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length;
  const consistencyBonus = segments.length >= 3 ? 0.05 : 0;
  return Math.min(avgConfidence + consistencyBonus, 1.0);
}

// Find segments that overlap with cluster selections
export function findOverlappingSegments(
  segments: EnhancedSegment[],
  clusterSelections: ClusterSelection[],
  clusters: TakeCluster[]
): { visible: EnhancedSegment[]; hidden: OverlapInfo[] } {
  const visible: EnhancedSegment[] = [];
  const hidden: OverlapInfo[] = [];
  
  for (const segment of segments) {
    let isHidden = false;
    
    // Check if segment overlaps with any removed cluster segments
    for (const selection of clusterSelections) {
      const cluster = clusters.find(c => c.id === selection.clusterId);
      if (!cluster) continue;
      
      for (const removedId of selection.removedSegments) {
        const removedSegment = cluster.attempts.find(a => a.id === removedId);
        if (!removedSegment) continue;
        
        if (timeRangesOverlap(
          segment.startTime,
          segment.endTime,
          removedSegment.startTime,
          removedSegment.endTime
        )) {
          hidden.push({
            segmentId: segment.id,
            coveredBy: {
              type: 'cluster',
              id: cluster.id,
              name: cluster.name,
              timeRange: {
                start: removedSegment.startTime,
                end: removedSegment.endTime
              }
            },
            reason: `Covered by cluster "${cluster.name}" - ${removedSegment.reason}`
          });
          isHidden = true;
          break;
        }
      }
      
      if (isHidden) break;
    }
    
    if (!isHidden) {
      visible.push(segment);
    }
  }
  
  return { visible, hidden };
}

// Check if a segment should be hidden due to a longer overlapping segment
export function resolveSegmentOverlaps(
  segments: EnhancedSegment[]
): { primary: EnhancedSegment[]; secondary: OverlapInfo[] } {
  const primary: EnhancedSegment[] = [];
  const secondary: OverlapInfo[] = [];
  const sorted = [...segments].sort((a, b) => {
    // Sort by duration (longer first) then by start time
    const durA = parseTime(a.endTime) - parseTime(a.startTime);
    const durB = parseTime(b.endTime) - parseTime(b.startTime);
    if (durA !== durB) return durB - durA;
    return parseTime(a.startTime) - parseTime(b.startTime);
  });
  
  const added = new Set<string>();
  
  for (const segment of sorted) {
    if (added.has(segment.id)) continue;
    
    let isPrimary = true;
    
    // Check if this segment is covered by any already added segment
    for (const primarySegment of primary) {
      if (timeRangesOverlap(
        segment.startTime,
        segment.endTime,
        primarySegment.startTime,
        primarySegment.endTime
      )) {
        secondary.push({
          segmentId: segment.id,
          coveredBy: {
            type: 'segment',
            id: primarySegment.id,
            name: primarySegment.category,
            timeRange: {
              start: primarySegment.startTime,
              end: primarySegment.endTime
            }
          },
          reason: `Overlapped by longer segment: ${primarySegment.reason}`
        });
        isPrimary = false;
        break;
      }
    }
    
    if (isPrimary) {
      primary.push(segment);
      added.add(segment.id);
    }
  }
  
  return { primary, secondary };
}