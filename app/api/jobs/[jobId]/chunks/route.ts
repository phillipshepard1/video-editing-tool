/**
 * Job Chunks API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';
import { getStorageManager } from '@/lib/services/storage-manager';

const jobQueue = getJobQueueService();
const storageManager = getStorageManager();

/**
 * GET /api/jobs/[jobId]/chunks - Get job video chunks
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    const { searchParams } = new URL(request.url);
    const refreshUrls = searchParams.get('refreshUrls') === 'true';

    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    let chunks = await jobQueue.getVideoChunks(jobId);

    // Refresh URLs if requested
    if (refreshUrls && chunks.length > 0) {
      try {
        chunks = await storageManager.refreshChunkUrls(jobId, 24);
      } catch (error) {
        console.warn('Failed to refresh chunk URLs:', error);
        // Continue with existing chunks
      }
    }

    // Get storage usage
    const storageUsage = await storageManager.getJobStorageUsage(jobId);

    return NextResponse.json({
      success: true,
      chunks,
      count: chunks.length,
      storageUsage,
    });

  } catch (error) {
    console.error('Error fetching job chunks:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch job chunks',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs/[jobId]/chunks/refresh - Refresh chunk URLs
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    const body = await request.json();
    const { expirationHours = 24 } = body;

    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    const refreshedChunks = await storageManager.refreshChunkUrls(jobId, expirationHours);

    return NextResponse.json({
      success: true,
      chunks: refreshedChunks,
      message: `Refreshed ${refreshedChunks.length} chunk URLs`,
    });

  } catch (error) {
    console.error('Error refreshing chunk URLs:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to refresh chunk URLs',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}