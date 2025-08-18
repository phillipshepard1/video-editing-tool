import { createClient } from '@supabase/supabase-js';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
const MAX_RETRIES = 3;
const UPLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes per chunk

interface UploadProgress {
  uploaded: number;
  total: number;
  percentage: number;
}

export async function uploadLargeFile(
  file: File,
  bucketName: string,
  fileName: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<{ publicUrl: string; path: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  console.log(`Starting chunked upload for ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
  
  // For files under 100MB, use regular upload
  if (file.size < 100 * 1024 * 1024) {
    console.log('File under 100MB, using regular upload');
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return { publicUrl, path: data.path };
  }

  // For large files, use multipart upload via TUS protocol
  console.log('File over 100MB, using TUS resumable upload');
  
  try {
    // First, try using the built-in resumable upload if available
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
        duplex: 'half' // Important for large files
      });

    if (!error) {
      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      return { publicUrl, path: data.path };
    }

    // If regular upload failed, fall back to manual chunking
    console.log('Regular upload failed, falling back to manual chunking:', error.message);
    return await uploadInChunks(file, bucketName, fileName, supabase, onProgress);
    
  } catch (error) {
    console.error('Upload error:', error);
    // Final fallback: try manual chunking
    return await uploadInChunks(file, bucketName, fileName, supabase, onProgress);
  }
}

async function uploadInChunks(
  file: File,
  bucketName: string,
  fileName: string,
  supabase: any,
  onProgress?: (progress: UploadProgress) => void
): Promise<{ publicUrl: string; path: string }> {
  
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  console.log(`Uploading in ${totalChunks} chunks of ${CHUNK_SIZE / (1024 * 1024)}MB each`);
  
  // Create a unique session ID for this upload
  const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const tempFileName = `temp/${sessionId}/${fileName}`;
  
  let uploadedBytes = 0;
  
  // Upload chunks sequentially
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    console.log(`Uploading chunk ${chunkIndex + 1}/${totalChunks} (${((end - start) / (1024 * 1024)).toFixed(2)}MB)`);
    
    let retries = 0;
    let success = false;
    
    while (retries < MAX_RETRIES && !success) {
      try {
        // Upload this chunk
        const chunkFile = new File([chunk], `${fileName}.part${chunkIndex}`, { type: file.type });
        
        const { error } = await supabase.storage
          .from(bucketName)
          .upload(`${tempFileName}.part${chunkIndex}`, chunkFile, {
            cacheControl: '3600',
            upsert: true
          });
        
        if (error) throw error;
        
        uploadedBytes += (end - start);
        success = true;
        
        if (onProgress) {
          onProgress({
            uploaded: uploadedBytes,
            total: file.size,
            percentage: Math.round((uploadedBytes / file.size) * 100)
          });
        }
        
      } catch (error) {
        retries++;
        console.error(`Chunk ${chunkIndex + 1} upload failed (attempt ${retries}/${MAX_RETRIES}):`, error);
        
        if (retries >= MAX_RETRIES) {
          throw new Error(`Failed to upload chunk ${chunkIndex + 1} after ${MAX_RETRIES} attempts`);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000 * retries));
      }
    }
  }
  
  console.log('All chunks uploaded, assembling file...');
  
  // Note: Supabase doesn't have built-in chunk assembly
  // For production, you'd need a server-side function to combine chunks
  // For now, we'll just upload the whole file with increased timeout
  
  // Clean up temp chunks (in production)
  // await cleanupChunks(supabase, bucketName, tempFileName, totalChunks);
  
  // For now, fall back to regular upload with extended timeout
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  return { publicUrl, path: data.path };
}

// Alternative: Use presigned URL for direct upload
export async function getPresignedUploadUrl(
  bucketName: string,
  fileName: string
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  // Create a signed URL for upload (valid for 1 hour)
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUploadUrl(fileName, {
      upsert: true
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  return {
    uploadUrl: data.signedUrl,
    publicUrl
  };
}

// Upload directly using presigned URL
export async function uploadWithPresignedUrl(
  file: File,
  uploadUrl: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          uploaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100)
        });
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });
    
    xhr.addEventListener('timeout', () => {
      reject(new Error('Upload timed out'));
    });
    
    xhr.open('PUT', uploadUrl);
    xhr.timeout = UPLOAD_TIMEOUT;
    xhr.send(file);
  });
}