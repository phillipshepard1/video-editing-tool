# AI Research Prompt: Database Alternative for Video Platform

## Copy this prompt for Claude, ChatGPT, or Perplexity:

---

I need help finding a database/storage solution to replace Supabase for my video editing platform. Here's my situation and requirements:

## Current Critical Issues
- Supabase times out on video uploads over 1GB (I need 5-10GB support)
- Getting "UND_ERR_HEADERS_TIMEOUT" errors
- No chunked upload or resume capability
- Can't track upload progress in real-time
- RLS policies causing "table not found" errors even when tables exist

## Absolute Requirements
1. **MCP (Model Context Protocol) server** - MUST have an MCP server implementation so I can connect via terminal
2. **Large file support** - Handle 5-10GB video uploads reliably without timeouts
3. **Chunked/resumable uploads** - If connection drops, resume from where it left off
4. **Progress tracking** - Show upload speed, percentage, time remaining
5. **JavaScript/TypeScript SDK** - First-class support for Next.js apps
6. **Direct browser uploads** - Bypass my server for large files

## My Usage Pattern
- 50-100 video uploads per month
- File sizes: 1-5GB average, up to 10GB max
- Need ~1TB storage
- 2-5TB monthly bandwidth
- 10-50 concurrent users
- Using Next.js, TypeScript, React

## Please Research These Solutions

For each platform below, I need to know:
1. **Does it have an MCP server?** (check for "mcp-server-[platform]" on GitHub)
2. **How does it handle 5GB uploads?** (multipart? resumable? what's the real-world performance?)
3. **Upload speed benchmarks** for large files
4. **Pricing** for my usage (1TB storage, 5TB bandwidth)
5. **Migration difficulty** from Supabase
6. **Code example** for uploading a 5GB file with progress tracking

### Platforms to Research:
- **Cloudflare R2 + D1** (storage + database combo)
- **AWS S3 + RDS/DynamoDB**
- **Backblaze B2 + PostgreSQL** 
- **Appwrite** (all-in-one platform)
- **Xata** (Postgres with file attachments)
- **Neon + external storage**
- **Turso + external storage**
- **MongoDB Atlas** (with GridFS)
- **Firebase** (Storage + Firestore)
- **MinIO** (self-hosted S3 alternative)

## Specific Questions to Answer

1. **Which solution has the BEST large file upload experience?** (speed, reliability, developer experience)

2. **Which has an MCP server available?** (official or community maintained)

3. **What's the REAL upload speed I can expect for a 5GB file?** (not theoretical, actual benchmarks)

4. **Which is easiest to migrate to from Supabase?** (least code changes)

5. **Which has the best cost/performance ratio for video storage?**

6. **Show me actual code for:**
   - Uploading a 5GB video with progress bar
   - Resuming a failed upload
   - Getting a signed URL for direct browser upload

## Deal Breakers
- No MCP server = eliminated
- Can't handle 5GB files = eliminated  
- No JavaScript/TypeScript SDK = eliminated
- Over $200/month for my usage = eliminated

## Ideal Outcome
Find me 2-3 solutions that:
1. Have MCP servers (or I can build one)
2. Handle 10GB uploads like butter
3. Cost under $100/month
4. Can migrate to in under a week
5. Have great developer experience

Please create a comparison table and give me your top recommendation with a clear explanation of why it's the best choice for my video platform needs.

---

## Additional Context for the AI:

I'm a developer building a video editing platform where users upload raw footage (1-10GB files), the system analyzes it with AI, and then renders edited versions. The current Supabase setup fails on large files, and I need something that "just works" for big video files. I value developer experience and reliability over having every possible feature. The MCP server requirement is non-negotiable as I need terminal integration for my workflow.