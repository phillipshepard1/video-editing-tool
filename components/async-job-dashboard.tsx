'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

interface Job {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'retrying';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  current_stage: 'upload' | 'split_chunks' | 'store_chunks' | 'queue_analysis' | 'gemini_processing' | 'assemble_timeline' | 'render_video';
  progress_percentage: number;
  stage_progress: Record<string, any>;
  metadata: {
    originalFileName: string;
    fileSize: number;
    needsChunking?: boolean;
  };
  retry_count: number;
  max_retries: number;
  last_error?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  result_data?: any;
}

interface WorkerStats {
  success: boolean;
  running: boolean;
  health?: {
    totalWorkers: number;
    runningWorkers: number;
    healthyWorkers: number;
    workersByStage: Record<string, number>;
    systemUptime: number;
  };
  workers?: Array<{
    workerId: string;
    stage: string;
    running: boolean;
    healthy: boolean;
    stats: {
      jobsProcessed: number;
      jobsFailed: number;
      activeJobs: number;
    };
  }>;
}

interface AsyncJobDashboardProps {
  refreshInterval?: number;
}

export default function AsyncJobDashboard({ refreshInterval = 5000 }: AsyncJobDashboardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workerStats, setWorkerStats] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [jobLogs, setJobLogs] = useState<any[]>([]);
  const [retryOptions, setRetryOptions] = useState<any>(null);

  // Supabase client for real-time updates
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/jobs');
      if (!response.ok) throw new Error('Failed to fetch jobs');
      
      const data = await response.json();
      setJobs(data.jobs || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
    }
  }, []);

  const fetchWorkerStats = useCallback(async () => {
    try {
      const response = await fetch('/api/workers');
      if (response.ok) {
        const data = await response.json();
        setWorkerStats(data);
      }
    } catch (err) {
      console.error('Error fetching worker stats:', err);
    }
  }, []);

  const startWorkers = async () => {
    try {
      const response = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      
      if (response.ok) {
        await fetchWorkerStats();
        alert('Workers started successfully!');
      } else {
        const data = await response.json();
        alert(`Failed to start workers: ${data.error}`);
      }
    } catch (err) {
      alert(`Error starting workers: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const stopWorkers = async () => {
    try {
      const response = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      
      if (response.ok) {
        await fetchWorkerStats();
        alert('Workers stopped successfully!');
      } else {
        const data = await response.json();
        alert(`Failed to stop workers: ${data.error}`);
      }
    } catch (err) {
      alert(`Error stopping workers: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const fetchJobDetails = async (jobId: string) => {
    try {
      // Fetch job logs
      const logsResponse = await fetch(`/api/jobs/${jobId}/logs`);
      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        setJobLogs(logsData.logs || []);
      }

      // Fetch retry options if job failed
      const job = jobs.find(j => j.id === jobId);
      if (job && job.status === 'failed') {
        const retryResponse = await fetch(`/api/jobs/${jobId}/retry`);
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          setRetryOptions(retryData);
        }
      }
    } catch (err) {
      console.error('Error fetching job details:', err);
    }
  };

  const retryJob = async (jobId: string, recoveryAction: string, parameters: any = {}) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryAction, parameters })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Job retry initiated: ${data.message}`);
        fetchJobs(); // Refresh jobs list
        setRetryOptions(null);
      } else {
        const data = await response.json();
        alert(`Failed to retry job: ${data.error}`);
      }
    } catch (err) {
      alert(`Error retrying job: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Initialize data
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchJobs(), fetchWorkerStats()]);
      setLoading(false);
    };
    init();
  }, [fetchJobs, fetchWorkerStats]);

  // Set up real-time subscriptions
  useEffect(() => {
    const subscription = supabase
      .channel('job_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'processing_jobs'
      }, (payload) => {
        console.log('Job update:', payload);
        fetchJobs(); // Refresh jobs when any job changes
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchJobs, supabase]);

  // Set up polling for worker stats
  useEffect(() => {
    const interval = setInterval(fetchWorkerStats, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchWorkerStats, refreshInterval]);

  // Handle job selection
  useEffect(() => {
    if (selectedJob) {
      fetchJobDetails(selectedJob);
    }
  }, [selectedJob, jobs]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'processing': return 'text-blue-600 bg-blue-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'pending': case 'queued': return 'text-yellow-600 bg-yellow-50';
      case 'retrying': return 'text-orange-600 bg-orange-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStageDisplay = (stage: string) => {
    const stageNames: Record<string, string> = {
      'upload': 'Upload',
      'split_chunks': 'Chunking',
      'store_chunks': 'Storage',
      'queue_analysis': 'Queuing',
      'gemini_processing': 'AI Analysis',
      'assemble_timeline': 'Timeline',
      'render_video': 'Rendering'
    };
    return stageNames[stage] || stage;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
    return `${Math.round(bytes / 1024)}KB`;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-lg">Loading jobs...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Video Processing Jobs</h1>
          <p className="text-gray-600">Monitor and manage video processing jobs</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={fetchJobs}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Refresh Jobs
          </button>
        </div>
      </div>

      {/* Worker Stats */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Worker System</h2>
          <div className="flex gap-2">
            {workerStats?.running ? (
              <button
                onClick={stopWorkers}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                Stop Workers
              </button>
            ) : (
              <button
                onClick={startWorkers}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Start Workers
              </button>
            )}
          </div>
        </div>

        {workerStats ? (
          workerStats.running ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center p-3 bg-green-50 rounded">
                <div className="font-semibold text-green-800">
                  {workerStats.health?.runningWorkers || 0}/{workerStats.health?.totalWorkers || 0}
                </div>
                <div className="text-green-600">Workers Running</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded">
                <div className="font-semibold text-blue-800">
                  {workerStats.health?.healthyWorkers || 0}
                </div>
                <div className="text-blue-600">Healthy Workers</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded">
                <div className="font-semibold text-purple-800">
                  {workerStats.health?.systemUptime ? formatDuration(workerStats.health.systemUptime) : '0s'}
                </div>
                <div className="text-purple-600">System Uptime</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="font-semibold text-gray-800">
                  {workerStats.workers?.reduce((sum, w) => sum + w.stats.jobsProcessed, 0) || 0}
                </div>
                <div className="text-gray-600">Jobs Processed</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>Worker system is not running</p>
              <p className="text-sm">Click "Start Workers" to begin processing jobs</p>
            </div>
          )
        ) : (
          <div className="text-center py-4 text-gray-500">
            Loading worker status...
          </div>
        )}
      </div>

      {/* Jobs List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Processing Jobs ({jobs.length})</h2>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-400">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="divide-y divide-gray-200">
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No jobs found</p>
              <p className="text-sm">Upload a video to create your first processing job</p>
            </div>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                className={`p-4 hover:bg-gray-50 cursor-pointer ${selectedJob === job.id ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-gray-900 truncate">
                        {job.title}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                        {job.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">
                        {getStageDisplay(job.current_stage)}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                      <span>{formatFileSize(job.metadata.fileSize)}</span>
                      <span>•</span>
                      <span>{job.metadata.originalFileName}</span>
                      {job.metadata.needsChunking && (
                        <>
                          <span>•</span>
                          <span className="text-orange-600">Chunked</span>
                        </>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${job.progress_percentage}%` }}
                      ></div>
                    </div>

                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>{job.progress_percentage}% complete</span>
                      <span>
                        Created {new Date(job.created_at).toLocaleDateString()} {new Date(job.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <div className="ml-4 flex flex-col items-end gap-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      job.priority === 'high' ? 'bg-red-100 text-red-700' :
                      job.priority === 'normal' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {job.priority.toUpperCase()}
                    </span>
                    
                    {job.status === 'failed' && job.retry_count < job.max_retries && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          retryJob(job.id, 'retry');
                        }}
                        className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {selectedJob === job.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                    {/* Stage Progress */}
                    {job.stage_progress && Object.keys(job.stage_progress).length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Current Stage Details</h4>
                        <div className="bg-gray-50 rounded p-3 text-sm">
                          <pre className="whitespace-pre-wrap text-gray-700">
                            {JSON.stringify(job.stage_progress, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Error Info */}
                    {job.last_error && (
                      <div>
                        <h4 className="font-medium text-sm text-red-700 mb-2">Last Error</h4>
                        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                          {job.last_error}
                        </div>
                      </div>
                    )}

                    {/* Retry Options */}
                    {retryOptions && job.status === 'failed' && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Recovery Options</h4>
                        <div className="space-y-2">
                          {retryOptions.recoverySuggestions?.map((option: any, index: number) => (
                            <button
                              key={index}
                              onClick={() => retryJob(job.id, option.action, option.parameters)}
                              className="block w-full text-left p-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded text-sm"
                            >
                              <div className="font-medium text-orange-800">
                                {option.action.replace('_', ' ').toUpperCase()}: {option.description}
                              </div>
                              <div className="text-orange-600 text-xs mt-1">
                                Success rate: {Math.round(option.estimatedSuccessRate * 100)}%
                                {option.estimatedTime && ` • Est. time: ${option.estimatedTime}`}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent Logs */}
                    {jobLogs.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Recent Logs</h4>
                        <div className="bg-gray-50 rounded max-h-40 overflow-y-auto">
                          {jobLogs.slice(0, 10).map((log, index) => (
                            <div key={index} className={`p-2 text-xs border-b border-gray-200 last:border-b-0 ${
                              log.level === 'error' ? 'text-red-700 bg-red-50' :
                              log.level === 'warn' ? 'text-yellow-700 bg-yellow-50' :
                              'text-gray-700'
                            }`}>
                              <div className="flex justify-between">
                                <span className="font-medium">[{log.level.toUpperCase()}] {log.message}</span>
                                <span className="text-gray-500">
                                  {new Date(log.created_at).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Job Results */}
                    {job.result_data && job.status === 'completed' && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Results</h4>
                        <div className="bg-green-50 rounded p-3 text-sm">
                          <pre className="whitespace-pre-wrap text-green-700">
                            {JSON.stringify(job.result_data, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}