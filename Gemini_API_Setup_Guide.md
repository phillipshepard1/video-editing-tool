# Gemini API Setup Guide for Video Analysis

## Getting the Correct API Key

### Step 1: Access Google AI Studio
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account

### Step 2: Create API Key
1. Click "Get API Key"
2. Select "Create API key in new project" or choose existing project
3. Copy the API key (starts with `AIza...`)

### Step 3: Verify Video Support
Test your API key with this curl command:
```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY"
```

## Key Differences: OpenRouter vs Google AI Studio

| Feature | OpenRouter | Google AI Studio |
|---------|------------|------------------|
| Text Chat | ✅ Yes | ✅ Yes |
| Video Upload | ❌ No | ✅ Yes (up to 2GB) |
| Files API | ❌ No | ✅ Yes |
| Video Analysis | ❌ No | ✅ Yes |
| Cost for 20min video | N/A | ~$0.10 |
| API Format | OpenAI-compatible | Google-specific |

## Required API Endpoints

Your app needs these Gemini endpoints (not available via OpenRouter):

### 1. File Upload Endpoint
```
POST https://generativelanguage.googleapis.com/upload/v1beta/files
```

### 2. Generate Content with Video
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
```

## Quick Test Script

Save this as `test-gemini-video.js`:

```javascript
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

// Use your Google AI Studio API key (not OpenRouter)
const genAI = new GoogleGenerativeAI("YOUR_GOOGLE_AI_STUDIO_API_KEY");

async function testVideoUpload() {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  // Test with a small video file
  const videoPath = "./test-video.mp4";
  const videoData = fs.readFileSync(videoPath);
  
  // Upload file
  const uploadResponse = await fetch(
    "https://generativelanguage.googleapis.com/upload/v1beta/files",
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "multipart",
        "Authorization": `Bearer YOUR_API_KEY`
      },
      body: videoData
    }
  );
  
  const file = await uploadResponse.json();
  console.log("File uploaded:", file);
  
  // Analyze video
  const result = await model.generateContent([
    {
      fileData: {
        mimeType: "video/mp4",
        fileUri: file.file.uri
      }
    },
    { text: "Describe this video in detail" }
  ]);
  
  console.log("Analysis:", result.response.text());
}

testVideoUpload().catch(console.error);
```

## Free Tier Limits (Google AI Studio)

- **Free tier**: 1,500 requests/day
- **Rate limit**: 15 requests/minute
- **Video length**: Up to 1 hour
- **No credit card required** initially

## Environment Variable Setup

In your `.env.local`:
```env
# ✅ CORRECT - From Google AI Studio
GEMINI_API_KEY=AIzaSy... (your key from aistudio.google.com)

# ❌ WRONG - OpenRouter won't work for video
# OPENROUTER_API_KEY=sk-or-... (this won't work)
```

## Migration Path if You Already Have OpenRouter

You can keep OpenRouter for other LLMs but need Google's API for video:

```javascript
// For text-only tasks (can use OpenRouter)
const textAnalysis = await openrouter.chat.completions.create({
  model: "google/gemini-pro",
  messages: [{ role: "user", content: "Analyze this text" }]
});

// For video tasks (must use Google AI Studio)
const videoAnalysis = await geminiDirect.generateContent([
  { fileData: { fileUri: videoUri, mimeType: "video/mp4" }},
  { text: "Find segments to cut" }
]);
```

## Next Steps

1. **Get API Key**: Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. **Test it**: Run the test script above with a small video
3. **Verify**: Ensure you can upload files and get responses
4. **Proceed**: Continue with app development

The Google AI Studio API is free to start and specifically designed for multimodal inputs like video, which is exactly what your app needs.