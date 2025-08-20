/**
 * Assembly Worker
 * Combines analysis results from all chunks into a final timeline for rendering
 */

import { BaseWorker, WorkerOptions } from './base-worker';
import { ClaimedJob } from '../services/job-queue';

export interface AssemblyJobPayload {
  analysisResults: {
    segmentsToRemove: Array<{
      id: string;
      startTime: string;
      endTime: string;
      duration: number;
      reason: string;
      category: string;
      severity: 'low' | 'medium' | 'high';
      confidence: number;
      transcript: string;
      contextNote: string;
      selected: boolean;
      chunkIndex: number;
      originalStartTime: string;
      originalEndTime: string;
      absoluteStartTime: number;
      absoluteEndTime: number;
    }>;
    summary: {
      originalDuration: number;
      finalDuration: number;
      timeRemoved: number;
      segmentCount: number;
      chunksAnalyzed: number;
      errors: number;
    };
  };
  chunksAnalyzed: number;
}

export interface TimelineSegment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  action: 'keep' | 'remove';
  reason?: string;
  category?: string;
  severity?: string;
  confidence?: number;
}

export interface ProcessedTimeline {
  segments: TimelineSegment[];
  segmentsToKeep: TimelineSegment[];
  segmentsToRemove: TimelineSegment[];
  summary: {
    originalDuration: number;
    finalDuration: number;
    timeReduction: number;
    reductionPercentage: number;
    totalSegments: number;
    segmentsToRemove: number;
    segmentsToKeep: number;
  };
  renderInstructions: {
    cuts: Array<{
      startTime: number;
      endTime: number;
    }>;
    keeps: Array<{
      startTime: number;
      endTime: number;
    }>;
  };
}

export class AssemblyWorker extends BaseWorker {
  constructor(workerId: string, options: Partial<WorkerOptions> = {}) {
    super({
      workerId,
      stage: 'assemble_timeline',
      concurrency: 2, // Can handle multiple assembly jobs concurrently
      ...options,
    });
  }

  async processJob(job: ClaimedJob): Promise<any> {
    const payload = job.payload as AssemblyJobPayload;
    
    if (!payload.analysisResults || !payload.analysisResults.segmentsToRemove) {
      throw new Error('No analysis results provided for timeline assembly');
    }

    // Log start
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'assemble_timeline',
      'Starting timeline assembly',
      { 
        chunksAnalyzed: payload.chunksAnalyzed,
        segmentCount: payload.analysisResults.segmentsToRemove.length
      },
      this.options.workerId
    );

    // Update job progress
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 10,
      stage_progress: { 
        assemble_timeline: { 
          stage: 'processing', 
          progress: 10,
          message: 'Assembling timeline from analysis results...'
        } 
      }
    });

    // Step 1: Clean and validate segments
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 30,
      stage_progress: { 
        assemble_timeline: { 
          stage: 'validating', 
          progress: 30,
          message: 'Validating and cleaning segments...'
        } 
      }
    });

    const validatedSegments = await this.validateAndCleanSegments(job.job_id, payload.analysisResults.segmentsToRemove);

    // Step 2: Resolve overlaps and conflicts
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 50,
      stage_progress: { 
        assemble_timeline: { 
          stage: 'resolving', 
          progress: 50,
          message: 'Resolving overlaps and conflicts...'
        } 
      }
    });

    const resolvedSegments = await this.resolveOverlaps(job.job_id, validatedSegments);

    // Step 3: Generate final timeline
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 70,
      stage_progress: { 
        assemble_timeline: { 
          stage: 'building', 
          progress: 70,
          message: 'Building final timeline...'
        } 
      }
    });

    const processedTimeline = await this.buildFinalTimeline(job.job_id, resolvedSegments, payload.analysisResults.summary);

    // Step 4: Generate render instructions
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 90,
      stage_progress: { 
        assemble_timeline: { 
          stage: 'finalizing', 
          progress: 90,
          message: 'Generating render instructions...'
        } 
      }
    });

    const renderInstructions = await this.generateRenderInstructions(job.job_id, processedTimeline);
    processedTimeline.renderInstructions = renderInstructions;

    // Log completion
    await this.jobQueue.addLog(
      job.job_id,
      'info',
      'assemble_timeline',
      'Timeline assembly completed successfully',
      { 
        finalSegments: processedTimeline.segments.length,
        segmentsToRemove: processedTimeline.segmentsToRemove.length,
        timeReduction: processedTimeline.summary.timeReduction,
        reductionPercentage: processedTimeline.summary.reductionPercentage
      },
      this.options.workerId
    );

    // Update job with timeline results
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 95,
      result_data: {
        assemble_timeline: {
          success: true,
          timeline: processedTimeline,
          segmentsToRemove: processedTimeline.segmentsToRemove.length,
          timeReduction: processedTimeline.summary.timeReduction,
          reductionPercentage: processedTimeline.summary.reductionPercentage
        }
      }
    });

    // DON'T automatically queue for rendering - let user review first!
    // The user should trigger render manually after reviewing segments
    
    // Mark job as COMPLETED after assembly
    await this.jobQueue.updateJob(job.job_id, {
      progress_percentage: 100,
      status: 'completed', // Mark as complete, ready for review
      current_stage: 'assemble_timeline',
      completed_at: new Date().toISOString()
    });

    return {
      success: true,
      timeline: processedTimeline,
      timeReduction: processedTimeline.summary.timeReduction,
      segmentsToRemove: processedTimeline.segmentsToRemove.length,
      reductionPercentage: processedTimeline.summary.reductionPercentage,
      // No nextStage - stops here for user review
    };
  }

  private async validateAndCleanSegments(jobId: string, segments: any[]): Promise<TimelineSegment[]> {
    const validSegments: TimelineSegment[] = [];
    let invalidCount = 0;

    for (const segment of segments) {
      try {
        // Validate required fields
        if (typeof segment.absoluteStartTime !== 'number' || typeof segment.absoluteEndTime !== 'number') {
          throw new Error('Invalid time values');
        }

        if (segment.absoluteStartTime >= segment.absoluteEndTime) {
          throw new Error('Start time must be before end time');
        }

        if (segment.duration <= 0) {
          throw new Error('Duration must be positive');
        }

        // Create validated segment
        const validSegment: TimelineSegment = {
          id: segment.id || `segment-${Date.now()}-${Math.random()}`,
          startTime: segment.absoluteStartTime,
          endTime: segment.absoluteEndTime,
          duration: segment.duration,
          action: 'remove',
          reason: segment.reason,
          category: segment.category,
          severity: segment.severity,
          confidence: segment.confidence
        };

        validSegments.push(validSegment);
      } catch (error) {
        invalidCount++;
        await this.jobQueue.addLog(
          jobId,
          'warn',
          'assemble_timeline',
          `Invalid segment skipped: ${error instanceof Error ? error.message : String(error)}`,
          { segment: segment.id, startTime: segment.absoluteStartTime, endTime: segment.absoluteEndTime },
          this.options.workerId
        );
      }
    }

    if (invalidCount > 0) {
      await this.jobQueue.addLog(
        jobId,
        'info',
        'assemble_timeline',
        `Validation complete: ${validSegments.length} valid segments, ${invalidCount} invalid segments skipped`,
        { validSegments: validSegments.length, invalidSegments: invalidCount },
        this.options.workerId
      );
    }

    return validSegments.sort((a, b) => a.startTime - b.startTime);
  }

  private async resolveOverlaps(jobId: string, segments: TimelineSegment[]): Promise<TimelineSegment[]> {
    if (segments.length <= 1) return segments;

    const resolvedSegments: TimelineSegment[] = [];
    let mergedCount = 0;
    let i = 0;

    while (i < segments.length) {
      let currentSegment = { ...segments[i] };
      let j = i + 1;

      // Find all overlapping segments
      while (j < segments.length && segments[j].startTime <= currentSegment.endTime) {
        const nextSegment = segments[j];
        
        // Merge segments
        currentSegment.endTime = Math.max(currentSegment.endTime, nextSegment.endTime);
        currentSegment.duration = currentSegment.endTime - currentSegment.startTime;
        
        // Combine reasons and choose highest severity
        if (nextSegment.reason && !currentSegment.reason?.includes(nextSegment.reason)) {
          currentSegment.reason = `${currentSegment.reason}; ${nextSegment.reason}`;
        }
        
        // Take highest confidence
        if (nextSegment.confidence && (!currentSegment.confidence || nextSegment.confidence > currentSegment.confidence)) {
          currentSegment.confidence = nextSegment.confidence;
        }

        mergedCount++;
        j++;
      }

      resolvedSegments.push(currentSegment);
      i = j;
    }

    if (mergedCount > 0) {
      await this.jobQueue.addLog(
        jobId,
        'info',
        'assemble_timeline',
        `Overlap resolution complete: merged ${mergedCount} overlapping segments`,
        { originalSegments: segments.length, finalSegments: resolvedSegments.length },
        this.options.workerId
      );
    }

    return resolvedSegments;
  }

  private async buildFinalTimeline(jobId: string, segmentsToRemove: TimelineSegment[], summary: any): Promise<ProcessedTimeline> {
    // Create segments to keep (inverse of segments to remove)
    const segmentsToKeep: TimelineSegment[] = [];
    let lastEndTime = 0;

    for (const removeSegment of segmentsToRemove) {
      // If there's a gap before this remove segment, add it as a keep segment
      if (lastEndTime < removeSegment.startTime) {
        segmentsToKeep.push({
          id: `keep-${Date.now()}-${Math.random()}`,
          startTime: lastEndTime,
          endTime: removeSegment.startTime,
          duration: removeSegment.startTime - lastEndTime,
          action: 'keep'
        });
      }
      lastEndTime = Math.max(lastEndTime, removeSegment.endTime);
    }

    // Add final keep segment if needed
    if (lastEndTime < summary.originalDuration) {
      segmentsToKeep.push({
        id: `keep-final-${Date.now()}`,
        startTime: lastEndTime,
        endTime: summary.originalDuration,
        duration: summary.originalDuration - lastEndTime,
        action: 'keep'
      });
    }

    // Combine all segments and sort
    const allSegments = [...segmentsToKeep, ...segmentsToRemove].sort((a, b) => a.startTime - b.startTime);

    // Calculate final statistics
    const totalKeepDuration = segmentsToKeep.reduce((sum, seg) => sum + seg.duration, 0);
    const totalRemoveDuration = segmentsToRemove.reduce((sum, seg) => sum + seg.duration, 0);
    const reductionPercentage = summary.originalDuration > 0 ? (totalRemoveDuration / summary.originalDuration) * 100 : 0;

    const processedTimeline: ProcessedTimeline = {
      segments: allSegments,
      segmentsToKeep,
      segmentsToRemove,
      summary: {
        originalDuration: summary.originalDuration,
        finalDuration: totalKeepDuration,
        timeReduction: totalRemoveDuration,
        reductionPercentage: Math.round(reductionPercentage * 100) / 100,
        totalSegments: allSegments.length,
        segmentsToRemove: segmentsToRemove.length,
        segmentsToKeep: segmentsToKeep.length
      },
      renderInstructions: {
        cuts: [],
        keeps: []
      }
    };

    await this.jobQueue.addLog(
      jobId,
      'info',
      'assemble_timeline',
      'Timeline built successfully',
      { 
        originalDuration: summary.originalDuration,
        finalDuration: totalKeepDuration,
        reductionPercentage: reductionPercentage.toFixed(2) + '%'
      },
      this.options.workerId
    );

    return processedTimeline;
  }

  private async generateRenderInstructions(jobId: string, timeline: ProcessedTimeline): Promise<ProcessedTimeline['renderInstructions']> {
    const cuts = timeline.segmentsToRemove.map(segment => ({
      startTime: segment.startTime,
      endTime: segment.endTime
    }));

    const keeps = timeline.segmentsToKeep.map(segment => ({
      startTime: segment.startTime,
      endTime: segment.endTime
    }));

    await this.jobQueue.addLog(
      jobId,
      'info',
      'assemble_timeline',
      'Render instructions generated',
      { cuts: cuts.length, keeps: keeps.length },
      this.options.workerId
    );

    return { cuts, keeps };
  }
}

export default AssemblyWorker;