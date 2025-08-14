'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Info, Cpu, HardDrive, Globe, X } from 'lucide-react';

interface BrowserCompatibility {
  ffmpeg: boolean;
  webCodecs: boolean;
  webGL: boolean;
  indexedDB: boolean;
  serviceWorker: boolean;
  memory: boolean;
  overall: 'full' | 'partial' | 'unsupported';
}

interface MemoryStats {
  used: number;
  total: number;
  percentage: number;
  status: 'healthy' | 'warning' | 'critical';
}

export function BrowserCompatibilityAlert() {
  const [compatibility, setCompatibility] = useState<BrowserCompatibility | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkCompatibility();
  }, []);

  const checkCompatibility = () => {
    const compat: BrowserCompatibility = {
      ffmpeg: typeof WebAssembly !== 'undefined',
      webCodecs: 'VideoEncoder' in window && 'VideoDecoder' in window,
      webGL: !!document.createElement('canvas').getContext('webgl2'),
      indexedDB: 'indexedDB' in window,
      serviceWorker: 'serviceWorker' in navigator,
      memory: 'memory' in performance,
      overall: 'full'
    };

    // Determine overall compatibility
    const critical = [compat.ffmpeg, compat.indexedDB];
    const important = [compat.webCodecs, compat.webGL];
    
    if (critical.some(c => !c)) {
      compat.overall = 'unsupported';
    } else if (important.some(c => !c)) {
      compat.overall = 'partial';
    }

    setCompatibility(compat);
  };

  if (!compatibility || dismissed) return null;

  const getAlertStyle = () => {
    switch (compatibility.overall) {
      case 'unsupported':
        return 'bg-red-50 border-red-200';
      case 'partial':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-green-50 border-green-200';
    }
  };

  const getIcon = () => {
    switch (compatibility.overall) {
      case 'unsupported':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'partial':
        return <Info className="w-5 h-5 text-yellow-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
  };

  const getMessage = () => {
    switch (compatibility.overall) {
      case 'unsupported':
        return 'Your browser lacks critical features for video processing. Please use Chrome, Edge, or Firefox.';
      case 'partial':
        return 'Your browser has limited support. Some features may not work optimally.';
      default:
        return 'Your browser is fully compatible with all video processing features.';
    }
  };

  return (
    <div className={`relative p-4 rounded-lg border ${getAlertStyle()} mb-6`}>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
      >
        <X className="w-4 h-4" />
      </button>
      
      <div className="flex items-start space-x-3">
        {getIcon()}
        <div className="flex-1">
          <p className="font-medium text-sm">{getMessage()}</p>
          
          {compatibility.overall !== 'full' && (
            <details className="mt-2">
              <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                View compatibility details
              </summary>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center space-x-2">
                  {compatibility.ffmpeg ? '✅' : '❌'}
                  <span>WebAssembly (Required for video processing)</span>
                </div>
                <div className="flex items-center space-x-2">
                  {compatibility.webCodecs ? '✅' : '⚠️'}
                  <span>WebCodecs API (Hardware acceleration)</span>
                </div>
                <div className="flex items-center space-x-2">
                  {compatibility.webGL ? '✅' : '⚠️'}
                  <span>WebGL2 (GPU acceleration)</span>
                </div>
                <div className="flex items-center space-x-2">
                  {compatibility.indexedDB ? '✅' : '❌'}
                  <span>IndexedDB (File storage)</span>
                </div>
                <div className="flex items-center space-x-2">
                  {compatibility.memory ? '✅' : '⚠️'}
                  <span>Memory API (Performance monitoring)</span>
                </div>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export function SystemHealthIndicator() {
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [cpuCores, setCpuCores] = useState<number>(1);
  const [storageAvailable, setStorageAvailable] = useState<number | null>(null);

  useEffect(() => {
    // Check CPU cores
    setCpuCores(navigator.hardwareConcurrency || 1);

    // Monitor memory
    const interval = setInterval(() => {
      updateMemoryStats();
      checkStorageQuota();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const updateMemoryStats = () => {
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      const used = mem.usedJSHeapSize;
      const total = mem.jsHeapSizeLimit;
      const percentage = (used / total) * 100;
      
      setMemoryStats({
        used,
        total,
        percentage,
        status: percentage > 85 ? 'critical' : percentage > 70 ? 'warning' : 'healthy'
      });
    }
  };

  const checkStorageQuota = async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const available = (estimate.quota || 0) - (estimate.usage || 0);
        setStorageAvailable(available);
      } catch (err) {
        console.error('Failed to check storage:', err);
      }
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">System Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CPU Cores */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-gray-500" />
            <span className="text-sm">CPU Cores</span>
          </div>
          <Badge variant={cpuCores >= 4 ? "default" : "secondary"}>
            {cpuCores} cores
          </Badge>
        </div>

        {/* Memory Usage */}
        {memoryStats && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <HardDrive className="w-4 h-4 text-gray-500" />
                <span className="text-sm">Memory</span>
              </div>
              <span className="text-sm text-gray-600">
                {formatBytes(memoryStats.used)} / {formatBytes(memoryStats.total)}
              </span>
            </div>
            <Progress 
              value={memoryStats.percentage} 
              className={`h-2 ${
                memoryStats.status === 'critical' ? 'bg-red-100' :
                memoryStats.status === 'warning' ? 'bg-yellow-100' :
                'bg-gray-100'
              }`}
            />
            {memoryStats.status !== 'healthy' && (
              <p className="text-xs text-yellow-600">
                {memoryStats.status === 'critical' 
                  ? '⚠️ Critical: Consider closing other tabs'
                  : '⚠️ High memory usage detected'}
              </p>
            )}
          </div>
        )}

        {/* Storage Available */}
        {storageAvailable !== null && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-gray-500" />
              <span className="text-sm">Storage Available</span>
            </div>
            <span className="text-sm text-gray-600">
              {formatBytes(storageAvailable)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MemoryUsageIndicator({ inline = false }: { inline?: boolean }) {
  const [percentage, setPercentage] = useState(0);
  const [status, setStatus] = useState<'healthy' | 'warning' | 'critical'>('healthy');

  useEffect(() => {
    const interval = setInterval(() => {
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        const pct = (mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100;
        setPercentage(pct);
        setStatus(pct > 85 ? 'critical' : pct > 70 ? 'warning' : 'healthy');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (inline) {
    return (
      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${
          status === 'critical' ? 'bg-red-500' :
          status === 'warning' ? 'bg-yellow-500' :
          'bg-green-500'
        } animate-pulse`} />
        <span className="text-xs text-gray-600">
          Memory: {percentage.toFixed(0)}%
        </span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 border">
      <div className="flex items-center space-x-3">
        <div className={`w-3 h-3 rounded-full ${
          status === 'critical' ? 'bg-red-500' :
          status === 'warning' ? 'bg-yellow-500' :
          'bg-green-500'
        } animate-pulse`} />
        <div>
          <p className="text-xs font-medium">Memory Usage</p>
          <p className="text-xs text-gray-600">{percentage.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}