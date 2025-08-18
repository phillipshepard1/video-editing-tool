'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../src/contexts/AuthContext';
import AuthenticatedLayout from '@/components/AuthenticatedLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Video, Clock, Calendar, Play, Trash2, 
  FolderOpen, ArrowLeft, Search, Filter
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface VideoSession {
  id: string;
  session_name: string;
  original_filename: string;
  video_duration: number;
  original_duration?: number;
  current_step: number;
  created_at: string;
  updated_at: string;
  timeRemoved: number;
  formattedDuration: string;
  formattedCreatedAt: string;
  formattedUpdatedAt: string;
}

export default function SessionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/sessions');
      const data = await response.json();

      if (response.ok) {
        setSessions(data.sessions);
      } else {
        setError(data.error || 'Failed to fetch sessions');
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      return;
    }

    setDeleting(sessionId);
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSessions(sessions.filter(s => s.id !== sessionId));
        toast.success('Session deleted successfully');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete session');
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    } finally {
      setDeleting(null);
    }
  };

  const formatTimeSaved = (timeRemoved: number): string => {
    const mins = Math.floor(timeRemoved / 60);
    const secs = Math.floor(timeRemoved % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredSessions = sessions.filter(session =>
    session.session_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    session.original_filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <AuthenticatedLayout>
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading your sessions...</p>
              </div>
            </div>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Link href="/dashboard">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
            
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Your Analysis Sessions
            </h1>
            <p className="text-gray-600 text-lg">
              Resume your video analysis work from where you left off
            </p>
          </div>

          {/* Search and Filters */}
          <Card className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 shadow-lg mb-8">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search sessions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <Button variant="outline" className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filter
              </Button>
            </div>
          </Card>

          {/* Error State */}
          {error && (
            <Card className="bg-red-50 border-red-200 p-6 mb-8">
              <p className="text-red-600">{error}</p>
              <Button 
                onClick={fetchSessions} 
                variant="outline" 
                className="mt-4"
              >
                Try Again
              </Button>
            </Card>
          )}

          {/* Sessions Grid */}
          {filteredSessions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSessions.map((session) => (
                <Card 
                  key={session.id}
                  className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 shadow-lg hover:shadow-xl transition-all group cursor-pointer"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 group-hover:text-purple-600 transition-colors line-clamp-2">
                          {session.session_name}
                        </h3>
                        <p className="text-sm text-gray-600 truncate">
                          {session.original_filename}
                        </p>
                      </div>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session.id);
                        }}
                        variant="outline"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:border-red-300"
                        disabled={deleting === session.id}
                      >
                        {deleting === session.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    {/* Video Preview Placeholder */}
                    <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                      <Video className="w-8 h-8 text-gray-400" />
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="text-gray-600">{session.formattedDuration}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-green-500" />
                        <span className="text-gray-600">{session.formattedUpdatedAt}</span>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Step {session.current_step}/3</span>
                        <span className="text-purple-600">
                          Saved {formatTimeSaved(session.timeRemoved)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-purple-600 h-2 rounded-full transition-all"
                          style={{ width: `${(session.current_step / 3) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Action */}
                    <Link href={`/session/${session.id}`} className="block">
                      <Button className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700">
                        <Play className="w-4 h-4 mr-2" />
                        Resume Session
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-white/80 backdrop-blur-xl rounded-2xl p-12 border border-gray-200 shadow-lg text-center">
              <FolderOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {searchTerm ? 'No sessions found' : 'No saved sessions yet'}
              </h3>
              <p className="text-gray-600 mb-6">
                {searchTerm 
                  ? 'Try adjusting your search terms'
                  : 'Start analyzing a video and save your session to see it here'
                }
              </p>
              {!searchTerm && (
                <Link href="/dashboard">
                  <Button className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700">
                    Start New Analysis
                  </Button>
                </Link>
              )}
            </Card>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
}