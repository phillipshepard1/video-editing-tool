/**
 * Shotstack API Service V2 - Corrected implementation
 * Uses the correct asset structure for video editing
 */

import { EnhancedSegment } from '@/lib/types/segments';
import { parseTimeToSeconds as geminiParseTime } from './gemini';

const SHOTSTACK_API_URL = 'https://api.shotstack.io';

// According to Shotstack docs, for video editing we need to use the VideoAsset
// The video source goes in a VideoAsset which then gets referenced
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
  fps?: number;  // Frame rate: 23.976, 24, 25, 29.97, 30, 50, 59.94, 60
  quality?: 'low' | 'medium' | 'high';  // Encoding quality
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | '4:3';
}

export interface ShotstackEdit {
  timeline: ShotstackTimeline;
  output: ShotstackOutput;
}

/**
 * Build Shotstack timeline from segments to remove
 */
export function buildShotstackTimeline(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number
): ShotstackTimeline {
  console.log('Building Shotstack timeline V2');
  console.log('Video URL:', videoUrl);
  console.log('Duration:', videoDuration);
  console.log('Segments to remove:', segmentsToRemove.length);

  // Sort segments by start time
  const sortedSegments = [...segmentsToRemove].sort((a, b) => {
    const aStart = parseTimeToSeconds(a.startTime);
    const bStart = parseTimeToSeconds(b.startTime);
    return aStart - bStart;
  });

  const clips: ShotstackClip[] = [];
  let lastEnd = 0;
  let outputPosition = 0;

  // Create clips for parts to keep
  sortedSegments.forEach(segment => {
    const segmentStart = parseTimeToSeconds(segment.startTime);
    const segmentEnd = parseTimeToSeconds(segment.endTime);

    // Add clip for content before this segment
    if (segmentStart > lastEnd) {
      const clipLength = segmentStart - lastEnd;
      
      // Create a video asset clip
      const clip: ShotstackClip = {
        asset: {
          type: 'video',
          src: videoUrl,
          trim: lastEnd,  // Where to start in the source video
          volume: 1
        },
        start: outputPosition,  // Where this clip appears in output
        length: clipLength,  // How long to play
        fit: 'crop'
      };
      
      clips.push(clip);
      outputPosition += clipLength;
      
      console.log(`Clip ${clips.length}: Keep ${lastEnd}s-${segmentStart}s (${clipLength}s)`);
    }

    lastEnd = Math.max(lastEnd, segmentEnd);
  });

  // Add final clip
  if (lastEnd < videoDuration) {
    const clipLength = videoDuration - lastEnd;
    
    const clip: ShotstackClip = {
      asset: {
        type: 'video',
        src: videoUrl,
        trim: lastEnd,
        volume: 1
      },
      start: outputPosition,
      length: clipLength,
      fit: 'crop'
    };
    
    clips.push(clip);
    console.log(`Final clip: Keep ${lastEnd}s-${videoDuration}s (${clipLength}s)`);
  }

  return {
    background: '#000000',
    tracks: [{ clips }]
  };
}

/**
 * Validate and normalize FPS to Shotstack supported values
 */
function normalizeFPS(fps: number): number {
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
 * Submit render job to Shotstack
 */
export async function submitShotstackRender(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number,
  apiKey: string,
  environment: string = 'stage',
  outputOptions?: {
    fps?: number;
    quality?: 'low' | 'medium' | 'high';
    resolution?: 'preview' | 'mobile' | 'sd' | 'hd' | '1080' | '4k';
  }
): Promise<any> {
  const timeline = buildShotstackTimeline(videoUrl, segmentsToRemove, videoDuration);
  
  // Build output configuration with user preferences
  // Normalize FPS to supported values
  const normalizedFPS = outputOptions?.fps ? normalizeFPS(outputOptions.fps) : 30;
  
  const output: ShotstackOutput = {
    format: 'mp4',
    resolution: outputOptions?.resolution || '1080',
    fps: normalizedFPS,  // Use normalized FPS
    quality: outputOptions?.quality || 'high'  // Default to high quality
  };

  const edit: ShotstackEdit = {
    timeline,
    output
  };

  // Log detailed settings for verification
  console.log('=== SHOTSTACK RENDER SETTINGS ===');
  console.log(`FPS: ${output.fps} (normalized from ${outputOptions?.fps || 30})`);
  console.log(`Quality: ${output.quality} (user selected)`);
  console.log(`Resolution: ${output.resolution} (user selected)`);
  console.log(`Format: ${output.format}`);
  console.log('Full edit object:', JSON.stringify(edit, null, 2));
  console.log('=================================');

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
  environment: string = 'stage'
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