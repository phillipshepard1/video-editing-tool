import { EnhancedSegment } from '@/lib/types/segments';

interface RenderQualityOptions {
  width?: number;
  height?: number;
  fps?: number;
  quality?: 'low' | 'medium' | 'high' | 'ultra' | 'lossless';
  maintainAspectRatio?: boolean;
  upscale?: boolean;
}

// Quality presets for optimal rendering
const QUALITY_PRESETS = {
  low: {
    maxWidth: 720,
    maxHeight: 720,
    fps: 24,
    description: '720p, good for previews'
  },
  medium: {
    maxWidth: 1280,
    maxHeight: 1280,
    fps: 30,
    description: '1080p, standard quality'
  },
  high: {
    maxWidth: 1920,
    maxHeight: 1920,
    fps: 30,
    description: '1080p+, high quality'
  },
  ultra: {
    maxWidth: 2560,
    maxHeight: 2560,
    fps: 60,
    description: '1440p+, ultra quality'
  },
  lossless: {
    maxWidth: 3840,
    maxHeight: 3840,
    fps: 60,
    description: 'Original resolution, maximum quality'
  }
};

// Calculate optimal render dimensions
function calculateRenderDimensions(
  originalWidth: number,
  originalHeight: number,
  options: RenderQualityOptions = {}
): { width: number; height: number; fps: number } {
  const quality = options.quality || 'high';
  const preset = QUALITY_PRESETS[quality];
  
  let targetWidth = options.width || originalWidth;
  let targetHeight = options.height || originalHeight;
  let targetFps = options.fps || preset.fps;

  // Apply quality preset limits
  if (!options.upscale) {
    // Don't upscale beyond original resolution unless explicitly requested
    targetWidth = Math.min(targetWidth, originalWidth, preset.maxWidth);
    targetHeight = Math.min(targetHeight, originalHeight, preset.maxHeight);
  } else {
    // Allow upscaling to preset limits
    targetWidth = Math.min(targetWidth, preset.maxWidth);
    targetHeight = Math.min(targetHeight, preset.maxHeight);
  }

  // Maintain aspect ratio if requested
  if (options.maintainAspectRatio !== false) {
    const aspectRatio = originalWidth / originalHeight;
    
    if (targetWidth / targetHeight > aspectRatio) {
      // Width is too large, adjust it
      targetWidth = Math.round(targetHeight * aspectRatio);
    } else {
      // Height is too large, adjust it
      targetHeight = Math.round(targetWidth / aspectRatio);
    }
  }

  // Ensure dimensions are within Chillin API limits and even numbers
  targetWidth = Math.max(720, Math.min(3840, Math.round(targetWidth / 2) * 2));
  targetHeight = Math.max(720, Math.min(3840, Math.round(targetHeight / 2) * 2));
  targetFps = Math.max(15, Math.min(60, targetFps));

  return {
    width: targetWidth,
    height: targetHeight,
    fps: targetFps
  };
}

export interface ChillinRenderRequest {
  videoUrl: string;
  videoDuration: number;
  videoWidth: number;
  videoHeight: number;
  fps: number;
  segmentsToRemove: EnhancedSegment[];
}

export interface ChillinRenderResponse {
  renderId: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  outputUrl?: string | null;
  error?: string | null;
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

// Build Chillin API request with enhanced quality options
export function buildChillinRequest(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number,
  originalVideoWidth: number = 1920,
  originalVideoHeight: number = 1080,
  originalFps: number = 30,
  qualityOptions: RenderQualityOptions = {}
): ChillinProject {
  // Calculate optimal render dimensions
  const renderDimensions = calculateRenderDimensions(
    originalVideoWidth,
    originalVideoHeight,
    qualityOptions
  );
  
  const videoWidth = renderDimensions.width;
  const videoHeight = renderDimensions.height;
  const fps = renderDimensions.fps;
  
  console.log('Render quality settings:');
  console.log(`- Quality preset: ${qualityOptions.quality || 'high'}`);
  console.log(`- Original: ${originalVideoWidth}x${originalVideoHeight}@${originalFps}fps`);
  console.log(`- Target: ${videoWidth}x${videoHeight}@${fps}fps`);
  console.log(`- Upscaling: ${qualityOptions.upscale ? 'enabled' : 'disabled'}`);
  
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
    const segmentDuration = segment.end - segment.start;
    // Generate a UUID-like ID (recommended by API docs)
    const id = `${Math.random().toString(36).substr(2, 9)}-${Date.now()}-${index}`;
    
    // Validate segment values
    if (segmentDuration <= 0) {
      console.error(`Invalid segment duration: ${segmentDuration} for segment ${index}`);
    }
    
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
      startInSource: segment.start,  // CORRECT FIELD: Where to start in source video (seconds)
      isFrontTrimmed: segment.start > 0,  // Set to true when startInSource > 0
      volume: 1,  // Full volume
      hasAudio: true  // Assume video has audio
    };
    
    console.log(`  Element ${index}:`, {
      outputStart: outputPosition.toFixed(2),
      duration: segmentDuration.toFixed(2),
      sourceStart: segment.start.toFixed(2),
      sourceEnd: segment.end.toFixed(2),
      isFrontTrimmed: element.isFrontTrimmed
    });
    
    outputPosition += segmentDuration;  // Update position for next segment
    return element;
  });

  // Calculate total duration (sum of all keeper segments)
  const totalDuration = keeperSegments.reduce((acc, seg) => acc + (seg.end - seg.start), 0);

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

// Enhanced render job submission with quality validation
export async function submitRenderJob(
  request: ChillinProject,
  apiKey: string,
  qualityOptions?: RenderQualityOptions
): Promise<ChillinRenderResponse> {
  console.log('Submitting render job with settings:');
  console.log(`- Resolution: ${request.compositeWidth}x${request.compositeHeight}`);
  console.log(`- FPS: ${request.fps}`);
  console.log(`- Elements: ${request.projectData.view.length}`);
  console.log(`- Quality: ${qualityOptions?.quality || 'high'}`);
  
  // Validate render settings for optimal quality
  const totalDuration = request.projectData.duration;
  const resolution = request.compositeWidth * request.compositeHeight;
  const pixelRate = resolution * request.fps * totalDuration;
  
  if (pixelRate > 2.5e9) { // Very high complexity
    console.warn('High complexity render detected - this may take longer to process');
  }
  
  if (request.compositeWidth > 1920 || request.compositeHeight > 1920) {
    console.log('High resolution render - ensuring optimal settings');
  }
  const response = await fetch('https://render-api.chillin.online/render/v1', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Render-Quality': qualityOptions?.quality || 'high',
      'X-Render-Priority': 'quality' // Prioritize quality over speed
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
      renderId: renderId || null,
      status: (result.data.status as 'queued' | 'processing' | 'completed' | 'failed') || 'processing',
      outputUrl: result.data.outputUrl || undefined,
      error: undefined
    };
  }
  
  // Handle error response
  if (result.code !== 0) {
    console.error('Chillin API error:', result.msg);
    throw new Error(result.msg || 'API error');
  }
  
  return {
    renderId: null,
    status: 'failed' as const,
    outputUrl: undefined,
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
    console.log('Chillin status response:', JSON.stringify(result, null, 2));
    
    // Parse response according to API docs format
    if (result.code === 0 && result.data?.render) {
      const render = result.data.render;
      
      // Log render details for debugging
      console.log('Render details:', {
        renderId: render.render_id,
        state: render.state,
        progress: render.progress,
        error: render.error_message || render.error,
        videoUrl: render.video_url
      });
      
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
      
      // Get more detailed error message if available
      const errorMessage = render.state === 'failed' 
        ? (render.error_message || render.error || render.failure_reason || 'Render failed')
        : undefined;
      
      return {
        renderId: render.render_id?.toString() || renderId,
        status: status as 'queued' | 'processing' | 'completed' | 'failed',
        outputUrl: render.video_url || undefined,
        error: errorMessage
      };
    }
    
    // Handle error response
    if (result.code !== 0) {
      console.error('Chillin API error:', result.msg);
      return {
        renderId: renderId,
        status: 'failed' as const,
        outputUrl: undefined,
        error: result.msg || 'Unknown error'
      };
    }
    
    // Fallback for unexpected format
    return {
      renderId: renderId,
      status: 'processing' as const,
      outputUrl: undefined,
      error: undefined
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Render status check timed out after 10 seconds');
      throw new Error('Status check timed out - Chillin API may be slow or unresponsive');
    }
    throw error;
  }
}

// Enhanced render function with automatic quality optimization
export async function renderVideoWithOptimalQuality(
  videoUrl: string,
  segmentsToRemove: EnhancedSegment[],
  videoDuration: number,
  originalVideoInfo: {
    width: number;
    height: number;
    fps: number;
  },
  apiKey: string,
  qualityPreference: 'speed' | 'balanced' | 'quality' = 'quality'
): Promise<ChillinRenderResponse> {
  
  // Determine optimal quality settings based on preference
  let qualityOptions: RenderQualityOptions;
  
  switch (qualityPreference) {
    case 'speed':
      qualityOptions = {
        quality: 'medium',
        maintainAspectRatio: true,
        upscale: false
      };
      break;
    case 'balanced':
      qualityOptions = {
        quality: 'high',
        maintainAspectRatio: true,
        upscale: false
      };
      break;
    case 'quality':
    default:
      qualityOptions = {
        quality: originalVideoInfo.width >= 1920 ? 'ultra' : 'high',
        maintainAspectRatio: true,
        upscale: originalVideoInfo.width < 1920 // Upscale lower res videos
      };
      break;
  }
  
  console.log(`Rendering with ${qualityPreference} preference:`, qualityOptions);
  
  const request = buildChillinRequest(
    videoUrl,
    segmentsToRemove,
    videoDuration,
    originalVideoInfo.width,
    originalVideoInfo.height,
    originalVideoInfo.fps,
    qualityOptions
  );
  
  return await submitRenderJob(request, apiKey, qualityOptions);
}

// Quality assessment helper
export function assessVideoQuality(width: number, height: number, bitrate: number): {
  category: 'low' | 'medium' | 'high' | 'ultra';
  recommendedRenderQuality: 'low' | 'medium' | 'high' | 'ultra' | 'lossless';
  shouldUpscale: boolean;
  estimatedRenderTime: string;
} {
  const totalPixels = width * height;
  const pixelsPerBit = totalPixels / (bitrate || 1000000); // Default 1Mbps if unknown
  
  let category: 'low' | 'medium' | 'high' | 'ultra';
  let recommendedRenderQuality: 'low' | 'medium' | 'high' | 'ultra' | 'lossless';
  let shouldUpscale = false;
  let estimatedRenderTime: string;
  
  if (totalPixels < 720 * 480) {
    category = 'low';
    recommendedRenderQuality = 'medium';
    shouldUpscale = true;
    estimatedRenderTime = '2-5 min';
  } else if (totalPixels < 1280 * 720) {
    category = 'medium';
    recommendedRenderQuality = 'high';
    shouldUpscale = false;
    estimatedRenderTime = '3-7 min';
  } else if (totalPixels < 1920 * 1080) {
    category = 'high';
    recommendedRenderQuality = 'high';
    shouldUpscale = false;
    estimatedRenderTime = '5-10 min';
  } else {
    category = 'ultra';
    recommendedRenderQuality = 'ultra';
    shouldUpscale = false;
    estimatedRenderTime = '8-15 min';
  }
  
  // Adjust based on bitrate quality
  if (bitrate && bitrate > 10000000) { // > 10Mbps
    recommendedRenderQuality = 'lossless';
  }
  
  return {
    category,
    recommendedRenderQuality,
    shouldUpscale,
    estimatedRenderTime
  };
}

// Export quality utilities
export { QUALITY_PRESETS, calculateRenderDimensions };
export type { RenderQualityOptions };