/**
 * Shotstack API Service V3 - Fixed version with proper frame handling
 * Fixes freezing issues caused by FPS mismatches and floating point errors
 */

import { EnhancedSegment } from '@/lib/types/segments';
import { parseTimeToSeconds as geminiParseTime } from './gemini';

const SHOTSTACK_API_URL = 'https://api.shotstack.io';

export interface ShotstackVideoAsset {
  type: 'video';
  src: string;
  trim?: number;
  volume?: number;
}

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
  // Add offset to prevent gaps
  offset?: {
    x?: number;
    y?: number;
  };
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
  // Add merge strategy to prevent gaps
  merge?: {
    combine?: 'merge' | 'overlay';
    transition?: 'fade' | 'wipe' | 'slide';
  };
}

/**
 * Round to 3 decimal places to avoid floating point issues
 */
function roundTime(time: number): number {
  return Math.round(time * 1000) / 1000;
}

/**
 * Convert time to frame-accurate value based on FPS
 */
function toFrameAccurate(seconds: number, fps: number): number {
  const frames = Math.round(seconds * fps);
  return roundTime(frames / fps);
}

/**
 * Build Shotstack timeline with frame-accurate timing
 */
export function buildShotstackTimeline(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number,
  sourceFPS: number = 30  // Pass source FPS for accurate frame timing
): ShotstackTimeline {
  console.log('Building Shotstack timeline V3 with frame accuracy');
  console.log('Video URL:', videoUrl);
  console.log('Duration:', videoDuration);
  console.log('Source FPS:', sourceFPS);
  console.log('Segments to remove:', segmentsToRemove.length);

  // Sort segments by start time
  const sortedSegments = [...segmentsToRemove].sort((a, b) => {
    const aStart = parseTimeToSeconds(a.startTime);
    const bStart = parseTimeToSeconds(b.startTime);
    return aStart - bStart;
  });

  // Merge overlapping segments to prevent issues
  const mergedSegments = mergeOverlappingSegments(sortedSegments);
  console.log(`Merged ${sortedSegments.length} segments into ${mergedSegments.length}`);

  const clips: ShotstackClip[] = [];
  let lastEnd = 0;
  let outputPosition = 0;

  // Create clips for parts to keep
  mergedSegments.forEach((segment, index) => {
    const segmentStart = toFrameAccurate(parseTimeToSeconds(segment.startTime), sourceFPS);
    const segmentEnd = toFrameAccurate(parseTimeToSeconds(segment.endTime), sourceFPS);

    // Add clip for content before this segment
    if (segmentStart > lastEnd) {
      // Add small overlap to prevent gaps (0.001 seconds)
      const overlapBuffer = index > 0 ? 0.001 : 0;
      const clipStart = Math.max(0, lastEnd - overlapBuffer);
      const clipEnd = segmentStart + overlapBuffer;
      const clipLength = roundTime(clipEnd - clipStart);
      
      // Only add clip if it's longer than 1 frame
      if (clipLength > (1 / sourceFPS)) {
        const clip: ShotstackClip = {
          asset: {
            type: 'video',
            src: videoUrl,
            trim: roundTime(clipStart),  // Frame-accurate trim point
            volume: 1
          },
          start: roundTime(outputPosition),  // Frame-accurate output position
          length: clipLength,  // Frame-accurate length
          fit: 'none'  // Use 'none' to preserve original aspect ratio and prevent scaling issues
        };
        
        clips.push(clip);
        outputPosition = roundTime(outputPosition + clipLength);
        
        console.log(`Clip ${clips.length}: Keep ${clipStart.toFixed(3)}s-${clipEnd.toFixed(3)}s (${clipLength.toFixed(3)}s) at output ${(outputPosition - clipLength).toFixed(3)}s`);
      }
    }

    lastEnd = segmentEnd;
  });

  // Add final clip
  if (lastEnd < videoDuration) {
    const clipLength = roundTime(videoDuration - lastEnd);
    
    // Only add if longer than 1 frame
    if (clipLength > (1 / sourceFPS)) {
      const clip: ShotstackClip = {
        asset: {
          type: 'video',
          src: videoUrl,
          trim: roundTime(lastEnd),
          volume: 1
        },
        start: roundTime(outputPosition),
        length: clipLength,
        fit: 'none'
      };
      
      clips.push(clip);
      console.log(`Final clip: Keep ${lastEnd.toFixed(3)}s-${videoDuration.toFixed(3)}s (${clipLength.toFixed(3)}s) at output ${outputPosition.toFixed(3)}s`);
    }
  }

  // Validate timeline for gaps
  validateTimeline(clips);

  return {
    background: '#000000',
    tracks: [{ clips }]
  };
}

/**
 * Merge overlapping segments to prevent timeline issues
 */
function mergeOverlappingSegments(segments: EnhancedSegment[]): EnhancedSegment[] {
  if (segments.length === 0) return [];
  
  const merged: EnhancedSegment[] = [];
  let current = { ...segments[0] };
  
  for (let i = 1; i < segments.length; i++) {
    const currentEnd = parseTimeToSeconds(current.endTime);
    const nextStart = parseTimeToSeconds(segments[i].startTime);
    
    if (nextStart <= currentEnd) {
      // Segments overlap, merge them
      const nextEnd = parseTimeToSeconds(segments[i].endTime);
      if (nextEnd > currentEnd) {
        current.endTime = segments[i].endTime;
      }
      console.log(`Merged overlapping segments: ${current.startTime}-${current.endTime}`);
    } else {
      // No overlap, add current and start new
      merged.push(current);
      current = { ...segments[i] };
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * Validate timeline for gaps or overlaps
 */
function validateTimeline(clips: ShotstackClip[]) {
  let expectedStart = 0;
  
  clips.forEach((clip, index) => {
    const gap = Math.abs(clip.start - expectedStart);
    if (gap > 0.001) {  // Allow 1ms tolerance
      console.warn(`⚠️ Gap detected at clip ${index + 1}: expected start ${expectedStart.toFixed(3)}s, actual ${clip.start.toFixed(3)}s, gap: ${gap.toFixed(3)}s`);
    }
    expectedStart = roundTime(clip.start + clip.length);
  });
  
  const totalDuration = clips.reduce((sum, clip) => sum + clip.length, 0);
  console.log(`Timeline validation: ${clips.length} clips, total duration: ${totalDuration.toFixed(3)}s`);
}

function parseTimeToSeconds(timeStr: string | number): number {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr) return 0;
  
  // Use the improved Gemini parser which handles more formats
  // including decimal seconds (MM:SS.S) for better accuracy
  const parsed = geminiParseTime(timeStr);
  if (!isNaN(parsed)) return parsed;
  
  // Fallback to simple parsing if Gemini parser fails
  return parseFloat(timeStr) || 0;
}

/**
 * Validate and normalize FPS to Shotstack supported values
 */
export function normalizeFPS(fps: number): number {
  // Shotstack supports: 23.976, 24, 25, 29.97, 30, 50, 59.94, 60
  const supportedFPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
  
  // Find closest supported FPS
  const closest = supportedFPS.reduce((prev, curr) => {
    return Math.abs(curr - fps) < Math.abs(prev - fps) ? curr : prev;
  });
  
  if (Math.abs(closest - fps) > 0.1) {
    console.warn(`FPS ${fps} is not directly supported. Using closest: ${closest}`);
  }
  
  return closest;
}

/**
 * Submit render job to Shotstack with proper FPS handling
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
  // IMPORTANT: Use the source FPS for timeline building
  const sourceFPS = outputOptions?.fps || 30;
  const timeline = buildShotstackTimeline(videoUrl, segmentsToRemove, videoDuration, sourceFPS);
  
  // Ensure output FPS matches source FPS to prevent conversion issues
  const normalizedFPS = normalizeFPS(sourceFPS);
  
  const output: ShotstackOutput = {
    format: 'mp4',
    resolution: outputOptions?.resolution || '1080',
    fps: normalizedFPS,  // Use normalized FPS that matches source
    quality: outputOptions?.quality || 'high'
  };

  const edit: ShotstackEdit = {
    timeline,
    output
  };

  console.log('=== SHOTSTACK RENDER SETTINGS V3 ===');
  console.log(`Source FPS: ${sourceFPS}`);
  console.log(`Output FPS: ${normalizedFPS} (normalized)`);
  console.log(`Quality: ${output.quality}`);
  console.log(`Resolution: ${output.resolution}`);
  console.log(`Clips: ${timeline.tracks[0].clips.length}`);
  console.log('=====================================');

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
    console.error('Shotstack API rejected request:', error);
    throw new Error(`Shotstack API error: ${error}`);
  }

  const result = await response.json();
  console.log('Shotstack API accepted render with settings:', {
    renderId: result.response?.id,
    fps: output.fps,
    quality: output.quality,
    resolution: output.resolution
  });
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