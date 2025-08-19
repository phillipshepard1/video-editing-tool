/**
 * Job Logs API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';

const jobQueue = getJobQueueService();

/**
 * GET /api/jobs/[jobId]/logs - Get job logs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const level = searchParams.get('level') as 'info' | 'warn' | 'error' | null;

    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    let logs = await jobQueue.getJobLogs(jobId, limit);

    // Filter by level if requested
    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
    });

  } catch (error) {
    console.error('Error fetching job logs:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch job logs',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}