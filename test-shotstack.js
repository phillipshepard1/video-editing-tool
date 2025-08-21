/**
 * Test Shotstack API directly
 */

const SHOTSTACK_API_KEY = 'b3oPAaFAAzLxWHCcFwQ0o7PNJt0CHLVy3n78uvrE';
const SHOTSTACK_ENV = 'v1';

// Test video URL (using a public sample video)
const testVideoUrl = 'https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/footage/road.mp4';

// Create a simple edit with one clip
const edit = {
  timeline: {
    background: '#000000',
    tracks: [
      {
        clips: [
          {
            asset: {
              type: 'video',
              src: testVideoUrl,
              trim: 0,
              volume: 1
            },
            start: 0,
            length: 5,
            fit: 'crop'
          }
        ]
      }
    ]
  },
  output: {
    format: 'mp4',
    resolution: '1080'
  }
};

console.log('Sending test render to Shotstack...');
console.log(JSON.stringify(edit, null, 2));

fetch(`https://api.shotstack.io/${SHOTSTACK_ENV}/render`, {
  method: 'POST',
  headers: {
    'x-api-key': SHOTSTACK_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(edit)
})
.then(response => response.json())
.then(data => {
  console.log('\nResponse from Shotstack:');
  console.log(JSON.stringify(data, null, 2));
  
  if (data.success && data.response?.id) {
    console.log(`\nRender ID: ${data.response.id}`);
    console.log('Render submitted successfully!');
  } else {
    console.log('\nRender failed:', data.message || 'Unknown error');
  }
})
.catch(error => {
  console.error('Error:', error);
});