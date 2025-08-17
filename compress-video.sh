#!/bin/bash

# Video Compression Script for Gemini Upload
# Usage: ./compress-video.sh input.mp4 output.mp4

if [ $# -ne 2 ]; then
    echo "Usage: $0 <input_video> <output_video>"
    echo "Example: $0 large_video.mp4 compressed_video.mp4"
    exit 1
fi

INPUT="$1"
OUTPUT="$2"

echo "🎬 Compressing video for Gemini upload (max 2GB)..."
echo "Input: $INPUT"
echo "Output: $OUTPUT"

# Check if input file exists
if [ ! -f "$INPUT" ]; then
    echo "❌ Error: Input file not found!"
    exit 1
fi

# Get input file size
INPUT_SIZE=$(du -h "$INPUT" | cut -f1)
echo "📊 Input file size: $INPUT_SIZE"

# Compress with balanced quality/size settings
ffmpeg -i "$INPUT" \
    -c:v libx264 \
    -crf 24 \
    -preset medium \
    -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" \
    -c:a aac \
    -b:a 128k \
    -movflags +faststart \
    "$OUTPUT"

# Check if successful
if [ $? -eq 0 ]; then
    OUTPUT_SIZE=$(du -h "$OUTPUT" | cut -f1)
    echo "✅ Compression complete!"
    echo "📊 Output file size: $OUTPUT_SIZE"
    
    # Check if under 2GB
    OUTPUT_BYTES=$(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT" 2>/dev/null)
    if [ "$OUTPUT_BYTES" -gt 2147483648 ]; then
        echo "⚠️  Warning: File is still over 2GB. Try more aggressive compression:"
        echo "   ffmpeg -i $INPUT -c:v libx264 -crf 28 -vf scale=1280:720 -c:a aac -b:a 96k $OUTPUT"
    else
        echo "✅ File is under 2GB - ready for upload!"
    fi
else
    echo "❌ Compression failed!"
    exit 1
fi