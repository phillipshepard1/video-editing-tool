// Direct upload to Supabase using signed URLs - handles large files better

interface UploadProgress {
  percentage: number;
  loaded: number;
  total: number;
  speed?: number; // bytes per second
  timeRemaining?: number; // seconds
}

export async function uploadVideoDirectly(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<{ publicUrl: string; path: string }> {
  
  const fileName = `uploads/video_${Date.now()}_${file.name}`;
  
  console.log(`Starting direct upload: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
  
  // Step 1: Get a signed upload URL from our API
  const urlResponse = await fetch('/api/storage/create-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName,
      bucketName: 'videos'
    })
  });

  if (!urlResponse.ok) {
    const error = await urlResponse.json();
    throw new Error(error.error || 'Failed to get upload URL');
  }

  const { uploadUrl, token, publicUrl, path } = await urlResponse.json();
  
  console.log('Got signed upload URL, starting upload...');
  
  // Step 2: Upload directly to Supabase using the signed URL
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;
    
    // Track upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000; // seconds
        const bytesDiff = event.loaded - lastLoaded;
        const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
        
        const percentage = Math.round((event.loaded / event.total) * 100);
        const bytesRemaining = event.total - event.loaded;
        const timeRemaining = speed > 0 ? bytesRemaining / speed : 0;
        
        if (onProgress) {
          onProgress({
            percentage,
            loaded: event.loaded,
            total: event.total,
            speed,
            timeRemaining
          });
        }
        
        lastLoaded = event.loaded;
        lastTime = now;
        
        // Log progress every 10%
        if (percentage % 10 === 0) {
          const speedMB = (speed / (1024 * 1024)).toFixed(2);
          const remainingMin = Math.ceil(timeRemaining / 60);
          console.log(`Upload progress: ${percentage}% (${speedMB} MB/s, ~${remainingMin}min remaining)`);
        }
      }
    });
    
    // Handle successful upload
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const totalTime = (Date.now() - startTime) / 1000;
        const avgSpeed = (file.size / totalTime / (1024 * 1024)).toFixed(2);
        console.log(`Upload complete! Took ${totalTime.toFixed(1)}s at ${avgSpeed} MB/s average`);
        resolve({ publicUrl, path });
      } else {
        console.error('Upload failed with status:', xhr.status, xhr.responseText);
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    
    // Handle errors
    xhr.addEventListener('error', () => {
      console.error('Upload error occurred');
      reject(new Error('Upload failed - network error'));
    });
    
    xhr.addEventListener('abort', () => {
      console.error('Upload was aborted');
      reject(new Error('Upload aborted'));
    });
    
    xhr.addEventListener('timeout', () => {
      console.error('Upload timed out');
      reject(new Error('Upload timed out'));
    });
    
    // Configure and send request
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('x-upsert', 'true'); // Allow overwriting
    
    // Set a very long timeout for large files (30 minutes)
    xhr.timeout = 30 * 60 * 1000;
    
    // Send the file
    xhr.send(file);
  });
}

// Helper to format bytes
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper to format time
export function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${(seconds / 3600).toFixed(1)}h`;
}