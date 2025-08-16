const fetch = require('node-fetch');

// Test video URL from Supabase
const testVideoUrl = 'https://leeslkgwtmgfewsbxwyu.supabase.co/storage/v1/object/public/videos/renders/video_1755317871149.mp4';

// Test segments to remove
const testSegments = [
  {
    startTime: '00:10.000',
    endTime: '00:15.000',
    reason: 'Test cut 1',
    confidence: 0.9
  },
  {
    startTime: '00:25.000',
    endTime: '00:30.000',
    reason: 'Test cut 2',
    confidence: 0.85
  }
];

async function testRenderAPI() {
  console.log('Testing Chillin render API...\n');
  
  try {
    // Submit render job
    console.log('Submitting render job to API...');
    const response = await fetch('http://localhost:3000/api/render/chillin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoUrl: testVideoUrl,
        segmentsToRemove: testSegments,
        videoDuration: 60,
        videoWidth: 1920,
        videoHeight: 1080,
        fps: 30
      })
    });
    
    const result = await response.json();
    console.log('Submit response:', result);
    
    if (!result.renderId) {
      console.error('No render ID received');
      return;
    }
    
    console.log('\nRender ID:', result.renderId);
    console.log('Polling for status...\n');
    
    // Poll for status
    let attempts = 0;
    const maxAttempts = 60;
    
    const pollStatus = async () => {
      attempts++;
      
      try {
        const statusResponse = await fetch(`http://localhost:3000/api/render/chillin?renderId=${result.renderId}`);
        const statusResult = await statusResponse.json();
        
        console.log(`Attempt ${attempts}: Status = ${statusResult.status || 'unknown'}`);
        
        if (statusResult.status === 'completed' && statusResult.outputUrl) {
          console.log('\n✅ Render completed!');
          console.log('Output URL:', statusResult.outputUrl);
          return;
        }
        
        if (statusResult.status === 'failed') {
          console.error('\n❌ Render failed:', statusResult.error);
          return;
        }
        
        if (attempts < maxAttempts) {
          setTimeout(pollStatus, 5000);
        } else {
          console.log('\n⏱️ Timeout after', attempts, 'attempts');
        }
      } catch (error) {
        console.error('Status check error:', error.message);
        if (attempts < maxAttempts) {
          setTimeout(pollStatus, 5000);
        }
      }
    };
    
    setTimeout(pollStatus, 3000);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRenderAPI();