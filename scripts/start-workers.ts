#!/usr/bin/env node

/**
 * Start Queue Workers
 * Run this script to start background workers for video processing
 * Usage: npm run workers
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), '.env.local') });

// Verify environment variables are loaded
// Check for either SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY
const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) {
  console.error('❌ Missing required environment variables:');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!serviceKey) {
    console.error('   - SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
  }
  console.error('\nPlease ensure .env.local file exists with these variables.');
  process.exit(1);
}

// Set the service key to the expected variable name
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

import { initializeQueueSystem } from '../lib/queue-system-init';

async function main() {
  console.log('========================================');
  console.log('   VIDEO PROCESSING QUEUE SYSTEM');
  console.log('========================================');
  console.log('');
  console.log('✅ Environment variables loaded');
  
  try {
    const { jobQueue, workerManager, health } = await initializeQueueSystem();
    
    console.log('');
    console.log('Workers are running and listening for jobs.');
    console.log('Press Ctrl+C to stop.');
    console.log('');
    
    // Keep the process alive
    await new Promise(() => {});
    
  } catch (error) {
    console.error('Failed to start workers:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(console.error);