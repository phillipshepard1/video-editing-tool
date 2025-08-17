'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';
import AuthenticatedLayout from '@/components/AuthenticatedLayout';
import { WorkflowManagerV2 } from '@/components/WorkflowManagerV2';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { EnhancedSegment, FilterState } from '@/lib/types/segments';
import { TakeCluster, ClusterSelection } from '@/lib/clustering';
import { generateFCPXML, generateEDL, generatePremiereXML, downloadFile } from '@/lib/export-formats';
import toast from 'react-hot-toast';

interface VideoSession {
  id: string;
  session_name: string;
  original_filename: string;
  video_url: string;
  video_duration: number;
  original_duration?: number;
  segments: EnhancedSegment[];
  clusters: TakeCluster[];
  cluster_selections: ClusterSelection[];
  filter_state?: FilterState;
  current_step: number;
  created_at: string;
  updated_at: string;
}

export default function SessionLoaderPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const videoRef = useRef<HTMLVideoElement>(null!);

  const [session, setSession] = useState<VideoSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<EnhancedSegment | null>(null);

  useEffect(() => {
    if (sessionId) {
      fetchSession();
    }
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json();

      if (response.ok) {
        setSession(data.session);
      } else {
        if (response.status === 404) {
          setError('Session not found. It may have been deleted or you may not have permission to access it.');
        } else {
          setError(data.error || 'Failed to load session');
        }
      }
    } catch (err) {
      console.error('Error fetching session:', err);
      setError('Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    router.push('/dashboard');
  };

  const handleExport = (format: 'edl' | 'fcpxml' | 'premiere', segmentsToRemove: EnhancedSegment[]) => {
    if (!session) return;

    if (format === 'edl') {
      const content = generateEDL(segmentsToRemove, session.video_duration, session.original_filename);
      downloadFile(content, `${session.original_filename}_edit.edl`, 'text/plain');
    } else if (format === 'fcpxml') {
      const content = generateFCPXML(segmentsToRemove, session.video_duration, session.original_filename);
      downloadFile(content, `${session.original_filename}_edit.fcpxml`, 'application/xml');
    } else if (format === 'premiere') {
      const content = generatePremiereXML(segmentsToRemove, session.video_duration, session.original_filename);
      downloadFile(content, `${session.original_filename}_edit.xml`, 'application/xml');
    }
  };

  if (loading) {
    return (
      <AuthenticatedLayout>
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading your session...</p>
              </div>
            </div>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (error) {
    return (
      <AuthenticatedLayout>
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <Link href="/sessions">
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Sessions
                  </Button>
                </Link>
              </div>
            </div>

            {/* Error Card */}
            <Card className="bg-white/80 backdrop-blur-xl rounded-2xl p-12 border border-red-200 shadow-lg text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Unable to Load Session
              </h3>
              <p className="text-gray-600 mb-6">
                {error}
              </p>
              <div className="flex justify-center gap-4">
                <Button 
                  onClick={fetchSession} 
                  variant="outline"
                >
                  Try Again
                </Button>
                <Link href="/sessions">
                  <Button>
                    Back to Sessions
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!session) {
    return (
      <AuthenticatedLayout>
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Card className="bg-white/80 backdrop-blur-xl rounded-2xl p-12 border border-gray-200 shadow-lg text-center">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Session not found
              </h3>
              <p className="text-gray-600 mb-6">
                The requested session could not be found.
              </p>
              <Link href="/sessions">
                <Button>
                  Back to Sessions
                </Button>
              </Link>
            </Card>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="container mx-auto py-8 px-4 max-w-[1600px]">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <Link href="/sessions">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Sessions
                </Button>
              </Link>
            </div>
            
            {/* Session Info */}
            <Card className="bg-white/80 backdrop-blur-xl rounded-2xl p-4 border border-gray-200 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{session.session_name}</h1>
                  <p className="text-gray-600">{session.original_filename}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Last updated</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(session.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Workflow Manager */}
          <WorkflowManagerV2
            segments={session.segments}
            videoUrl={session.video_url}
            videoDuration={session.video_duration}
            onExport={handleExport}
            onNewAnalysis={handleBackToDashboard}
            originalDuration={session.original_duration || session.video_duration}
            videoRef={videoRef}
            onSegmentSelect={setSelectedSegment}
            originalFilename={session.original_filename}
          />

          {/* Hidden video element for video operations */}
          <video
            ref={videoRef}
            className="hidden"
            controls
            preload="metadata"
          >
            <source src={session.video_url} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </main>
    </AuthenticatedLayout>
  );
}