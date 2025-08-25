'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  FileVideo, Clock, CheckCircle, XCircle, 
  Loader2, Download, Eye, Trash2, RefreshCw,
  Play, Edit, Sparkles
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Job {
  id: string;
  title: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed';
  current_stage: string;
  progress_percentage: number;
  created_at: string;
  completed_at?: string;
  metadata?: {
    originalFileName: string;
    originalFileSize: number;
    videoUrl?: string;
    videoPath?: string;
    uploadedAt?: string;
    fileType?: string;
    fileSize?: number;
  };
  result_data?: {
    gemini_processing?: {
      totalSegments: number;
      analysis?: any;
    };
    assemble_timeline?: {
      timeline?: any;
      success?: boolean;
      timeReduction?: number;
      segmentsToRemove?: number;
      reductionPercentage?: number;
    };
    render_video?: {
      outputVideoUrl: string;
    };
  };
  downloadUrl?: string;
}

interface JobListProps {
  onJobSelect?: (job: Job) => void;
  onJobDelete?: (jobId: string) => void;
}

export function JobList({ onJobSelect, onJobDelete }: JobListProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch jobs from API
  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/jobs');
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Poll for job updates
  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'processing': return 'text-blue-600 bg-blue-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'queued': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'processing': return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'failed': return <XCircle className="w-4 h-4" />;
      case 'queued': return <Clock className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setJobs(jobs.filter(j => j.id !== jobId));
        onJobDelete?.(jobId);
      }
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  };

  const handleDownload = (job: Job) => {
    if (job.downloadUrl || job.result_data?.render_video?.outputVideoUrl) {
      const url = job.downloadUrl || job.result_data?.render_video?.outputVideoUrl;
      const link = document.createElement('a');
      link.href = url!;
      link.download = `edited_${job.title}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center p-8">
        <FileVideo className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-500">No videos uploaded yet</p>
        <p className="text-sm text-gray-400 mt-2">Upload a video to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <Card 
          key={job.id} 
          className={`p-4 transition-all hover:shadow-md cursor-pointer ${
            job.status === 'completed' ? 'hover:border-green-300' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1">
              {/* Video Thumbnail */}
              <div className="w-20 h-12 bg-gray-100 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                {job.metadata?.thumbnail || job.metadata?.videoUrl ? (
                  <video 
                    className="w-full h-full object-cover"
                    src={job.metadata?.thumbnail || job.metadata?.videoUrl}
                    muted
                    playsInline
                    onMouseEnter={(e) => {
                      e.currentTarget.currentTime = 0;
                      e.currentTarget.play().catch(() => {});
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0;
                    }}
                  />
                ) : (
                  <FileVideo className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="font-medium text-gray-900 truncate">
                    {job.metadata?.originalFileName || job.title}
                  </h4>
                  <Badge 
                    variant="secondary" 
                    className={`${getStatusColor(job.status)} border-0`}
                  >
                    <span className="flex items-center space-x-1">
                      {getStatusIcon(job.status)}
                      <span>{job.status}</span>
                    </span>
                  </Badge>
                </div>
                
                <div className="flex items-center space-x-4 mt-1">
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </span>
                  {job.current_stage && job.status === 'processing' && (
                    <span className="text-xs text-blue-600 font-medium">
                      {job.current_stage.replace(/_/g, ' ')}
                    </span>
                  )}
                  {job.result_data?.gemini_processing?.totalSegments && (
                    <span className="text-xs text-gray-500">
                      {job.result_data.gemini_processing.totalSegments} segments found
                    </span>
                  )}
                </div>

                {job.status === 'processing' && (
                  <Progress 
                    value={job.progress_percentage} 
                    className="h-1 mt-2" 
                  />
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {(job.status === 'completed' || 
                (job.status === 'processing' && job.result_data?.assemble_timeline)) && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onJobSelect?.(job)}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Review & Edit
                  </Button>
                  
                  {(job.downloadUrl || job.result_data?.render_video?.outputVideoUrl) && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleDownload(job)}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  )}
                </>
              )}
              
              {job.status === 'failed' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchJobs()}
                  className="text-orange-600 hover:text-orange-700"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retry
                </Button>
              )}
              
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(job.id)}
                className="text-red-500 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}