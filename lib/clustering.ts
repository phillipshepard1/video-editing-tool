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
    type: 'cluster' | 'silence' | 'segment';
    id: string;
    name?: string;
    timeRange: { start: string; end: string };
  };
  reason: string;
  resolution?: 'keep_cluster' | 'remove_silence' | 'user_decision';
}



// Convert time string or number to seconds
function parseTime(timeStr: string | number): number {
  // If already a number, return it
  if (typeof timeStr === 'number') {
    return timeStr;
  }
  
  // Handle string format
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
  console.log('Segments data:', sorted.map(s => ({ 
    category: s.category, 
    reason: s.reason.substring(0, 50),
    startTime: s.startTime,
    duration: s.duration 
  })));
  
  // Strategy 1: Look for consecutive segments that could be multiple takes
  const consecutiveClusters = detectConsecutiveTakes(sorted);
  clusters.push(...consecutiveClusters);
  
  // Strategy 2: Look for segments with similar reasons/content
  const similarityGroups = detectSimilarityGroups(sorted);
  clusters.push(...similarityGroups);
  
  // Strategy 3: Look for classic retake patterns
  const retakeClusters = detectRetakePatterns(sorted);
  clusters.push(...retakeClusters);
  
  // If no clusters found yet, try more aggressive detection
  if (clusters.length === 0 && segments.length >= 2) {
    console.log('No clusters found with standard methods, trying aggressive detection...');
    const aggressiveClusters = detectAggressiveClusters(sorted);
    clusters.push(...aggressiveClusters);
  }
  
  console.log('detectClusters: Found', clusters.length, 'clusters total');
  clusters.forEach((c, i) => {
    console.log(`  Cluster ${i + 1}: ${c.name}, ${c.attempts.length} attempts, pattern: ${c.pattern}`);
  });
  
  return clusters;
}

// Aggressive cluster detection as fallback
function detectAggressiveClusters(segments: EnhancedSegment[]): TakeCluster[] {
  const clusters: TakeCluster[] = [];
  
  // Strategy: Group any segments that are close in time
  for (let i = 0; i < segments.length - 1; i++) {
    const segment1 = segments[i];
    const segment2 = segments[i + 1];
    
    const gap = parseTime(segment2.startTime) - parseTime(segment1.endTime);
    
    // If segments are very close together (within 5 seconds), group them
    if (gap < 5 && gap >= 0) {
      const attempts = [segment1, segment2];
      const winnerStart = segment2.endTime;
      const winnerEnd = formatTime(parseTime(winnerStart) + 10);
      
      clusters.push({
        id: `cluster-aggressive-${clusters.length + 1}`,
        name: `Detected Takes (${formatTime(parseTime(segment1.startTime))})`,
        attempts,
        winner: {
          startTime: winnerStart,
          endTime: winnerEnd,
          isGap: true,
          confidence: 0.7
        },
        pattern: 'multiple_takes',
        confidence: 0.7,
        timeRange: {
          start: segment1.startTime,
          end: winnerEnd
        }
      });
      
      // Skip the next segment since we just processed it
      i++;
    }
  }
  
  return clusters;
}

// Detect consecutive segments that might be multiple takes
function detectConsecutiveTakes(segments: EnhancedSegment[]): TakeCluster[] {
  const clusters: TakeCluster[] = [];
  let currentGroup: EnhancedSegment[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    
    // Look for segments close together in time (within 10 seconds)
    if (nextSegment) {
      const gap = parseTime(nextSegment.startTime) - parseTime(segment.endTime);
      
      if (gap < 10 && gap > 0) {
        if (currentGroup.length === 0) {
          currentGroup.push(segment);
        }
        currentGroup.push(nextSegment);
        i++; // Skip the next segment since we just added it
      } else {
        // End of potential cluster
        if (currentGroup.length >= 2) {
          const lastSegment = currentGroup[currentGroup.length - 1];
          const clusterEnd = parseTime(lastSegment.endTime);
          const potentialWinnerStart = clusterEnd;
          
          // Look for a gap that could be the "good take"
          let winnerEnd = '';
          for (let j = i + 1; j < segments.length; j++) {
            const futureSegment = segments[j];
            if (parseTime(futureSegment.startTime) - clusterEnd > 30) {
              winnerEnd = futureSegment.startTime;
              break;
            }
          }
          
          if (!winnerEnd) {
            winnerEnd = formatTime(clusterEnd + 30); // Default 30 second gap
          }
          
          clusters.push({
            id: `cluster-consecutive-${clusters.length + 1}`,
            name: `Multiple Takes (${formatTime(parseTime(currentGroup[0].startTime))})`,
            attempts: [...currentGroup],
            winner: {
              startTime: formatTime(potentialWinnerStart),
              endTime: winnerEnd,
              isGap: true,
              confidence: 0.8
            },
            pattern: 'multiple_takes',
            confidence: 0.8,
            timeRange: {
              start: currentGroup[0].startTime,
              end: winnerEnd
            }
          });
        }
        currentGroup = [];
      }
    } else {
      // Last segment
      if (currentGroup.length >= 2) {
        const lastSegment = currentGroup[currentGroup.length - 1];
        clusters.push({
          id: `cluster-consecutive-${clusters.length + 1}`,
          name: `Multiple Takes (${formatTime(parseTime(currentGroup[0].startTime))})`,
          attempts: [...currentGroup],
          winner: {
            startTime: lastSegment.endTime,
            endTime: formatTime(parseTime(lastSegment.endTime) + 15),
            isGap: true,
            confidence: 0.8
          },
          pattern: 'multiple_takes',
          confidence: 0.8,
          timeRange: {
            start: currentGroup[0].startTime,
            end: formatTime(parseTime(lastSegment.endTime) + 15)
          }
        });
      }
    }
  }
  
  return clusters;
}

// Detect classic retake patterns
function detectRetakePatterns(segments: EnhancedSegment[]): TakeCluster[] {
  const clusters: TakeCluster[] = [];
  let currentCluster: EnhancedSegment[] = [];
  let clusterStart = '';
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    
    // Expanded indicators of repeated takes
    const isRetake = 
      segment.category === 'false_start' ||
      segment.category === 'bad_take' ||
      segment.reason.toLowerCase().includes('restart') ||
      segment.reason.toLowerCase().includes('try again') ||
      segment.reason.toLowerCase().includes('false start') ||
      segment.reason.toLowerCase().includes('multiple attempts') ||
      segment.reason.toLowerCase().includes('retake') ||
      segment.reason.toLowerCase().includes('start over') ||
      segment.reason.toLowerCase().includes('take') ||
      (segment.duration < 10 && segment.category === 'pause'); // Short pauses often indicate retakes
    
    console.log(`Retake check ${i}: category="${segment.category}", isRetake=${isRetake}, reason="${segment.reason.substring(0, 30)}"`);
    
    if (isRetake) {
      if (currentCluster.length === 0) {
        clusterStart = segment.startTime;
      }
      currentCluster.push(segment);
      
      // Check if next segment continues the pattern
      if (nextSegment) {
        const gap = parseTime(nextSegment.startTime) - parseTime(segment.endTime);
        
        // If gap is more than 20 seconds, likely end of cluster
        if (gap > 20) {
          if (currentCluster.length >= 1) { // Even single retakes are valuable
            const lastAttempt = currentCluster[currentCluster.length - 1];
            const winnerStart = lastAttempt.endTime;
            const winnerEnd = nextSegment ? nextSegment.startTime : formatTime(parseTime(winnerStart) + 15);
            
            clusters.push({
              id: `cluster-retake-${clusters.length + 1}`,
              name: inferClusterName(currentCluster),
              attempts: [...currentCluster],
              winner: {
                startTime: winnerStart,
                endTime: winnerEnd,
                isGap: true,
                confidence: 0.9
              },
              pattern: determinePattern(currentCluster),
              confidence: calculateClusterConfidence(currentCluster),
              timeRange: {
                start: clusterStart,
                end: winnerEnd
              }
            });
          }
          currentCluster = [];
          clusterStart = '';
        }
      } else {
        // Last segment in the list
        if (currentCluster.length >= 1) {
          const lastAttempt = currentCluster[currentCluster.length - 1];
          clusters.push({
            id: `cluster-retake-${clusters.length + 1}`,
            name: inferClusterName(currentCluster),
            attempts: [...currentCluster],
            winner: {
              startTime: lastAttempt.endTime,
              endTime: formatTime(parseTime(lastAttempt.endTime) + 15),
              isGap: true,
              confidence: 0.9
            },
            pattern: determinePattern(currentCluster),
            confidence: calculateClusterConfidence(currentCluster),
            timeRange: {
              start: clusterStart,
              end: formatTime(parseTime(lastAttempt.endTime) + 15)
            }
          });
        }
      }
    }
  }
  
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
      
      // Check if segments are within 60 seconds of each other (more generous)
      const timeDiff = Math.abs(
        parseTime(segments[j].startTime) - parseTime(segments[i].endTime)
      );
      
      if (timeDiff < 60) {
        // Multiple similarity checks
        const reasonSimilarity = calculateSimilarity(
          segments[i].reason,
          segments[j].reason
        );
        
        const categorySimilarity = segments[i].category === segments[j].category ? 0.5 : 0;
        
        // Check for similar durations (within 50% difference)
        const duration1 = segments[i].duration;
        const duration2 = segments[j].duration;
        const durationSimilarity = Math.abs(duration1 - duration2) / Math.max(duration1, duration2) < 0.5 ? 0.3 : 0;
        
        const totalSimilarity = reasonSimilarity + categorySimilarity + durationSimilarity;
        
        console.log(`Similarity check ${i}-${j}: reason=${reasonSimilarity.toFixed(2)}, category=${categorySimilarity}, duration=${durationSimilarity}, total=${totalSimilarity.toFixed(2)}`);
        
        if (totalSimilarity > 0.4) { // Lower threshold for better detection
          similar.push(segments[j]);
          used.add(segments[j].id);
        }
      }
    }
    
    if (similar.length >= 2) {
      const firstSegment = similar[0];
      const lastSegment = similar[similar.length - 1];
      
      // Find a good spot for the winner (gap between the segments)
      const winnerStart = lastSegment.endTime;
      const winnerEnd = formatTime(parseTime(winnerStart) + 20);
      
      clusters.push({
        id: `cluster-similar-${clusters.length + 1}`,
        name: `Similar Content (${similar.length} attempts)`,
        attempts: similar,
        winner: {
          startTime: winnerStart,
          endTime: winnerEnd,
          isGap: true,
          confidence: 0.8
        },
        pattern: 'retake',
        confidence: 0.85,
        timeRange: {
          start: firstSegment.startTime,
          end: winnerEnd
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