// Video utilities for frame extraction
export async function extractFramesFromVideo(
  videoFile: File,
  numFrames: number = 10
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const frames: string[] = [];
    const videoUrl = URL.createObjectURL(videoFile);
    
    video.src = videoUrl;
    video.addEventListener('loadedmetadata', () => {
      const duration = video.duration;
      const interval = duration / numFrames;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      let currentFrame = 0;
      
      const captureFrame = () => {
        if (currentFrame >= numFrames) {
          URL.revokeObjectURL(videoUrl);
          resolve(frames);
          return;
        }
        
        video.currentTime = currentFrame * interval;
      };
      
      video.addEventListener('seeked', () => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64
        canvas.toBlob((blob) => {
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              frames.push(base64.split(',')[1]); // Remove data:image/jpeg;base64, prefix
              currentFrame++;
              captureFrame();
            };
            reader.readAsDataURL(blob);
          }
        }, 'image/jpeg', 0.8);
      });
      
      captureFrame();
    });
    
    video.addEventListener('error', (e) => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error('Error loading video'));
    });
  });
}

// Convert video file to base64 (for small videos only)
export async function videoToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // Remove the data:video/mp4;base64, prefix
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}