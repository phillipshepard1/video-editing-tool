/**
 * Queue-based Video Upload API
 * Handles video upload using the new job queue system
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';
import { createClient } from '@supabase/supabase-js';

const jobQueue = getJobQueueService();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('video') as File;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const userId = formData.get('userId') as string | null; // Make userId optional
    const priority = (formData.get('priority') as any) || 'normal';
    
    // Parse processing options
    let processingOptions = {};
    const processingOptionsStr = formData.get('processingOptions') as string;
    if (processingOptionsStr) {
      try {
        processingOptions = JSON.parse(processingOptionsStr);
      } catch (e) {
        console.warn('Invalid processing options JSON, using defaults');
      }
    }

    // Parse metadata
    let metadata = {};
    const metadataStr = formData.get('metadata') as string;
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch (e) {
        console.warn('Invalid metadata JSON, using defaults');
      }
    }

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No video file provided' },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      return NextResponse.json(
        { success: false, error: 'File must be a video' },
        { status: 400 }
      );
    }

    // Check file size (max 2GB)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      return NextResponse.json(
        { 
          success: false, 
          error: `File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024 / 1024)}GB` 
        },
        { status: 400 }
      );
    }

    // Create the job first
    let job;
    try {
      job = await jobQueue.createJob({
        title,
        description,
        user_id: userId || undefined,
        priority,
        processing_options: {
          quality: 'medium',
          maxSizeBytes: 50 * 1024 * 1024, // 50MB chunks
          ...processingOptions,
        },
        metadata: {
          ...metadata,
          originalFileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          uploadedAt: new Date().toISOString(),
        },
      });
      
      // Validate job was created with an ID
      if (!job || !job.id) {
        throw new Error('Job creation failed - no job ID returned');
      }
      
      console.log('Job created successfully:', job.id);
    } catch (error) {
      console.error('Failed to create job:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to create job: ${error instanceof Error ? error.message : 'Unknown error'}`
        },
        { status: 500 }
      );
    }

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload the entire video to Supabase storage first
    const videoPath = `jobs/${job.id}/original_${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('videos')
      .upload(videoPath, buffer, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      await jobQueue.updateJob(job.id, {
        status: 'failed',
        last_error: `Upload failed: ${uploadError.message}`
      });
      throw new Error(`Failed to upload video: ${uploadError.message}`);
    }

    // Get public URL for the uploaded video
    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(videoPath);

    // Update job with video URL
    await jobQueue.updateJob(job.id, {
      metadata: {
        ...job.metadata,
        videoPath,
        videoUrl: publicUrl
      }
    });

    // Now split into chunks for processing
    // Smaller chunks for Gemini (5MB max to avoid metadata too large error)
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks
    const chunks = [];
    for (let i = 0; i < buffer.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, buffer.length);
      chunks.push({
        index: chunks.length,
        start: i,
        end: end,
        size: end - i
      });
    }

    // Prepare chunk records for database
    const chunkRecords = [];
    
    // Upload each chunk to storage
    for (const chunk of chunks) {
      const chunkData = buffer.slice(chunk.start, chunk.end);
      const chunkPath = `jobs/${job.id}/chunks/chunk_${chunk.index}.mp4`;
      
      const { error: chunkError } = await supabase.storage
        .from('videos')
        .upload(chunkPath, chunkData, {
          contentType: file.type,
          upsert: true
        });

      if (chunkError) {
        console.error(`Failed to upload chunk ${chunk.index}:`, chunkError);
        continue; // Skip failed chunks
      }

      // Get signed URL for the chunk
      const { data: signedUrlData } = await supabase.storage
        .from('videos')
        .createSignedUrl(chunkPath, 3600 * 24); // 24 hour expiry

      // Prepare chunk record for database
      chunkRecords.push({
        chunk_index: chunk.index,
        chunk_name: `chunk_${chunk.index}.mp4`,
        storage_path: chunkPath,
        storage_url: signedUrlData?.signedUrl || '',  // Add the signed URL
        start_time: (chunk.start / buffer.length) * 100,
        end_time: (chunk.end / buffer.length) * 100,
        duration: ((chunk.end - chunk.start) / buffer.length) * 100,
        file_size: chunk.size,
        uploaded: true,
        processed: false
      });
    }

    // Add all chunk records to database at once
    if (chunkRecords.length > 0) {
      try {
        await jobQueue.addVideoChunks(job.id, chunkRecords);
        console.log(`Added ${chunkRecords.length} chunk records for job ${job.id}`);
      } catch (chunkError) {
        // Log error but continue - chunks are optional for small files
        console.error('Failed to add chunk records:', chunkError);
        // For small files, we can continue without chunk records
        if (chunks.length <= 1) {
          console.log('Single chunk file, continuing without chunk records');
        } else {
          // For multi-chunk files, this is a critical error
          throw chunkError;
        }
      }
    }

    // Enqueue for analysis
    await jobQueue.enqueueJob(job.id, 'queue_analysis', {
      chunksStored: chunks.length,
      readyForAnalysis: true,
      videoUrl: publicUrl,
      analysisOptions: processingOptions.analysisOptions || {}
    }, priority);

    // Update job status to queued
    await jobQueue.updateJob(job.id, {
      status: 'queued',
      current_stage: 'queue_analysis',
      progress_percentage: 5
    });

    // Log job creation
    await jobQueue.addLog(
      job.id,
      'info',
      'upload',
      `Job created for video upload: ${file.name}`,
      {
        title,
        fileName: file.name,
        fileSize: file.size,
        priority,
      }
    );

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        title: job.title,
        status: job.status,
        current_stage: job.current_stage,
        progress_percentage: job.progress_percentage,
        created_at: job.created_at,
      },
      message: 'Video uploaded and queued for processing',
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to upload and queue video',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}