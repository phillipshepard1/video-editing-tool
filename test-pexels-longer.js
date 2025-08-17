// Test script to render a longer Pexels video through Chillin API
// This tests a more complex edit to confirm everything works
require('dotenv').config({ path: '.env.local' });

async function testPexelsLongerVideo() {
  const apiKey = process.env.CHILLIN_API_KEY;
  
  if (!apiKey) {
    console.error('Error: CHILLIN_API_KEY not found in .env.local');
    process.exit(1);
  }

  // Using a different Pexels video - this one is longer
  const videoUrl = 'https://videos.pexels.com/video-files/3129671/3129671-hd_1920_1080_30fps.mp4';
  
  console.log('Testing with another Pexels video:', videoUrl);
  console.log('This test will create multiple segments like your actual use case\n');
  
  // Create a more complex edit with multiple segments
  const request = {
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
          id: `pexels-test2-${Date.now()}-0`,
          type: 'Video',
          start: 0,           // Start at beginning of output
          duration: 3,        // 3 seconds from beginning
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
          externalUrl: videoUrl,
          ext: 'mp4',
          startInSource: 2,    // Start from 2 seconds in source
          volume: 1,
          hasAudio: true
        },
        {
          id: `pexels-test2-${Date.now()}-1`,
          type: 'Video',
          start: 3,           // After first segment
          duration: 4,        // 4 seconds
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
          externalUrl: videoUrl,
          ext: 'mp4',
          startInSource: 8,    // Skip to 8 seconds in source
          volume: 1,
          hasAudio: true
        },
        {
          id: `pexels-test2-${Date.now()}-2`,
          type: 'Video',
          start: 7,           // After second segment
          duration: 2,        // 2 seconds
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
          externalUrl: videoUrl,
          ext: 'mp4',
          startInSource: 15,   // Jump to 15 seconds in source
          volume: 1,
          hasAudio: true
        }
      ],
      audio: [],
      effect: [],
      transition: [],
      version: 0,
      duration: 9  // Total 9 seconds output
    }
  };

  console.log('Creating a 9-second video with 3 segments:');
  console.log('- Segment 1: Source 2-5s → Output 0-3s');
  console.log('- Segment 2: Source 8-12s → Output 3-7s');
  console.log('- Segment 3: Source 15-17s → Output 7-9s\n');
  
  try {
    console.log('Submitting to Chillin API...');
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
        console.log('\n✨ Pexels videos work perfectly with Chillin!');
        
        // Check status after 8 seconds
        if (result.data.render_id) {
          console.log('\nWaiting 8 seconds before checking status...');
          await new Promise(resolve => setTimeout(resolve, 8000));
          
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
          
          if (statusResult.data?.render?.state === 'success') {
            console.log('\n🎉 Render completed successfully!');
            if (statusResult.data.render.video_url) {
              console.log('Download URL:', statusResult.data.render.video_url);
            }
          } else if (statusResult.data?.render?.state === 'failed') {
            console.log('\n❌ Render failed');
            if (statusResult.data.render.error_message) {
              console.log('Error:', statusResult.data.render.error_message);
            }
          } else {
            console.log(`\nCurrent state: ${statusResult.data?.render?.state || 'unknown'}`);
            console.log('Render is still processing. Check again in a few moments.');
          }
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

testPexelsLongerVideo();