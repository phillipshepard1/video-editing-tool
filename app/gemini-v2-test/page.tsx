'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface EditingError {
  eventNumber: number;
  startOfFlawedTake: string;
  startOfSuccessfulRetake: string;
  description: string;
  confidence: number;
  verbalCues?: string[];
  nonVerbalCues?: string[];
}

interface ExtendedSilence {
  eventNumber: number;
  startTime: string;
  endTime: string;
  duration: number;
  confidence: number;
  ambientNoiseLevel?: 'silent' | 'low' | 'moderate';
}

interface AnalysisResult {
  editingErrors: EditingError[];
  extendedSilences: ExtendedSilence[];
  summary: {
    originalDuration: number;
    totalEditingErrors: number;
    totalSilences: number;
    totalTimeToRemove: number;
    estimatedFinalDuration: number;
  };
  metadata: {
    processingTime: number;
    tokenCount: number;
    estimatedCost: number;
    analysisVersion: string;
  };
}

export default function GeminiV2TestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingInfo, setProcessingInfo] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResults(null);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append('video', file);
      if (customInstructions.trim()) {
        formData.append('customInstructions', customInstructions.trim());
      }

      const response = await fetch('/api/analysis/process-v2', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Analysis failed');
      }

      setResults(result.data);
      setProcessingInfo(result.processing);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getAmbientColor = (level?: string) => {
    switch (level) {
      case 'silent': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-green-100 text-green-800';
      case 'moderate': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🧪 Gemini V2 Test Interface
            <Badge variant="outline">Flubbed Takes Detection</Badge>
          </CardTitle>
          <CardDescription>
            Test the new enhanced Gemini prompt that focuses on identifying editing errors (flubbed takes + retakes) and extended silences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Video File
            </label>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
            />
            {file && (
              <p className="text-xs text-gray-600 mt-1">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Custom Instructions (Optional)
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Any specific things to look for or focus on..."
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
              rows={3}
            />
          </div>

          <Button 
            onClick={handleAnalyze} 
            disabled={!file || isProcessing}
            className="w-full"
          >
            {isProcessing ? '🔄 Analyzing Video...' : '🚀 Analyze with V2 Prompt'}
          </Button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>📊 Analysis Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{results.summary.totalEditingErrors}</div>
                  <div className="text-sm text-gray-600">Editing Errors</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.summary.totalSilences}</div>
                  <div className="text-sm text-gray-600">Extended Silences</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{results.summary.totalTimeToRemove}s</div>
                  <div className="text-sm text-gray-600">Time to Remove</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{formatTime(results.summary.estimatedFinalDuration)}</div>
                  <div className="text-sm text-gray-600">Final Duration</div>
                </div>
              </div>
              
              {processingInfo && (
                <div className="mt-4 p-3 bg-gray-50 rounded-md text-xs">
                  <strong>Processing:</strong> {processingInfo.analysisTime}ms | 
                  <strong> Tokens:</strong> {results.metadata.tokenCount} | 
                  <strong> Cost:</strong> ${results.metadata.estimatedCost.toFixed(4)} |
                  <strong> Version:</strong> {results.metadata.analysisVersion}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Editing Errors */}
          {results.editingErrors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>🎬 Editing Errors Found ({results.editingErrors.length})</CardTitle>
                <CardDescription>Flubbed takes and retakes identified</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {results.editingErrors.map((error, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold">Error Event #{error.eventNumber}</h4>
                        <Badge className={getConfidenceColor(error.confidence)}>
                          {(error.confidence * 100).toFixed(0)}% confident
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div>
                          <strong className="text-red-600">Flawed Take:</strong> {error.startOfFlawedTake}
                        </div>
                        <div>
                          <strong className="text-green-600">Successful Retake:</strong> {error.startOfSuccessfulRetake}
                        </div>
                      </div>

                      <p className="text-sm text-gray-700 mb-3">{error.description}</p>

                      <div className="space-y-2">
                        {error.verbalCues && error.verbalCues.length > 0 && (
                          <div>
                            <strong className="text-xs text-gray-600">Verbal Cues:</strong>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {error.verbalCues.map((cue, i) => (
                                <Badge key={i} variant="outline" className="text-xs">"{cue}"</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {error.nonVerbalCues && error.nonVerbalCues.length > 0 && (
                          <div>
                            <strong className="text-xs text-gray-600">Non-Verbal Cues:</strong>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {error.nonVerbalCues.map((cue, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{cue}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Extended Silences */}
          {results.extendedSilences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>🔇 Extended Silences Found ({results.extendedSilences.length})</CardTitle>
                <CardDescription>Pauses longer than 2 seconds</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {results.extendedSilences.map((silence, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">#{silence.eventNumber}</Badge>
                        <span className="font-mono text-sm">
                          {silence.startTime} → {silence.endTime}
                        </span>
                        <Badge variant="secondary">{silence.duration}s</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getAmbientColor(silence.ambientNoiseLevel)}>
                          {silence.ambientNoiseLevel || 'unknown'}
                        </Badge>
                        <Badge className={getConfidenceColor(silence.confidence)}>
                          {(silence.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* No Results */}
          {results.editingErrors.length === 0 && results.extendedSilences.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">✨ No editing errors or extended silences found!</p>
                <p className="text-sm text-gray-400 mt-1">This video appears to be well-edited already.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}