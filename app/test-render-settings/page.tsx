'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestRenderSettings() {
  const [renderFPS, setRenderFPS] = useState<number>(60); // Default to 60 FPS
  const [renderQuality, setRenderQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [renderResolution, setRenderResolution] = useState<'sd' | 'hd' | '1080' | '4k'>('1080');
  const [testResult, setTestResult] = useState<string>('');

  const testRenderSettings = async () => {
    try {
      // Test the API with the selected settings
      const response = await fetch('/api/render/shotstack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoUrl: 'https://example.com/test-video.mp4',
          segmentsToRemove: [],
          videoDuration: 60,
          fps: renderFPS,
          quality: renderQuality,
          resolution: renderResolution
        })
      });

      const result = await response.json();
      setTestResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setTestResult(`Error: ${error}`);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle>Test Shotstack Render Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* FPS Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Frame Rate (FPS):</label>
            <div className="grid grid-cols-5 gap-2">
              {[24, 25, 30, 50, 60].map((fps) => (
                <button
                  key={fps}
                  className={`px-3 py-2 text-sm rounded transition-colors ${
                    renderFPS === fps
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setRenderFPS(fps)}
                >
                  {fps} fps
                </button>
              ))}
            </div>
          </div>

          {/* Quality Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Quality:</label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((quality) => (
                <button
                  key={quality}
                  className={`px-3 py-2 text-sm rounded transition-colors capitalize ${
                    renderQuality === quality
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setRenderQuality(quality)}
                >
                  {quality}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Resolution:</label>
            <div className="grid grid-cols-4 gap-2">
              {(['sd', 'hd', '1080', '4k'] as const).map((res) => (
                <button
                  key={res}
                  className={`px-3 py-2 text-sm rounded transition-colors ${
                    renderResolution === res
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setRenderResolution(res)}
                >
                  {res === 'sd' ? '480p' : res === 'hd' ? '720p' : res === '1080' ? '1080p' : '4K'}
                </button>
              ))}
            </div>
          </div>

          {/* Current Settings Display */}
          <div className="p-4 bg-gray-100 rounded">
            <h3 className="font-medium mb-2">Current Settings:</h3>
            <ul className="text-sm space-y-1">
              <li>FPS: <span className="font-mono">{renderFPS}</span></li>
              <li>Quality: <span className="font-mono">{renderQuality}</span></li>
              <li>Resolution: <span className="font-mono">{renderResolution}</span></li>
            </ul>
          </div>

          <Button onClick={testRenderSettings} className="w-full">
            Test Render Settings
          </Button>

          {testResult && (
            <div className="mt-4">
              <h3 className="font-medium mb-2">API Response:</h3>
              <pre className="p-4 bg-gray-900 text-green-400 rounded overflow-x-auto text-xs">
                {testResult}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}