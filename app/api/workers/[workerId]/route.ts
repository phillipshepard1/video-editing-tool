/**
 * Individual Worker API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkerManager } from '@/lib/workers/worker-manager';

/**
 * GET /api/workers/[workerId] - Get specific worker details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { workerId: string } }
) {
  try {
    const { workerId } = params;
    const workerManager = getWorkerManager();
    
    const workerDetails = workerManager.getWorkerDetails(workerId);
    if (!workerDetails) {
      return NextResponse.json(
        { success: false, error: 'Worker not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      worker: workerDetails,
    });

  } catch (error) {
    console.error('Error fetching worker details:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch worker details',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workers/[workerId] - Manage specific worker
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { workerId: string } }
) {
  try {
    const { workerId } = params;
    const body = await request.json();
    const { action } = body;

    const workerManager = getWorkerManager();

    switch (action) {
      case 'restart':
        await workerManager.restartWorker(workerId);
        return NextResponse.json({
          success: true,
          message: `Worker ${workerId} restarted`,
        });

      case 'stop':
        await workerManager.removeWorker(workerId);
        return NextResponse.json({
          success: true,
          message: `Worker ${workerId} stopped and removed`,
        });

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error managing worker:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to manage worker',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}