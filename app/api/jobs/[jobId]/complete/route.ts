import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobQueue = getJobQueueService();
    const { jobId } = params;
    
    // Get the current job
    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Mark as completed if it has analysis results
    if (job.result_data?.assemble_timeline) {
      await jobQueue.updateJob(jobId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_percentage: 100
      });
      
      return NextResponse.json({ 
        success: true, 
        message: 'Job marked as completed',
        job: await jobQueue.getJob(jobId)
      });
    }
    
    return NextResponse.json({ 
      error: 'Job does not have analysis results' 
    }, { status: 400 });
    
  } catch (error) {
    console.error('Error completing job:', error);
    return NextResponse.json(
      { error: 'Failed to complete job' },
      { status: 500 }
    );
  }
}