/**
 * Workers Management API
 * Controls the background worker system
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkerManager } from '@/lib/workers/worker-manager';

export const dynamic = 'force-dynamic';

// Global worker manager instance
let globalWorkerManager: any = null;

/**
 * GET /api/workers - Get worker status
 */
export async function GET(request: NextRequest) {
  try {
    if (!globalWorkerManager) {
      return NextResponse.json({
        success: false,
        error: 'Worker system not started',
        running: false,
        workers: []
      });
    }

    const health = globalWorkerManager.getSystemHealth();
    const workers = globalWorkerManager.getWorkerStatuses();

    return NextResponse.json({
      success: true,
      running: true,
      health,
      workers,
      message: `${health.runningWorkers}/${health.totalWorkers} workers running`
    });

  } catch (error) {
    console.error('Error getting worker status:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get worker status',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * POST /api/workers - Start/Stop workers or add/remove individual workers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, stage, workerId } = body;

    switch (action) {
      case 'start':
        if (globalWorkerManager) {
          return NextResponse.json({
            success: false,
            error: 'Worker system already running'
          }, { status: 400 });
        }

        // Initialize and start worker system
        globalWorkerManager = getWorkerManager({
          autoStart: true,
          workers: {
            upload: 2,
            split_chunks: 1,
            store_chunks: 3,
            queue_analysis: 1,
            gemini_processing: 2,
            assemble_timeline: 1,
            render_video: 1,
          }
        });

        await globalWorkerManager.start();

        const health = globalWorkerManager.getSystemHealth();
        
        return NextResponse.json({
          success: true,
          action: 'started',
          health,
          message: `Worker system started with ${health.totalWorkers} workers`
        });

      case 'stop':
        if (!globalWorkerManager) {
          return NextResponse.json({
            success: false,
            error: 'Worker system not running'
          }, { status: 400 });
        }

        await globalWorkerManager.stop();
        globalWorkerManager = null;

        return NextResponse.json({
          success: true,
          action: 'stopped',
          message: 'Worker system stopped'
        });

      case 'restart':
        if (globalWorkerManager) {
          await globalWorkerManager.stop();
        }

        globalWorkerManager = getWorkerManager({
          autoStart: true,
          workers: {
            upload: 2,
            split_chunks: 1,
            store_chunks: 3,
            queue_analysis: 1,
            gemini_processing: 2,
            assemble_timeline: 1,
            render_video: 1,
          }
        });

        await globalWorkerManager.start();

        const restartHealth = globalWorkerManager.getSystemHealth();
        
        return NextResponse.json({
          success: true,
          action: 'restarted',
          health: restartHealth,
          message: `Worker system restarted with ${restartHealth.totalWorkers} workers`
        });

      case 'add_worker':
        if (!globalWorkerManager) {
          return NextResponse.json({
            success: false,
            error: 'Worker system not running'
          }, { status: 400 });
        }

        if (!stage) {
          return NextResponse.json({
            success: false,
            error: 'Stage required for adding worker'
          }, { status: 400 });
        }

        const newWorkerId = await globalWorkerManager.addWorker(stage);
        
        return NextResponse.json({
          success: true,
          action: 'worker_added',
          workerId: newWorkerId,
          stage,
          message: `Added worker ${newWorkerId} for stage ${stage}`
        });

      case 'remove_worker':
        if (!globalWorkerManager) {
          return NextResponse.json({
            success: false,
            error: 'Worker system not running'
          }, { status: 400 });
        }

        if (!workerId) {
          return NextResponse.json({
            success: false,
            error: 'Worker ID required for removing worker'
          }, { status: 400 });
        }

        await globalWorkerManager.removeWorker(workerId);
        
        return NextResponse.json({
          success: true,
          action: 'worker_removed',
          workerId,
          message: `Removed worker ${workerId}`
        });

      case 'restart_worker':
        if (!globalWorkerManager) {
          return NextResponse.json({
            success: false,
            error: 'Worker system not running'
          }, { status: 400 });
        }

        if (!workerId) {
          return NextResponse.json({
            success: false,
            error: 'Worker ID required for restarting worker'
          }, { status: 400 });
        }

        await globalWorkerManager.restartWorker(workerId);
        
        return NextResponse.json({
          success: true,
          action: 'worker_restarted',
          workerId,
          message: `Restarted worker ${workerId}`
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: start, stop, restart, add_worker, remove_worker, restart_worker'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error managing workers:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to manage workers',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * DELETE /api/workers - Emergency stop all workers
 */
export async function DELETE(request: NextRequest) {
  try {
    if (globalWorkerManager) {
      await globalWorkerManager.stop();
      globalWorkerManager = null;
    }

    return NextResponse.json({
      success: true,
      action: 'emergency_stop',
      message: 'All workers stopped'
    });

  } catch (error) {
    console.error('Error stopping workers:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to stop workers',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}