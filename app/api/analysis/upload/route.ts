import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
        
        // Check for error states
        if (fileStatus.state === 'FAILED') {
          console.error('File processing failed:', fileStatus);
          console.error('Error details:', fileStatus.error || 'No error details provided');
          throw new Error(`Gemini failed to process the video: ${fileStatus.error?.message || fileStatus.error || 'Unknown error'}`);
        }
      }
      
      // Wait 3 seconds before next check (increased from 2)
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error('Error checking file status:', error);
    }
  }
  
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a video file.' },
        { status: 400 }
      );
    }

    // Validate file size (2GB max)
    const maxSize = 2000 * 1024 * 1024; // 2GB in bytes
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2GB.' },
        { status: 400 }
      );
    }

    console.log(`Uploading video: ${file.name}, size: ${file.size} bytes (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    const uploadStartTime = Date.now();

    // Prepare for parallel uploads
    const geminiFormData = new FormData();
    geminiFormData.append('file', file);

    // Initialize Supabase client with service key for server-side operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        auth: {
          persistSession: false
        }
      }
    );

    // Generate unique filename for Supabase
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop() || 'mp4';
    const supabaseFileName = `uploads/video_${timestamp}.${fileExtension}`;

    // Convert File to ArrayBuffer for Supabase
    const arrayBuffer = await file.arrayBuffer();

    // Start both uploads in parallel
    console.log('Starting parallel uploads to Gemini and Supabase...');
    const [geminiResult, supabaseResult] = await Promise.all([
      // Upload to Gemini
      fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          body: geminiFormData,
        }
      ).then(async (response) => {
        if (!response.ok) {
          const error = await response.text();
          console.error('Gemini upload error:', error);
          throw new Error('Failed to upload video to Gemini');
        }
        return response.json();
      }),
      
      // Upload to Supabase
      supabaseAdmin.storage
        .from('videos')
        .upload(supabaseFileName, arrayBuffer, {
          contentType: file.type,
          upsert: false
        })
    ]);

    const uploadTime = Date.now() - uploadStartTime;
    console.log(`Parallel upload successful (took ${uploadTime}ms / ${(uploadTime/1000).toFixed(1)}s)`);
    console.log(`- Gemini: ${geminiResult.file.name}`);
    console.log(`- Supabase: ${supabaseFileName}`);

    // Check if Supabase upload was successful
    if (supabaseResult.error) {
      console.error('Supabase upload error:', supabaseResult.error);
      // Continue anyway - Gemini upload succeeded, we can upload to Supabase later if needed
      console.warn('Supabase upload failed, but continuing with Gemini analysis');
    }

    // Get public URL for Supabase video
    let supabaseUrl = null;
    if (!supabaseResult.error) {
      const { data: publicUrlData } = supabaseAdmin.storage
        .from('videos')
        .getPublicUrl(supabaseFileName);
      supabaseUrl = publicUrlData.publicUrl;
      console.log('Supabase public URL:', supabaseUrl);
    }

    const result = geminiResult;
    
    // Wait for file to become active
    console.log('Waiting for file to become active...');
    try {
      const isActive = await waitForFileActive(result.file.uri);
      
      if (!isActive) {
        return NextResponse.json(
          { error: 'File upload succeeded but activation timed out. Please try again with a smaller video or different format.' },
          { status: 500 }
        );
      }
    } catch (waitError) {
      console.error('Error during file activation:', waitError);
      return NextResponse.json(
        { error: waitError instanceof Error ? waitError.message : 'File processing failed' },
        { status: 500 }
      );
    }
    
    console.log('File is active and ready for analysis');
    
    return NextResponse.json({
      success: true,
      fileUri: result.file.uri,
      fileName: result.file.displayName,
      sizeBytes: result.file.sizeBytes,
      mimeType: result.file.mimeType,
      supabaseUrl: supabaseUrl,  // Include the Supabase URL for later use
      supabaseFileName: supabaseFileName
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}