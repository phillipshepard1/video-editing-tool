import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Increase body size limit for video uploads
export const maxDuration = 300; // 5 minutes timeout
export const runtime = 'nodejs';

// Helper function to wait for file to be active
async function waitForFileActive(fileUri: string, maxAttempts = 60): Promise<boolean> {
  const fileId = fileUri.split('/').pop();
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${process.env.GEMINI_API_KEY}`
      );
      
      if (response.ok) {
        const fileStatus = await response.json();
        console.log(`File status check ${i + 1}/${maxAttempts}: ${fileStatus.state}`);
        
        if (fileStatus.state === 'ACTIVE') {
          console.log(`File became active after ${i + 1} attempts (${(i + 1) * 3} seconds)`);
          return true;
        }
        
        if (fileStatus.state === 'FAILED') {
          console.error('File processing failed:', fileStatus);
          throw new Error(`Gemini failed to process the video: ${fileStatus.error?.message || 'Unknown error'}`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error('Error checking file status:', error);
    }
  }
  
  return false;
}

// Server-side video validation
function validateVideo(file: File): { valid: boolean; issues: string[]; needsChunking: boolean } {
  const issues: string[] = [];
  
  // Check file size (2GB limit for Gemini)
  const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
  const needsChunking = file.size > maxSize;
  
  if (file.size > 5 * 1024 * 1024 * 1024) { // 5GB absolute max
    issues.push(`File size (${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB) exceeds 5GB maximum`);
  }
  
  // Check file format
  const supportedFormats = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/webm',
    'video/x-ms-wmv',
    'video/3gpp'
  ];
  
  if (!supportedFormats.includes(file.type)) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const supportedExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', '3gp'];
    
    if (!extension || !supportedExtensions.includes(extension)) {
      issues.push(`Unsupported format: ${file.type || extension}`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    needsChunking
  };
}

export async function POST(request: NextRequest) {
  try {
    // Handle large uploads by reading the file in chunks
    const contentType = request.headers.get('content-type') || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Invalid content type. Expected multipart/form-data' },
        { status: 400 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error('Error parsing form data:', error);
      
      // If metadata part is too large, suggest client-side chunking
      if (error instanceof Error && error.message.includes('too large')) {
        return NextResponse.json({
          error: 'File too large for direct upload',
          requiresChunking: true,
          message: 'Please use the chunked upload endpoint for large files',
          maxDirectUploadSize: '100MB'
        }, { status: 413 });
      }
      
      throw error;
    }
    
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    console.log('Received file:', file.name, 'Type:', file.type, 'Size:', (file.size / 1024 / 1024).toFixed(2) + 'MB');
    
    // Validate video
    const validation = validateVideo(file);
    
    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: 'Video validation failed', 
          issues: validation.issues
        },
        { status: 400 }
      );
    }
    
    // For very large files, return chunking instructions
    if (validation.needsChunking) {
      return NextResponse.json({
        requiresChunking: true,
        message: 'File exceeds 2GB. Please use chunked upload.',
        fileSize: file.size,
        recommendedChunkSize: 500 * 1024 * 1024, // 500MB chunks
        endpoint: '/api/upload/chunked'
      }, { status: 200 });
    }
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    
    // Upload to Supabase storage
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedName}`;
    const bucketName = 'videos';
    
    console.log('Uploading to Supabase bucket:', bucketName, 'File:', fileName);
    
    // First, ensure the bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucketName);
    
    if (!bucketExists) {
      console.log('Creating videos bucket...');
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: false,
        allowedMimeTypes: ['video/*']
      });
      
      if (createError && !createError.message.includes('already exists')) {
        console.error('Error creating bucket:', createError);
        return NextResponse.json(
          { error: 'Failed to create storage bucket', details: createError.message },
          { status: 500 }
        );
      }
    }
    
    // Upload file to Supabase
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false
      });
    
    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload to storage', details: uploadError.message },
        { status: 500 }
      );
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);
    
    console.log('Supabase upload successful:', publicUrl);
    
    // For files that don't need Gemini (too complex, wrong format), skip Gemini
    // Gemini supports up to 2GB, but we'll use 1.9GB as safe limit
    const skipGemini = !['video/mp4', 'video/quicktime'].includes(file.type) || file.size > 1900 * 1024 * 1024; // 1.9GB
    
    if (skipGemini) {
      console.log('Skipping Gemini upload for this file type/size');
      return NextResponse.json({
        supabaseUrl: publicUrl,
        supabaseFileName: fileName,
        requiresClientProcessing: true,
        skipGemini: true,
        message: 'File uploaded to storage. Client-side processing recommended.'
      });
    }
    
    // Upload to Gemini API for compatible files
    console.log('Starting Gemini upload...');
    
    try {
      // Convert File to ArrayBuffer for proper upload
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Create proper multipart boundary
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;
      
      // Build multipart body manually to avoid metadata issues
      const metadata = JSON.stringify({
        file: {
          mimeType: file.type || 'video/mp4',
          displayName: file.name
        }
      });
      
      const multipartBody = Buffer.concat([
        Buffer.from(delimiter),
        Buffer.from('Content-Type: application/json\r\n\r\n'),
        Buffer.from(metadata),
        Buffer.from(delimiter),
        Buffer.from(`Content-Type: ${file.type || 'video/mp4'}\r\n\r\n`),
        buffer,
        Buffer.from(closeDelimiter)
      ]);
      
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': multipartBody.length.toString()
          },
          body: multipartBody,
        }
      );
      
      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error('Gemini upload failed:', errorText);
        console.error('Response status:', geminiResponse.status);
        console.error('File size:', (file.size / 1024 / 1024).toFixed(2) + 'MB');
        
        // Parse error for better diagnostics
        let errorMessage = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorText;
        } catch (e) {
          // Keep original error text if not JSON
        }
        
        // Still return Supabase URL even if Gemini fails
        return NextResponse.json({
          supabaseUrl: publicUrl,
          supabaseFileName: fileName,
          geminiError: errorMessage,
          fileSizeMB: Math.round(file.size / 1024 / 1024),
          requiresClientProcessing: true,
          message: 'Uploaded to storage but Gemini processing failed. Use client-side processing.'
        });
      }
      
      const uploadResult = await geminiResponse.json();
      console.log('Gemini upload completed. File URI:', uploadResult.file?.uri);
      
      // Wait for file to become active
      if (uploadResult.file?.uri) {
        const isActive = await waitForFileActive(uploadResult.file.uri);
        
        if (!isActive) {
          console.warn('Gemini file not active yet, but continuing...');
        }
      }
      
      // Return both Gemini URI and Supabase URL
      return NextResponse.json({
        fileUri: uploadResult.file?.uri,
        fileName: uploadResult.file?.name,
        mimeType: uploadResult.file?.mimeType,
        sizeBytes: uploadResult.file?.sizeBytes,
        supabaseUrl: publicUrl,
        supabaseFileName: fileName,
        requiresClientProcessing: false
      });
      
    } catch (geminiError) {
      console.error('Gemini error:', geminiError);
      
      // Return Supabase URL even if Gemini fails
      return NextResponse.json({
        supabaseUrl: publicUrl,
        supabaseFileName: fileName,
        geminiError: geminiError instanceof Error ? geminiError.message : 'Gemini upload failed',
        requiresClientProcessing: true,
        message: 'File uploaded to storage. Gemini processing failed - use alternative processing.'
      });
    }
    
  } catch (error) {
    console.error('Upload error:', error);
    
    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('too large') || error.message.includes('413')) {
        return NextResponse.json({
          error: 'File too large',
          requiresChunking: true,
          message: 'Please use chunked upload for files over 100MB'
        }, { status: 413 });
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}