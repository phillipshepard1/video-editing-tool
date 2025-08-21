/**
 * Shotstack API Service
 * Professional video editing API - replacement for Chillin
 * Documentation: https://shotstack.io/docs/api/
 */

import { EnhancedSegment } from '@/lib/types/segments';

// Shotstack API configuration
const SHOTSTACK_API_URL = 'https://api.shotstack.io';
const SHOTSTACK_CDN_URL = 'https://cdn.shotstack.io';

export interface ShotstackClip {
  asset: {
    type: 'video' | 'audio' | 'image';
    src: string;
    trim?: {
      start: number;
      end: number;
    };
  };
  start: number;
  length: number;
  fit?: 'cover' | 'contain' | 'crop';
  scale?: number;
  position?: 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left' | 'topLeft' | 'center';
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
  format: 'mp4' | 'webm' | 'mov' | 'avi' | 'mkv';
  resolution: 'preview' | 'mobile' | 'sd' | 'hd' | '1080' | '4k';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | '4:3';
  fps?: number;
  scaleTo?: 'preview' | 'mobile' | 'sd' | 'hd' | '1080';
  quality?: 'low' | 'medium' | 'high';
  repeat?: boolean;
}

export interface ShotstackRenderRequest {
  timeline: ShotstackTimeline;
  output: ShotstackOutput;
  callback?: string;
  disk?: 'local' | 'mount';
}

export interface ShotstackRenderResponse {
  success: boolean;
  message: string;
  response?: {
    id: string;
    owner: string;
    plan: string;
    status: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';
    error?: string;
    duration?: number;
    render_time?: number;
    url?: string;
    poster?: string;
    thumbnail?: string;
  };
}

/**
 * Convert segments to remove into Shotstack timeline clips
 * This creates clips for the parts we want to KEEP
 */
export function buildShotstackTimeline(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number,
  videoWidth: number = 1920,
  videoHeight: number = 1080
): ShotstackTimeline {
  console.log('Building Shotstack timeline:');
  console.log('- Video duration:', videoDuration);
  console.log('- Segments to remove:', segmentsToRemove.length);
  
  // Sort segments by start time
  const sortedSegments = [...segmentsToRemove].sort((a, b) => {
    const aStart = parseTimeToSeconds(a.startTime);
    const bStart = parseTimeToSeconds(b.startTime);
    return aStart - bStart;
  });

  // Calculate segments to keep (inverse of segments to remove)
  const clips: ShotstackClip[] = [];
  let lastEnd = 0;
  let outputPosition = 0; // Track position in output timeline

  sortedSegments.forEach((segment, index) => {
    const segmentStart = parseTimeToSeconds(segment.startTime);
    const segmentEnd = parseTimeToSeconds(segment.endTime);

    // If there's content before this segment, keep it
    if (segmentStart > lastEnd) {
      const clipLength = segmentStart - lastEnd;
      
      clips.push({
        asset: {
          type: 'video',
          src: videoUrl,
          trim: {
            start: lastEnd,
            end: segmentStart
          }
        },
        start: outputPosition,
        length: clipLength,
        fit: 'crop'
      });

      outputPosition += clipLength;
      console.log(`Clip ${clips.length}: Keep ${lastEnd}s-${segmentStart}s (${clipLength}s) at output position ${outputPosition - clipLength}s`);
    }

    lastEnd = Math.max(lastEnd, segmentEnd);
  });

  // Add final clip if there's content after the last removed segment
  if (lastEnd < videoDuration) {
    const clipLength = videoDuration - lastEnd;
    
    clips.push({
      asset: {
        type: 'video',
        src: videoUrl,
        trim: {
          start: lastEnd,
          end: videoDuration
        }
      },
      start: outputPosition,
      length: clipLength,
      fit: 'crop'
    });

    console.log(`Clip ${clips.length}: Keep ${lastEnd}s-${videoDuration}s (${clipLength}s) at output position ${outputPosition}s`);
  }

  return {
    background: '#000000',
    tracks: [{
      clips
    }]
  };
}

/**
 * Parse time string to seconds
 */
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  
  const parts = timeStr.split(':');
  
  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return parseInt(minutes) * 60 + parseFloat(seconds);
  } else if (parts.length === 3) {
    // HH:MM:SS or MM:SS:FF format
    const [first, second, third] = parts;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const thirdNum = parseFloat(third);
    
    // If third number is > 60, it's likely frames
    if (thirdNum > 60) {
      // MM:SS:FF format
      return firstNum * 60 + secondNum + (thirdNum / 100);
    }
    
    // If first number is < 60, assume MM:SS:FF
    if (firstNum < 60) {
      return firstNum * 60 + secondNum + (thirdNum / 100);
    }
    
    // Otherwise treat as HH:MM:SS
    return firstNum * 3600 + secondNum * 60 + thirdNum;
  }
  
  return parseFloat(timeStr) || 0;
}

/**
 * Submit render job to Shotstack
 */
export async function submitShotstackRender(
  timeline: ShotstackTimeline,
  apiKey: string,
  outputOptions?: Partial<ShotstackOutput>
): Promise<ShotstackRenderResponse> {
  const environment = process.env.SHOTSTACK_ENV || 'stage'; // 'stage' for testing, 'v1' for production
  
  const renderRequest: ShotstackRenderRequest = {
    timeline,
    output: {
      format: outputOptions?.format || 'mp4',
      resolution: outputOptions?.resolution || '1080',
      fps: outputOptions?.fps || 30,
      quality: outputOptions?.quality || 'high',
      ...outputOptions
    }
  };

  console.log('Submitting to Shotstack:', JSON.stringify(renderRequest, null, 2));

  try {
    const response = await fetch(`${SHOTSTACK_API_URL}/${environment}/render`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(renderRequest)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Shotstack API error:', error);
      
      try {
        const errorData = JSON.parse(error);
        throw new Error(`Shotstack error: ${errorData.message || error}`);
      } catch {
        throw new Error(`Shotstack API error: ${error}`);
      }
    }

    const result = await response.json();
    console.log('Shotstack response:', result);

    return {
      success: result.success || false,
      message: result.message || 'Render submitted',
      response: result.response
    };

  } catch (error) {
    console.error('Shotstack submission error:', error);
    throw error;
  }
}

/**
 * Check render status on Shotstack
 */
export async function getShotstackRenderStatus(
  renderId: string,
  apiKey: string
): Promise<ShotstackRenderResponse> {
  const environment = process.env.SHOTSTACK_ENV || 'stage';
  
  try {
    const response = await fetch(`${SHOTSTACK_API_URL}/${environment}/render/${renderId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Shotstack status check error:', error);
      throw new Error(`Failed to get render status: ${error}`);
    }

    const result = await response.json();
    console.log('Shotstack status:', result);

    // Map Shotstack response to our format
    return {
      success: result.success || false,
      message: result.message || '',
      response: result.response
    };

  } catch (error) {
    console.error('Shotstack status error:', error);
    throw error;
  }
}

/**
 * Build complete Shotstack render request
 */
export function buildShotstackRequest(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number,
  videoWidth?: number,
  videoHeight?: number,
  quality?: 'low' | 'medium' | 'high'
): ShotstackRenderRequest {
  const timeline = buildShotstackTimeline(
    videoUrl,
    segmentsToRemove,
    videoDuration,
    videoWidth,
    videoHeight
  );

  // Map quality to resolution
  let resolution: ShotstackOutput['resolution'] = '1080';
  if (quality === 'low') {
    resolution = 'sd';
  } else if (quality === 'medium') {
    resolution = 'hd';
  } else if (quality === 'high') {
    resolution = '1080';
  }

  return {
    timeline,
    output: {
      format: 'mp4',
      resolution,
      fps: 30,
      quality: quality || 'high'
    }
  };
}

/**
 * Health check for Shotstack API
 */
export async function checkShotstackHealth(apiKey: string): Promise<{
  healthy: boolean;
  message: string;
  credits?: number;
}> {
  const environment = process.env.SHOTSTACK_ENV || 'stage';
  
  try {
    // Shotstack doesn't have a specific health endpoint, but we can check our quota
    const response = await fetch(`${SHOTSTACK_API_URL}/${environment}/render`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        healthy: true,
        message: 'Shotstack API is operational',
        credits: data.credits || undefined
      };
    } else if (response.status === 401) {
      return {
        healthy: false,
        message: 'Invalid API key'
      };
    } else {
      return {
        healthy: false,
        message: `API returned status ${response.status}`
      };
    }
  } catch (error) {
    return {
      healthy: false,
      message: error instanceof Error ? error.message : 'Connection failed'
    };
  }
}