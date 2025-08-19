/**
 * Analysis Worker
 * Handles video analysis using Gemini AI
 */

import { BaseWorker, WorkerOptions } from './base-worker';
import { ClaimedJob } from '../services/job-queue';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AnalysisJobPayload {
  chunksStored: number;
  readyForAnalysis: boolean;
  analysisOptions?: {
    prompt?: string;
    targetDuration?: number;
    thoroughness?: 'quick' | 'standard' | 'thorough';
  };
}

export class AnalysisWorker extends BaseWorker {
  private genAI: GoogleGenerativeAI;

  constructor(workerId: string, options: Partial<WorkerOptions> = {}) {
    super({
      workerId,
      stage: 'gemini_processing',
      concurrency: 2, // Limit concurrent Gemini calls
      claimDuration: 60, // Longer claim for AI processing
      ...options,
    });

    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  async processJob(job: ClaimedJob): Promise<any> {
    const payload = job.payload as AnalysisJobPayload;
    
    if (!payload.readyForAnalysis) {
      throw new Error('Job not ready for analysis');
    }

    // Log start
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'gemini_processing',
      'Starting Gemini video analysis',
      { chunksStored: payload.chunksStored },
      this.options.workerId
    );

    // Update job progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 10,
      stage_progress: { 
        gemini_processing: { 
          stage: 'preparing', 
          progress: 10,
          message: 'Preparing video for analysis...'
        } 
      }
    });

    // Get video chunks from storage
    const videoChunks = await this.storageManager.getStoredChunks(job.job_id);
    
    if (videoChunks.length === 0) {
      throw new Error('No video chunks found for analysis');
    }

    // Update progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 20,
      stage_progress: { 
        gemini_processing: { 
          stage: 'refreshing_urls', 
          progress: 20,
          message: 'Refreshing video URLs...'
        } 
      }
    });

    // Refresh signed URLs to ensure they're valid
    const refreshedChunks = await this.storageManager.refreshChunkUrls(job.job_id, 2); // 2 hour expiry

    // Analyze each chunk
    const analysisResults = [];
    let processedChunks = 0;

    for (const chunk of refreshedChunks) {
      try {
        if (!chunk.storage_url) {
          throw new Error(`No valid URL for chunk ${chunk.chunk_index}`);
        }

        // Update progress for current chunk
        const chunkProgress = Math.round(((processedChunks / refreshedChunks.length) * 70) + 20); // 20-90%
        
        await this.jobQueue.updateJob(job.job_id, {
          progress_percentage: chunkProgress,
          stage_progress: { 
            gemini_processing: { 
              stage: 'analyzing', 
              progress: chunkProgress,
              message: `Analyzing chunk ${chunk.chunk_index + 1}/${refreshedChunks.length}`,
              currentChunk: chunk.chunk_index,
              totalChunks: refreshedChunks.length
            } 
          }
        });

        // Perform Gemini analysis
        const analysis = await this.analyzeVideoChunk(chunk, payload.analysisOptions);
        analysisResults.push({
          chunkIndex: chunk.chunk_index,
          analysis,
        });

        // Update chunk with analysis result
        await this.jobQueue.updateVideoChunk(chunk.id, {
          processed: true,
          analysis_result: analysis,
        });

        processedChunks++;

        await this.jobQueue.addLog(
          job.job_id,
          'info',
          'gemini_processing',
          `Chunk ${chunk.chunk_index} analyzed successfully`,
          { 
            chunkIndex: chunk.chunk_index, 
            segmentsFound: analysis?.segmentsToRemove?.length || 0 
          },
          this.options.workerId
        );

      } catch (error) {
        await this.jobQueue.addLog(
          job.job_id,
          'error',
          'gemini_processing',
          `Failed to analyze chunk ${chunk.chunk_index}: ${error instanceof Error ? error.message : String(error)}`,
          { chunkIndex: chunk.chunk_index, error: String(error) },
          this.options.workerId
        );
        
        // Continue with other chunks, but log the error
        analysisResults.push({
          chunkIndex: chunk.chunk_index,
          error: error instanceof Error ? error.message : String(error),
        });
        processedChunks++;
      }
    }

    // Combine analysis results
    const combinedAnalysis = this.combineAnalysisResults(analysisResults);

    // Log completion
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'gemini_processing',
      'Gemini analysis completed successfully',
      { 
        totalChunks: refreshedChunks.length,
        processedChunks: analysisResults.length,
        totalSegments: combinedAnalysis.segmentsToRemove?.length || 0
      },
      this.options.workerId
    );

    // Update job with analysis results
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 95,
      result_data: {
        gemini_processing: {
          success: true,
          chunksAnalyzed: analysisResults.length,
          totalSegments: combinedAnalysis.segmentsToRemove?.length || 0,
          analysis: combinedAnalysis
        }
      }
    });

    // Queue for timeline assembly
    await this.jobQueue.enqueueJob(job.job_id, 'assemble_timeline', {
      analysisResults: combinedAnalysis,
      chunksAnalyzed: analysisResults.length
    });

    // Complete analysis stage
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 100,
      current_stage: 'assemble_timeline'
    });

    return {
      success: true,
      analysisResults: combinedAnalysis,
      chunksAnalyzed: analysisResults.length,
      nextStage: 'assemble_timeline'
    };
  }

  private async analyzeVideoChunk(chunk: any, options?: AnalysisJobPayload['analysisOptions']): Promise<any> {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      },
    });

    // Build analysis prompt based on options
    const thoroughnessLevel = options?.thoroughness || 'standard';
    const customPrompt = options?.prompt || '';
    const targetDuration = options?.targetDuration;

    const analysisPrompt = this.buildAnalysisPrompt(thoroughnessLevel, customPrompt, targetDuration);

    try {
      // First, upload the chunk file to Gemini
      const geminiFileUri = await this.uploadChunkToGemini(chunk);
      
      const result = await model.generateContent([
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: geminiFileUri,
          },
        },
        { text: analysisPrompt },
      ]);

      const response = await result.response;
      let text = response.text();

      // Parse JSON response
      let analysisResult;
      try {
        analysisResult = JSON.parse(text);
      } catch (parseError) {
        // Try to extract JSON from markdown blocks
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Invalid JSON response from Gemini');
        }
      }

      // Enhance segments with required fields
      if (analysisResult?.segmentsToRemove) {
        analysisResult.segmentsToRemove = analysisResult.segmentsToRemove.map((segment: any, index: number) => ({
          ...segment,
          id: `segment-${chunk.chunk_index}-${index}-${Date.now()}`,
          selected: true,
          chunkIndex: chunk.chunk_index,
          // Adjust timing for chunk offset
          originalStartTime: segment.startTime,
          originalEndTime: segment.endTime,
          absoluteStartTime: chunk.start_time + this.parseTimeToSeconds(segment.startTime),
          absoluteEndTime: chunk.start_time + this.parseTimeToSeconds(segment.endTime),
        }));
      }

      return analysisResult;

    } catch (error) {
      console.error('Gemini analysis error:', error);
      throw new Error(`Gemini analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildAnalysisPrompt(thoroughness: string, customPrompt: string, targetDuration?: number): string {
    const basePrompt = `Carefully analyze this video chunk and identify segments that should be removed for a tighter, more professional edit.

CATEGORIZATION SYSTEM - Use these EXACT category values:
- "bad_take": Multiple attempts where this one is clearly worse
- "pause": Silence longer than 2 seconds
- "false_start": Incomplete thoughts, restarts
- "filler_words": Excessive "um", "uh", "like", "you know", "so", "basically"
- "technical": Audio/video issues, glitches
- "redundant": Repeated information already covered
- "tangent": Off-topic content
- "low_energy": Noticeably quieter delivery, mumbling
- "long_explanation": Extended sections that could be condensed
- "weak_transition": Awkward topic changes

ANALYSIS DEPTH:`;

    let depthInstructions = '';
    switch (thoroughness) {
      case 'quick':
        depthInstructions = `
- Focus on obvious issues: long pauses (>3s), clear false starts, major technical problems
- Assign severity: mostly "high" for clear removals, "medium" for borderline cases
- Be efficient but accurate`;
        break;
      case 'thorough':
        depthInstructions = `
- Scan the ENTIRE video chunk from start to end
- Find EVERY pause over 2 seconds, all filler words, every false start
- Include subtle issues: brief hesitations, slight audio glitches, minor redundancies
- Assign severity carefully: "high" (definitely remove), "medium" (probably remove), "low" (consider keeping)
- Provide detailed contextNote for each segment`;
        break;
      default: // standard
        depthInstructions = `
- Scan the video chunk thoroughly but focus on meaningful improvements
- Find pauses over 2 seconds, excessive filler words, false starts, technical issues
- Balance thoroughness with practicality
- Assign severity: "high" (clear issues), "medium" (improvements), "low" (questionable)`;
    }

    const targetInfo = targetDuration ? `\nTARGET DURATION: Try to identify enough content to reduce to approximately ${targetDuration} seconds.` : '';

    const customInfo = customPrompt ? `\nADDITIONAL INSTRUCTIONS: ${customPrompt}` : '';

    return `${basePrompt}
${depthInstructions}${targetInfo}${customInfo}

Return only valid JSON in this format:
{
  "segmentsToRemove": [
    {
      "startTime": "0:05",
      "endTime": "0:08",
      "duration": 3,
      "reason": "Long uncomfortable pause",
      "category": "pause",
      "severity": "high",
      "confidence": 0.95,
      "transcript": "So... [long pause] ...what I want to say is",
      "contextNote": "Pause disrupts flow and adds no value"
    }
  ],
  "summary": {
    "chunkDuration": 120,
    "segmentCount": 12,
    "timeToRemove": 25
  }
}`;
  }

  private combineAnalysisResults(results: any[]): any {
    const allSegments: any[] = [];
    let totalDuration = 0;
    let totalTimeToRemove = 0;
    let errorCount = 0;

    for (const result of results) {
      if (result.error) {
        errorCount++;
        continue;
      }

      if (result.analysis?.segmentsToRemove) {
        allSegments.push(...result.analysis.segmentsToRemove);
      }

      if (result.analysis?.summary) {
        totalDuration += result.analysis.summary.chunkDuration || 0;
        totalTimeToRemove += result.analysis.summary.timeToRemove || 0;
      }
    }

    // Sort segments by absolute start time
    allSegments.sort((a, b) => (a.absoluteStartTime || 0) - (b.absoluteStartTime || 0));

    return {
      segmentsToRemove: allSegments,
      summary: {
        originalDuration: totalDuration,
        finalDuration: Math.max(0, totalDuration - totalTimeToRemove),
        timeRemoved: totalTimeToRemove,
        segmentCount: allSegments.length,
        chunksAnalyzed: results.length - errorCount,
        errors: errorCount
      }
    };
  }

  private parseTimeToSeconds(timeStr: string): number {
    // Parse time format like "1:23" or "0:05" to seconds
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return parseFloat(timeStr) || 0;
  }

  private async uploadChunkToGemini(chunk: any): Promise<string> {
    try {
      // Download the chunk from Supabase storage
      const response = await fetch(chunk.storage_url);
      if (!response.ok) {
        throw new Error(`Failed to download chunk: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Create proper multipart boundary (same technique as original upload)
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;
      
      // Build multipart body manually to avoid metadata issues
      const metadata = JSON.stringify({
        file: {
          mimeType: 'video/mp4',
          displayName: `chunk_${chunk.chunk_index}.mp4`
        }
      });
      
      const multipartBody = Buffer.concat([
        Buffer.from(delimiter),
        Buffer.from('Content-Type: application/json\r\n\r\n'),
        Buffer.from(metadata),
        Buffer.from(delimiter),
        Buffer.from('Content-Type: video/mp4\r\n\r\n'),
        buffer,
        Buffer.from(closeDelimiter)
      ]);

      const uploadResponse = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': multipartBody.length.toString()
          },
          body: multipartBody,
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Gemini upload failed:', errorText);
        console.error('Chunk size:', buffer.length, 'bytes');
        throw new Error(`Gemini upload failed: ${errorText}`);
      }

      const uploadResult = await uploadResponse.json();
      const fileUri = uploadResult.file?.uri;

      if (!fileUri) {
        throw new Error('No file URI returned from Gemini upload');
      }

      // Wait for file to become active
      await this.waitForGeminiFileActive(fileUri);

      return fileUri;
    } catch (error) {
      console.error('Error uploading chunk to Gemini:', error);
      throw new Error(`Failed to upload chunk to Gemini: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async waitForGeminiFileActive(fileUri: string, maxAttempts: number = 30): Promise<void> {
    const fileId = fileUri.split('/').pop();
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${process.env.GEMINI_API_KEY}`
        );
        
        if (response.ok) {
          const fileStatus = await response.json();
          
          if (fileStatus.state === 'ACTIVE') {
            return;
          }
          
          if (fileStatus.state === 'FAILED') {
            throw new Error(`Gemini file processing failed: ${fileStatus.error?.message || 'Unknown error'}`);
          }
        }
        
        // Wait 3 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw error;
        }
        console.warn('Error checking Gemini file status, retrying:', error);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    throw new Error('Gemini file did not become active within timeout period');
  }
}

export default AnalysisWorker;