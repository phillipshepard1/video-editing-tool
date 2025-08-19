/**
 * Real-time Job Tracker Component
 * Uses Supabase subscriptions for live updates
 */

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { JobStatusTracker, JobStatus } from './job-status-tracker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, CheckCircle, AlertCircle, RefreshCw, Trash2,
  Play, Pause, Volume2, VolumeX 
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  userId?: string;
  onJobComplete?: (job: JobStatus) => void;
  maxJobs?: number;
  showCompleted?: boolean;
  className?: string;
}

export function RealtimeJobTracker({
  userId,
  onJobComplete,
  maxJobs = 10,
  showCompleted = true,
  className = '',
}: Props) {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [subscription, setSubscription] = useState<any>(null);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch initial jobs
  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      params.set('limit', maxJobs.toString());

      const response = await fetch(`/api/jobs?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }

      const data = await response.json();
      if (data.success) {
        let jobsList = data.jobs;
        
        if (!showCompleted) {
          jobsList = jobsList.filter((job: JobStatus) => 
            !['completed', 'failed', 'cancelled'].includes(job.status)
          );
        }
        
        setJobs(jobsList);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setIsLoading(false);
    }
  };

  // Set up real-time subscription
  const setupSubscription = () => {
    if (subscription) {
      subscription.unsubscribe();
    }

    // Subscribe to job changes
    const channel = supabase
      .channel('job-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'processing_jobs',
        // Filter by user if provided
        ...(userId && { filter: `user_id=eq.${userId}` }),
      }, (payload: any) => {
        handleJobUpdate(payload);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'job_logs',
      }, (payload: any) => {
        handleLogUpdate(payload);
      })
      .subscribe();

    setSubscription(channel);
  };

  const handleJobUpdate = (payload: any) => {
    const { eventType, new: newJob, old: oldJob } = payload;

    setJobs(prevJobs => {
      let updatedJobs = [...prevJobs];

      switch (eventType) {
        case 'INSERT':
          // Add new job
          if (!updatedJobs.find(job => job.id === newJob.id)) {
            updatedJobs.unshift(newJob);
            playNotificationSound('new');
          }
          break;

        case 'UPDATE':
          // Update existing job
          const index = updatedJobs.findIndex(job => job.id === newJob.id);
          if (index !== -1) {
            const wasCompleted = oldJob?.status === 'completed';
            const isNowCompleted = newJob.status === 'completed';
            const wasFailed = oldJob?.status === 'failed';
            const isNowFailed = newJob.status === 'failed';

            updatedJobs[index] = newJob;

            // Handle completion
            if (!wasCompleted && isNowCompleted) {
              onJobComplete?.(newJob);
              playNotificationSound('complete');
            }

            // Handle failure
            if (!wasFailed && isNowFailed) {
              playNotificationSound('error');
            }
          }
          break;

        case 'DELETE':
          // Remove job
          updatedJobs = updatedJobs.filter(job => job.id !== oldJob.id);
          break;
      }

      // Filter completed jobs if not showing them
      if (!showCompleted) {
        updatedJobs = updatedJobs.filter(job => 
          !['completed', 'failed', 'cancelled'].includes(job.status)
        );
      }

      // Limit number of jobs
      return updatedJobs.slice(0, maxJobs);
    });
  };

  const handleLogUpdate = (payload: any) => {
    const { new: newLog } = payload;
    
    // Update the job with new log (optional - for immediate log display)
    setJobs(prevJobs => 
      prevJobs.map(job => 
        job.id === newLog.job_id 
          ? { ...job, updated_at: new Date().toISOString() }
          : job
      )
    );
  };

  const playNotificationSound = (type: 'new' | 'complete' | 'error') => {
    if (!soundEnabled) return;

    // Create simple notification sounds using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    switch (type) {
      case 'new':
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        break;
      case 'complete':
        oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.2);
        break;
      case 'error':
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        break;
    }
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  // Initialize
  useEffect(() => {
    fetchJobs();
    setupSubscription();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [userId, maxJobs, showCompleted]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [subscription]);

  const handleRefresh = () => {
    fetchJobs();
  };

  const handleClearCompleted = async () => {
    const completedJobs = jobs.filter(job => 
      ['completed', 'failed', 'cancelled'].includes(job.status)
    );

    for (const job of completedJobs) {
      try {
        await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete job:', err);
      }
    }

    // Remove from local state immediately
    setJobs(prevJobs => 
      prevJobs.filter(job => 
        !['completed', 'failed', 'cancelled'].includes(job.status)
      )
    );
  };

  const getStatusSummary = () => {
    const summary = jobs.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return summary;
  };

  if (isLoading) {
    return (
      <div className={`animate-pulse space-y-4 ${className}`}>
        <div className="bg-gray-200 rounded-lg h-32"></div>
        <div className="bg-gray-200 rounded-lg h-24"></div>
        <div className="bg-gray-200 rounded-lg h-24"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <span className="text-red-900">{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusSummary = getStatusSummary();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Clock className="w-5 h-5 text-purple-500 mr-2" />
              Processing Jobs ({jobs.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSoundEnabled(!soundEnabled)}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              {statusSummary.completed > 0 && (
                <Button variant="outline" size="sm" onClick={handleClearCompleted}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear Completed
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Status summary */}
        {Object.keys(statusSummary).length > 0 && (
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusSummary).map(([status, count]) => (
                <Badge key={status} variant="outline">
                  {status}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Job list */}
      {jobs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Processing Jobs
            </h3>
            <p className="text-gray-600">
              Upload a video to start processing
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobStatusTracker
              key={job.id}
              jobId={job.id}
              onJobComplete={onJobComplete}
              showLogs={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default RealtimeJobTracker;