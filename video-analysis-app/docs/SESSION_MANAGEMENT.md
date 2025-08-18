# Session Management System

## Overview
The session management system allows you to save and reload video analysis sessions, eliminating the need to re-upload and re-analyze videos when testing rendering or making changes.

## Features
- **Auto-save**: Sessions are automatically saved after Gemini analysis completes
- **Manual save**: Save current session state at any time
- **Session list**: View all your saved sessions with metadata
- **Quick load**: Load any previous session to continue where you left off
- **No re-processing**: Skip upload and analysis steps completely

## Setup Instructions

### 1. Create the Database Table
First, you need to create the `analysis_sessions` table in your Supabase database.

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `supabase/create-sessions-table.sql`
4. Click "Run" to execute the SQL

The table will be created with proper indexes and RLS policies.

### 2. Verify Environment Variables
Ensure you have these environment variables in your `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```

### 3. How to Use

#### Auto-Save
When you upload and analyze a video:
1. The video is uploaded to Gemini and Supabase
2. Analysis is performed
3. **Session is automatically saved** with all data
4. You'll see "Session saved successfully!" message

#### Load a Saved Session
1. Click "Load Saved Sessions" button in the dashboard
2. Browse your saved sessions
3. Click on any session to load it
4. The app will:
   - Load the video from Supabase (no re-upload)
   - Load all segments and analysis data
   - Jump directly to the review/editing interface
   - You can immediately test rendering

#### Manual Save
If you make changes to segments or settings:
1. Click "Save Current Session" button
2. Session will be updated with current state
3. Useful for saving progress during editing

## Benefits
- **Save time**: No need to re-upload large videos
- **Save money**: No repeated Gemini API calls
- **Test freely**: Test rendering multiple times without re-analysis
- **Resume work**: Come back to a project days later
- **Multiple projects**: Switch between different videos easily

## Session Data Stored
Each session saves:
- Video URL and Supabase storage URL
- Video metadata (duration, size, dimensions)
- All analyzed segments with timestamps
- Clustering data (if using workflow)
- User selections and edits
- Gemini file URI for reference
- Render history

## Troubleshooting

### "Failed to save session"
- Check that the database table exists
- Verify SUPABASE_SERVICE_KEY is set
- Check Supabase logs for errors

### "Failed to load sessions"
- Ensure you're logged in
- Check network connection
- Verify database permissions

### Sessions not showing up
- Refresh the session list
- Check that sessions were saved for your email
- Verify RLS policies are correct

## Technical Details

### API Endpoints
- `POST /api/sessions/save` - Save a session
- `GET /api/sessions/list` - List user's sessions
- `GET /api/sessions/load/[id]` - Load specific session

### Database Schema
Table: `analysis_sessions`
- Stores complete analysis state
- Uses JSONB for flexible segment storage
- RLS enabled for user privacy
- Indexed for fast queries

### Storage
- Videos remain in Supabase storage
- Only metadata is duplicated
- No additional storage costs

## Future Enhancements
- Session sharing between users
- Version history for sessions
- Batch operations on multiple sessions
- Export/import sessions as JSON
- Session templates for common workflows