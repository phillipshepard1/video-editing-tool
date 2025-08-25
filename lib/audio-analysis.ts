/**
 * Audio Analysis Utilities for Silence Detection and Boundary Refinement
 */

export interface AudioSegmentInfo {
  startTime: number;
  endTime: number;
  speechStart: number;
  speechEnd: number;
  leadingSilence: number;
  trailingSilence: number;
  averageLevel: number;
  peakLevel: number;
  silenceThreshold: number;
}

export interface SilenceRegion {
  start: number;
  end: number;
  duration: number;
}

/**
 * Analyzes audio levels in a video element to detect silence regions
 * @param video Video element to analyze
 * @param startTime Start time for analysis (seconds)
 * @param endTime End time for analysis (seconds)
 * @param silenceThreshold Audio level threshold for silence detection (-40 dB default)
 * @returns Promise with audio segment information
 */
export async function analyzeAudioSegment(
  video: HTMLVideoElement,
  startTime: number,
  endTime: number,
  silenceThreshold: number = -40
): Promise<AudioSegmentInfo> {
  return new Promise((resolve, reject) => {
    // Create audio context for analysis
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaElementSource(video);
    const analyser = audioContext.createAnalyser();
    
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.3;
    
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Sample rate for analysis (10 samples per second)
    const sampleRate = 10;
    const samples: number[] = [];
    let currentTime = startTime;
    
    // Seek to start time
    video.currentTime = startTime;
    
    const analyzeSample = () => {
      if (currentTime >= endTime) {
        // Analysis complete, process results
        const result = processSamples(samples, startTime, endTime, silenceThreshold, sampleRate);
        audioContext.close();
        resolve(result);
        return;
      }
      
      // Get current audio level
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const dbLevel = 20 * Math.log10(average / 255);
      
      samples.push(dbLevel);
      currentTime += 1 / sampleRate;
      
      // Seek to next sample position
      video.currentTime = currentTime;
      
      // Continue analysis
      setTimeout(analyzeSample, 1000 / sampleRate);
    };
    
    // Start analysis when video is ready
    video.addEventListener('seeked', () => {
      setTimeout(analyzeSample, 100);
    }, { once: true });
    
    video.addEventListener('error', () => {
      audioContext.close();
      reject(new Error('Video analysis failed'));
    });
  });
}

/**
 * Process audio samples to detect speech boundaries
 */
function processSamples(
  samples: number[],
  startTime: number,
  endTime: number,
  silenceThreshold: number,
  sampleRate: number
): AudioSegmentInfo {
  // Find first non-silent sample (speech start)
  let speechStartIndex = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] > silenceThreshold) {
      speechStartIndex = i;
      break;
    }
  }
  
  // Find last non-silent sample (speech end)
  let speechEndIndex = samples.length - 1;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i] > silenceThreshold) {
      speechEndIndex = i;
      break;
    }
  }
  
  // Calculate times
  const speechStart = startTime + (speechStartIndex / sampleRate);
  const speechEnd = startTime + (speechEndIndex / sampleRate);
  const leadingSilence = speechStart - startTime;
  const trailingSilence = endTime - speechEnd;
  
  // Calculate audio levels
  const nonSilentSamples = samples.filter(s => s > silenceThreshold);
  const averageLevel = nonSilentSamples.length > 0 
    ? nonSilentSamples.reduce((a, b) => a + b) / nonSilentSamples.length 
    : silenceThreshold;
  const peakLevel = Math.max(...samples);
  
  return {
    startTime,
    endTime,
    speechStart,
    speechEnd,
    leadingSilence,
    trailingSilence,
    averageLevel,
    peakLevel,
    silenceThreshold
  };
}

/**
 * Detects all silence regions in a video
 * @param video Video element to analyze
 * @param duration Video duration in seconds
 * @param minSilenceDuration Minimum silence duration to detect (default 1 second)
 * @param silenceThreshold Audio level threshold for silence detection
 * @returns Array of silence regions
 */
export async function detectSilenceRegions(
  video: HTMLVideoElement,
  duration: number,
  minSilenceDuration: number = 1.0,
  silenceThreshold: number = -40
): Promise<SilenceRegion[]> {
  const regions: SilenceRegion[] = [];
  const sampleRate = 10; // 10 samples per second
  const totalSamples = Math.floor(duration * sampleRate);
  
  // Create audio context for analysis
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioContext.createMediaElementSource(video);
  const analyser = audioContext.createAnalyser();
  
  analyser.fftSize = 2048;
  source.connect(analyser);
  analyser.connect(audioContext.destination);
  
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  // Analyze entire video
  const samples: boolean[] = [];
  
  for (let i = 0; i < totalSamples; i++) {
    const time = i / sampleRate;
    video.currentTime = time;
    
    await new Promise(resolve => {
      video.addEventListener('seeked', () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        const dbLevel = 20 * Math.log10(average / 255);
        samples.push(dbLevel < silenceThreshold);
        resolve(undefined);
      }, { once: true });
    });
  }
  
  // Find silence regions
  let silenceStart = -1;
  
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate;
    const isSilent = samples[i];
    
    if (isSilent && silenceStart === -1) {
      // Start of silence region
      silenceStart = time;
    } else if (!isSilent && silenceStart !== -1) {
      // End of silence region
      const duration = time - silenceStart;
      if (duration >= minSilenceDuration) {
        regions.push({
          start: silenceStart,
          end: time,
          duration
        });
      }
      silenceStart = -1;
    }
  }
  
  // Handle trailing silence
  if (silenceStart !== -1) {
    const duration = (samples.length / sampleRate) - silenceStart;
    if (duration >= minSilenceDuration) {
      regions.push({
        start: silenceStart,
        end: samples.length / sampleRate,
        duration
      });
    }
  }
  
  audioContext.close();
  return regions;
}

/**
 * Refines segment boundaries based on audio analysis
 * Trims silence from the beginning and end of segments
 */
export async function refineSegmentBoundaries(
  video: HTMLVideoElement,
  segments: Array<{startTime: number; endTime: number; [key: string]: any}>,
  silenceThreshold: number = -40
): Promise<Array<any>> {
  const refinedSegments = [];
  
  for (const segment of segments) {
    try {
      const audioInfo = await analyzeAudioSegment(
        video,
        segment.startTime,
        segment.endTime,
        silenceThreshold
      );
      
      // Only refine if there's significant silence to trim
      const shouldRefine = audioInfo.leadingSilence > 0.5 || audioInfo.trailingSilence > 0.5;
      
      if (shouldRefine) {
        refinedSegments.push({
          ...segment,
          originalStart: segment.startTime,
          originalEnd: segment.endTime,
          startTime: audioInfo.speechStart,
          endTime: audioInfo.speechEnd,
          leadingSilence: audioInfo.leadingSilence,
          trailingSilence: audioInfo.trailingSilence,
          wasRefined: true,
          audioAnalysis: {
            averageLevel: audioInfo.averageLevel,
            peakLevel: audioInfo.peakLevel,
            silenceThreshold: audioInfo.silenceThreshold
          }
        });
      } else {
        refinedSegments.push({
          ...segment,
          wasRefined: false
        });
      }
    } catch (error) {
      console.warn(`Failed to refine segment ${segment.startTime}-${segment.endTime}:`, error);
      refinedSegments.push(segment);
    }
  }
  
  return refinedSegments;
}

/**
 * Simple audio level detection without full analysis
 * Used for real-time preview adjustments
 */
export function createAudioLevelDetector(video: HTMLVideoElement) {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioContext.createMediaElementSource(video);
  const analyser = audioContext.createAnalyser();
  
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;
  
  source.connect(analyser);
  analyser.connect(audioContext.destination);
  
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  return {
    getCurrentLevel(): number {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      return 20 * Math.log10(average / 255);
    },
    
    isSilent(threshold: number = -40): boolean {
      return this.getCurrentLevel() < threshold;
    },
    
    destroy() {
      audioContext.close();
    }
  };
}

/**
 * Time conversion utilities
 */
export function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    // MM:SS format
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return parseFloat(timeStr);
}

export function secondsToTimeString(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
}