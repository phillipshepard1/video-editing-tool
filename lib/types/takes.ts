export interface TakeIssue {
  type: 'audio_quality' | 'delivery' | 'content' | 'technical' | 'pacing' | 'energy';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface TakeQuality {
  type: 'clear_delivery' | 'good_pace' | 'confident_tone' | 'complete_thought' | 'good_audio';
  description: string;
}

export interface Take {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  transcript?: string;
  qualityScore: number; // 1-10 scale
  issues: TakeIssue[];
  qualities: TakeQuality[];
  confidence: number; // AI confidence in quality assessment
}

export interface ContentGroup {
  id: string;
  name: string;
  description: string;
  takes: Take[];
  bestTakeId: string; // ID of the take AI recommends keeping
  reasoning: string; // AI explanation for why this take is best
  contentType: 'introduction' | 'explanation' | 'conclusion' | 'transition' | 'key_point' | 'general';
  timeRange: {
    start: string;
    end: string;
  };
  averageQuality: number; // Average quality score across all takes
  confidence: number; // AI confidence in grouping and selection
}

// Separate interface for metadata to allow flexibility
export interface AnalysisMetadata {
  processingTime: number;
  tokenCount: number;
  estimatedCost: number;
  analysisVersion: string;
  clusterAnalysis?: any; // Metadata from cluster-only analysis
  silenceAnalysis?: any; // Metadata from silence-only analysis
  analysisType?: string;
  totalClusters?: number;
  totalTakes?: number;
  totalSilences?: number;
  totalSilenceDuration?: number;
  [key: string]: any; // Allow any additional properties
}

export interface EnhancedAnalysisResult {
  segments: any[]; // Existing segment data
  contentGroups: ContentGroup[];
  summary: {
    originalDuration: number;
    finalDuration: number;
    timeRemoved: number;
    segmentCount: number;
    groupCount: number;
    takesAnalyzed: number;
    averageQualityImprovement: number; // How much quality improved by selecting best takes
  };
  metadata: AnalysisMetadata;
}

export interface TakeSelection {
  groupId: string;
  selectedTakeId: string;
  isUserOverride: boolean; // Whether user manually changed from AI recommendation
  reason?: string; // User's reason for override
}

export interface ComparisonData {
  takeA: Take;
  takeB: Take;
  groupId: string;
  groupName: string;
}