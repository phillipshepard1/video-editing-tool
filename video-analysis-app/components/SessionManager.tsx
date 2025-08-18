'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Save, 
  FolderOpen, 
  Clock, 
  Film, 
  Trash2, 
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface Session {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  videoFilename: string;
  videoDuration: number;
  stats: {
    totalSegments: number;
    segmentsToRemove: number;
    originalDuration: number;
    finalDuration: number;
    timeSaved: number;
  };
  status: string;
  hasRenderedVideo: boolean;
}

interface SessionManagerProps {
  currentSessionData?: any; // Current analysis data to save
  userEmail: string;
  onSessionLoad: (sessionData: any) => void;
  onSessionSave?: (sessionId: string) => void;
}

export function SessionManager({ 
  currentSessionData, 
  userEmail, 
  onSessionLoad,
  onSessionSave 
}: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    if (userEmail) {
      loadSessions();
    }
  }, [userEmail]);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/sessions/list?userEmail=${encodeURIComponent(userEmail)}`);
      const data = await response.json();
      
      if (data.success) {
        setSessions(data.sessions);
        console.log(`Loaded ${data.sessions.length} sessions`);
      } else {
        setError(data.error || 'Failed to load sessions');
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const saveCurrentSession = async () => {
    if (!currentSessionData) {
      setError('No session data to save');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const sessionName = `${currentSessionData.videoFilename || 'Video'} - ${new Date().toLocaleString()}`;
      
      const response = await fetch('/api/sessions/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...currentSessionData,
          userEmail,
          sessionName,
          sessionDescription: `Analysis of ${currentSessionData.videoFilename} with ${currentSessionData.segments?.length || 0} segments`
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccessMessage(`Session "${data.sessionName}" saved successfully!`);
        if (onSessionSave) {
          onSessionSave(data.sessionId);
        }
        // Reload sessions to show the new one
        await loadSessions();
        
        // Clear success message after 5 seconds
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(data.error || 'Failed to save session');
      }
    } catch (err) {
      console.error('Error saving session:', err);
      setError('Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/sessions/load/${sessionId}`);
      const data = await response.json();
      
      if (data.success) {
        console.log('Session loaded:', data.session);
        onSessionLoad(data.session);
        setSuccessMessage('Session loaded successfully!');
        setShowSessions(false);
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || 'Failed to load session');
      }
    } catch (err) {
      console.error('Error loading session:', err);
      setError('Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex gap-4">
        {currentSessionData && (
          <Button
            onClick={saveCurrentSession}
            disabled={saving}
            className="flex items-center gap-2"
            variant="default"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Current Session
          </Button>
        )}
        
        <Button
          onClick={() => setShowSessions(!showSessions)}
          variant="outline"
          className="flex items-center gap-2"
        >
          <FolderOpen className="h-4 w-4" />
          {showSessions ? 'Hide' : 'Load'} Saved Sessions
          {sessions.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs">
              {sessions.length}
            </span>
          )}
        </Button>

        <Button
          onClick={loadSessions}
          variant="outline"
          size="icon"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-600 rounded-lg">
          <CheckCircle className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      {/* Sessions List */}
      {showSessions && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No saved sessions found. Analyze a video and save it to create your first session.
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => loadSession(session.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-medium flex items-center gap-2">
                          <Film className="h-4 w-4" />
                          {session.name}
                        </h4>
                        {session.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {session.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(session.createdAt)}
                          </span>
                          <span>Duration: {formatDuration(session.videoDuration)}</span>
                          <span>{session.stats.segmentsToRemove} cuts</span>
                          {session.stats.timeSaved > 0 && (
                            <span className="text-green-600">
                              Saves {formatDuration(session.stats.timeSaved)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.hasRenderedVideo && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadSession(session.id);
                          }}
                        >
                          Load
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}