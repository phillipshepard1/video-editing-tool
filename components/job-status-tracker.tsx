/**
 * Job Status Tracker Component
 * Real-time tracking of video processing jobs
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Clock, CheckCircle, AlertCircle, X, RefreshCw, Eye, Download, 
  Upload, Database, Brain, Layers, Video, Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface JobStatus {
  id: string;
  title: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'retrying';
  current_stage: 'upload' | 'split_chunks' | 'store_chunks' | 'queue_analysis' | 'gemini_processing' | 'assemble_timeline' | 'render_video';
  progress_percentage: number;
  stage_progress: Record<string, any>;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
  result_data?: Record<string, any>;
}

interface Props {
  jobId: string;
  onJobComplete?: (job: JobStatus) => void;
  onJobFailed?: (job: JobStatus, error: string) => void;
  showLogs?: boolean;
  compact?: boolean;
  className?: string;
}

const stageNames = {
  upload: 'Upload & Validation',
  split_chunks: 'Splitting Video',
  store_chunks: 'Storing Chunks',
  queue_analysis: 'Preparing Analysis',
  gemini_processing: 'AI Analysis',
  assemble_timeline: 'Assembling Timeline',
  render_video: 'Rendering Video',
};

const stageIcons = {
  upload: Upload,
  split_chunks: Layers,
  store_chunks: Database,
  queue_analysis: Clock,
  gemini_processing: Brain,
  assemble_timeline: Video,
  render_video: Zap,
};

const statusColors = {
  pending: 'gray',
  queued: 'blue',
  processing: 'yellow',
  completed: 'green',
  failed: 'red',
  cancelled: 'gray',
  retrying: 'orange',
};

export function JobStatusTracker({
  jobId,
  onJobComplete,
  onJobFailed,
  showLogs = false,
  compact = false,
  className = '',
}: Props) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch job status
  const fetchJobStatus = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }
      const data = await response.json();
      
      if (data.success) {
        const newJob = data.job;
        setJob(newJob);
        
        // Check for completion or failure
        if (newJob.status === 'completed' && job?.status !== 'completed') {
          onJobComplete?.(newJob);
        } else if (newJob.status === 'failed' && job?.status !== 'failed') {
          onJobFailed?.(newJob, newJob.last_error || 'Job failed');
        }

        // Stop auto-refresh for terminal states
        if (['completed', 'failed', 'cancelled'].includes(newJob.status)) {
          setAutoRefresh(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch job');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch job logs
  const fetchJobLogs = async () => {
    if (!showLogs) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/logs?limit=20`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setLogs(data.logs);
        }
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchJobStatus();
    fetchJobLogs();
  }, [jobId]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchJobStatus();
      if (showLogs) fetchJobLogs();
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, showLogs]);

  const handleRefresh = () => {
    setIsLoading(true);
    fetchJobStatus();
    fetchJobLogs();
  };

  const handleCancel = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        await fetchJobStatus();
      }
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  if (isLoading && !job) {
    return (
      <div className={`animate-pulse space-y-4 ${className}`}>
        <div className="bg-gray-200 rounded-lg h-32"></div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-900">{error || 'Job not found'}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  const StageIcon = stageIcons[job.current_stage];
  const statusColor = statusColors[job.status];

  if (compact) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <StageIcon className="w-4 h-4 text-purple-500 mr-2" />
            <span className="font-medium text-gray-900">{job.title}</span>
          </div>
          <Badge variant={statusColor as any}>{job.status}</Badge>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{stageNames[job.current_stage]}</span>
          <span className="text-gray-600">{job.progress_percentage}%</span>
        </div>
        <Progress value={job.progress_percentage} className="h-1 mt-2" />
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <StageIcon className="w-5 h-5 text-purple-500 mr-2" />
            {job.title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={statusColor as any}>{job.status}</Badge>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Progress Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {stageNames[job.current_stage]}
            </span>
            <span className="text-sm text-gray-600">
              {job.progress_percentage}%
            </span>
          </div>
          <Progress value={job.progress_percentage} className="h-2" />
          
          {job.stage_progress[job.current_stage]?.message && (
            <p className="text-xs text-gray-500 mt-1">
              {job.stage_progress[job.current_stage].message}
            </p>
          )}
        </div>

        {/* Job Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Created:</span>
            <span className="ml-1 text-gray-900">
              {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Updated:</span>
            <span className="ml-1 text-gray-900">
              {formatDistanceToNow(new Date(job.updated_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* File Info */}
        {job.metadata && (
          <div className="bg-gray-50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-900 mb-2">File Information</h4>
            <div className="space-y-1 text-xs text-gray-600">
              {job.metadata.originalFileName && (
                <div>File: {job.metadata.originalFileName}</div>
              )}
              {job.metadata.fileSize && (
                <div>Size: {Math.round(job.metadata.fileSize / 1024 / 1024)} MB</div>
              )}
              {job.metadata.fileType && (
                <div>Type: {job.metadata.fileType}</div>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {job.status === 'completed' && job.result_data && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center mb-2">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <h4 className="text-sm font-medium text-green-900">Processing Complete</h4>
            </div>
            {job.result_data.gemini_processing?.totalSegments && (
              <p className="text-sm text-green-700">
                Found {job.result_data.gemini_processing.totalSegments} segments to edit
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline">
                <Eye className="w-4 h-4 mr-1" />
                View Results
              </Button>
              <Button size="sm" variant="outline">
                <Download className="w-4 h-4 mr-1" />
                Download
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {job.status === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center mb-2">
              <AlertCircle className="w-4 h-4 text-red-500 mr-2" />
              <h4 className="text-sm font-medium text-red-900">Processing Failed</h4>
            </div>
            {job.last_error && (
              <p className="text-sm text-red-700">{job.last_error}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t border-gray-200">
          <div className="flex gap-2">
            {showLogs && (
              <Button variant="outline" size="sm">
                View Logs
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {['pending', 'queued', 'processing', 'retrying'].includes(job.status) && (
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Logs */}
        {showLogs && logs.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Recent Logs</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {logs.slice(0, 10).map((log) => (
                <div key={log.id} className="text-xs">
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                    log.level === 'error' ? 'bg-red-500' : 
                    log.level === 'warn' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <span className="text-gray-500">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}:
                  </span>
                  <span className="ml-1 text-gray-700">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default JobStatusTracker;