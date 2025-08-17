// Test script to render Pexels video through Chillin API
// This uses their official example video to test if the API key works

require('dotenv').config({ path: '.env.local' });

async function testPexelsVideo() {
  const apiKey = process.env.CHILLIN_API_KEY;
  
  if (!apiKey) {
    console.error('Error: CHILLIN_API_KEY not found in .env.local');
    process.exit(1);
  }

  // Using Chillin's example video from their docs
  const videoUrl = 'https://videos.pexels.com/video-files/1526909/1526909-hd_1280_720_24fps.mp4';
  
  // Simple test: just trim the first 5 seconds from a 10-second video
  const request = {
    compositeWidth: 1280,
    compositeHeight: 720,
    fps: 24,
    projectData: {
      type: 'video',
      width: 1280,
      height: 720,
      fill: '#000000',
      view: [
        {
          id: `test-${Date.now()}`,
          type: 'Video',
          start: 0,           // Start at beginning of output
          duration: 5,        // Play for 5 seconds
          trackIndex: 0,
          x: 0,
          y: 0,
          width: 1280,
          height: 720,
          blendMode: 'normal',
          anchorX: 640,
          anchorY: 360,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          skewX: 0,
          skewY: 0,
          keyframes: [],
          externalUrl: videoUrl,
          ext: 'mp4',
          startInSource: 2,    // Start from 2 seconds in source
          volume: 1,
          hasAudio: true
        }
      ],
      audio: [],
      effect: [],
      transition: [],
      version: 0,
      duration: 5
    }
  };

  console.log('Testing with Pexels video:', videoUrl);
  console.log('Creating a 5-second clip starting from 2 seconds in...\n');
  console.log('Request payload:', JSON.stringify(request, null, 2));
  
  try {
    console.log('\nSubmitting to Chillin API...');
    const response = await fetch('https://render-api.chillin.online/render/v1', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(request)
    });

    console.log('Response status:', response.status);
    
    const responseText = await response.text();
    console.log('Raw response:', responseText);
    
    try {
      const result = JSON.parse(responseText);
      
      if (result.code === 0 && result.data) {
        console.log('\n✅ SUCCESS! Render submitted');
        console.log('Render ID:', result.data.render_id);
        console.log('Status:', result.data.status);
        console.log('\nYour API key is working correctly!');
        console.log('The issue is likely with Supabase video accessibility.');
        
        // Check status after 3 seconds
        if (result.data.render_id) {
          console.log('\nWaiting 3 seconds before checking status...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          console.log('Checking render status...');
          const statusResponse = await fetch('https://render-api.chillin.online/render/result', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              render_id: result.data.render_id
            })
          });
          
          const statusResult = await statusResponse.json();
          console.log('Status check result:', JSON.stringify(statusResult, null, 2));
        }
      } else {
        console.log('\n❌ Error:', result.msg || 'Unknown error');
        console.log('Error code:', result.code);
      }
    } catch (e) {
      console.error('Failed to parse response as JSON:', e.message);
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }
}

testPexelsVideo();