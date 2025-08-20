# Video Editor - Deployment & Usage Guide

## 🚀 Quick Start

### Local Development
```bash
npm install
npm run dev       # Start Next.js app
npm run workers   # Start background workers (separate terminal)
```

### Production Deployment (DigitalOcean)

1. **Server Requirements**
   - Minimum: 2 vCPU, 4GB RAM
   - Recommended: 4 vCPU, 8GB RAM
   - Ubuntu 22.04 or later

2. **Setup Commands**
```bash
# Clone and setup
git clone [your-repo] /var/www/video-editor
cd /var/www/video-editor
npm install

# Environment variables
cp .env.local .env.production
# Edit NEXT_PUBLIC_APP_URL to your domain/IP

# Build and start
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

3. **Nginx Configuration**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    client_max_body_size 2048M;
    proxy_read_timeout 600s;
    
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

## 📁 Project Structure

```
video-editing-tool/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── upload/        # Video upload endpoints
│   │   │   ├── queue/     # Chunked processing (slow)
│   │   │   └── queue-fast/ # Whole video processing (fast)
│   │   ├── analysis/      # Gemini AI analysis
│   │   └── jobs/          # Job management
│   └── dashboard/         # Main UI
├── lib/                   # Core libraries
│   ├── services/          # Job queue service
│   └── workers/           # Background workers
│       ├── analysis-worker.ts      # Chunk processing
│       └── analysis-worker-fast.ts  # Whole video processing
├── components/            # React components
└── ecosystem.config.js    # PM2 configuration
```

## 🎥 How It Works

### Video Processing Pipeline
1. **Upload** → Video stored in Supabase
2. **Analysis** → Gemini AI identifies cuts
3. **Assembly** → Timeline created with segments
4. **Review** → User reviews and edits cuts
5. **Export** → Download EDL/XML or render

### Processing Modes
- **Fast Mode** (Default): Processes entire video at once (5-10 min for 200MB)
- **Chunk Mode** (Legacy): Splits video into chunks (slower, 2+ hours)

## 🔧 Key Features

- **AI-Powered Analysis**: Automatically finds pauses, filler words, redundant content
- **Background Processing**: Queue system handles multiple videos
- **Review Interface**: Edit AI suggestions before rendering
- **Export Formats**: EDL, FCPXML, Premiere XML
- **Scalable**: Workers can process multiple videos concurrently

## 🛠️ Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
GEMINI_API_KEY=your_gemini_key

# Optional
CHILLIN_API_KEY=your_chillin_key  # For video rendering
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Change for production
```

## 📊 Monitoring

```bash
# View logs
pm2 logs

# Monitor resources
pm2 monit

# Check status
pm2 status

# Restart services
pm2 restart all
```

## 🐛 Troubleshooting

### Job Stuck at Processing
- Check worker logs: `pm2 logs video-editor-workers`
- Verify Gemini API key is valid
- For large videos (>100MB), processing takes 5-10 minutes

### Upload Fails
- Check Nginx `client_max_body_size` (should be 2048M)
- Verify Supabase storage bucket permissions

### Workers Not Processing
```bash
pm2 restart video-editor-workers
pm2 logs video-editor-workers --lines 100
```

## 📈 Performance

| Video Size | Processing Time | Mode |
|------------|----------------|------|
| < 10MB     | 1-2 minutes    | Fast |
| 50MB       | 3-5 minutes    | Fast |
| 200MB      | 5-10 minutes   | Fast |
| 500MB      | 10-15 minutes  | Fast |

## 🔄 Updates

To deploy updates:
```bash
cd /var/www/video-editor
git pull
npm install
npm run build
pm2 restart all
```

## 📝 API Endpoints

- `POST /api/upload/queue-fast` - Upload video for processing
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/[id]` - Get job status
- `POST /api/jobs/[id]/render` - Trigger manual render
- `GET /api/jobs/[id]/logs` - View job logs

## 🎯 Current Status

- ✅ Fast processing implemented
- ✅ Background workers stable
- ✅ Review interface working
- ✅ Export formats functional
- ✅ Production ready

---

**Support**: Report issues at [your-repo-issues]
**Version**: 1.0.0
**Last Updated**: January 2025