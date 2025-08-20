/**
 * Fast Analysis Worker - Processes entire video at once
 * Like the frontend version but in background
 */

import { BaseWorker, WorkerOptions } from './base-worker';
import { ClaimedJob } from '../services/job-queue';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class FastAnalysisWorker extends BaseWorker {
  private genAI: GoogleGenerativeAI;
  private fileManager: GoogleAIFileManager;

  constructor(workerId: string, options: Partial<WorkerOptions> = {}) {
    super({
      workerId,
      stage: 'gemini_processing',
      concurrency: 2, // Can handle 2 videos concurrently
      ...options,
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for analysis worker');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = new GoogleAIFileManager(apiKey);
  }

  async processJob(job: ClaimedJob): Promise<any> {
    const payload = job.payload;
    
    // Check if this is a whole video processing job
    if (!payload.processWholeVideo) {
      // Skip this job for regular analysis worker to handle
      console.log(`Job ${job.job_id} is not for fast processing, skipping`);
      await this.jobQueue.releaseJobClaim(job.queue_id);
      return { skipped: true };
    }

    // Log start
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'gemini_processing',
      'Starting FAST Gemini analysis (whole video)',
      { videoUrl: payload.videoUrl },
      this.options.workerId
    );

    // Update job progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 10,
      stage_progress: { 
        gemini_processing: { 
          stage: 'uploading', 
          progress: 10,
          message: 'Uploading video to Gemini...'
        } 
      }
    });

    try {
      // Download video from Supabase URL
      const videoUrl = payload.videoUrl;
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }

      const videoBuffer = await videoResponse.arrayBuffer();
      
      // Update progress
      await this.jobQueue.updateJob(job.job_id, {
        progress_percentage: 30,
        stage_progress: { 
          gemini_processing: { 
            stage: 'uploading', 
            progress: 30,
            message: 'Uploading to Gemini API...'
          } 
        }
      });

      // Create a temporary file path for upload
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `video_${job.job_id}.mp4`);
      
      // Write buffer to temp file
      await fs.writeFile(tempFilePath, Buffer.from(videoBuffer));

      // Upload to Gemini File API
      const uploadResult = await this.fileManager.uploadFile(
        tempFilePath,
        {
          mimeType: 'video/mp4',
          displayName: 'Analysis Video',
        }
      );
      
      // Clean up temp file
      await fs.unlink(tempFilePath).catch(() => {});

      await this.jobQueue.addLog(
        job.job_id,
        'info',
        'gemini_processing',
        'Video uploaded to Gemini successfully',
        { fileUri: uploadResult.file.uri },
        this.options.workerId
      );

      // Update progress
      await this.jobQueue.updateJob(job.job_id, {
        progress_percentage: 50,
        stage_progress: { 
          gemini_processing: { 
            stage: 'analyzing', 
            progress: 50,
            message: 'Analyzing entire video with AI...'
          } 
        }
      });

      // Analyze the ENTIRE video at once
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.3,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
        },
      });

      const analysisPrompt = `Analyze this entire video and identify segments that should be removed to create a more concise, professional version.

Focus on finding:
1. Long pauses (over 2 seconds)
2. Filler words ("um", "uh", "like", "you know")
3. False starts and repetitions
4. Technical issues (audio problems, visual glitches)
5. Off-topic tangents
6. Dead air or silence

For each segment to remove, provide:
- Exact start and end times (format: "MM:SS" or "H:MM:SS")
- Duration in seconds
- Reason for removal
- Category: "pause", "filler_words", "redundant", "technical", "off_topic", "dead_air"
- Severity: "high" (definitely remove), "medium" (probably remove), "low" (consider keeping)
- Confidence score (0.0 to 1.0)

Return ONLY valid JSON in this format:
{
  "segmentsToRemove": [
    {
      "startTime": "0:05",
      "endTime": "0:08",
      "duration": 3,
      "reason": "Long pause",
      "category": "pause",
      "severity": "high",
      "confidence": 0.95,
      "transcript": "",
      "contextNote": "Disrupts flow"
    }
  ],
  "summary": {
    "originalDuration": 300,
    "finalDuration": 250,
    "timeRemoved": 50,
    "segmentCount": 15
  }
}`;

      const result = await model.generateContent([
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: uploadResult.file.uri,
          },
        },
        { text: analysisPrompt },
      ]);

      const geminiResponse = await result.response;
      const responseText = await geminiResponse.text();

      // Parse JSON response
      let analysisResult;
      try {
        analysisResult = JSON.parse(responseText);
      } catch (parseError) {
        // Try to extract JSON from markdown blocks
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse Gemini response as JSON');
        }
      }

      // Process segments to add absolute times
      if (analysisResult.segmentsToRemove) {
        analysisResult.segmentsToRemove = analysisResult.segmentsToRemove.map((segment: any, index: number) => {
          const startSeconds = this.timeStringToSeconds(segment.startTime);
          const endSeconds = this.timeStringToSeconds(segment.endTime);
          
          return {
            ...segment,
            id: `segment-${index}`,
            absoluteStartTime: startSeconds,
            absoluteEndTime: endSeconds,
            originalStartTime: segment.startTime,
            originalEndTime: segment.endTime,
            selected: true
          };
        });
      }

      // Update progress
      await this.jobQueue.updateJob(job.job_id, {
        progress_percentage: 90,
        stage_progress: { 
          gemini_processing: { 
            stage: 'completing', 
            progress: 90,
            message: 'Analysis complete, preparing results...'
          } 
        }
      });

      // Log completion
      await this.jobQueue.addLog(
        job.job_id,
        'info',
        'gemini_processing',
        'FAST Gemini analysis completed successfully',
        { 
          totalSegments: analysisResult.segmentsToRemove?.length || 0,
          timeRemoved: analysisResult.summary?.timeRemoved || 0
        },
        this.options.workerId
      );

      // Update job with analysis results
      await this.jobQueue.updateJob(job.job_id, {
        progress_percentage: 95,
        result_data: {
          gemini_processing: {
            success: true,
            chunksAnalyzed: 1, // Whole video as one "chunk"
            totalSegments: analysisResult.segmentsToRemove?.length || 0,
            analysis: analysisResult
          }
        }
      });

      // Queue for timeline assembly
      await this.jobQueue.enqueueJob(job.job_id, 'assemble_timeline', {
        analysisResults: analysisResult,
        chunksAnalyzed: 1
      });

      // Complete analysis stage
      await this.jobQueue.updateJob(job.job_id, {
        progress_percentage: 100,
        current_stage: 'assemble_timeline'
      });

      return {
        success: true,
        analysisResults: analysisResult,
        chunksAnalyzed: 1,
        nextStage: 'assemble_timeline'
      };

    } catch (error) {
      await this.jobQueue.addLog(
        job.job_id,
        'error',
        'gemini_processing',
        `FAST analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        { error: String(error) },
        this.options.workerId
      );

      throw error;
    }
  }

  private timeStringToSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
      // H:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      // MM:SS or M:SS
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
      // Just seconds
      return parts[0];
    }
    return 0;
  }
}

export default FastAnalysisWorker;