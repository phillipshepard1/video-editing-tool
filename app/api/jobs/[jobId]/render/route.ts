import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobQueue = getJobQueueService();
    const { jobId } = params;
    
    // Get render options from request body
    const body = await request.json();
    const { segments, quality = 'high' } = body;
    
    // Get the current job
    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Check if job has completed analysis
    if (!job.result_data?.assemble_timeline) {
      return NextResponse.json({ 
        error: 'Job must complete analysis before rendering' 
      }, { status: 400 });
    }
    
    // Queue the render job with user's selected segments
    await jobQueue.enqueueJob(jobId, 'render_video', {
      timeline: job.result_data.assemble_timeline.timeline,
      segmentsToRemove: segments || job.result_data.assemble_timeline.timeline.segmentsToRemove,
      quality,
      userInitiated: true // Mark as user-initiated render
    });
    
    // Update job status
    await jobQueue.updateJob(jobId, {
      status: 'processing',
      current_stage: 'render_video',
      progress_percentage: 0
    });
    
    return NextResponse.json({ 
      success: true, 
      message: 'Render job queued',
      jobId 
    });
    
  } catch (error) {
    console.error('Error starting render:', error);
    return NextResponse.json(
      { error: 'Failed to start render' },
      { status: 500 }
    );
  }
}