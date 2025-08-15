import { createClient } from '@/utils/supabase/client';

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
  const supabase = createClient();
  
  // Check file size
  const maxSize = 500 * 1024 * 1024; // 500MB limit
  
  if (videoFile.size > maxSize) {
    throw new Error(`File size ${(videoFile.size / 1024 / 1024).toFixed(1)}MB exceeds the 500MB limit. Please use a smaller video file.`);
  }
  
  console.log(`Uploading video: ${videoFile.name}, size: ${(videoFile.size / 1024 / 1024).toFixed(1)}MB`);
  
  // Generate unique filename
  const timestamp = Date.now();
  const fileExtension = videoFile.name.split('.').pop() || 'mp4';
  const fileName = `video_${timestamp}.${fileExtension}`;
  const filePath = `renders/${fileName}`;
  
  try {
    // Try to upload to 'videos' bucket, fallback to creating it or using default bucket
    let bucketName = 'videos';
    let uploadResult = await supabase.storage
      .from(bucketName)
      .upload(filePath, videoFile, {
        cacheControl: '3600',
        upsert: false
      });
    
    // If bucket doesn't exist, try to create it
    if (uploadResult.error?.message?.includes('Bucket not found')) {
      console.log('Videos bucket not found, creating it...');
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        allowedMimeTypes: ['video/*'],
        fileSizeLimit: 524288000 // 500MB limit
      });
      
      if (createError && !createError.message.includes('already exists')) {
        console.warn('Could not create videos bucket:', createError.message);
        // Fallback to using a default bucket name
        bucketName = 'public';
      }
      
      // Retry upload
      uploadResult = await supabase.storage
        .from(bucketName)
        .upload(filePath, videoFile, {
          cacheControl: '3600',
          upsert: false
        });
    }
    
    if (uploadResult.error) {
      console.error('Supabase upload error:', uploadResult.error);
      throw new Error(`Failed to upload video: ${uploadResult.error.message}`);
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);
    
    if (!publicUrl) {
      throw new Error('Failed to get public URL for uploaded video');
    }
    
    console.log('Video uploaded successfully:', { publicUrl, filePath });
    
    return {
      publicUrl,
      filePath
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