import { EnhancedSegment } from '@/lib/types/segments';

export interface ChillinRenderRequest {
  videoUrl: string;
  videoDuration: number;
  videoWidth: number;
  videoHeight: number;
  fps: number;
  segmentsToRemove: EnhancedSegment[];
}

export interface ChillinRenderResponse {
  renderId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  error?: string;
}

export interface ChillinVideoElement {
  type: 'video';
  source: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface ChillinProject {
  composite: {
    width: number;
    height: number;
    fps: number;
  };
  project: {
    elements: ChillinVideoElement[];
    duration: number;
  };
}

// Convert segments to remove into segments to keep
export function calculateKeeperSegments(
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number
): { start: number; end: number }[] {
  // Sort segments by start time
  const sorted = [...segmentsToRemove].sort((a, b) => {
    const aStart = parseTimeToSeconds(a.startTime);
    const bStart = parseTimeToSeconds(b.startTime);
    return aStart - bStart;
  });

  const keeperSegments: { start: number; end: number }[] = [];
  let lastEnd = 0;

  for (const segment of sorted) {
    const segmentStart = parseTimeToSeconds(segment.startTime);
    const segmentEnd = parseTimeToSeconds(segment.endTime);

    // If there's a gap between last removed segment and this one, keep it
    if (segmentStart > lastEnd) {
      keeperSegments.push({
        start: lastEnd,
        end: segmentStart
      });
    }

    lastEnd = Math.max(lastEnd, segmentEnd);
  }

  // Keep the final segment if there's content after the last removed segment
  if (lastEnd < videoDuration) {
    keeperSegments.push({
      start: lastEnd,
      end: videoDuration
    });
  }

  return keeperSegments;
}

// Parse time string to seconds
function parseTimeToSeconds(timeStr: string): number {
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

// Build Chillin API request
export function buildChillinRequest(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number,
  videoWidth: number = 1920,
  videoHeight: number = 1080,
  fps: number = 30
): ChillinProject {
  const keeperSegments = calculateKeeperSegments(segmentsToRemove, videoDuration);
  
  // Create video elements for each keeper segment
  const elements: ChillinVideoElement[] = keeperSegments.map((segment, index) => ({
    type: 'video',
    source: videoUrl,
    startTime: segment.start,
    endTime: segment.end,
    x: 0,
    y: 0,
    width: videoWidth,
    height: videoHeight
  }));

  // Calculate total duration (sum of all keeper segments)
  const totalDuration = keeperSegments.reduce((acc, seg) => acc + (seg.end - seg.start), 0);

  return {
    composite: {
      width: videoWidth,
      height: videoHeight,
      fps
    },
    project: {
      elements,
      duration: totalDuration
    }
  };
}

// Submit render job to Chillin API
export async function submitRenderJob(
  request: ChillinProject,
  apiKey: string
): Promise<ChillinRenderResponse> {
  const response = await fetch('https://render-api.chillin.online/render/v1', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Chillin API error: ${error}`);
  }

  const result = await response.json();
  
  return {
    renderId: result.renderId || result.id,
    status: result.status || 'queued',
    outputUrl: result.outputUrl,
    error: result.error
  };
}

// Poll for render status
export async function getRenderStatus(
  renderId: string,
  apiKey: string
): Promise<ChillinRenderResponse> {
  const response = await fetch(`https://render-api.chillin.online/render/v1/status/${renderId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get render status: ${error}`);
  }

  const result = await response.json();
  
  return {
    renderId: result.renderId || renderId,
    status: result.status,
    outputUrl: result.outputUrl || result.url,
    error: result.error
  };
}