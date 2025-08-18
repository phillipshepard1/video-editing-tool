import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getVideoProcessor, ProcessingOptions } from '@/lib/services/video-processor';

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
    const processingOptions = formData.get('options') ? 
      JSON.parse(formData.get('options') as string) : {};
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log(`Processing upload: ${file.name}, size: ${file.size} bytes (${(file.size / 1024 / 1024).toFixed(1)} MB)`);

    // Initialize video processor
    const processor = getVideoProcessor();
    await processor.initialize();

    // Comprehensive validation using video processor
    const validation = await processor.validateVideo(file, {
      maxSizeBytes: 2 * 1024 * 1024 * 1024, // 2GB Gemini limit
      ...processingOptions
    });

    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: 'Video validation failed', 
          issues: validation.issues,
          supportedFormats: processor.getSupportedFormats()
        },
        { status: 400 }
      );
    }

    // Process video (convert if needed, chunk if too large)
    const processingResult = await processor.processVideo(file, {
      maxSizeBytes: 2 * 1024 * 1024 * 1024, // 2GB for Gemini
      chunkSize: 500, // 500MB chunks
      quality: processingOptions.quality || 'medium',
      ...processingOptions
    });

    if (!processingResult.success) {
      return NextResponse.json(
        { 
          error: 'Video processing failed', 
          details: processingResult.error,
          originalFormat: processingResult.originalFormat
        },
        { status: 500 }
      );
    }

    // Determine which file(s) to upload to Gemini
    const filesToProcess = processingResult.chunks || 
      [{ index: 0, file: processingResult.convertedFile || file, startTime: 0, endTime: 0, duration: 0, size: (processingResult.convertedFile || file).size }];

    const uploadStartTime = Date.now();
    const uploadResults: any[] = [];

    // Process each file/chunk
    for (let i = 0; i < filesToProcess.length; i++) {
      const chunk = filesToProcess[i];
      console.log(`Processing chunk ${i + 1}/${filesToProcess.length}: ${chunk.file.name}, size: ${(chunk.size / 1024 / 1024).toFixed(1)} MB`);

      // Prepare Gemini upload for this chunk
      const geminiFormData = new FormData();
      geminiFormData.append('file', chunk.file);

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
      const fileExtension = chunk.file.name.split('.').pop() || 'mp4';
      const supabaseFileName = `uploads/video_${timestamp}_chunk_${chunk.index}.${fileExtension}`;

      // Convert File to ArrayBuffer for Supabase
      const arrayBuffer = await chunk.file.arrayBuffer();

      // Start both uploads in parallel
      console.log(`Starting parallel uploads for chunk ${i + 1} to Gemini and Supabase...`);
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
            throw new Error(`Failed to upload chunk ${i + 1} to Gemini`);
          }
          return response.json();
        }),
        
        // Upload to Supabase
        supabaseAdmin.storage
          .from('videos')
          .upload(supabaseFileName, arrayBuffer, {
            contentType: chunk.file.type,
            upsert: false
          })
      ]);

      console.log(`Chunk ${i + 1} parallel upload successful`);
      console.log(`- Gemini: ${geminiResult.file.name}`);
      console.log(`- Supabase: ${supabaseFileName}`);

      // Check if Supabase upload was successful
      if (supabaseResult.error) {
        console.error(`Supabase upload error for chunk ${i + 1}:`, supabaseResult.error);
        // Continue anyway - Gemini upload succeeded
      }

      // Get public URL for Supabase video
      let supabaseUrl = null;
      if (!supabaseResult.error) {
        const { data: publicUrlData } = supabaseAdmin.storage
          .from('videos')
          .getPublicUrl(supabaseFileName);
        supabaseUrl = publicUrlData.publicUrl;
      }

      // Wait for file to become active in Gemini
      console.log(`Waiting for chunk ${i + 1} to become active in Gemini...`);
      try {
        const isActive = await waitForFileActive(geminiResult.file.uri);
        
        if (!isActive) {
          throw new Error(`Chunk ${i + 1} upload succeeded but activation timed out`);
        }
      } catch (waitError) {
        console.error(`Error during chunk ${i + 1} activation:`, waitError);
        throw waitError;
      }
      
      console.log(`Chunk ${i + 1} is active and ready for analysis`);

      // Store chunk result
      uploadResults.push({
        chunkIndex: chunk.index,
        fileUri: geminiResult.file.uri,
        fileName: geminiResult.file.displayName,
        sizeBytes: geminiResult.file.sizeBytes,
        mimeType: geminiResult.file.mimeType,
        supabaseUrl,
        supabaseFileName,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        duration: chunk.duration
      });
    }

    const totalUploadTime = Date.now() - uploadStartTime;
    console.log(`All ${filesToProcess.length} chunk(s) processed successfully in ${(totalUploadTime/1000).toFixed(1)}s`);

    // Cleanup processor resources
    await processor.cleanup();
    
    return NextResponse.json({
      success: true,
      processingResult: {
        originalFormat: processingResult.originalFormat,
        targetFormat: processingResult.targetFormat,
        conversionRequired: processingResult.originalFormat !== processingResult.targetFormat,
        wasChunked: filesToProcess.length > 1,
        totalSize: processingResult.totalSize,
        geminiCompatible: processingResult.geminiCompatible
      },
      chunks: uploadResults,
      totalChunks: filesToProcess.length,
      uploadTime: totalUploadTime
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Cleanup processor resources on error
    try {
      const processor = getVideoProcessor();
      await processor.cleanup();
    } catch (cleanupError) {
      console.warn('Cleanup error:', cleanupError);
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}