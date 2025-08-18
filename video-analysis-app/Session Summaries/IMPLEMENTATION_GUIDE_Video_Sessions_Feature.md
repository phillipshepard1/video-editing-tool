# Implementation Guide: Video Sessions Feature

## Feature Overview
**"Save After Analysis"** - Allow users to save video analysis results and reload them later without re-analysis.

## User Value Proposition
- **Before**: Upload → Analyze → Export → Lose everything when browser closes
- **After**: Upload → Analyze → Save → Export anytime → Reload sessions → Multiple exports from one analysis

## Technical Implementation Plan

### Phase 1: Database & Core Save (2-3 hours)

#### 1.1 Database Schema
```sql
CREATE TABLE video_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  
  -- Session Identity
  session_name TEXT NOT NULL,
  description TEXT,
  
  -- Video Reference  
  original_filename TEXT NOT NULL,
  video_url TEXT NOT NULL,
  video_duration REAL NOT NULL,
  
  -- Analysis Results (JSONB for flexibility)
  segments JSONB NOT NULL,              -- EnhancedSegment[]
  clusters JSONB NOT NULL,              -- TakeCluster[]  
  cluster_selections JSONB NOT NULL,    -- ClusterSelection[]
  
  -- Workflow State
  current_step INTEGER DEFAULT 3,
  filter_state JSONB,                   -- FilterState
  final_segments JSONB,                 -- Final export selection
  
  -- Quick Access Metrics (computed from segments)
  original_duration REAL,
  final_duration REAL,
  time_saved REAL,
  segments_count INTEGER,
  
  -- Session Management
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_opened_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_step CHECK (current_step IN (1, 2, 3))
);

-- Performance Indexes
CREATE INDEX idx_sessions_user_recent ON video_sessions(user_id, updated_at DESC);
```

#### 1.2 API Routes to Create

**POST /api/sessions**
```typescript
// Save current workflow state
export async function POST(request: NextRequest) {
  const { sessionName, videoUrl, segments, clusters, clusterSelections, filterState, finalSegments } = await request.json();
  
  const { data } = await supabase
    .from('video_sessions')
    .insert({
      user_id: user.id,
      session_name: sessionName,
      video_url: videoUrl,
      segments,
      clusters,
      cluster_selections: clusterSelections,
      filter_state: filterState,
      final_segments: finalSegments,
      // Compute metrics
      segments_count: segments.length,
      original_duration: calculateOriginalDuration(segments),
      final_duration: calculateFinalDuration(segments, finalSegments)
    })
    .select()
    .single();
  
  return NextResponse.json(data);
}
```

**GET /api/sessions**
```typescript
// List user's sessions
export async function GET(request: NextRequest) {
  const { data } = await supabase
    .from('video_sessions')
    .select('id, session_name, original_filename, created_at, segments_count, time_saved')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  
  return NextResponse.json(data);
}
```

**GET /api/sessions/[sessionId]**
```typescript
// Load specific session
export async function GET(request: NextRequest, { params }: { params: { sessionId: string } }) {
  const { data } = await supabase
    .from('video_sessions')
    .select('*')
    .eq('id', params.sessionId)
    .eq('user_id', user.id)
    .single();
  
  // Update last_opened_at
  await supabase
    .from('video_sessions')
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', params.sessionId);
  
  return NextResponse.json(data);
}
```

#### 1.3 Add Save Button to WorkflowManagerV2
**File: `components/WorkflowManagerV2.tsx`**

```typescript
// Add state for save functionality
const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
const [sessionId, setSessionId] = useState<string | null>(null);

// Add save function
const handleSaveSession = async () => {
  if (!videoUrl || !segments.length) return;
  
  const sessionName = prompt('Session name:') || `${originalFilename} - ${new Date().toLocaleDateString()}`;
  
  setSaveStatus('saving');
  
  try {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionName,
        originalFilename: originalFilename,
        videoUrl,
        videoAuration: videoDuration,
        segments,
        clusters,
        clusterSelections,
        filterState,
        finalSegments: finalSegmentsToRemove,
        currentStep
      })
    });
    
    const savedSession = await response.json();
    setSessionId(savedSession.id);
    setSaveStatus('saved');
    toast.success('Session saved! You can now close the browser.');
  } catch (error) {
    setSaveStatus('error');
    toast.error('Failed to save session');
  }
};

// Add save button in the UI (after Step 3 summary cards)
{currentStep === 3 && (
  <Card className="bg-white border-gray-200 shadow-xl">
    <div className="p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Save Session</h3>
      <div className="flex gap-3">
        <Button
          onClick={handleSaveSession}
          disabled={saveStatus === 'saving' || !segments.length}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saveStatus === 'saving' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {saveStatus === 'saved' && <CheckCircle className="w-4 h-4 mr-2" />}
          <Save className="w-4 h-4 mr-2" />
          {saveStatus === 'saved' ? 'Saved!' : 'Save Session'}
        </Button>
        
        {sessionId && (
          <Button
            variant="outline"
            onClick={() => router.push('/sessions')}
          >
            View All Sessions
          </Button>
        )}
      </div>
    </div>
  </Card>
)}
```

### Phase 2: Sessions Dashboard (3-4 hours)

#### 2.1 Create Sessions Page
**File: `app/sessions/page.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Trash2, Edit, Calendar, Clock } from 'lucide-react';

interface SessionSummary {
  id: string;
  session_name: string;
  original_filename: string;
  created_at: string;
  segments_count: number;
  time_saved: number;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/sessions');
      const data = await response.json();
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    router.push(`/session/${sessionId}`);
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions(sessions.filter(s => s.id !== sessionId));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return <div>Loading sessions...</div>;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Video Sessions</h1>
        <p className="text-gray-600">Your saved video analysis sessions</p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-600 mb-4">No saved sessions yet</p>
            <Button onClick={() => router.push('/dashboard')}>
              Analyze Your First Video
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sessions.map((session) => (
            <Card key={session.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {session.session_name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">{session.original_filename}</p>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(session.created_at).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {session.segments_count} segments • {formatTime(session.time_saved)} saved
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => loadSession(session.id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Load Session
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={() => deleteSession(session.id)}
                      className="text-red-600 border-red-300 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 2.2 Add Navigation Link
**File: `components/AuthenticatedLayout.tsx` or main navigation**

```typescript
<Link href="/sessions" className="nav-link">
  <Video className="w-4 h-4 mr-2" />
  My Sessions
</Link>
```

### Phase 3: Session Loading (2 hours)

#### 3.1 Create Session View Page
**File: `app/session/[sessionId]/page.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { WorkflowManagerV2 } from '@/components/WorkflowManagerV2';

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      
      if (!response.ok) {
        throw new Error('Session not found');
      }
      
      const sessionData = await response.json();
      setSession(sessionData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading session...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!session) return <div>Session not found</div>;

  return (
    <div>
      <div className="bg-blue-50 p-4 mb-4">
        <h1 className="text-lg font-semibold">📁 {session.session_name}</h1>
        <p className="text-sm text-gray-600">Loaded from saved session</p>
      </div>
      
      <WorkflowManagerV2
        segments={session.segments}
        clusters={session.clusters}
        initialClusterSelections={session.cluster_selections}
        videoUrl={session.video_url}
        videoDuration={session.video_duration}
        originalDuration={session.original_duration}
        initialStep={session.current_step || 3}
        sessionMode={true}
        sessionId={session.id}
        onExport={(format, segments) => {
          // Handle export and track it
          console.log('Exporting from session:', format, segments.length);
        }}
        onNewAnalysis={() => {
          router.push('/dashboard');
        }}
      />
    </div>
  );
}
```

## Implementation Checklist

### Phase 1: Core Save (Start Here)
- [ ] Create database table and migration
- [ ] Create POST /api/sessions route
- [ ] Add save button to WorkflowManagerV2
- [ ] Test saving a session
- [ ] Add success/error feedback

### Phase 2: Sessions Dashboard  
- [ ] Create GET /api/sessions route
- [ ] Create /sessions page
- [ ] Add navigation link
- [ ] Test sessions list
- [ ] Add delete functionality

### Phase 3: Session Loading
- [ ] Create GET /api/sessions/[id] route  
- [ ] Create /session/[sessionId] page
- [ ] Test loading sessions
- [ ] Add error handling for missing sessions

### Phase 4: Polish (Optional)
- [ ] Session renaming
- [ ] Session search/filtering
- [ ] Export history tracking
- [ ] Bulk operations

## Key Files to Modify

1. **Database**: Add migration for video_sessions table
2. **API Routes**: `/app/api/sessions/route.ts`, `/app/api/sessions/[sessionId]/route.ts`
3. **UI Components**: `components/WorkflowManagerV2.tsx` (add save button)
4. **Pages**: `app/sessions/page.tsx`, `app/session/[sessionId]/page.tsx`
5. **Navigation**: Add "My Sessions" link

## Expected Development Time
- **Phase 1**: 2-3 hours (core save functionality)
- **Phase 2**: 3-4 hours (sessions dashboard)
- **Phase 3**: 2 hours (session loading)
- **Total MVP**: 7-9 hours

## Success Criteria
1. User can save session after analysis
2. User can view list of saved sessions  
3. User can load any saved session
4. All workflow state is preserved
5. Video playback works in loaded sessions
6. User can export from loaded sessions

---

**Start with Phase 1 - get saving working first, then build the dashboard and loading.**