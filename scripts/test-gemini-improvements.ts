#!/usr/bin/env tsx

/**
 * Test script for validating Gemini clustering and silence detection improvements
 */

import { 
  analyzeVideoForClusters, 
  analyzeVideoForSilence, 
  analyzeVideoWithTakes,
  parseTimeToSeconds 
} from '../lib/services/gemini';

// Test timestamp parsing
function testTimestampParsing() {
  console.log('\n=== Testing Timestamp Parsing ===\n');
  
  const testCases = [
    { input: '00:05', expected: 5, description: 'MM:SS format' },
    { input: '01:30', expected: 90, description: 'MM:SS with minutes' },
    { input: '00:05.3', expected: 5.3, description: 'MM:SS.S with decimals' },
    { input: '01:23.7', expected: 83.7, description: 'MM:SS.S' },
    { input: '00:00:05', expected: 5, description: 'HH:MM:SS format' },
    { input: '01:30:45', expected: 5445, description: 'HH:MM:SS full' },
    { input: '00:30:15.5', expected: 1815.5, description: 'HH:MM:SS.S' },
    { input: '5', expected: 5, description: 'Simple number' },
    { input: '83', expected: 83, description: 'Seconds > 60' },
    { input: '00:05:75', expected: 5 + (75/30), description: 'MM:SS:FF (frames)' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(test => {
    const result = parseTimeToSeconds(test.input);
    const isClose = Math.abs(result - test.expected) < 0.1; // Allow small floating point differences
    
    if (isClose) {
      console.log(`✅ ${test.description}: "${test.input}" → ${result}s (expected ${test.expected}s)`);
      passed++;
    } else {
      console.log(`❌ ${test.description}: "${test.input}" → ${result}s (expected ${test.expected}s)`);
      failed++;
    }
  });
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Test with a sample video file URI
async function testWithVideo(fileUri: string) {
  console.log('\n=== Testing Video Analysis ===\n');
  console.log('File URI:', fileUri);
  
  try {
    // Test 1: Cluster detection
    console.log('\n--- Testing Cluster Detection ---');
    const startClusters = Date.now();
    const clusterResult = await analyzeVideoForClusters(fileUri);
    const clusterTime = (Date.now() - startClusters) / 1000;
    
    console.log(`✅ Cluster detection completed in ${clusterTime.toFixed(2)}s`);
    console.log(`   Found ${clusterResult.contentGroups.length} clusters`);
    
    if (clusterResult.contentGroups.length > 0) {
      const firstCluster = clusterResult.contentGroups[0];
      console.log(`   First cluster: "${firstCluster.name}"`);
      console.log(`   Takes: ${firstCluster.takes.length}`);
      firstCluster.takes.forEach((take, idx) => {
        console.log(`     Take ${idx + 1}: ${take.startTime}-${take.endTime} (quality: ${take.qualityScore}/10)`);
        console.log(`       Transcript: "${take.transcript?.substring(0, 50)}..."`);
      });
    }
    
    // Test 2: Silence detection
    console.log('\n--- Testing Silence Detection ---');
    const startSilence = Date.now();
    const silenceResult = await analyzeVideoForSilence(fileUri);
    const silenceTime = (Date.now() - startSilence) / 1000;
    
    console.log(`✅ Silence detection completed in ${silenceTime.toFixed(2)}s`);
    console.log(`   Found ${silenceResult.segments.length} silence segments`);
    
    if (silenceResult.segments.length > 0) {
      console.log('   First 5 silence segments:');
      silenceResult.segments.slice(0, 5).forEach((seg, idx) => {
        console.log(`     ${idx + 1}. ${seg.startTime} - ${seg.endTime} (${seg.duration}s)`);
        if (seg.startTimeSeconds && seg.endTimeSeconds) {
          const calculatedDuration = seg.endTimeSeconds - seg.startTimeSeconds;
          const durationMatch = Math.abs(calculatedDuration - seg.duration) < 0.5;
          console.log(`        Timestamp accuracy: ${durationMatch ? '✅' : '❌'} (calculated: ${calculatedDuration.toFixed(1)}s)`);
        }
      });
    }
    
    // Test 3: Combined analysis
    console.log('\n--- Testing Combined Analysis ---');
    const startCombined = Date.now();
    const combinedResult = await analyzeVideoWithTakes(fileUri, 'Test analysis', undefined);
    const combinedTime = (Date.now() - startCombined) / 1000;
    
    console.log(`✅ Combined analysis completed in ${combinedTime.toFixed(2)}s`);
    console.log(`   Content groups: ${combinedResult.contentGroups.length}`);
    console.log(`   Silence segments: ${combinedResult.segments.length}`);
    console.log(`   Total processing time: ${combinedTime.toFixed(2)}s (vs ${(clusterTime + silenceTime).toFixed(2)}s sequential)`);
    
    // Check if parallel processing saved time
    const timeSaved = (clusterTime + silenceTime) - combinedTime;
    if (timeSaved > 0) {
      console.log(`   ⚡ Time saved with parallel processing: ${timeSaved.toFixed(2)}s`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error during video analysis:', error);
    return false;
  }
}

// Main test runner
async function main() {
  console.log('=== Gemini Service Improvement Tests ===');
  console.log('Testing clustering and silence detection improvements...\n');
  
  // Test timestamp parsing
  const parseTestPassed = testTimestampParsing();
  
  // Check if we have a test video URI from command line
  const testVideoUri = process.argv[2];
  
  if (testVideoUri) {
    // Test with actual video
    const videoTestPassed = await testWithVideo(testVideoUri);
    
    console.log('\n=== Test Summary ===');
    console.log(`Timestamp parsing: ${parseTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Video analysis: ${videoTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
  } else {
    console.log('\n=== Test Summary ===');
    console.log(`Timestamp parsing: ${parseTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('\nTo test video analysis, run:');
    console.log('  tsx scripts/test-gemini-improvements.ts <gemini-file-uri>');
    console.log('\nExample:');
    console.log('  tsx scripts/test-gemini-improvements.ts "https://generativelanguage.googleapis.com/v1beta/files/..."');
  }
}

// Run tests
main().catch(console.error);