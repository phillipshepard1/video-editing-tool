const { buildChillinRequest, submitRenderJob, getRenderStatus } = require('./lib/services/chillin');

// Test video URL from Supabase
const testVideoUrl = 'https://leeslkgwtmgfewsbxwyu.supabase.co/storage/v1/object/public/videos/renders/video_1755317871149.mp4';

// Test segments to remove (simulating cuts)
const testSegments = [
  {
    startTime: '00:10.000',
    endTime: '00:15.000',
    reason: 'Test cut 1'
  },
  {
    startTime: '00:25.000',
    endTime: '00:30.000',
    reason: 'Test cut 2'
  }
];

async function testRender() {
  console.log('Starting Chillin render test...\n');
  
  const apiKey = process.env.CHILLIN_API_KEY;
  if (!apiKey) {
    console.error('Error: CHILLIN_API_KEY not found in environment variables');
    process.exit(1);
  }
  
  try {
    // Build the request
    console.log('Building Chillin request...');
    const request = buildChillinRequest(
      testVideoUrl,
      testSegments,
      60, // 60 second video duration
      1920,
      1080,
      30
    );
    
    console.log('\nRequest structure:');
    console.log('- Composite dimensions:', request.compositeWidth, 'x', request.compositeHeight);
    console.log('- FPS:', request.fps);
    console.log('- View elements:', request.projectData.view.length);
    console.log('- Total duration:', request.projectData.duration, 'seconds');
    
    // Submit the render job
    console.log('\nSubmitting render job...');
    const renderResult = await submitRenderJob(request, apiKey);
    console.log('Render submitted:', renderResult);
    
    if (!renderResult.renderId) {
      console.error('No render ID received');
      return;
    }
    
    console.log('\nRender ID:', renderResult.renderId);
    console.log('Initial status:', renderResult.status);
    
    // Poll for status
    console.log('\nPolling for render status...');
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes
    
    const pollStatus = async () => {
      attempts++;
      console.log(`\nStatus check ${attempts}/${maxAttempts}...`);
      
      try {
        const status = await getRenderStatus(renderResult.renderId, apiKey);
        console.log('Status:', status.status);
        
        if (status.status === 'completed' && status.outputUrl) {
          console.log('\n✅ Render completed successfully!');
          console.log('Output URL:', status.outputUrl);
          return;
        }
        
        if (status.status === 'failed') {
          console.error('\n❌ Render failed:', status.error);
          return;
        }
        
        if (attempts < maxAttempts) {
          setTimeout(pollStatus, 5000); // Check every 5 seconds
        } else {
          console.log('\n⏱️ Timeout: Render is taking longer than expected');
          console.log('Render ID:', renderResult.renderId);
        }
      } catch (error) {
        console.error('Status check error:', error.message);
        if (attempts < maxAttempts) {
          setTimeout(pollStatus, 5000);
        }
      }
    };
    
    setTimeout(pollStatus, 3000); // Start polling after 3 seconds
    
  } catch (error) {
    console.error('\nError during test:', error);
  }
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Run the test
testRender();