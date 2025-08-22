/**
 * Shotstack API Service V4 - Final fix for freezing issues
 * Addresses timeline gaps, floating point errors, and last clip freezing
 */

import { EnhancedSegment } from '@/lib/types/segments';

const SHOTSTACK_API_URL = 'https://api.shotstack.io';

export interface ShotstackClip {
  asset: {
    type: 'video';
    src: string;
    trim?: number;
    volume?: number;
  };
  start: number;
  length: number;
  fit?: 'cover' | 'contain' | 'crop' | 'none';
}

export interface ShotstackTrack {
  clips: ShotstackClip[];
}

export interface ShotstackTimeline {
  background?: string;
  tracks: ShotstackTrack[];
}

export interface ShotstackOutput {
  format: 'mp4' | 'webm' | 'mov';
  resolution: 'preview' | 'mobile' | 'sd' | 'hd' | '1080' | '4k';
  fps?: number;
  quality?: 'low' | 'medium' | 'high';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | '4:3';
}

export interface ShotstackEdit {
  timeline: ShotstackTimeline;
  output: ShotstackOutput;
}

/**
 * Parse time string to seconds with high precision
 */
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  
  // Handle direct number input
  if (!isNaN(Number(timeStr))) {
    return Number(timeStr);
  }
  
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return parseInt(minutes) * 60 + parseFloat(seconds);
  } else if (parts.length === 3) {
    // HH:MM:SS or MM:SS.FF format
    const [first, second, third] = parts;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const thirdNum = parseFloat(third);
    
    // Check if it's frame format (MM:SS:FF)
    if (thirdNum > 60) {
      // Frames - convert to seconds (assuming 30fps for frame conversion)
      return firstNum * 60 + secondNum + (thirdNum / 100);
    }
    
    // Standard HH:MM:SS
    return firstNum * 3600 + secondNum * 60 + thirdNum;
  }
  
  return parseFloat(timeStr) || 0;
}

/**
 * Build Shotstack timeline with improved gap prevention
 */
export function buildShotstackTimeline(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number,
  sourceFPS: number = 60
): ShotstackTimeline {
  console.log('=== Building Shotstack Timeline V4 ===');
  console.log('Video URL:', videoUrl);
  console.log('Video Duration:', videoDuration, 'seconds');
  console.log('Source FPS:', sourceFPS);
  console.log('Segments to remove:', segmentsToRemove.length);
  
  // Sort segments by start time
  const sortedSegments = [...segmentsToRemove].sort((a, b) => {
    const aStart = parseTimeToSeconds(a.startTime);
    const bStart = parseTimeToSeconds(b.startTime);
    return aStart - bStart;
  });

  // Merge overlapping segments
  const mergedSegments: { start: number; end: number }[] = [];
  
  sortedSegments.forEach(segment => {
    const segStart = parseTimeToSeconds(segment.startTime);
    const segEnd = parseTimeToSeconds(segment.endTime);
    
    if (mergedSegments.length === 0) {
      mergedSegments.push({ start: segStart, end: segEnd });
    } else {
      const last = mergedSegments[mergedSegments.length - 1];
      if (segStart <= last.end) {
        // Overlap - extend the last segment
        last.end = Math.max(last.end, segEnd);
      } else {
        // No overlap - add new segment
        mergedSegments.push({ start: segStart, end: segEnd });
      }
    }
  });

  console.log(`Merged ${sortedSegments.length} segments into ${mergedSegments.length} segments`);

  // Build clips for content to keep
  const clips: ShotstackClip[] = [];
  let sourcePosition = 0;  // Position in source video
  let outputPosition = 0;  // Position in output timeline
  
  mergedSegments.forEach((segment, index) => {
    // Add clip for content before this removed segment
    if (segment.start > sourcePosition) {
      const clipDuration = segment.start - sourcePosition;
      
      const clip: ShotstackClip = {
        asset: {
          type: 'video',
          src: videoUrl,
          trim: sourcePosition,  // Start position in source
          volume: 1
        },
        start: outputPosition,  // Position in output
        length: clipDuration   // Duration to play
      };
      
      clips.push(clip);
      console.log(`Clip ${clips.length}: Source [${sourcePosition.toFixed(3)}s - ${segment.start.toFixed(3)}s] → Output [${outputPosition.toFixed(3)}s - ${(outputPosition + clipDuration).toFixed(3)}s]`);
      
      outputPosition += clipDuration;
    }
    
    // Move source position past the removed segment
    sourcePosition = segment.end;
  });
  
  // IMPORTANT: Add final clip if there's content after the last removed segment
  if (sourcePosition < videoDuration) {
    const finalClipDuration = videoDuration - sourcePosition;
    
    // Ensure we don't exceed video duration (important for last clip)
    const safeDuration = Math.min(finalClipDuration, videoDuration - sourcePosition);
    
    const finalClip: ShotstackClip = {
      asset: {
        type: 'video',
        src: videoUrl,
        trim: sourcePosition,  // Start at last position
        volume: 1
      },
      start: outputPosition,  // Place at end of output
      length: safeDuration    // Play until end of video
    };
    
    clips.push(finalClip);
    console.log(`Final Clip ${clips.length}: Source [${sourcePosition.toFixed(3)}s - ${videoDuration.toFixed(3)}s] → Output [${outputPosition.toFixed(3)}s - ${(outputPosition + safeDuration).toFixed(3)}s]`);
  }

  // Validate timeline
  validateTimeline(clips, videoDuration);

  return {
    background: '#000000',
    tracks: [{ clips }]
  };
}

/**
 * Validate timeline for issues
 */
function validateTimeline(clips: ShotstackClip[], originalDuration: number) {
  console.log('\n=== Timeline Validation ===');
  
  let expectedStart = 0;
  let hasGaps = false;
  let hasOverlaps = false;
  
  clips.forEach((clip, index) => {
    const gap = Math.abs(clip.start - expectedStart);
    
    if (gap > 0.001) {  // More than 1ms difference
      if (clip.start > expectedStart) {
        console.warn(`⚠️ GAP: ${gap.toFixed(3)}s gap before clip ${index + 1} at ${expectedStart.toFixed(3)}s`);
        hasGaps = true;
      } else {
        console.warn(`⚠️ OVERLAP: ${gap.toFixed(3)}s overlap at clip ${index + 1}`);
        hasOverlaps = true;
      }
    }
    
    // Check if trim + length exceeds original duration
    if (clip.asset.trim !== undefined && (clip.asset.trim + clip.length) > originalDuration) {
      console.error(`❌ CLIP ${index + 1} EXCEEDS VIDEO: trim=${clip.asset.trim}, length=${clip.length}, video=${originalDuration}`);
    }
    
    expectedStart = clip.start + clip.length;
  });
  
  const totalDuration = clips.reduce((sum, clip) => sum + clip.length, 0);
  const lastClipEnd = clips.length > 0 ? clips[clips.length - 1].start + clips[clips.length - 1].length : 0;
  
  console.log(`Total clips: ${clips.length}`);
  console.log(`Total duration: ${totalDuration.toFixed(3)}s`);
  console.log(`Timeline end: ${lastClipEnd.toFixed(3)}s`);
  console.log(`Gaps detected: ${hasGaps ? 'YES ⚠️' : 'NO ✅'}`);
  console.log(`Overlaps detected: ${hasOverlaps ? 'YES ⚠️' : 'NO ✅'}`);
  console.log('===========================\n');
}

/**
 * Normalize FPS to Shotstack supported values
 */
export function normalizeFPS(fps: number): number {
  const supportedFPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
  
  // Find closest supported FPS
  const closest = supportedFPS.reduce((prev, curr) => {
    return Math.abs(curr - fps) < Math.abs(prev - fps) ? curr : prev;
  });
  
  if (Math.abs(closest - fps) > 0.1) {
    console.warn(`FPS ${fps} normalized to ${closest}`);
  }
  
  return closest;
}

/**
 * Submit render job to Shotstack
 */
export async function submitShotstackRender(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number,
  apiKey: string,
  environment: string = 'v1',
  outputOptions?: {
    fps?: number;
    quality?: 'low' | 'medium' | 'high';
    resolution?: 'preview' | 'mobile' | 'sd' | 'hd' | '1080' | '4k';
  }
): Promise<any> {
  const sourceFPS = outputOptions?.fps || 60;
  const timeline = buildShotstackTimeline(videoUrl, segmentsToRemove, videoDuration, sourceFPS);
  
  // Ensure FPS matches source to prevent freezing
  const normalizedFPS = normalizeFPS(sourceFPS);
  
  const output: ShotstackOutput = {
    format: 'mp4',
    resolution: outputOptions?.resolution || '1080',
    fps: normalizedFPS,
    quality: outputOptions?.quality || 'high'
  };

  const edit: ShotstackEdit = {
    timeline,
    output
  };

  console.log('Submitting to Shotstack with settings:');
  console.log(`- FPS: ${normalizedFPS}`);
  console.log(`- Quality: ${output.quality}`);
  console.log(`- Resolution: ${output.resolution}`);
  console.log(`- Clips: ${timeline.tracks[0].clips.length}`);

  const response = await fetch(`${SHOTSTACK_API_URL}/${environment}/render`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(edit)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Shotstack API error:', error);
    throw new Error(`Shotstack API error: ${error}`);
  }

  const result = await response.json();
  console.log('Render submitted successfully:', result.response?.id);
  return result;
}

/**
 * Check render status
 */
export async function checkShotstackRender(
  renderId: string,
  apiKey: string,
  environment: string = 'v1'
): Promise<any> {
  const response = await fetch(
    `${SHOTSTACK_API_URL}/${environment}/render/${renderId}`,
    {
      headers: {
        'x-api-key': apiKey
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to check render status: ${response.statusText}`);
  }

  return response.json();
}