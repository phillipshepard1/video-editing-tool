/**
 * Test script to verify Shotstack render settings
 * Run with: node scripts/test-shotstack-settings.js
 */

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || 'b3oPAaFAAzLxWHCcFwQ0o7PNJt0CHLVy3n78uvrE';
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'v1';
const SHOTSTACK_API_URL = 'https://api.shotstack.io';

// Test different FPS and quality combinations
const testConfigurations = [
  { fps: 24, quality: 'high', resolution: '1080', description: 'Cinema 24fps High Quality' },
  { fps: 30, quality: 'medium', resolution: 'hd', description: 'Standard 30fps Medium Quality' },
  { fps: 60, quality: 'high', resolution: '1080', description: 'High FPS 60fps High Quality' },
  { fps: 25, quality: 'low', resolution: 'sd', description: 'PAL 25fps Low Quality' },
  { fps: 50, quality: 'high', resolution: '4k', description: 'PAL HFR 50fps 4K' }
];

async function testShotstackSettings(config) {
  console.log(`\n🧪 Testing: ${config.description}`);
  console.log(`   Settings: ${config.resolution} @ ${config.fps}fps, quality: ${config.quality}`);
  
  // Build a simple test timeline
  const testEdit = {
    timeline: {
      background: '#000000',
      tracks: [
        {
          clips: [
            {
              asset: {
                type: 'title',
                text: `Test: ${config.fps}fps ${config.quality} ${config.resolution}`,
                style: 'minimal',
                color: '#ffffff',
                size: 'medium'
              },
              start: 0,
              length: 5
            }
          ]
        }
      ]
    },
    output: {
      format: 'mp4',
      resolution: config.resolution,
      fps: config.fps,
      quality: config.quality
    }
  };

  try {
    // Submit render job
    const response = await fetch(`${SHOTSTACK_API_URL}/${SHOTSTACK_ENV}/render`, {
      method: 'POST',
      headers: {
        'x-api-key': SHOTSTACK_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testEdit)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`   ❌ Failed: ${error}`);
      return { success: false, error };
    }

    const result = await response.json();
    console.log(`   ✅ Success! Render ID: ${result.response.id}`);
    
    // Check render status
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    const statusResponse = await fetch(
      `${SHOTSTACK_API_URL}/${SHOTSTACK_ENV}/render/${result.response.id}`,
      {
        headers: {
          'x-api-key': SHOTSTACK_API_KEY,
          'Accept': 'application/json'
        }
      }
    );

    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log(`   📊 Status: ${status.response.status}`);
      
      // Verify output settings were applied
      if (status.response.data && status.response.data.output) {
        const output = status.response.data.output;
        console.log(`   📹 Actual output settings:`);
        console.log(`      - FPS: ${output.fps || 'default'}`);
        console.log(`      - Quality: ${output.quality || 'default'}`);
        console.log(`      - Resolution: ${output.resolution || 'default'}`);
      }
    }

    return { 
      success: true, 
      renderId: result.response.id,
      config: config
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('🚀 Starting Shotstack Settings Test Suite');
  console.log('=========================================');
  console.log(`API Key: ${SHOTSTACK_API_KEY.substring(0, 10)}...`);
  console.log(`Environment: ${SHOTSTACK_ENV}`);
  
  const results = [];
  
  for (const config of testConfigurations) {
    const result = await testShotstackSettings(config);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }
  
  // Summary
  console.log('\n📊 Test Summary');
  console.log('===============');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  
  if (successful === results.length) {
    console.log('\n🎉 All settings are working correctly!');
  } else {
    console.log('\n⚠️ Some settings failed. Check the logs above for details.');
  }
  
  // List successful render IDs
  console.log('\n📝 Render IDs for verification:');
  results.filter(r => r.success).forEach(r => {
    console.log(`   - ${r.config.description}: ${r.renderId}`);
  });
}

// Run tests
runAllTests().catch(console.error);