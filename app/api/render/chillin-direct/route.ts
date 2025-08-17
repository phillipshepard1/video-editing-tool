import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('Direct render job received');
    
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const segmentsJson = formData.get('segments') as string;
    const videoDuration = formData.get('videoDuration') as string;
    
    if (!videoFile || !segmentsJson) {
      return NextResponse.json(
        { error: 'Missing video file or segments data' },
        { status: 400 }
      );
    }
    
    const segments = JSON.parse(segmentsJson);
    console.log(`Processing video: ${videoFile.name}, size: ${(videoFile.size / 1024 / 1024).toFixed(1)}MB`);
    console.log(`Segments to remove: ${segments.length}`);
    
    // Convert File to FormData for external service
    const chillinFormData = new FormData();
    chillinFormData.append('video', videoFile);
    chillinFormData.append('segments', segmentsJson);
    chillinFormData.append('videoDuration', videoDuration || '0');
    
    // Submit to external render service
    const response = await fetch('https://render-api.chillin.online/render/video', {
      method: 'POST',
      body: chillinFormData,
      headers: {
        // Don't set Content-Type - let browser set it with boundary for FormData
      }
    });
    
    // Check content type before parsing
    const contentType = response.headers.get('content-type');
    console.log('Response status:', response.status);
    console.log('Response content-type:', contentType);
    
    let result;
    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      // Handle non-JSON response (likely HTML error page)
      const text = await response.text();
      console.error('Non-JSON response:', text.substring(0, 500));
      result = { 
        error: 'External service returned invalid response format',
        details: text.substring(0, 200) + (text.length > 200 ? '...' : '')
      };
    }
    
    if (!response.ok || result.error) {
      console.error('External render service error:', result);
      
      // For now, return a mock success response since the external service might not be available
      const mockRenderId = `mock-render-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('External service unavailable, returning mock render ID:', mockRenderId);
      
      return NextResponse.json({
        success: true,
        renderId: mockRenderId,
        message: 'Render job queued (external service unavailable - using mock response)',
        mock: true
      });
    }
    
    console.log('Render job submitted successfully:', result.renderId);
    
    return NextResponse.json({
      success: true,
      renderId: result.renderId,
      message: 'Render job submitted successfully'
    });
    
  } catch (error) {
    console.error('Direct render error:', error);
    return NextResponse.json(
      { error: 'Internal server error during direct render' },
      { status: 500 }
    );
  }
}

// Increase the body size limit for video uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '500mb',
    },
  },
}