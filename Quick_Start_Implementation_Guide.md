# Quick Start Implementation Guide
## Gemini Video Analysis App

### Step 1: Initialize Next.js Project

```bash
# Create Next.js app with TypeScript
npx create-next-app@latest video-analysis-app --typescript --tailwind --app

cd video-analysis-app

# Install dependencies
npm install @google/generative-ai @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install zustand tus-js-client react-dropzone
npm install @radix-ui/react-dialog @radix-ui/react-progress @radix-ui/react-tabs
npm install lucide-react class-variance-authority clsx tailwind-merge
npm install date-fns

# Dev dependencies
npm install -D @types/node
```

### Step 2: Set Up Environment Variables

Create `.env.local`:
```env
# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# App Config
NEXT_PUBLIC_MAX_FILE_SIZE_MB=2000
```

### Step 3: Initialize Supabase

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Run the SQL from the PRD database schema section
4. Get your API keys from Settings > API

### Step 4: Create Core Services

Create `lib/gemini.ts`:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function uploadVideoToGemini(file: File) {
  // Implementation here
}

export async function analyzeVideo(fileUri: string, prompt: string) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json"
    }
  });
  
  // Implementation here
}
```

### Step 5: Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create API key
3. Add to `.env.local`

### Step 6: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Next Steps

1. Build the upload component first
2. Test Gemini integration with a small video
3. Implement the results display
4. Add export functionality
5. Polish UI and error handling

### Key Files to Create

- `/app/page.tsx` - Main upload interface
- `/app/api/analysis/create/route.ts` - API endpoint
- `/components/VideoUploader.tsx` - Upload component
- `/lib/services/gemini.ts` - Gemini service
- `/lib/supabase.ts` - Database client

Ready to start building! Begin with the Next.js setup and Gemini API key.