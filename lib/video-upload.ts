// Server-side upload via API route - no direct Supabase client needed

export interface VideoUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface VideoUploadResult {
  publicUrl: string;
  filePath: string;
}

// Upload video to Supabase Storage and get public URL
export async function uploadVideoToSupabase(
  videoFile: File,
  onProgress?: (progress: VideoUploadProgress) => void
): Promise<VideoUploadResult> {
  // Check file size
  const maxSize = 5 * 1024 * 1024 * 1024; // 5GB limit (matching bucket limit)
  
  if (videoFile.size > maxSize) {
    throw new Error(`File size ${(videoFile.size / 1024 / 1024).toFixed(1)}MB exceeds the 5GB limit. Please use a smaller video file.`);
  }
  
  console.log(`Uploading video: ${videoFile.name}, size: ${(videoFile.size / 1024 / 1024).toFixed(1)}MB`);
  
  // Generate unique filename
  const timestamp = Date.now();
  const fileExtension = videoFile.name.split('.').pop() || 'mp4';
  const fileName = `video_${timestamp}.${fileExtension}`;
  const filePath = `renders/${fileName}`;
  
  try {
    // Use server-side API route for upload (uses service key, bypasses RLS)
    const formData = new FormData();
    formData.append('file', videoFile);
    formData.append('path', filePath);
    
    const response = await fetch('/api/storage/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }
    
    console.log('Video uploaded successfully via API:', {
      publicUrl: result.publicUrl,
      filePath: result.filePath,
      bucket: result.bucket
    });
    
    // Report progress as complete
    if (onProgress) {
      onProgress({
        loaded: videoFile.size,
        total: videoFile.size,
        percentage: 100
      });
    }
    
    return {
      publicUrl: result.publicUrl,
      filePath: result.filePath
    };
    
  } catch (error) {
    console.error('Video upload failed:', error);
    throw error;
  }
}

// Convert blob URL to File object
export async function blobUrlToFile(blobUrl: string, fileName: string): Promise<File> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type });
}

// Get video file from current upload context
export async function getVideoFileForUpload(
  videoUrl: string,
  originalFileName?: string
): Promise<File> {
  if (videoUrl.startsWith('blob:')) {
    // Convert blob URL to File
    const fileName = originalFileName || `video_${Date.now()}.mp4`;
    return await blobUrlToFile(videoUrl, fileName);
  } else if (videoUrl.startsWith('http')) {
    // Download from URL and convert to File
    const response = await fetch(videoUrl);
    const blob = await response.blob();
    const fileName = originalFileName || videoUrl.split('/').pop() || `video_${Date.now()}.mp4`;
    return new File([blob], fileName, { type: blob.type });
  } else {
    throw new Error('Unsupported video URL format');
  }
}