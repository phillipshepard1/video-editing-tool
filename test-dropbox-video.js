// Test script to render Dropbox video through Chillin API
require('dotenv').config({ path: '.env.local' });

async function testDropboxVideo() {
  const apiKey = process.env.CHILLIN_API_KEY;
  
  if (!apiKey) {
    console.error('Error: CHILLIN_API_KEY not found in .env.local');
    process.exit(1);
  }

  // Convert Dropbox share link to direct download link
  // Original: https://www.dropbox.com/scl/fi/yomxvcp5uzo63ms19tyfw/Smaller.mov?rlkey=dtrqxgsu95s9nf2649kuy9hx7&dl=0
  // Method 1: Change dl=0 to dl=1
  const videoUrl = 'https://www.dropbox.com/scl/fi/yomxvcp5uzo63ms19tyfw/Smaller.mov?rlkey=dtrqxgsu95s9nf2649kuy9hx7&dl=1';
  
  console.log('Testing with Dropbox video (direct link):', videoUrl);
  console.log('This is your actual video file from Dropbox!\n');
  
  // Use the same segments from your earlier render attempt
  // Keeping segments from 22.58s to 64.23s and 71.72s to 75s
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
          id: `dropbox-test-${Date.now()}-0`,
          type: 'Video',
          start: 0,
          duration: 41.65,  // First segment duration
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
          ext: 'mov',
          startInSource: 22.58,  // Start from 22.58 seconds
          volume: 1,
          hasAudio: true
        },
        {
          id: `dropbox-test-${Date.now()}-1`,
          type: 'Video',
          start: 41.65,  // Start after first segment
          duration: 3.28,  // Second segment duration
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
          ext: 'mov',
          startInSource: 71.72,  // Start from 71.72 seconds
          volume: 1,
          hasAudio: true
        }
      ],
      audio: [],
      effect: [],
      transition: [],
      version: 0,
      duration: 44.93  // Total duration
    }
  };

  console.log('Segments to keep:');
  console.log('- Segment 1: 22.58s to 64.23s (41.65s duration)');
  console.log('- Segment 2: 71.72s to 75.00s (3.28s duration)');
  console.log('Total output duration: 44.93 seconds\n');
  
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
        console.log('\n🎉 Dropbox link works! Your video is being processed.');
        
        // Check status after 5 seconds
        if (result.data.render_id) {
          console.log('\nWaiting 5 seconds before checking status...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
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
          
          if (statusResult.data?.render?.state === 'failed') {
            console.log('\n❌ Render failed');
            if (statusResult.data.render.error_message) {
              console.log('Error:', statusResult.data.render.error_message);
            }
          } else if (statusResult.data?.render?.state === 'success') {
            console.log('\n✅ Render completed!');
            if (statusResult.data.render.video_url) {
              console.log('Video URL:', statusResult.data.render.video_url);
            }
          } else {
            console.log('\nRender is still processing. Check again in a few moments.');
            console.log(`Use this command to check status:`);
            console.log(`curl -X POST https://render-api.chillin.online/render/result -H "Authorization: Bearer $CHILLIN_API_KEY" -H "Content-Type: application/json" -d '{"render_id": ${result.data.render_id}}'`);
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

testDropboxVideo();