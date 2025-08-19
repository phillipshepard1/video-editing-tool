'use client';

import { useState } from 'react';
import { QueueVideoUploader } from '@/components/queue-video-uploader';
import { RealtimeJobTracker } from '@/components/realtime-job-tracker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function QueueTestPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Queue-Based Video Processing</h1>
        <p className="text-gray-600">
          Upload videos for background processing with automatic chunking, Gemini analysis, and rendering
        </p>
      </div>

      <Tabs defaultValue="upload" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Upload Video</TabsTrigger>
          <TabsTrigger value="jobs">Job Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Video for Processing</CardTitle>
              <CardDescription>
                Your video will be split into chunks, analyzed by Gemini AI, and processed in the background
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QueueVideoUploader 
                onJobCreated={(jobId) => {
                  console.log('Job created:', jobId);
                  setSelectedJobId(jobId);
                }}
              />
            </CardContent>
          </Card>

          {selectedJobId && (
            <Card>
              <CardHeader>
                <CardTitle>Processing Pipeline</CardTitle>
                <CardDescription>Current job: {selectedJobId}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-6 gap-2 text-center">
                    <div className="p-2 bg-green-100 rounded">
                      <div className="text-xs font-medium">1. Upload</div>
                    </div>
                    <div className="p-2 bg-green-100 rounded">
                      <div className="text-xs font-medium">2. Split</div>
                    </div>
                    <div className="p-2 bg-blue-100 rounded">
                      <div className="text-xs font-medium">3. Queue</div>
                    </div>
                    <div className="p-2 bg-gray-100 rounded">
                      <div className="text-xs font-medium">4. Gemini</div>
                    </div>
                    <div className="p-2 bg-gray-100 rounded">
                      <div className="text-xs font-medium">5. Assemble</div>
                    </div>
                    <div className="p-2 bg-gray-100 rounded">
                      <div className="text-xs font-medium">6. Render</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="jobs">
          <RealtimeJobTracker />
        </TabsContent>
      </Tabs>
    </div>
  );
}