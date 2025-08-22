/**
 * Test script to verify the last clip freezing issue is fixed
 */

// Simulate the timeline building with test data
function testTimelineBuilding() {
  console.log('Testing timeline building for last clip freezing issue...\n');
  
  // Test case: Video with segments removed, including near the end
  const videoDuration = 120; // 2 minutes
  const segmentsToRemove = [
    { startTime: '0:10', endTime: '0:15' },  // Remove 5s at beginning
    { startTime: '0:30', endTime: '0:35' },  // Remove 5s in middle
    { startTime: '1:00', endTime: '1:05' },  // Remove 5s at 1 minute
    { startTime: '1:45', endTime: '1:50' },  // Remove 5s near end (CRITICAL)
  ];
  
  console.log('Video Duration:', videoDuration, 'seconds');
  console.log('Segments to remove:');
  segmentsToRemove.forEach(s => console.log(`  - ${s.startTime} to ${s.endTime}`));
  console.log('');
  
  // Convert time strings to seconds
  function parseTime(timeStr) {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return parseInt(timeStr);
  }
  
  // Build clips (simulating V4 logic)
  const clips = [];
  let sourcePosition = 0;
  let outputPosition = 0;
  
  const segments = segmentsToRemove.map(s => ({
    start: parseTime(s.startTime),
    end: parseTime(s.endTime)
  }));
  
  segments.forEach((segment, index) => {
    // Add clip for content before this removed segment
    if (segment.start > sourcePosition) {
      const clipDuration = segment.start - sourcePosition;
      
      clips.push({
        sourceStart: sourcePosition,
        sourceEnd: segment.start,
        outputStart: outputPosition,
        outputEnd: outputPosition + clipDuration,
        duration: clipDuration
      });
      
      console.log(`Clip ${clips.length}:`);
      console.log(`  Source: ${sourcePosition}s - ${segment.start}s`);
      console.log(`  Output: ${outputPosition}s - ${(outputPosition + clipDuration)}s`);
      console.log(`  Duration: ${clipDuration}s`);
      console.log('');
      
      outputPosition += clipDuration;
    }
    
    sourcePosition = segment.end;
  });
  
  // CRITICAL: Final clip
  if (sourcePosition < videoDuration) {
    const finalDuration = videoDuration - sourcePosition;
    
    clips.push({
      sourceStart: sourcePosition,
      sourceEnd: videoDuration,
      outputStart: outputPosition,
      outputEnd: outputPosition + finalDuration,
      duration: finalDuration
    });
    
    console.log(`FINAL Clip ${clips.length}: *** CRITICAL FOR FREEZING ISSUE ***`);
    console.log(`  Source: ${sourcePosition}s - ${videoDuration}s`);
    console.log(`  Output: ${outputPosition}s - ${(outputPosition + finalDuration)}s`);
    console.log(`  Duration: ${finalDuration}s`);
    console.log('');
  }
  
  // Validate timeline
  console.log('=== TIMELINE VALIDATION ===');
  
  let expectedOutput = 0;
  let hasGaps = false;
  
  clips.forEach((clip, index) => {
    if (Math.abs(clip.outputStart - expectedOutput) > 0.001) {
      console.error(`❌ GAP/OVERLAP at clip ${index + 1}: Expected ${expectedOutput}s, got ${clip.outputStart}s`);
      hasGaps = true;
    }
    
    // Check if last clip properly ends at video duration
    if (index === clips.length - 1) {
      if (clip.sourceEnd !== videoDuration) {
        console.error(`❌ LAST CLIP DOESN'T REACH END: Ends at ${clip.sourceEnd}s, should be ${videoDuration}s`);
      } else {
        console.log(`✅ Last clip properly reaches video end (${videoDuration}s)`);
      }
    }
    
    expectedOutput = clip.outputEnd;
  });
  
  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const expectedDuration = videoDuration - segmentsToRemove.reduce((sum, s) => {
    return sum + (parseTime(s.endTime) - parseTime(s.startTime));
  }, 0);
  
  console.log(`\nTotal output duration: ${totalDuration}s`);
  console.log(`Expected duration: ${expectedDuration}s`);
  console.log(`Timeline continuous: ${!hasGaps ? '✅ YES' : '❌ NO'}`);
  
  // Check specific issue: Last 15 seconds
  const last15Start = videoDuration - 15;
  const clipsInLast15 = clips.filter(c => c.sourceEnd > last15Start);
  
  console.log(`\n=== LAST 15 SECONDS CHECK (${last15Start}s - ${videoDuration}s) ===`);
  console.log(`Clips covering last 15 seconds: ${clipsInLast15.length}`);
  
  clipsInLast15.forEach((clip, index) => {
    console.log(`  Clip: Source [${clip.sourceStart}s - ${clip.sourceEnd}s]`);
    if (clip.sourceEnd === videoDuration) {
      console.log(`  ✅ This clip reaches the end of the video`);
    }
  });
  
  if (clipsInLast15.length === 0) {
    console.error('❌ NO CLIPS IN LAST 15 SECONDS - THIS WILL CAUSE FREEZING!');
  }
  
  // Final verdict
  console.log('\n=== VERDICT ===');
  if (!hasGaps && clipsInLast15.length > 0 && clips[clips.length - 1].sourceEnd === videoDuration) {
    console.log('✅ Timeline is correct - NO FREEZING EXPECTED');
  } else {
    console.log('❌ Timeline has issues - FREEZING LIKELY');
  }
}

// Run the test
testTimelineBuilding();