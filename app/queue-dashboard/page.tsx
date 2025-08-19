/**
 * Queue-based Dashboard Page
 * New dashboard using the job queue system
 */

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../src/contexts/AuthContext';
import AuthenticatedLayout from '@/components/AuthenticatedLayout';
import { JobVideoUploader } from '@/components/job-video-uploader';
import { RealtimeJobTracker } from '@/components/realtime-job-tracker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Video, Clock, TrendingUp, BarChart3, Zap, Settings,
  Play, Pause, Activity, Users, Server
} from 'lucide-react';

interface QueueStats {
  total: number;
  by_stage: Record<string, number>;
  by_priority: Record<string, number>;
  processing: number;
  pending_retry: number;
}

interface SystemHealth {
  totalWorkers: number;
  runningWorkers: number;
  healthyWorkers: number;
  workersByStage: Record<string, number>;
  systemUptime: number;
  lastHealthCheck: string;
}

export default function QueueDashboard() {
  const { user } = useAuth();
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [isLoading, setIsLoading] = useState(true);

  // Get user display name
  const displayName = user?.user_metadata?.full_name || 
                     user?.email?.split('@')[0] || 
                     'there';

  // Fetch queue statistics
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/queue/stats');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setQueueStats(data.queue);
          setSystemHealth(data.system);
        }
      }
    } catch (error) {
      console.error('Failed to fetch queue stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleJobCreated = (job: any) => {
    console.log('New job created:', job);
    setActiveTab('jobs');
    fetchStats();
  };

  const handleJobComplete = (job: any) => {
    console.log('Job completed:', job);
    fetchStats();
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <AuthenticatedLayout>
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Welcome to the new queue system, {displayName}! 🚀
            </h1>
            <p className="text-gray-600 text-lg">
              Experience faster, more reliable video processing with our production-ready queue architecture
            </p>
          </div>

          {/* System Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="bg-white/80 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Activity className="w-8 h-8 text-purple-500" />
                  <span className="text-2xl font-bold text-gray-900">
                    {queueStats?.total || 0}
                  </span>
                </div>
                <p className="text-gray-600 text-sm">Jobs in Queue</p>
              </CardContent>
            </Card>
            
            <Card className="bg-white/80 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Play className="w-8 h-8 text-green-500" />
                  <span className="text-2xl font-bold text-gray-900">
                    {queueStats?.processing || 0}
                  </span>
                </div>
                <p className="text-gray-600 text-sm">Processing Now</p>
              </CardContent>
            </Card>
            
            <Card className="bg-white/80 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Server className="w-8 h-8 text-blue-500" />
                  <span className="text-2xl font-bold text-gray-900">
                    {systemHealth?.runningWorkers || 0}/{systemHealth?.totalWorkers || 0}
                  </span>
                </div>
                <p className="text-gray-600 text-sm">Active Workers</p>
              </CardContent>
            </Card>
            
            <Card className="bg-white/80 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Clock className="w-8 h-8 text-pink-500" />
                  <span className="text-2xl font-bold text-gray-900">
                    {systemHealth ? formatUptime(systemHealth.systemUptime) : '0s'}
                  </span>
                </div>
                <p className="text-gray-600 text-sm">System Uptime</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Upload Video
              </TabsTrigger>
              <TabsTrigger value="jobs" className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Processing Jobs
              </TabsTrigger>
              <TabsTrigger value="system" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                System Status
              </TabsTrigger>
            </TabsList>

            {/* Upload Tab */}
            <TabsContent value="upload">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Upload Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mr-4">
                        <Zap className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Start New Project</h2>
                        <p className="text-gray-600">Upload your video for AI-powered analysis</p>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <JobVideoUploader
                      onJobCreated={handleJobCreated}
                      userId={user?.id}
                      options={{
                        priority: 'normal',
                        processingOptions: {
                          quality: 'medium',
                          chunkSize: 50 * 1024 * 1024, // 50MB chunks
                        },
                        metadata: {
                          source: 'dashboard',
                          version: '2.0',
                        },
                      }}
                    />
                  </CardContent>
                </Card>

                {/* Features Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>New Queue System Benefits</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                        <Activity className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <h4 className="text-gray-900 font-medium mb-1">Reliable Processing</h4>
                        <p className="text-gray-600 text-sm">Jobs are queued safely with automatic retry on failure</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                        <Server className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <h4 className="text-gray-900 font-medium mb-1">Scalable Architecture</h4>
                        <p className="text-gray-600 text-sm">Multiple workers handle concurrent processing</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                        <Clock className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-gray-900 font-medium mb-1">Real-time Updates</h4>
                        <p className="text-gray-600 text-sm">Live progress tracking with Supabase subscriptions</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                        <BarChart3 className="w-4 h-4 text-pink-600" />
                      </div>
                      <div>
                        <h4 className="text-gray-900 font-medium mb-1">Better Performance</h4>
                        <p className="text-gray-600 text-sm">Optimized chunk storage and processing pipeline</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Jobs Tab */}
            <TabsContent value="jobs">
              <RealtimeJobTracker
                userId={user?.id}
                onJobComplete={handleJobComplete}
                maxJobs={20}
                showCompleted={true}
              />
            </TabsContent>

            {/* System Tab */}
            <TabsContent value="system">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Queue Statistics */}
                <Card>
                  <CardHeader>
                    <CardTitle>Queue Statistics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {queueStats ? (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">By Stage</h4>
                          <div className="space-y-2">
                            {Object.entries(queueStats.by_stage).map(([stage, count]) => (
                              count > 0 && (
                                <div key={stage} className="flex items-center justify-between">
                                  <span className="text-sm text-gray-600 capitalize">
                                    {stage.replace(/_/g, ' ')}
                                  </span>
                                  <Badge variant="outline">{count}</Badge>
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">By Priority</h4>
                          <div className="space-y-2">
                            {Object.entries(queueStats.by_priority).map(([priority, count]) => (
                              count > 0 && (
                                <div key={priority} className="flex items-center justify-between">
                                  <span className="text-sm text-gray-600 capitalize">{priority}</span>
                                  <Badge variant={priority === 'urgent' ? 'red' : priority === 'high' ? 'orange' : 'gray'}>
                                    {count}
                                  </Badge>
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Activity className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600">Loading queue statistics...</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* System Health */}
                <Card>
                  <CardHeader>
                    <CardTitle>System Health</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {systemHealth ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">System Status</span>
                          <Badge variant={systemHealth.healthyWorkers >= systemHealth.totalWorkers * 0.8 ? 'green' : 'yellow'}>
                            {systemHealth.healthyWorkers >= systemHealth.totalWorkers * 0.8 ? 'Healthy' : 'Degraded'}
                          </Badge>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Workers by Stage</h4>
                          <div className="space-y-2">
                            {Object.entries(systemHealth.workersByStage).map(([stage, count]) => (
                              count > 0 && (
                                <div key={stage} className="flex items-center justify-between">
                                  <span className="text-sm text-gray-600 capitalize">
                                    {stage.replace(/_/g, ' ')}
                                  </span>
                                  <Badge variant="blue">{count}</Badge>
                                </div>
                              )
                            ))}
                          </div>
                        </div>

                        <div className="pt-4 border-t border-gray-200">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Total Workers:</span>
                              <span className="ml-1 font-medium">{systemHealth.totalWorkers}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Running:</span>
                              <span className="ml-1 font-medium text-green-600">{systemHealth.runningWorkers}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Healthy:</span>
                              <span className="ml-1 font-medium text-blue-600">{systemHealth.healthyWorkers}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Uptime:</span>
                              <span className="ml-1 font-medium">{formatUptime(systemHealth.systemUptime)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Server className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600">Loading system health...</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </AuthenticatedLayout>
  );
}