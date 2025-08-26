# Database Requirements Specification for Video Editing Platform

## Current Issues with Supabase

### Critical Problems
1. **Large File Upload Failures (1GB+)**
   - Timeout errors on files over 1GB (should handle 5GB+ easily)
   - Network header timeouts (UND_ERR_HEADERS_TIMEOUT)
   - No native chunked upload support
   - No resumable upload capability
   - Upload progress not trackable server-side

2. **Performance Issues**
   - Single connection bottleneck for large transfers
   - No parallel upload streams
   - Limited CDN/edge network for global distribution
   - Slow retrieval for large video files

3. **Developer Experience**
   - Complex RLS policies interfering with basic operations
   - Service key required for simple operations
   - Table schema cache issues (PGRST205 errors)
   - Limited real-time progress tracking

## Requirements for New Database Solution

### Must-Have Features

#### 1. Video Storage Capabilities
- **Minimum 10GB single file support** (ideally 50GB+)
- **Chunked/multipart uploads** with automatic assembly
- **Resumable uploads** that survive connection drops
- **Parallel upload streams** for faster transfers
- **Real-time progress tracking** with speed metrics
- **Direct browser uploads** (bypass application server)
- **Signed/presigned URLs** for secure direct access
- **Automatic transcoding** options (nice to have)

#### 2. Database Features
- **JSON/JSONB support** for flexible segment storage
- **Full-text search** on video metadata
- **Time-series data** support for analytics
- **ACID compliance** for data integrity
- **Batch operations** for bulk updates
- **Triggers and functions** for automation

#### 3. Developer Requirements
- **MCP (Model Context Protocol) server available** for terminal integration
- **REST API** with comprehensive documentation
- **JavaScript/TypeScript SDK** with type safety
- **WebSocket/real-time** subscriptions
- **Local development** environment support
- **Database migrations** tooling
- **Branching/preview** environments

#### 4. Performance & Scale
- **Global CDN** for video delivery
- **Edge functions** for compute near users
- **Auto-scaling** without manual intervention
- **99.9% uptime SLA** minimum
- **Sub-100ms query latency** for metadata
- **10Gbps+ bandwidth** capability

#### 5. Security & Compliance
- **Row-level security** that doesn't break basic ops
- **Encryption at rest** and in transit
- **GDPR compliant** data handling
- **Audit logs** for all operations
- **Backup and recovery** automated
- **Multi-region replication** options

### Nice-to-Have Features
- Video processing pipelines (FFmpeg integration)
- AI/ML model hosting for analysis
- Built-in video streaming (HLS/DASH)
- Collaborative features (real-time sync)
- Version control for database schema
- Cost prediction tools
- GraphQL API option

## Evaluation Criteria

### Technical Fit (40%)
- Can handle our video file sizes (1-5GB typical, up to 10GB)
- Supports our tech stack (Next.js, TypeScript, React)
- Has MCP server for terminal integration
- Provides necessary APIs and SDKs

### Performance (30%)
- Upload speed for large files
- Query performance for metadata
- Global distribution capabilities
- Concurrent user support

### Developer Experience (20%)
- Documentation quality
- SDK/API design
- Local development story
- Community support

### Cost (10%)
- Transparent pricing model
- Scales economically with usage
- No surprise bandwidth charges
- Free tier adequate for development

## Potential Alternatives to Research

### Specialized Video Platforms
1. **Cloudflare Stream + D1/R2**
   - R2 for storage (no egress fees)
   - Stream for video processing
   - D1 for metadata
   - Workers for edge compute

2. **AWS Stack**
   - S3 with multipart upload
   - RDS/DynamoDB for metadata
   - CloudFront for CDN
   - Lambda for processing

3. **Mux + PlanetScale**
   - Mux for video infrastructure
   - PlanetScale for database
   - Vercel for edge functions

### Modern Database Platforms
1. **Neon**
   - Postgres-compatible
   - Serverless with autoscaling
   - Branching for dev/test

2. **Turso**
   - SQLite at the edge
   - Embedded replicas
   - Great for read-heavy workloads

3. **Xata**
   - Postgres with built-in search
   - File attachments support
   - Generous free tier

4. **Appwrite**
   - Built-in file storage
   - Realtime subscriptions
   - Self-hostable option

## Research Questions for AI

When researching alternatives, please investigate:

1. **Does [Platform] have an MCP server implementation?**
   - Check GitHub for "mcp-server-[platform]"
   - Look for official or community implementations

2. **How does [Platform] handle 5GB file uploads?**
   - Native multipart upload support?
   - Resumable upload capability?
   - Direct browser upload options?

3. **What's the real-world upload performance?**
   - Benchmarks for large files
   - Global upload speeds
   - Concurrent upload limits

4. **What's the developer experience like?**
   - Quality of TypeScript SDK
   - Documentation completeness
   - Community activity

5. **What are the hidden costs?**
   - Bandwidth/egress fees
   - Storage costs at scale
   - API request pricing

6. **Integration complexity?**
   - Migration path from Supabase
   - Breaking changes required
   - Time to implement

## Success Criteria

The ideal solution will:
1. Handle 5GB uploads without any special configuration
2. Provide real-time upload progress to the UI
3. Have an MCP server for terminal integration
4. Cost less than $100/month for our usage pattern
5. Require minimal code changes from current Supabase setup
6. Offer better performance than current solution

## Usage Pattern Context

- **Monthly uploads**: 50-100 videos
- **Average file size**: 1-2GB
- **Peak file size**: 5-10GB  
- **Storage needed**: 500GB-1TB
- **Monthly bandwidth**: 2-5TB
- **Concurrent users**: 10-50
- **Read/write ratio**: 80/20

---

## AI Research Prompt

"I need to research modern database and storage solutions that can replace Supabase for a video editing platform. The critical requirement is reliable handling of 1-5GB video file uploads (current Supabase setup times out on 1GB+ files). Must have: MCP (Model Context Protocol) server for terminal integration, multipart/chunked upload support, JavaScript/TypeScript SDK, and real-time progress tracking. 

Please research and compare: Cloudflare R2+D1, AWS S3+RDS, Neon, Turso, Xata, Appwrite, and any other modern alternatives. For each, evaluate: 1) MCP server availability, 2) Large file upload capabilities and real-world performance, 3) Developer experience and documentation quality, 4) Pricing for 500GB storage and 2-5TB monthly bandwidth, 5) Migration complexity from Supabase.

Focus on solutions that excel at large file handling and provide the best developer experience. Ignore traditional databases without modern file storage capabilities."