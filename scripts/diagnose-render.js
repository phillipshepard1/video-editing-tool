/**
 * Diagnostic tool for Shotstack render issues
 * Helps identify freezing, FPS mismatches, and timeline gaps
 */

const RENDER_ID = process.argv[2];
const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || 'b3oPAaFAAzLxWHCcFwQ0o7PNJt0CHLVy3n78uvrE';
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'v1';

if (!RENDER_ID) {
  console.log('Usage: node scripts/diagnose-render.js <render-id>');
  console.log('Example: node scripts/diagnose-render.js 15508423-aa14-4188-92da-4363afc498a5');
  process.exit(1);
}

async function diagnoseRender() {
  console.log('🔍 Diagnosing Shotstack Render:', RENDER_ID);
  console.log('=========================================\n');

  try {
    // Fetch render details
    const response = await fetch(
      `https://api.shotstack.io/${SHOTSTACK_ENV}/render/${RENDER_ID}`,
      {
        headers: {
          'x-api-key': SHOTSTACK_API_KEY,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch render: ${response.status}`);
    }

    const data = await response.json();
    const render = data.response;

    // Basic Info
    console.log('📊 RENDER STATUS');
    console.log('----------------');
    console.log('Status:', render.status);
    console.log('Created:', new Date(render.created).toLocaleString());
    console.log('Render Time:', render.render_time ? `${render.render_time}s` : 'N/A');
    console.log('Output URL:', render.url || 'Not available');
    console.log('');

    // Check the edit data
    if (render.data) {
      const edit = render.data;
      
      // Output Settings
      console.log('⚙️  OUTPUT SETTINGS');
      console.log('------------------');
      console.log('Format:', edit.output.format);
      console.log('Resolution:', edit.output.resolution);
      console.log('FPS:', edit.output.fps || 'Default (25fps)');  // Shotstack defaults to 25fps!
      console.log('Quality:', edit.output.quality || 'Default');
      console.log('');

      // Timeline Analysis
      if (edit.timeline && edit.timeline.tracks) {
        console.log('🎬 TIMELINE ANALYSIS');
        console.log('--------------------');
        
        const clips = edit.timeline.tracks[0]?.clips || [];
        console.log('Total Clips:', clips.length);
        
        if (clips.length > 0) {
          // Check for gaps
          let expectedStart = 0;
          let gaps = [];
          let overlaps = [];
          
          clips.forEach((clip, index) => {
            const gap = clip.start - expectedStart;
            
            if (Math.abs(gap) > 0.001) {  // More than 1ms difference
              if (gap > 0) {
                gaps.push({
                  after: index,
                  gapSize: gap,
                  at: expectedStart,
                  nextStart: clip.start
                });
              } else {
                overlaps.push({
                  at: index,
                  overlapSize: Math.abs(gap),
                  expectedStart,
                  actualStart: clip.start
                });
              }
            }
            
            expectedStart = clip.start + clip.length;
            
            // Check for the 1:06 mark (66 seconds)
            if (clip.start <= 66 && (clip.start + clip.length) >= 66) {
              console.log(`\n⚠️  CLIP AT 1:06 (66s):`);
              console.log(`   Clip #${index + 1}`);
              console.log(`   Start: ${clip.start}s`);
              console.log(`   End: ${clip.start + clip.length}s`);
              console.log(`   Length: ${clip.length}s`);
              console.log(`   Trim: ${clip.asset.trim}s`);
              console.log(`   This clip contains the 1:06 freeze point!\n`);
            }
          });
          
          // Report gaps
          if (gaps.length > 0) {
            console.log('\n❌ TIMELINE GAPS DETECTED:');
            gaps.forEach(gap => {
              console.log(`   Gap after clip ${gap.after}: ${gap.gapSize.toFixed(3)}s at ${gap.at.toFixed(3)}s`);
              if (gap.at >= 65 && gap.at <= 67) {
                console.log(`   ⚠️  THIS GAP IS AT THE 1:06 FREEZE POINT!`);
              }
            });
          }
          
          // Report overlaps
          if (overlaps.length > 0) {
            console.log('\n⚠️  TIMELINE OVERLAPS DETECTED:');
            overlaps.forEach(overlap => {
              console.log(`   Overlap at clip ${overlap.at}: ${overlap.overlapSize.toFixed(3)}s`);
            });
          }
          
          // FPS Analysis
          console.log('\n🎥 FPS ANALYSIS');
          console.log('----------------');
          const outputFPS = edit.output.fps || 25;  // Shotstack defaults to 25!
          
          if (outputFPS === 25) {
            console.log('⚠️  WARNING: Output is 25 FPS (PAL standard)');
            console.log('   This will cause issues with 30/60 FPS source videos!');
            console.log('   RECOMMENDATION: Set fps to match your source (30 or 60)');
          } else if (outputFPS === 30 && clips.length > 0) {
            console.log('✅ Output is 30 FPS (good for 30/60 FPS sources)');
          } else if (outputFPS === 60) {
            console.log('✅ Output is 60 FPS (perfect for 60 FPS sources)');
          }
          
          // Timeline Duration
          const totalDuration = clips.reduce((sum, clip) => sum + clip.length, 0);
          const lastClipEnd = clips[clips.length - 1].start + clips[clips.length - 1].length;
          console.log('\nTotal Clips Duration:', totalDuration.toFixed(3), 'seconds');
          console.log('Timeline End:', lastClipEnd.toFixed(3), 'seconds');
          
          // Check specific timestamp
          console.log('\n🔍 CHECKING 1:06 (66 seconds):');
          const clipsAt66 = clips.filter(c => c.start <= 66 && (c.start + c.length) >= 66);
          if (clipsAt66.length === 0) {
            console.log('❌ NO CLIP at 1:06 - This would cause a freeze!');
          } else {
            console.log(`✅ ${clipsAt66.length} clip(s) cover 1:06`);
          }
        }
      }
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS');
    console.log('------------------');
    console.log('1. Always match output FPS to source FPS');
    console.log('2. For 60 FPS source → use 60 FPS output');
    console.log('3. For 30 FPS source → use 30 FPS output');
    console.log('4. Never use 25 FPS for NTSC (US) videos');
    console.log('5. Check for timeline gaps around freeze points');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

diagnoseRender();