/**
 * Mock Jobs API - Returns empty data quickly for testing
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Return empty jobs quickly to stop the spinning
  return NextResponse.json({
    success: true,
    jobs: [], // Empty array stops the spinning
    count: 0,
  });
}