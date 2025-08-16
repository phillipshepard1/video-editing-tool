// Test script to verify signed URLs work with Chillin
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function testSignedUrl() {
  const apiKey = process.env.CHILLIN_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  // The video file path in Supabase storage
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
  console.log('Generated signed URL:', signedUrl.substring(0, 100) + '...');
  console.log('Testing signed URL with curl...');
  
  // Test if the signed URL is accessible
  const { exec } = require('child_process');
  exec(`curl -I "${signedUrl}" 2>/dev/null | head -3`, (error, stdout, stderr) => {
    console.log('Signed URL test response:');
    console.log(stdout);
  });
  
  // Now test with Chillin
  console.log('\nSubmitting to Chillin with signed URL...');
  
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
          id: `signed-test-${Date.now()}`,
          type: 'Video',
          start: 0,
          duration: 10,  // Just test first 10 seconds
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
          startInSource: 25,  // Start from 25 seconds in
          volume: 1,
          hasAudio: true
        }
      ],
      audio: [],
      effect: [],
      transition: [],
      version: 0,
      duration: 10
    }
  };

  try {
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
    console.log('Raw response:', responseText);
    
    const result = JSON.parse(responseText);
    
    if (result.code === 0 && result.data) {
      console.log('\n✅ SUCCESS! Render submitted with signed URL');
      console.log('Render ID:', result.data.render_id);
      console.log('Status:', result.data.status);
      console.log('\n🎉 Signed URLs work! This should solve the 403 issue.');
      
      // Check status after 8 seconds
      if (result.data.render_id) {
        console.log('\nWaiting 8 seconds before checking status...');
        await new Promise(resolve => setTimeout(resolve, 8000));
        
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
        
        if (statusResult.data?.render?.error_message) {
          console.log('\n❌ Error:', statusResult.data.render.error_message);
          console.log('Signed URLs might not be the solution if this shows 403 again.');
        } else if (statusResult.data?.render?.state === 'failed') {
          console.log('\n❌ Render failed (check error_message above)');
        } else {
          console.log('\n✨ No immediate errors! State:', statusResult.data?.render?.state);
          console.log('If state is pending/processing, the signed URL is working!');
        }
      }
    } else {
      console.log('\n❌ Error:', result.msg || 'Unknown error');
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }
}

testSignedUrl();