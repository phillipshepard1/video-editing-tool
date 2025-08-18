'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Settings, 
  Zap, 
  FileVideo, 
  Activity,
  RefreshCw,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { getVideoProcessor } from '@/lib/services/video-processor';
import { getErrorHandler } from '@/lib/services/error-handler';
import { QUALITY_PRESETS } from '@/lib/services/chillin';

interface SystemHealth {
  processor: {
    initialized: boolean;
    status: 'healthy' | 'warning' | 'error';
    supportedFormats: number;
    lastError?: string;
  };
  errorHandler: {
    totalErrors: number;
    recentErrors: number;
    recoveryRate: number;
    categories: Record<string, number>;
  };
  browser: {
    compatible: boolean;
    features: Record<string, boolean>;
    memoryUsage?: number;
  };
  performance: {
    averageProcessingTime: number;
    successRate: number;
    lastProcessedVideo?: {
      name: string;
      size: number;
      duration: number;
      result: 'success' | 'conversion' | 'chunking' | 'error';
    };
  };
}

export function VideoProcessingStatus() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const checkSystemHealth = async () => {
    setLoading(true);
    
    try {
      const processor = getVideoProcessor();
      const errorHandler = getErrorHandler();
      
      // Check processor status
      let processorHealth;
      try {
        await processor.initialize();
        const formats = processor.getSupportedFormats();
        
        processorHealth = {
          initialized: true,
          status: 'healthy' as const,
          supportedFormats: formats.supported.length,
        };
      } catch (error) {
        processorHealth = {
          initialized: false,
          status: 'error' as const,
          supportedFormats: 0,
          lastError: error instanceof Error ? error.message : String(error)
        };
      }
      
      // Get error handler stats
      const errorStats = errorHandler.getErrorStats();
      const recentErrors = errorHandler.getRecentErrors(10);
      
      // Check browser compatibility
      const browserCompatible = {
        webAssembly: typeof WebAssembly !== 'undefined',
        sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
        indexedDB: typeof indexedDB !== 'undefined',
        worker: typeof Worker !== 'undefined',
        performanceMemory: 'memory' in performance,
      };
      
      const compatible = browserCompatible.webAssembly && browserCompatible.indexedDB;
      
      // Get memory usage if available
      let memoryUsage;
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        memoryUsage = memory.usedJSHeapSize / memory.totalJSHeapSize;
      }
      
      // Mock performance data (in real app, this would come from stored metrics)
      const performanceData = {
        averageProcessingTime: 45000, // 45 seconds average
        successRate: 0.92, // 92% success rate
        lastProcessedVideo: {
          name: 'sample_video.mp4',
          size: 156 * 1024 * 1024, // 156MB
          duration: 180, // 3 minutes
          result: 'success' as const
        }
      };
      
      const systemHealth: SystemHealth = {
        processor: processorHealth,
        errorHandler: {
          totalErrors: errorStats.total,
          recentErrors: recentErrors.length,
          recoveryRate: errorStats.recoverySuccessRate,
          categories: errorStats.byCategory
        },
        browser: {
          compatible,
          features: browserCompatible,
          memoryUsage
        },
        performance: performanceData
      };
      
      setHealth(systemHealth);
      setLastUpdate(new Date());
      
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSystemHealth();
    
    // Update health every 30 seconds
    const interval = setInterval(checkSystemHealth, 30000);
    
    return () => clearInterval(interval);
  }, []);

  if (!health) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center space-x-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Checking system health...</span>
        </div>
      </Card>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="w-5 h-5" />;
      case 'warning': return <AlertTriangle className="w-5 h-5" />;
      case 'error': return <AlertCircle className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <FileVideo className="w-6 h-6 text-purple-600" />
          <div>
            <h2 className="text-xl font-semibold">Video Processing System</h2>
            <p className="text-sm text-gray-600">
              Last updated: {lastUpdate?.toLocaleTimeString() || 'Never'}
            </p>
          </div>
        </div>
        <Button
          onClick={checkSystemHealth}
          variant="outline"
          size="sm"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <div className={getStatusColor(health.processor.status)}>
              {getStatusIcon(health.processor.status)}
            </div>
            <div>
              <p className="font-medium">Processor</p>
              <p className="text-sm text-gray-600 capitalize">{health.processor.status}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-medium">{health.processor.supportedFormats}</p>
              <p className="text-sm text-gray-600">Formats</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium">{(health.performance.successRate * 100).toFixed(1)}%</p>
              <p className="text-sm text-gray-600">Success Rate</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-purple-600" />
            <div>
              <p className="font-medium">{Math.round(health.performance.averageProcessingTime / 1000)}s</p>
              <p className="text-sm text-gray-600">Avg Time</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Detailed Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Processor Status */}
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            Video Processor
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span>Initialization</span>
              <Badge variant={health.processor.initialized ? 'default' : 'destructive'}>
                {health.processor.initialized ? 'Ready' : 'Failed'}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Supported Formats</span>
              <span className="font-mono">{health.processor.supportedFormats}</span>
            </div>
            
            {health.processor.lastError && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-sm text-red-700">
                  <strong>Last Error:</strong> {health.processor.lastError}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Browser Compatibility */}
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            Browser Compatibility
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span>Overall Status</span>
              <Badge variant={health.browser.compatible ? 'default' : 'destructive'}>
                {health.browser.compatible ? 'Compatible' : 'Issues'}
              </Badge>
            </div>
            
            {Object.entries(health.browser.features).map(([feature, supported]) => (
              <div key={feature} className="flex items-center justify-between text-sm">
                <span className="capitalize">{feature.replace(/([A-Z])/g, ' $1')}</span>
                <span className={supported ? 'text-green-600' : 'text-red-600'}>
                  {supported ? '✓' : '✗'}
                </span>
              </div>
            ))}
            
            {health.browser.memoryUsage !== undefined && (
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Memory Usage</span>
                  <span>{(health.browser.memoryUsage * 100).toFixed(1)}%</span>
                </div>
                <Progress value={health.browser.memoryUsage * 100} className="h-2" />
              </div>
            )}
          </div>
        </Card>

        {/* Error Statistics */}
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2" />
            Error Statistics
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span>Total Errors</span>
              <span className="font-mono">{health.errorHandler.totalErrors}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Recent Errors</span>
              <span className="font-mono">{health.errorHandler.recentErrors}</span>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-1">
                <span>Recovery Rate</span>
                <span>{(health.errorHandler.recoveryRate * 100).toFixed(1)}%</span>
              </div>
              <Progress value={health.errorHandler.recoveryRate * 100} className="h-2" />
            </div>
            
            {Object.entries(health.errorHandler.categories).length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Error Categories:</p>
                {Object.entries(health.errorHandler.categories).map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{category}</span>
                    <span className="font-mono">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Performance Metrics */}
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2" />
            Performance
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span>Success Rate</span>
              <div className="flex items-center space-x-2">
                <span>{(health.performance.successRate * 100).toFixed(1)}%</span>
                <div className="w-16">
                  <Progress value={health.performance.successRate * 100} className="h-2" />
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Avg Processing Time</span>
              <span>{Math.round(health.performance.averageProcessingTime / 1000)}s</span>
            </div>
            
            {health.performance.lastProcessedVideo && (
              <div className="bg-gray-50 border rounded p-3">
                <p className="text-sm font-medium mb-1">Last Processed:</p>
                <p className="text-sm text-gray-700">
                  {health.performance.lastProcessedVideo.name}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-600 mt-1">
                  <span>
                    {(health.performance.lastProcessedVideo.size / (1024 * 1024)).toFixed(1)}MB
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {health.performance.lastProcessedVideo.result}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quality Presets Info */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Available Quality Presets</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(QUALITY_PRESETS).map(([key, preset]) => (
            <div key={key} className="border rounded p-3">
              <p className="font-medium capitalize">{key}</p>
              <p className="text-sm text-gray-600 mb-2">{preset.description}</p>
              <div className="text-xs text-gray-500">
                <p>Max: {preset.maxWidth}p</p>
                <p>FPS: {preset.fps}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default VideoProcessingStatus;
