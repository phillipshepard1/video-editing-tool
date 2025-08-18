#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function testCompression() {
  const videoPath = path.join(__dirname, 'test-video.mp4');
  
  if (!fs.existsSync(videoPath)) {
    console.error('Test video not found:', videoPath);
    process.exit(1);
  }
  
  const stats = fs.statSync(videoPath);
  const fileSizeMB = stats.size / (1024 * 1024);
  console.log(`Testing with video: ${path.basename(videoPath)}`);
  console.log(`Original size: ${fileSizeMB.toFixed(2)} MB`);
  
  // Create form data
  const formData = new FormData();
  const fileBlob = new Blob([fs.readFileSync(videoPath)], { type: 'video/mp4' });
  formData.append('file', fileBlob, 'test-video.mp4');
  
  try {
    console.log('\nSending compression request...');
    const response = await fetch('http://localhost:3000/api/analysis/compress', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Compression failed:', response.status, error);
      return;
    }
    
    const compressedBlob = await response.blob();
    const compressedSize = compressedBlob.size / (1024 * 1024);
    const compressionRatio = response.headers.get('X-Compression-Ratio');
    
    console.log(`\nCompression successful!`);
    console.log(`Compressed size: ${compressedSize.toFixed(2)} MB`);
    console.log(`Compression ratio: ${compressionRatio}%`);
    
    // Save compressed file for verification
    const buffer = Buffer.from(await compressedBlob.arrayBuffer());
    const outputPath = path.join(__dirname, 'test-video-compressed.mp4');
    fs.writeFileSync(outputPath, buffer);
    console.log(`Compressed video saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error during compression test:', error);
  }
}

// Check if running in Node.js environment
if (typeof window === 'undefined') {
  // Use node-fetch for Node.js
  const fetch = require('node-fetch');
  const { FormData, Blob } = require('formdata-polyfill/esm.min.js');
  global.FormData = FormData;
  global.Blob = Blob;
  global.fetch = fetch;
}

testCompression();