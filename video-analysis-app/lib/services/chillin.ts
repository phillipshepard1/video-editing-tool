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
  // Basic Element properties (required)
  id: string;
  type: string;
  start: number;  // Position in output timeline (seconds)
  duration: number;  // Duration in output (seconds)
  trackIndex: number;
  
  // View Element positioning
  x: number;
  y: number;
  width: number;  // Required for Video
  height: number; // Required for Video
  blendMode: string;
  anchorX: number;
  anchorY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  skewX: number;
  skewY: number;
  keyframes: any[];
  
  // Video-specific properties
  externalUrl: string;
  ext: string;  // "mp4" or "mov"
  startInSource: number;  // Start time in source video (seconds) - THIS IS THE KEY FIELD
  isFrontTrimmed?: boolean;  // Required when startInSource > 0
  volume?: number;  // 0-1
  hasAudio: boolean;
}

export interface ChillinProject {
  compositeWidth: number;
  compositeHeight: number;
  fps: number;
  projectData: {
    type: string;
    width: number;
    height: number;
    fill: string;
    view: ChillinVideoElement[];
    audio: any[];
    effect: any[];
    transition: any[];
    version: number;
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
// Updated to better handle different timestamp formats
function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  
  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return parseInt(minutes) * 60 + parseFloat(seconds);
  } else if (parts.length === 3) {
    // Format: XX:YY:ZZ
    const [first, second, third] = parts;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const thirdNum = parseFloat(third);
    
    // IMPORTANT: Gemini seems to use MM:SS:FF format for videos under 1 hour
    // where FF is frames (0-29 for 30fps video)
    
    // If the third number is > 60, it's definitely frames, not seconds
    if (thirdNum > 60) {
      // MM:SS:FF format (frames in third position)
      return firstNum * 60 + secondNum + (thirdNum / 100); // Frames as decimal
    }
    
    // If first number is less than 60 and second number is less than 60
    // It's likely MM:SS:FF format (not hours)
    if (firstNum < 60) {
      // Treat as MM:SS:FF where FF is centiseconds or frame number
      // For "01:04:41" = 1 minute, 4 seconds, 41 centiseconds
      return firstNum * 60 + secondNum + (thirdNum / 100);
    }
    
    // For longer videos, treat as HH:MM:SS
    return firstNum * 3600 + secondNum * 60 + thirdNum;
  }
  
  // Simple number format
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
  // Validate parameters according to API documentation
  if (videoWidth < 720 || videoWidth > 3840) {
    console.warn(`Video width ${videoWidth} outside range 720-3840, using 1920`);
    videoWidth = 1920;
  }
  if (videoHeight < 720 || videoHeight > 3840) {
    console.warn(`Video height ${videoHeight} outside range 720-3840, using 1080`);
    videoHeight = 1080;
  }
  if (fps < 15 || fps > 60) {
    console.warn(`FPS ${fps} outside range 15-60, using 30`);
    fps = 30;
  }
  
  console.log('Building Chillin request:');
  console.log('- Video duration:', videoDuration);
  console.log('- Segments to remove:', segmentsToRemove.length);
  segmentsToRemove.forEach((seg, i) => {
    console.log(`  Remove ${i}: ${seg.startTime} - ${seg.endTime} (${seg.reason})`);
  });
  
  const keeperSegments = calculateKeeperSegments(segmentsToRemove, videoDuration);
  console.log('- Keeper segments:', keeperSegments.length);
  keeperSegments.forEach((seg, i) => {
    console.log(`  Keep ${i}: ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s (duration: ${(seg.end - seg.start).toFixed(2)}s)`);
  });
  
  // Create video elements for each keeper segment
  // Each element represents a portion of the source video to include in the output
  let outputPosition = 0;  // Track position in output timeline
  
  const elements: ChillinVideoElement[] = keeperSegments.map((segment, index) => {
    let segmentDuration = segment.end - segment.start;
    let startInSource = segment.start;
    
    // Safety check: ensure we don't exceed video bounds
    // Leave a small buffer (0.1s) to avoid edge cases with video duration
    const safetyBuffer = 0.1;
    if (startInSource + segmentDuration > videoDuration - safetyBuffer) {
      const oldDuration = segmentDuration;
      segmentDuration = Math.max(0.1, videoDuration - startInSource - safetyBuffer);
      console.warn(`  ⚠️ Element ${index}: Adjusted duration from ${oldDuration.toFixed(2)}s to ${segmentDuration.toFixed(2)}s to avoid exceeding video duration`);
    }
    
    // Generate a UUID-like ID (recommended by API docs)
    const id = `${Math.random().toString(36).substr(2, 9)}-${Date.now()}-${index}`;
    const element: ChillinVideoElement = {
      id,
      type: 'Video',
      start: outputPosition,  // Position in output timeline
      duration: segmentDuration,  // Duration in output
      trackIndex: 0,
      x: 0,
      y: 0,
      width: videoWidth,
      height: videoHeight,
      blendMode: 'normal',
      anchorX: videoWidth / 2,  // Center anchor
      anchorY: videoHeight / 2,  // Center anchor
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      skewX: 0,
      skewY: 0,
      keyframes: [],
      externalUrl: videoUrl,
      ext: videoUrl.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4',  // Detect extension from URL
      startInSource: startInSource,  // CORRECT FIELD: Where to start in source video (seconds)
      isFrontTrimmed: startInSource > 0,  // Required when startInSource > 0
      volume: 1,  // Full volume
      hasAudio: true  // Assume video has audio
    };
    
    console.log(`  Element ${index}: output ${outputPosition.toFixed(2)}s for ${segmentDuration.toFixed(2)}s, source startInSource=${startInSource.toFixed(2)}s (ends at ${(startInSource + segmentDuration).toFixed(2)}s)`);
    
    outputPosition += segmentDuration;  // Update position for next segment
    return element;
  });

  // Calculate total duration (sum of all keeper segments)
  const totalDuration = keeperSegments.reduce((acc, seg) => acc + (seg.end - seg.start), 0);
  
  // Log cost estimation for transparency
  const totalMinutes = totalDuration / 60;
  const estimatedCost = totalMinutes * 0.10; // $0.10 per minute for 1920x1080
  console.log('=== Chillin Render Cost Estimation ===');
  console.log(`Final video duration: ${totalDuration.toFixed(2)} seconds (${totalMinutes.toFixed(2)} minutes)`);
  console.log(`Estimated cost: $${estimatedCost.toFixed(2)} at $0.10/minute for 1920x1080`);
  
  // Warn if cost seems unusually high (likely a parsing issue)
  if (estimatedCost > 10) {
    console.warn('⚠️ WARNING: Estimated cost exceeds $10. Please verify segment timestamps are correct.');
    console.warn('⚠️ Common issue: timestamps might be in wrong format (HH:MM:SS vs MM:SS:FF)');
  }
  console.log('=====================================');

  return {
    compositeWidth: videoWidth,
    compositeHeight: videoHeight,
    fps,
    projectData: {
      type: 'video',  // Should be 'video' or 'animation', not empty string
      width: videoWidth,
      height: videoHeight,
      fill: '#000000',
      view: elements,
      audio: [],
      effect: [],
      transition: [],
      version: 0,
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
  console.log('Raw Chillin API response:', JSON.stringify(result, null, 2));
  
  // Check if successful response (code 0 means success)
  if (result.code === 0 && result.data) {
    const renderId = result.data.render_id || result.data.renderId;
    console.log(`Found render ID: ${renderId}`);
    return {
      renderId: renderId,
      status: result.data.status || 'processing',
      outputUrl: result.data.outputUrl,
      error: null
    };
  }
  
  // Handle error response
  if (result.code !== 0) {
    console.error('Chillin API error:', result.msg);
    throw new Error(result.msg || 'API error');
  }
  
  return {
    renderId: null,
    status: 'failed',
    outputUrl: null,
    error: result.msg || 'Unknown error'
  };
}

// Poll for render status
export async function getRenderStatus(
  renderId: string,
  apiKey: string
): Promise<ChillinRenderResponse> {
  console.log(`Checking render status for ID: ${renderId}`);
  
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    const response = await fetch('https://render-api.chillin.online/render/result', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        render_id: parseInt(renderId) // Convert to number as API expects
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.text();
      console.error(`Chillin status check failed: ${error}`);
      throw new Error(`Failed to get render status: ${error}`);
    }

    const result = await response.json();
    console.log('Chillin status response:', result);
    
    // Check if we got an empty or invalid response
    if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
      console.warn('Chillin API returned empty response, treating as processing');
      return {
        renderId: renderId,
        status: 'processing',
        outputUrl: null,
        error: null,
        message: 'Waiting for render service to respond'
      };
    }
    
    // Parse response according to API docs format
    if (result.code === 0 && result.data?.render) {
      const render = result.data.render;
      
      // Map Chillin states to our expected format
      let status = 'processing';
      if (render.state === 'success') {
        status = 'completed';
      } else if (render.state === 'failed') {
        status = 'failed';
      } else if (render.state === 'pending') {
        status = 'queued';
      } else if (render.state === 'rendering') {
        status = 'processing';
      }
      
      return {
        renderId: render.render_id?.toString() || renderId,
        status: status,
        outputUrl: render.video_url || null,
        error: render.state === 'failed' ? 'Render failed' : null
      };
    }
    
    // Handle error response
    if (result.code !== 0) {
      console.error('Chillin API error:', result.msg);
      return {
        renderId: renderId,
        status: 'failed',
        outputUrl: null,
        error: result.msg || 'Unknown error'
      };
    }
    
    // Fallback for unexpected format
    console.warn('Chillin API returned unexpected format:', result);
    return {
      renderId: renderId,
      status: 'processing',
      outputUrl: null,
      error: null,
      message: 'Render service returned unexpected response format'
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.error('Render status check timed out after 10 seconds');
      throw new Error('Status check timed out - Chillin API may be slow or unresponsive');
    }
    throw error;
  }
}