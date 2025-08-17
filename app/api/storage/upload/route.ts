import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase admin client with service key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string;
    
    if (!file || !path) {
      return NextResponse.json(
        { error: 'File and path are required' },
        { status: 400 }
      );
    }
    
    // Convert File to ArrayBuffer then to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`[Server] Uploading file: ${file.name}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB, path: ${path}`);
    
    // Try to upload to videos bucket first, then public as fallback
    const buckets = ['videos', 'public'];
    let uploadSuccess = false;
    let uploadedBucket = '';
    let lastError: any = null;
    
    for (const bucket of buckets) {
      console.log(`[Server] Attempting upload to bucket: ${bucket}`);
      
      // Check if bucket exists, create if needed
      const { data: bucketList } = await supabaseAdmin.storage.listBuckets();
      const bucketExists = bucketList?.some(b => b.name === bucket);
      
      if (!bucketExists) {
        console.log(`[Server] Creating bucket: ${bucket}`);
        const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
          public: true,
          fileSizeLimit: 5368709120, // 5GB - maximum allowed by Supabase
          allowedMimeTypes: ['video/mp4', 'video/mov', 'video/avi', 'video/quicktime', 'video/webm', 'video/x-m4v']
        });
        
        if (createError && !createError.message.includes('already exists')) {
          console.error(`[Server] Failed to create bucket ${bucket}:`, createError);
          lastError = createError;
          continue;
        }
      }
      
      // Upload the file using service key (bypasses all RLS)
      // For large files, we need to handle them differently
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, buffer, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false,
          duplex: 'half' // Required for large uploads
        });
      
      if (error) {
        console.error(`[Server] Upload to ${bucket} failed:`, error);
        lastError = error;
        
        // If file exists, try with a unique name
        if (error.message?.includes('already exists')) {
          const timestamp = Date.now();
          const newPath = path.replace(/(\.[^.]+)$/, `_${timestamp}$1`);
          console.log(`[Server] File exists, trying with new path: ${newPath}`);
          
          const { data: retryData, error: retryError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(newPath, buffer, {
              contentType: file.type,
              cacheControl: '3600',
              upsert: false
            });
          
          if (!retryError) {
            uploadSuccess = true;
            uploadedBucket = bucket;
            
            // Get public URL
            const { data: { publicUrl } } = supabaseAdmin.storage
              .from(bucket)
              .getPublicUrl(newPath);
            
            console.log(`[Server] Upload successful to ${bucket}: ${publicUrl}`);
            
            return NextResponse.json({
              success: true,
              publicUrl,
              filePath: newPath,
              bucket
            });
          }
        }
        continue;
      }
      
      uploadSuccess = true;
      uploadedBucket = bucket;
      
      // Get public URL
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(path);
      
      console.log(`[Server] Upload successful to ${bucket}: ${publicUrl}`);
      
      return NextResponse.json({
        success: true,
        publicUrl,
        filePath: path,
        bucket: uploadedBucket
      });
    }
    
    // If we get here, all attempts failed
    throw new Error(`Failed to upload to any bucket. Last error: ${lastError?.message || 'Unknown error'}`);
    
  } catch (error: any) {
    console.error('[Server] Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout for large uploads