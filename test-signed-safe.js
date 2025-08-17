// Test with safer segment parameters
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function testSignedUrlSafe() {
  const apiKey = process.env.CHILLIN_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const filePath = 'uploads/video_1755326846761.mov';
  
  console.log('Generating signed URL for:', filePath);
  
  // Generate signed URL with 2 hour expiration
  const { data, error } = await supabase.storage
    .from('videos')
    .createSignedUrl(filePath, 7200);
  
  if (error) {
    console.error('Failed to generate signed URL:', error);
    process.exit(1);
  }
  
  const signedUrl = data.signedUrl;
  console.log('Generated signed URL successfully');
  
  // Test with VERY conservative parameters
  console.log('\nTesting with safe parameters:');
  console.log('- Starting at 0 seconds');
  console.log('- Duration: 5 seconds');
  console.log('- No jumping in timeline\n');
  
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
          id: `safe-test-${Date.now()}`,
          type: 'Video',
          start: 0,        // Start at beginning of output
          duration: 5,     // Only 5 seconds
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
          externalUrl: signedUrl,
          ext: 'mov',
          startInSource: 0,  // Start from very beginning
          volume: 1,
          hasAudio: true
        }
      ],
      audio: [],
      effect: [],
      transition: [],
      version: 0,
      duration: 5  // Total project duration matches segment
    }
  };

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

    const responseText = await response.text();
    console.log('Response status:', response.status);
    
    const result = JSON.parse(responseText);
    
    if (result.code === 0 && result.data) {
      console.log('\n✅ Render submitted successfully');
      console.log('Render ID:', result.data.render_id);
      console.log('\nMonitor this render to see if it completes without NaN errors.');
      console.log('If this works, the issue is with seeking to position 25 in the video.');
      
      // Check status after 10 seconds
      if (result.data.render_id) {
        console.log('\nWaiting 10 seconds before checking status...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
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
        console.log('\nStatus check:', JSON.stringify(statusResult, null, 2));
        
        if (statusResult.data?.render?.error_message) {
          console.log('\n❌ Still getting error:', statusResult.data.render.error_message);
          console.log('\nThis suggests the MOV file itself has issues.');
          console.log('Consider converting to MP4 before uploading.');
        } else if (statusResult.data?.render?.state === 'success') {
          console.log('\n✅ Success! The issue was with seeking too far in the video.');
        } else {
          console.log('\nCurrent state:', statusResult.data?.render?.state);
        }
      }
    } else {
      console.log('\n❌ Error:', result.msg || 'Unknown error');
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }
}

testSignedUrlSafe();