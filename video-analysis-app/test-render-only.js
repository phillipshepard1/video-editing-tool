// Test just the rendering side with Chillin API
require('dotenv').config({ path: '.env.local' });

const TEST_VIDEO_URL = 'https://leeslkgwtmgfewsbxwyu.supabase.co/storage/v1/object/public/videos/renders/video_1755317871149.mp4';

async function testRender() {
  console.log('🎬 Testing Chillin Render API\n');
  console.log('Video URL:', TEST_VIDEO_URL);
  console.log('API Key:', process.env.CHILLIN_API_KEY ? '✓ Found' : '✗ Missing');
  
  if (!process.env.CHILLIN_API_KEY) {
    console.error('Error: CHILLIN_API_KEY not found in .env.local');
    return;
  }

  // Test segments - remove 10-15 seconds and 25-30 seconds
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
          id: `test-${Date.now()}-1`,
          type: 'Video',
          start: 0,  // Output position
          duration: 10,  // Keep first 10 seconds
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
          externalUrl: TEST_VIDEO_URL,
          ext: 'mp4',
          startInSource: 0,  // Source: 0-10 seconds
          volume: 1,
          hasAudio: true
        },
        {
          id: `test-${Date.now()}-2`,
          type: 'Video',
          start: 10,  // Output position
          duration: 10,  // Keep 10 seconds
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
          externalUrl: TEST_VIDEO_URL,
          ext: 'mp4',
          startInSource: 15,  // Source: Skip to 15-25 seconds
          volume: 1,
          hasAudio: true
        },
        {
          id: `test-${Date.now()}-3`,
          type: 'Video',
          start: 20,  // Output position
          duration: 30,  // Keep rest of video
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
          externalUrl: TEST_VIDEO_URL,
          ext: 'mp4',
          startInSource: 30,  // Source: From 30 seconds onward
          volume: 1,
          hasAudio: true
        }
      ],
      audio: [],
      effect: [],
      transition: [],
      version: 0,
      duration: 50  // Total output duration
    }
  };

  console.log('\n📦 Request structure:');
  console.log('- Video elements:', testRequest.projectData.view.length);
  console.log('- Total output duration:', testRequest.projectData.duration, 'seconds');
  console.log('- Using field: startInSource ✓');
  
  try {
    console.log('\n📤 Submitting render job...');
    
    const response = await fetch('https://render-api.chillin.online/render/v1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CHILLIN_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testRequest)
    });

    const result = await response.json();
    console.log('\n📥 Response:', JSON.stringify(result, null, 2));

    if (result.code === 0 && result.data?.render_id) {
      console.log('\n✅ Render submitted successfully!');
      console.log('Render ID:', result.data.render_id);
      
      // Poll for status
      console.log('\n⏳ Checking status...');
      setTimeout(async () => {
        const statusResponse = await fetch('https://render-api.chillin.online/render/result', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.CHILLIN_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            render_id: result.data.render_id
          })
        });
        
        const statusResult = await statusResponse.json();
        console.log('\nStatus check:', JSON.stringify(statusResult, null, 2));
        
        if (statusResult.code === 0 && statusResult.data?.render) {
          console.log('\nRender state:', statusResult.data.render.state);
          if (statusResult.data.render.video_url) {
            console.log('Output URL:', statusResult.data.render.video_url);
          }
        }
      }, 3000);
      
    } else {
      console.error('\n❌ Render failed:');
      console.error('Code:', result.code);
      console.error('Message:', result.msg);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testRender();