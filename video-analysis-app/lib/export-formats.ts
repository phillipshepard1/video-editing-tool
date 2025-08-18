/**
 * Export functionality for Final Cut Pro XML and EDL formats
 */

import { EnhancedSegment } from './types/segments';

interface TimeCode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
}

/**
 * Convert seconds to timecode format
 */
function secondsToTimecode(seconds: number, fps: number = 30): TimeCode {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * fps);
  
  return { hours, minutes, seconds: secs, frames };
}

/**
 * Format timecode for display
 */
function formatTimecode(tc: TimeCode): string {
  return `${tc.hours.toString().padStart(2, '0')}:${tc.minutes.toString().padStart(2, '0')}:${tc.seconds.toString().padStart(2, '0')}:${tc.frames.toString().padStart(2, '0')}`;
}

/**
 * Parse time string like "1:30" or "0:05" to seconds
 */
function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Generate Final Cut Pro X XML (FCPXML)
 */
export function generateFCPXML(
  segments: EnhancedSegment[],
  videoDuration: number,
  videoFileName: string,
  videoPath?: string,
  fps: number = 30
): string {
  const frameDuration = `1/${fps}s`;
  const durationInFrames = Math.floor(videoDuration * fps);
  
  // Sort segments by start time
  const sortedSegments = [...segments].sort((a, b) => 
    parseTimeToSeconds(a.startTime) - parseTimeToSeconds(b.startTime)
  );
  
  // Calculate kept segments (inverse of removed segments)
  const keptSegments: Array<{ start: number; end: number }> = [];
  let currentPosition = 0;
  
  for (const segment of sortedSegments) {
    const segmentStart = parseTimeToSeconds(segment.startTime);
    const segmentEnd = parseTimeToSeconds(segment.endTime);
    
    // Add kept segment before this removed segment
    if (currentPosition < segmentStart) {
      keptSegments.push({ start: currentPosition, end: segmentStart });
    }
    
    currentPosition = Math.max(currentPosition, segmentEnd);
  }
  
  // Add final kept segment if video continues after last cut
  if (currentPosition < videoDuration) {
    keptSegments.push({ start: currentPosition, end: videoDuration });
  }
  
  // Build asset-clips for kept segments
  let clips = '';
  let timelineOffset = 0;
  
  for (const kept of keptSegments) {
    const duration = kept.end - kept.start;
    clips += `
            <asset-clip ref="video1" offset="${timelineOffset}s" duration="${duration}s" start="${kept.start}s" tcFormat="NDF"/>`;
    timelineOffset += duration;
  }
  
  const totalDuration = timelineOffset;
  
  const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="HD 1080p 30" frameDuration="${frameDuration}" width="1920" height="1080" colorSpace="1-1-1 (Rec. 709)"/>
    <asset id="video1" name="${videoFileName}" start="0s" duration="${videoDuration}s" format="r1" hasVideo="1" hasAudio="1">
      <media-rep kind="original-media" src="${videoPath || 'file://' + videoFileName}"/>
    </asset>
  </resources>
  <library>
    <event name="AI Edited Video">
      <project name="${videoFileName.replace(/\.[^/.]+$/, '')} - Edited" modDate="2025-01-12 12:00:00 -0800">
        <sequence format="r1" duration="${totalDuration}s" tcStart="0s" tcFormat="NDF">
          <spine>${clips}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;

  return fcpxml;
}

/**
 * Generate EDL (Edit Decision List) format
 */
export function generateEDL(
  segments: EnhancedSegment[],
  videoDuration: number,
  videoFileName: string,
  fps: number = 30
): string {
  // Sort segments by start time
  const sortedSegments = [...segments].sort((a, b) => 
    parseTimeToSeconds(a.startTime) - parseTimeToSeconds(b.startTime)
  );
  
  // Calculate kept segments
  const keptSegments: Array<{ start: number; end: number }> = [];
  let currentPosition = 0;
  
  for (const segment of sortedSegments) {
    const segmentStart = parseTimeToSeconds(segment.startTime);
    const segmentEnd = parseTimeToSeconds(segment.endTime);
    
    if (currentPosition < segmentStart) {
      keptSegments.push({ start: currentPosition, end: segmentStart });
    }
    
    currentPosition = Math.max(currentPosition, segmentEnd);
  }
  
  if (currentPosition < videoDuration) {
    keptSegments.push({ start: currentPosition, end: videoDuration });
  }
  
  // Build EDL
  let edl = `TITLE: ${videoFileName.replace(/\.[^/.]+$/, '')} - AI Edited
FCM: NON-DROP FRAME

`;
  
  let editNumber = 1;
  let recordOffset = 0;
  
  for (const kept of keptSegments) {
    const sourceIn = secondsToTimecode(kept.start, fps);
    const sourceOut = secondsToTimecode(kept.end, fps);
    const recordIn = secondsToTimecode(recordOffset, fps);
    const recordOut = secondsToTimecode(recordOffset + (kept.end - kept.start), fps);
    
    // EDL format: EDIT# REEL# CHANNEL TRANS DUR SOURCE_IN SOURCE_OUT RECORD_IN RECORD_OUT
    edl += `${editNumber.toString().padStart(3, '0')}  001      V     C        ${formatTimecode(sourceIn)} ${formatTimecode(sourceOut)} ${formatTimecode(recordIn)} ${formatTimecode(recordOut)}
`;
    
    // Add audio track
    edl += `${editNumber.toString().padStart(3, '0')}  001      A     C        ${formatTimecode(sourceIn)} ${formatTimecode(sourceOut)} ${formatTimecode(recordIn)} ${formatTimecode(recordOut)}
`;
    
    editNumber++;
    recordOffset += (kept.end - kept.start);
  }
  
  return edl;
}

/**
 * Generate Premiere Pro compatible XML (FCP 7 XML format)
 */
export function generatePremiereXML(
  segments: EnhancedSegment[],
  videoDuration: number,
  videoFileName: string,
  videoPath?: string,
  fps: number = 30
): string {
  // Sort segments and calculate kept segments
  const sortedSegments = [...segments].sort((a, b) => 
    parseTimeToSeconds(a.startTime) - parseTimeToSeconds(b.startTime)
  );
  
  const keptSegments: Array<{ start: number; end: number }> = [];
  let currentPosition = 0;
  
  for (const segment of sortedSegments) {
    const segmentStart = parseTimeToSeconds(segment.startTime);
    const segmentEnd = parseTimeToSeconds(segment.endTime);
    
    if (currentPosition < segmentStart) {
      keptSegments.push({ start: currentPosition, end: segmentStart });
    }
    
    currentPosition = Math.max(currentPosition, segmentEnd);
  }
  
  if (currentPosition < videoDuration) {
    keptSegments.push({ start: currentPosition, end: videoDuration });
  }
  
  // Build clips
  let clips = '';
  let timelineStart = 0;
  
  for (let i = 0; i < keptSegments.length; i++) {
    const kept = keptSegments[i];
    const inPoint = Math.floor(kept.start * fps);
    const outPoint = Math.floor(kept.end * fps);
    const duration = outPoint - inPoint;
    const timelineEnd = timelineStart + duration;
    
    clips += `
        <clipitem id="clip-${i + 1}">
          <name>${videoFileName} - ${i + 1}</name>
          <duration>${duration}</duration>
          <rate>
            <timebase>${fps}</timebase>
            <ntsc>FALSE</ntsc>
          </rate>
          <start>${timelineStart}</start>
          <end>${timelineEnd}</end>
          <in>${inPoint}</in>
          <out>${outPoint}</out>
          <file id="file-1"/>
        </clipitem>`;
    
    timelineStart = timelineEnd;
  }
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <project>
    <name>${videoFileName.replace(/\.[^/.]+$/, '')} - AI Edited</name>
    <children>
      <sequence>
        <name>Edited Sequence</name>
        <duration>${timelineStart}</duration>
        <rate>
          <timebase>${fps}</timebase>
          <ntsc>FALSE</ntsc>
        </rate>
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <width>1920</width>
                <height>1080</height>
                <pixelaspectratio>square</pixelaspectratio>
                <rate>
                  <timebase>${fps}</timebase>
                  <ntsc>FALSE</ntsc>
                </rate>
              </samplecharacteristics>
            </format>
            <track>${clips}
            </track>
          </video>
          <audio>
            <track>
              <!-- Audio clips would go here -->
            </track>
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>`;

  return xml;
}

/**
 * Download file helper
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}