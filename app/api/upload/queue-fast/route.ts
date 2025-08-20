/**
 * Fast Queue-based Video Upload API
 * Processes entire video at once like frontend version
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
    const userId = formData.get('userId') as string | null;
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
          processWholeVideo: true, // NEW: Process entire video at once
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

    // Upload the ENTIRE video to Supabase storage
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

    // NO CHUNKING! Just store one "chunk" record for the whole video
    // This is for compatibility with existing code
    const chunkRecords = [{
      chunk_index: 0,
      chunk_name: `whole_video.mp4`,
      storage_path: videoPath,
      storage_url: publicUrl,
      start_time: 0,
      end_time: 100,
      duration: 100,
      file_size: file.size,
      uploaded: true,
      processed: false
    }];

    // Add the single chunk record
    try {
      await jobQueue.addVideoChunks(job.id, chunkRecords);
      console.log(`Added whole video as single chunk for job ${job.id}`);
    } catch (chunkError) {
      console.error('Failed to add chunk record:', chunkError);
      // Continue anyway - it's just for compatibility
    }

    // Enqueue for FAST analysis (whole video at once)
    await jobQueue.enqueueJob(job.id, 'queue_analysis', {
      chunksStored: 1, // Just one "chunk" - the whole video
      readyForAnalysis: true,
      videoUrl: publicUrl,
      processWholeVideo: true, // Flag to process whole video
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
      `Job created for FAST video upload (whole video): ${file.name}`,
      {
        title,
        fileName: file.name,
        fileSize: file.size,
        priority,
        processWholeVideo: true
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
      message: 'Video uploaded for FAST processing (entire video at once)',
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