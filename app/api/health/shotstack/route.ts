/**
 * Shotstack API Health Check
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkShotstackHealth } from '@/lib/services/shotstack';

export async function GET(request: NextRequest) {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  const environment = process.env.SHOTSTACK_ENV || 'stage';
  
  const health = {
    service: 'Shotstack API',
    environment,
    timestamp: new Date().toISOString(),
    configured: false,
    healthy: false,
    message: '',
    setupInstructions: null as any
  };

  // Check if API key is configured
  if (!apiKey || apiKey === 'YOUR_SHOTSTACK_API_KEY_HERE') {
    health.message = 'Shotstack API key not configured';
    health.setupInstructions = {
      steps: [
        '1. Sign up at https://dashboard.shotstack.io/register',
        '2. Get your API key from the dashboard',
        '3. Add to .env.local: SHOTSTACK_API_KEY=your_key_here',
        '4. Restart the development server'
      ],
      pricing: {
        free: '20 renders per month',
        starter: '$39/month for 1000 minutes',
        pro: '$99/month for 3000 minutes'
      },
      benefits: [
        'More reliable than Chillin',
        'Professional video editing API',
        'Timeline-based editing',
        'Multiple output formats',
        'CDN delivery'
      ]
    };
    
    return NextResponse.json(health, { status: 503 });
  }

  health.configured = true;

  // Test API connection
  try {
    const result = await checkShotstackHealth(apiKey);
    
    health.healthy = result.healthy;
    health.message = result.message;
    
    if (result.credits !== undefined) {
      health.credits = result.credits;
    }
    
    return NextResponse.json(health, { 
      status: health.healthy ? 200 : 503 
    });
    
  } catch (error) {
    health.healthy = false;
    health.message = error instanceof Error ? error.message : 'Failed to check Shotstack health';
    
    return NextResponse.json(health, { status: 503 });
  }
}