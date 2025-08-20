# Video File Size Limits Configuration

## Current Settings: 2GB Maximum

All components are now configured to support **2GB maximum file size**:

### 1. Next.js Configuration (`next.config.ts`)
```typescript
experimental: {
  serverActions: {
    bodySizeLimit: '2gb'  // ✅ Updated
  }
},
api: {
  bodyParser: {
    sizeLimit: '2gb'      // ✅ Updated
  },
  responseLimit: '2gb'    // ✅ Updated
}
```

### 2. API Endpoints
- `/api/upload/queue/route.ts`: `2GB` ✅
- `/api/upload/queue-fast/route.ts`: `2GB` ✅
```typescript
const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
```

### 3. Environment Variable (`.env.local` / `.env.production`)
```bash
NEXT_PUBLIC_MAX_FILE_SIZE_MB=2000  # 2GB
```

### 4. Nginx Configuration (Production Server)
```nginx
client_max_body_size 2048M;  # 2GB
proxy_read_timeout 600s;     # 10 minutes for large uploads
```

## To Increase Limits (e.g., to 5GB)

If you need to support larger files, update ALL of these:

### 1. Next.js (`next.config.ts`)
```typescript
bodySizeLimit: '5gb'
sizeLimit: '5gb'
responseLimit: '5gb'
```

### 2. API Routes
```typescript
const maxSize = 5 * 1024 * 1024 * 1024; // 5GB
```

### 3. Environment Variable
```bash
NEXT_PUBLIC_MAX_FILE_SIZE_MB=5000  # 5GB
```

### 4. Nginx
```nginx
client_max_body_size 5120M;  # 5GB
```

## Important Notes

- **Supabase Storage**: Default limit is 5GB per file (can be increased in dashboard)
- **Server RAM**: Ensure server has enough RAM (file is loaded into memory during upload)
- **Network Timeout**: Large files may need increased timeout settings
- **Gemini API**: Has its own limits for video analysis (typically handles up to 1GB well)

## Testing File Sizes

| File Size | Upload Time (100Mbps) | Processing Time | Status |
|-----------|------------------------|-----------------|---------|
| 10MB      | ~1 second             | 1-2 minutes     | ✅ Fast |
| 100MB     | ~10 seconds           | 3-5 minutes     | ✅ Good |
| 500MB     | ~45 seconds           | 5-10 minutes    | ✅ OK   |
| 1GB       | ~90 seconds           | 10-15 minutes   | ✅ OK   |
| 2GB       | ~3 minutes            | 15-20 minutes   | ✅ Max  |

## Deployment Command

After changing limits, rebuild and restart:
```bash
npm run build
pm2 restart all
```