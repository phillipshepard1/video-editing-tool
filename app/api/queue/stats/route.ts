/**
 * Queue Statistics API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobQueueService } from '@/lib/services/job-queue';
import { getWorkerManager } from '@/lib/workers/worker-manager';

const jobQueue = getJobQueueService();

/**
 * GET /api/queue/stats - Get queue and system statistics
 */
export async function GET(request: NextRequest) {
  try {
    const [queueStats, systemHealth] = await Promise.all([
      jobQueue.getQueueStats(),
      getSystemHealth(),
    ]);

    return NextResponse.json({
      success: true,
      queue: queueStats,
      system: systemHealth,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error fetching queue stats:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch queue statistics',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

async function getSystemHealth() {
  try {
    const workerManager = getWorkerManager();
    return workerManager.getSystemHealth();
  } catch (error) {
    console.warn('Worker manager not available:', error);
    return {
      totalWorkers: 0,
      runningWorkers: 0,
      healthyWorkers: 0,
      workersByStage: {},
      systemUptime: 0,
      lastHealthCheck: new Date(),
      available: false,
    };
  }
}