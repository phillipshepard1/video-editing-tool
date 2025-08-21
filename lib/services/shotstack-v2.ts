/**
 * Shotstack API Service V2 - Corrected implementation
 * Uses the correct asset structure for video editing
 */

import { EnhancedSegment } from '@/lib/types/segments';

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
  resolution: 'preview' | 'mobile' | 'sd' | 'hd' | '1080';
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

function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    const [first, second, third] = parts.map(Number);
    if (third > 60) {
      return first * 60 + second + (third / 100);
    }
    if (first < 60) {
      return first * 60 + second + (third / 100);
    }
    return first * 3600 + second * 60 + third;
  }
  
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
  environment: string = 'stage'
): Promise<any> {
  const timeline = buildShotstackTimeline(videoUrl, segmentsToRemove, videoDuration);
  
  const edit: ShotstackEdit = {
    timeline,
    output: {
      format: 'mp4',
      resolution: '1080'
    }
  };

  console.log('Submitting to Shotstack with edit:', JSON.stringify(edit, null, 2));

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
    throw new Error(`Shotstack API error: ${error}`);
  }

  return response.json();
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