/**
 * Chillin API Health Check Endpoint
 * Checks if Chillin API is operational and accessible
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiKey = process.env.CHILLIN_API_KEY;
  
  const health = {
    service: 'Chillin API',
    timestamp: new Date().toISOString(),
    checks: {
      apiKeyConfigured: false,
      apiReachable: false,
      authValid: false,
      renderServerStatus: 'unknown'
    },
    errors: [] as string[],
    warnings: [] as string[]
  };

  // Check 1: API Key configured
  if (!apiKey) {
    health.errors.push('CHILLIN_API_KEY not configured in environment variables');
    return NextResponse.json({ 
      healthy: false, 
      ...health 
    }, { status: 503 });
  }
  health.checks.apiKeyConfigured = true;

  // Check 2: API Reachability
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('https://render-api.chillin.online/render/result', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ render_id: 1 }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      health.checks.apiReachable = true;
      
      const data = await response.json();
      
      // Check 3: Authentication validity
      if (data.code === 0) {
        health.checks.authValid = true;
      } else if (data.code === 401 || data.code === 403) {
        health.errors.push('API key is invalid or expired');
      } else if (data.code === 2008) {
        health.warnings.push('Insufficient render credits');
      }
      
      // Check for known server issues
      if (data.msg && data.msg.includes('EOF')) {
        health.checks.renderServerStatus = 'down';
        health.errors.push('Render servers are currently unavailable (EOF error)');
      } else if (data.msg && data.msg.includes('connection')) {
        health.checks.renderServerStatus = 'connection_issues';
        health.errors.push('Render servers have connection issues');
      } else {
        health.checks.renderServerStatus = 'operational';
      }
      
    } else {
      health.errors.push(`API returned status ${response.status}`);
      
      // Try to get error details
      try {
        const errorData = await response.json();
        if (errorData.msg) {
          health.errors.push(errorData.msg);
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
    
  } catch (error) {
    health.checks.apiReachable = false;
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        health.errors.push('API request timeout (5 seconds)');
      } else if (error.message.includes('Failed to fetch')) {
        health.errors.push('Cannot connect to Chillin API');
      } else {
        health.errors.push(error.message);
      }
    } else {
      health.errors.push('Unknown error connecting to API');
    }
  }

  // Determine overall health
  const isHealthy = 
    health.checks.apiKeyConfigured && 
    health.checks.apiReachable && 
    health.checks.authValid &&
    health.checks.renderServerStatus !== 'down';

  // Add recommendations
  const recommendations = [];
  
  if (!health.checks.apiKeyConfigured) {
    recommendations.push('Add CHILLIN_API_KEY to your .env.local file');
  }
  
  if (health.checks.authValid && health.warnings.includes('Insufficient render credits')) {
    recommendations.push('Add render credits at https://chillin.online/render-console');
  }
  
  if (health.checks.renderServerStatus === 'down') {
    recommendations.push('Wait for Chillin to fix their render servers or contact support@chillin.online');
  }
  
  if (!health.checks.apiReachable) {
    recommendations.push('Check your internet connection or Chillin API status');
  }

  return NextResponse.json({
    healthy: isHealthy,
    ...health,
    recommendations
  }, { 
    status: isHealthy ? 200 : 503 
  });
}

/**
 * POST endpoint for testing render submission
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.CHILLIN_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'CHILLIN_API_KEY not configured'
    }, { status: 500 });
  }

  try {
    // Create a minimal test render request
    const testRequest = {
      compositeWidth: 1920,
      compositeHeight: 1080,
      fps: 30,
      projectData: {
        type: 'video',
        width: 1920,
        height: 1080,
        fill: '#000000',
        view: [
          {
            id: 'test-element',
            type: 'Video',
            start: 0,
            duration: 1,
            trackIndex: 0,
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            blendMode: 'normal',
            anchorX: 960,
            anchorY: 540,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            skewX: 0,
            skewY: 0,
            keyframes: [],
            externalUrl: 'https://leeslkgwtmgfewsbxwyu.supabase.co/storage/v1/object/public/videos/test.mp4',
            ext: 'mp4',
            startInSource: 0,
            isFrontTrimmed: false,
            volume: 1,
            hasAudio: true
          }
        ],
        audio: [],
        effect: [],
        transition: [],
        version: 0,
        duration: 1
      }
    };

    const response = await fetch('https://render-api.chillin.online/render/v1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testRequest)
    });

    const result = await response.json();

    return NextResponse.json({
      success: result.code === 0,
      testResult: result,
      message: result.code === 0 
        ? 'Test render submitted successfully' 
        : `Test failed: ${result.msg}`
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}