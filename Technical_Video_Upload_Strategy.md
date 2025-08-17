# Technical Strategy: Large Video Upload to Gemini

## Challenge
Uploading 20-minute videos (1-2GB) from browser to Gemini API requires careful handling due to:
- Browser memory limitations
- Network interruptions
- Gemini's file upload requirements
- Vercel's serverless function limits (4.5MB body, 10s timeout on hobby plan)

## Solution Architecture

### Option 1: Direct Client Upload (Recommended)
```
Browser → Gemini Files API directly
```

**Implementation:**
```typescript
// client-side upload directly to Gemini
async function uploadToGemini(file: File) {
  // Use Gemini's File API directly from client
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(
    'https://generativelanguage.googleapis.com/upload/v1beta/files',
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'multipart',
        'Authorization': `Bearer ${apiKey}` // Use proxy endpoint
      },
      body: formData
    }
  );
  
  return response.json();
}
```

**Pros:**
- No server bandwidth costs
- Direct upload, faster
- No timeout issues

**Cons:**
- Exposes API key (need proxy)
- Less control over process

### Option 2: Server Proxy with Streaming
```
Browser → Vercel Edge Function → Gemini
```

**Implementation:**
```typescript
// Edge function to proxy upload
export const runtime = 'edge'; // Important: Use Edge runtime

export async function POST(request: Request) {
  // Stream file through to Gemini
  const formData = await request.formData();
  const file = formData.get('file') as File;
  
  // Forward to Gemini with server API key
  const geminiResponse = await fetch(
    'https://generativelanguage.googleapis.com/upload/v1beta/files',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
        'X-Goog-Upload-Protocol': 'multipart'
      },
      body: formData
    }
  );
  
  return geminiResponse;
}
```

### Option 3: Two-Step Process (Most Robust)
```
Browser → Vercel Blob Storage → Server → Gemini
```

**Step 1: Upload to Vercel Blob**
```typescript
// Client uploads to Vercel Blob Storage
import { upload } from '@vercel/blob/client';

const blob = await upload(file.name, file, {
  access: 'public',
  handleUploadUrl: '/api/upload/blob',
});
```

**Step 2: Server transfers to Gemini**
```typescript
// API route downloads from Blob and uploads to Gemini
export async function POST(request: Request) {
  const { blobUrl } = await request.json();
  
  // Download from Blob Storage
  const videoResponse = await fetch(blobUrl);
  const videoBlob = await videoResponse.blob();
  
  // Upload to Gemini
  const formData = new FormData();
  formData.append('file', videoBlob);
  
  const geminiResponse = await fetch(
    'https://generativelanguage.googleapis.com/upload/v1beta/files',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: formData
    }
  );
  
  return geminiResponse.json();
}
```

## Recommended Approach: Hybrid Solution

### Phase 1: Initial Development
Use **Option 3** (Two-step with Blob Storage) for reliability:
- Resumable uploads
- Progress tracking
- Retry capability
- No timeout issues

### Phase 2: Optimization
Implement **Option 1** (Direct upload) with security:
- Create secure token endpoint
- Use short-lived upload URLs
- Implement CORS properly

## Gemini File API Details

### Upload Endpoint
```
POST https://generativelanguage.googleapis.com/upload/v1beta/files
```

### Headers Required
```typescript
{
  'X-Goog-Upload-Protocol': 'multipart',
  'Authorization': `Bearer ${API_KEY}`
}
```

### Response Format
```json
{
  "file": {
    "name": "files/abc-123",
    "displayName": "video.mp4",
    "mimeType": "video/mp4",
    "sizeBytes": "1234567890",
    "createTime": "2024-01-01T00:00:00.000Z",
    "updateTime": "2024-01-01T00:00:00.000Z",
    "expirationTime": "2024-01-02T00:00:00.000Z",
    "sha256Hash": "abc123...",
    "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc-123"
  }
}
```

### File Limitations
- Max file size: 2GB
- Supported formats: MP4, AVI, MOV, MPEG, etc.
- Files auto-delete after 48 hours
- Max 20 files per request

## Implementation Code

### Complete Upload Service
```typescript
// lib/services/video-upload.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export class VideoUploadService {
  private genAI: GoogleGenerativeAI;
  
  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }
  
  async uploadVideo(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      // Step 1: Upload to temporary storage (Vercel Blob)
      const blobUrl = await this.uploadToBlob(file, onProgress);
      
      // Step 2: Transfer to Gemini
      const geminiFile = await this.transferToGemini(blobUrl);
      
      // Step 3: Clean up blob storage
      await this.deleteBlob(blobUrl);
      
      return geminiFile.uri;
      
    } catch (error) {
      console.error('Upload failed:', error);
      throw new Error('Failed to upload video');
    }
  }
  
  private async uploadToBlob(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    // Use tus-js-client for resumable upload
    return new Promise((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: '/api/upload/blob',
        resume: true,
        chunkSize: 10 * 1024 * 1024, // 10MB chunks
        metadata: {
          filename: file.name,
          filetype: file.type
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const progress = (bytesUploaded / bytesTotal) * 50; // 50% for upload
          onProgress?.(progress);
        },
        onSuccess: () => {
          resolve(upload.url);
        },
        onError: (error) => {
          reject(error);
        }
      });
      
      upload.start();
    });
  }
  
  private async transferToGemini(blobUrl: string): Promise<any> {
    const response = await fetch('/api/gemini/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ blobUrl })
    });
    
    if (!response.ok) {
      throw new Error('Failed to transfer to Gemini');
    }
    
    return response.json();
  }
  
  private async deleteBlob(url: string): Promise<void> {
    await fetch('/api/upload/blob', {
      method: 'DELETE',
      body: JSON.stringify({ url })
    });
  }
}
```

### API Route for Gemini Transfer
```typescript
// app/api/gemini/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { blobUrl } = await request.json();
    
    // Download video from blob storage
    const videoResponse = await fetch(blobUrl);
    const videoBlob = await videoResponse.blob();
    
    // Create form data for Gemini
    const formData = new FormData();
    formData.append('file', videoBlob);
    
    // Upload to Gemini Files API
    const geminiResponse = await fetch(
      'https://generativelanguage.googleapis.com/upload/v1beta/files',
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'multipart',
          'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`
        },
        body: formData
      }
    );
    
    if (!geminiResponse.ok) {
      throw new Error('Gemini upload failed');
    }
    
    const result = await geminiResponse.json();
    
    return NextResponse.json({
      success: true,
      file: result.file
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
```

## Error Handling Strategy

### Retry Logic
```typescript
async function uploadWithRetry(
  file: File,
  maxRetries = 3
): Promise<string> {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadVideo(file);
    } catch (error) {
      lastError = error;
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  
  throw lastError;
}
```

### Progress Tracking
```typescript
interface UploadProgress {
  stage: 'uploading' | 'processing' | 'analyzing';
  percentage: number;
  message: string;
}

function useVideoUpload() {
  const [progress, setProgress] = useState<UploadProgress>({
    stage: 'uploading',
    percentage: 0,
    message: 'Preparing upload...'
  });
  
  const upload = async (file: File) => {
    // Stage 1: Upload (0-50%)
    setProgress({
      stage: 'uploading',
      percentage: 0,
      message: 'Uploading video...'
    });
    
    const uri = await uploadVideo(file, (pct) => {
      setProgress({
        stage: 'uploading',
        percentage: pct * 0.5,
        message: `Uploading: ${Math.round(pct)}%`
      });
    });
    
    // Stage 2: Processing (50-75%)
    setProgress({
      stage: 'processing',
      percentage: 50,
      message: 'Processing with Gemini...'
    });
    
    // Stage 3: Analysis (75-100%)
    setProgress({
      stage: 'analyzing',
      percentage: 75,
      message: 'Analyzing content...'
    });
    
    return uri;
  };
  
  return { upload, progress };
}
```

## Testing Strategy

### 1. Test with Small Files First
```typescript
// Start with 1-minute clips
const testFile = new File(
  [await fetch('/test-video-1min.mp4').then(r => r.blob())],
  'test.mp4',
  { type: 'video/mp4' }
);
```

### 2. Simulate Network Issues
```typescript
// Add artificial delays and failures
if (process.env.NODE_ENV === 'development') {
  // Random failure for testing
  if (Math.random() < 0.2) {
    throw new Error('Simulated network error');
  }
}
```

### 3. Monitor Upload Performance
```typescript
const startTime = Date.now();
const result = await upload(file);
const duration = Date.now() - startTime;

analytics.track('video_upload', {
  fileSize: file.size,
  duration: duration,
  speed: file.size / duration // bytes per ms
});
```

## Production Checklist

- [ ] Set up Gemini API key in Vercel environment
- [ ] Configure CORS for direct uploads
- [ ] Implement rate limiting (10 uploads per user per hour)
- [ ] Add file type validation (video/* only)
- [ ] Set up monitoring for failed uploads
- [ ] Create cleanup job for orphaned files
- [ ] Test with various video formats
- [ ] Implement upload size limits
- [ ] Add progress persistence (resume on refresh)
- [ ] Create upload queue system

This strategy ensures reliable video uploads while working within the constraints of serverless architecture and browser limitations.