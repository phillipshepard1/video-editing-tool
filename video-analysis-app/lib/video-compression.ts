/**
 * Video compression utilities for large file handling
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  targetSizeMB?: number;
}

/**
 * Compress video using browser's MediaRecorder API
 * This creates a lower quality version suitable for analysis
 */
export async function compressVideoForAnalysis(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const {
    maxWidth = 854,  // 480p width
    maxHeight = 480,  // 480p height
    videoBitrate = 1000000, // 1 Mbps
    audioBitrate = 128000,  // 128 kbps
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;

    video.onloadedmetadata = async () => {
      try {
        // Calculate scaling to maintain aspect ratio
        const scale = Math.min(
          maxWidth / video.videoWidth,
          maxHeight / video.videoHeight,
          1 // Don't upscale
        );
        
        const outputWidth = Math.floor(video.videoWidth * scale);
        const outputHeight = Math.floor(video.videoHeight * scale);

        // Create canvas for video processing
        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Could not get canvas context');
        }

        // Capture canvas stream
        const stream = canvas.captureStream(30); // 30 fps

        // Add audio from original video if available
        try {
          const audioStream = (video as any).captureStream();
          const audioTrack = audioStream.getAudioTracks()[0];
          if (audioTrack) {
            stream.addTrack(audioTrack);
          }
        } catch (e) {
          console.warn('Could not capture audio:', e);
        }

        // Set up MediaRecorder with compression
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: videoBitrate,
          audioBitsPerSecond: audioBitrate,
        });

        const chunks: Blob[] = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, '_compressed.webm'),
            { type: 'video/webm' }
          );
          
          URL.revokeObjectURL(video.src);
          resolve(compressedFile);
        };

        mediaRecorder.onerror = (event) => {
          reject(new Error('MediaRecorder error: ' + event));
        };

        // Start recording and playback
        mediaRecorder.start();
        video.play();

        // Draw video frames to canvas
        const drawFrame = () => {
          if (!video.paused && !video.ended) {
            ctx.drawImage(video, 0, 0, outputWidth, outputHeight);
            requestAnimationFrame(drawFrame);
          } else {
            mediaRecorder.stop();
          }
        };
        
        video.onplay = () => {
          drawFrame();
        };

      } catch (error) {
        URL.revokeObjectURL(video.src);
        reject(error);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };
  });
}

/**
 * Check if video needs compression based on file size
 */
export function needsCompression(file: File, thresholdMB: number = 500): boolean {
  const fileSizeMB = file.size / (1024 * 1024);
  return fileSizeMB > thresholdMB;
}

/**
 * Estimate compressed file size
 */
export function estimateCompressedSize(
  originalSizeMB: number,
  originalResolution: { width: number; height: number },
  targetResolution: { width: number; height: number } = { width: 854, height: 480 }
): number {
  const pixelRatio = 
    (targetResolution.width * targetResolution.height) / 
    (originalResolution.width * originalResolution.height);
  
  // Rough estimate: compressed size is proportional to pixel count and bitrate reduction
  // Assuming we're reducing bitrate by ~70% and resolution by pixelRatio
  return originalSizeMB * pixelRatio * 0.3;
}