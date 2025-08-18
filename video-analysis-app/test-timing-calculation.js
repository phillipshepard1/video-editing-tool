// Test timing calculation for 12-minute video
// Based on Chillin pricing: $0.10 per minute for 1920x1080 at 60fps and below

// Mock segment data - typical format from Gemini
const mockSegments = [
  { startTime: "00:30:00", endTime: "01:15:00", reason: "Flub/mistake" },  // 00:30 - 01:15 (45 seconds)
  { startTime: "02:45:00", endTime: "03:30:00", reason: "Flub/mistake" },  // 02:45 - 03:30 (45 seconds)
  { startTime: "05:00:00", endTime: "05:45:00", reason: "Flub/mistake" },  // 05:00 - 05:45 (45 seconds)
  { startTime: "08:30:00", endTime: "09:00:00", reason: "Flub/mistake" },  // 08:30 - 09:00 (30 seconds)
  { startTime: "10:15:00", endTime: "11:00:00", reason: "Flub/mistake" },  // 10:15 - 11:00 (45 seconds)
];

// The parseTimeToSeconds function from chillin.ts
function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  
  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return parseInt(minutes) * 60 + parseFloat(seconds);
  } else if (parts.length === 3) {
    // Format: XX:YY:ZZ
    const [first, second, third] = parts;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const thirdNum = parseFloat(third);
    
    // IMPORTANT: Gemini seems to use MM:SS:FF format for videos under 1 hour
    // where FF is frames (0-29 for 30fps video) or centiseconds (0-99)
    
    // If the third number is > 60, it's definitely frames/centiseconds, not seconds
    if (thirdNum > 60) {
      // MM:SS:FF format (frames in third position)
      console.log(`  Detected MM:SS:FF format (third > 60): ${timeStr}`);
      return firstNum * 60 + secondNum + (thirdNum / 100); // Frames as decimal
    }
    
    // If first number is less than 60 and second number is less than 60
    // It's likely MM:SS:FF format (not hours)
    if (firstNum < 60) {
      // Treat as MM:SS:FF where FF is centiseconds or frame number
      // For "01:04:41" = 1 minute, 4 seconds, 41 centiseconds
      console.log(`  Detected MM:SS:FF format (first < 60): ${timeStr}`);
      return firstNum * 60 + secondNum + (thirdNum / 100);
    }
    
    // For longer videos, treat as HH:MM:SS
    console.log(`  Detected HH:MM:SS format: ${timeStr}`);
    return firstNum * 3600 + secondNum * 60 + thirdNum;
  }
  
  // Simple number format
  return parseFloat(timeStr);
}

// Calculate keeper segments (what remains after removing segments)
function calculateKeeperSegments(segmentsToRemove, videoDuration) {
  if (segmentsToRemove.length === 0) {
    return [{ start: 0, end: videoDuration }];
  }

  // Convert to seconds and sort
  const sortedSegments = segmentsToRemove.map(seg => ({
    start: parseTimeToSeconds(seg.startTime),
    end: parseTimeToSeconds(seg.endTime)
  })).sort((a, b) => a.start - b.start);

  const keeperSegments = [];
  let lastEnd = 0;

  for (const segment of sortedSegments) {
    if (segment.start > lastEnd) {
      keeperSegments.push({
        start: lastEnd,
        end: segment.start
      });
    }
    lastEnd = Math.max(lastEnd, segment.end);
  }

  // Add final segment if there's video after the last removed segment
  if (lastEnd < videoDuration) {
    keeperSegments.push({
      start: lastEnd,
      end: videoDuration
    });
  }

  return keeperSegments;
}

console.log('=== Timing Calculation Test for 12-minute Video ===\n');

const videoDurationMinutes = 12;
const videoDurationSeconds = videoDurationMinutes * 60; // 720 seconds

console.log(`Original video duration: ${videoDurationMinutes} minutes (${videoDurationSeconds} seconds)\n`);

console.log('Segments to remove:');
let totalRemovedSeconds = 0;
mockSegments.forEach((seg, i) => {
  const startSec = parseTimeToSeconds(seg.startTime);
  const endSec = parseTimeToSeconds(seg.endTime);
  const duration = endSec - startSec;
  totalRemovedSeconds += duration;
  console.log(`  ${i + 1}. ${seg.startTime} - ${seg.endTime} = ${duration.toFixed(2)} seconds`);
});

console.log(`\nTotal time to remove: ${totalRemovedSeconds.toFixed(2)} seconds (${(totalRemovedSeconds/60).toFixed(2)} minutes)`);

// Calculate keeper segments
const keeperSegments = calculateKeeperSegments(mockSegments, videoDurationSeconds);

console.log('\nKeeper segments (what remains):');
let totalKeptSeconds = 0;
keeperSegments.forEach((seg, i) => {
  const duration = seg.end - seg.start;
  totalKeptSeconds += duration;
  console.log(`  ${i + 1}. ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s = ${duration.toFixed(2)} seconds`);
});

console.log(`\nTotal duration after editing: ${totalKeptSeconds.toFixed(2)} seconds (${(totalKeptSeconds/60).toFixed(2)} minutes)`);

// Calculate cost
const finalDurationMinutes = totalKeptSeconds / 60;
const costPerMinute = 0.10; // $0.10 per minute for 1920x1080
const totalCost = finalDurationMinutes * costPerMinute;

console.log('\n=== Cost Calculation ===');
console.log(`Final video duration: ${finalDurationMinutes.toFixed(2)} minutes`);
console.log(`Cost per minute: $${costPerMinute.toFixed(2)}`);
console.log(`Total render cost: $${totalCost.toFixed(2)}`);

// Check if $9 is enough
const availableBalance = 9.00;
console.log(`\nAvailable balance: $${availableBalance.toFixed(2)}`);
if (totalCost <= availableBalance) {
  console.log(`✅ Sufficient balance! You have enough to render this video.`);
  console.log(`   Remaining after render: $${(availableBalance - totalCost).toFixed(2)}`);
} else {
  console.log(`❌ Insufficient balance! You need $${(totalCost - availableBalance).toFixed(2)} more.`);
}

// Show what maximum duration can be rendered with $9
const maxMinutesWithBalance = availableBalance / costPerMinute;
console.log(`\nWith $${availableBalance.toFixed(2)}, you can render up to ${maxMinutesWithBalance.toFixed(1)} minutes of video.`);