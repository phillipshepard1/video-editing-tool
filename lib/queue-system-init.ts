/**
 * Queue System Initialization
 * Starts the worker manager and background processing system
 */

import { getWorkerManager } from './workers/worker-manager';

let isInitialized = false;
let workerManager: any = null;

export async function initializeQueueSystem() {
  if (isInitialized) {
    console.log('Queue system already initialized');
    return workerManager;
  }

  try {
    console.log('🚀 Initializing video processing queue system...');

    // Initialize worker manager with production settings
    workerManager = getWorkerManager({
      workers: {
        upload: 3,           // 3 upload workers for concurrent file processing
        split_chunks: 2,     // 2 workers for video splitting (when implemented)
        store_chunks: 4,     // 4 storage workers for high throughput
        queue_analysis: 2,   // 2 simple queue workers
        gemini_processing: 3, // 3 AI workers (limited by API quotas)
        assemble_timeline: 2, // 2 timeline workers (when implemented)
        render_video: 1,     // 1 render worker (when implemented)
      },
      autoStart: true, // Start workers immediately
    });

    // Start the worker manager
    await workerManager.start();

    isInitialized = true;
    console.log('✅ Queue system initialized successfully');
    
    // Log system health
    const health = workerManager.getSystemHealth();
    console.log(`📊 System Status: ${health.runningWorkers}/${health.totalWorkers} workers running`);
    
    // Set up graceful shutdown
    setupGracefulShutdown();

    return workerManager;
    
  } catch (error) {
    console.error('❌ Failed to initialize queue system:', error);
    throw error;
  }
}

export function getQueueSystemStatus() {
  if (!workerManager) {
    return {
      initialized: false,
      healthy: false,
      workers: 0,
      message: 'Queue system not initialized'
    };
  }

  const health = workerManager.getSystemHealth();
  return {
    initialized: isInitialized,
    healthy: workerManager.isHealthy(),
    workers: health.runningWorkers,
    totalWorkers: health.totalWorkers,
    uptime: health.systemUptime,
    message: `${health.runningWorkers}/${health.totalWorkers} workers running`
  };
}

export async function shutdownQueueSystem() {
  if (!workerManager || !isInitialized) {
    console.log('Queue system not running');
    return;
  }

  try {
    console.log('🛑 Shutting down queue system...');
    await workerManager.stop();
    isInitialized = false;
    workerManager = null;
    console.log('✅ Queue system shutdown complete');
  } catch (error) {
    console.error('❌ Error shutting down queue system:', error);
  }
}

function setupGracefulShutdown() {
  // Handle various shutdown signals
  const shutdownEvents = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  shutdownEvents.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`\n📋 Received ${signal}, starting graceful shutdown...`);
      await shutdownQueueSystem();
      process.exit(0);
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('💥 Uncaught Exception:', error);
    await shutdownQueueSystem();
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    await shutdownQueueSystem();
    process.exit(1);
  });
}

// Don't auto-initialize - let the scripts/start-workers.ts handle initialization
// This prevents premature initialization before environment variables are loaded

export default {
  initialize: initializeQueueSystem,
  getStatus: getQueueSystemStatus,
  shutdown: shutdownQueueSystem,
};