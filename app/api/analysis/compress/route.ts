import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log(`Compressing video: ${file.name}, size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);

    // Create temp directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-compress-'));
    const inputPath = path.join(tempDir, 'input.mp4');
    const outputPath = path.join(tempDir, 'compressed.mp4');

    try {
      // Save uploaded file to temp directory
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await fs.writeFile(inputPath, buffer);

      // FFmpeg compression command
      // Target: 480p resolution, 800kbps video, 96kbps audio
      // Added padding to ensure dimensions are divisible by 2 (requirement for H.264)
      const ffmpegCommand = `ffmpeg -i "${inputPath}" -vf "scale='min(854,iw)':'min(480,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" -c:v libx264 -preset faster -crf 28 -b:v 800k -maxrate 1200k -bufsize 1200k -c:a aac -b:a 96k -ac 2 -movflags +faststart "${outputPath}" -y`;

      console.log('Running FFmpeg command...');
      const { stdout, stderr } = await execAsync(ffmpegCommand);
      console.log('FFmpeg output:', stdout);
      if (stderr) console.log('FFmpeg stderr:', stderr);

      // Read compressed file
      const compressedBuffer = await fs.readFile(outputPath);
      const compressedBlob = new Blob([compressedBuffer], { type: 'video/mp4' });
      
      // Get file stats
      const originalStats = await fs.stat(inputPath);
      const compressedStats = await fs.stat(outputPath);
      
      const compressionRatio = ((1 - compressedStats.size / originalStats.size) * 100).toFixed(1);
      
      console.log(`Compression complete: ${(originalStats.size / (1024 * 1024)).toFixed(2)}MB -> ${(compressedStats.size / (1024 * 1024)).toFixed(2)}MB (${compressionRatio}% reduction)`);

      // Clean up temp files
      await fs.rm(tempDir, { recursive: true });

      // Return compressed video
      return new NextResponse(compressedBlob, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${file.name.replace(/\.[^/.]+$/, '')}_compressed.mp4"`,
          'X-Original-Size': originalStats.size.toString(),
          'X-Compressed-Size': compressedStats.size.toString(),
          'X-Compression-Ratio': compressionRatio,
        },
      });
    } catch (error) {
      // Clean up on error
      await fs.rm(tempDir, { recursive: true }).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error('Compression error:', error);
    
    // Check if FFmpeg is installed
    if ((error as any).message?.includes('ffmpeg')) {
      return NextResponse.json(
        { error: 'FFmpeg is not installed. Please install FFmpeg to use compression.' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to compress video' },
      { status: 500 }
    );
  }
}

// Configuration for larger uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2gb',
    },
  },
};