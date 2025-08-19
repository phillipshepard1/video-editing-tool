'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ComparisonData, Take, TakeSelection } from '@/lib/types/takes';
import { QualityMeter, QualityComparison } from './QualityMeter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  Play, 
  Pause, 
  X, 
  Volume2,
  VolumeX,
  RotateCcw,
  Crown,
  CheckCircle,
  AlertTriangle,
  Clock,
  GitBranch
} from 'lucide-react';

interface SideBySideComparisonProps {
  comparison: ComparisonData | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectTake: (selection: TakeSelection) => void;
  videoUrl: string | null;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

export function SideBySideComparison({
  comparison,
  isOpen,
  onClose,
  onSelectTake,
  videoUrl,
  videoRef
}: SideBySideComparisonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [syncPlayback, setSyncPlayback] = useState(true);
  const [selectedSide, setSelectedSide] = useState<'A' | 'B' | null>(null);
  const [currentTake, setCurrentTake] = useState<'A' | 'B'>('A');

  // Parse time string to seconds
  const parseTime = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return parseInt(minutes) * 60 + parseFloat(seconds);
    }
    return parseFloat(timeStr);
  };

  // Format seconds to time string
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get current take being displayed
  const getCurrentTake = (): Take | null => {
    if (!comparison) return null;
    return currentTake === 'A' ? comparison.takeA : comparison.takeB;
  };

  // Check if current time is within take bounds
  const isInTakeBounds = (take: Take): boolean => {
    const takeStart = parseTime(take.startTime);
    const takeEnd = parseTime(take.endTime);
    return currentTime >= takeStart && currentTime <= takeEnd;
  };

  // Handle play/pause
  const handlePlayPause = () => {
    if (!videoRef?.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      // Seek to the start of current take if not in bounds
      const take = getCurrentTake();
      if (take && !isInTakeBounds(take)) {
        videoRef.current.currentTime = parseTime(take.startTime);
      }
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Switch between takes
  const switchToTake = (takeId: 'A' | 'B') => {
    if (!videoRef?.current || !comparison) return;
    
    const take = takeId === 'A' ? comparison.takeA : comparison.takeB;
    const takeStart = parseTime(take.startTime);
    
    setCurrentTake(takeId);
    videoRef.current.currentTime = takeStart;
    setCurrentTime(takeStart);
    
    if (isPlaying) {
      videoRef.current.play();
    }
  };

  // Handle take selection
  const handleSelectTake = (take: Take) => {
    if (!comparison) return;
    
    onSelectTake({
      groupId: comparison.groupId,
      selectedTakeId: take.id,
      isUserOverride: true,
      reason: `Selected via side-by-side comparison with quality score ${take.qualityScore}`
    });
    
    setSelectedSide(take === comparison.takeA ? 'A' : 'B');
  };

  // Monitor video progress
  useEffect(() => {
    if (!videoRef?.current) return;
    
    const video = videoRef.current;
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      
      // Auto-switch takes in sync mode
      if (syncPlayback && comparison) {
        const takeA = comparison.takeA;
        const takeB = comparison.takeB;
        const time = video.currentTime;
        
        // Determine which take should be showing based on time
        const inTakeA = time >= parseTime(takeA.startTime) && time <= parseTime(takeA.endTime);
        const inTakeB = time >= parseTime(takeB.startTime) && time <= parseTime(takeB.endTime);
        
        if (inTakeA && currentTake !== 'A') {
          setCurrentTake('A');
        } else if (inTakeB && currentTake !== 'B') {
          setCurrentTake('B');
        }
      }
    };
    
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleLoadedMetadata = () => setDuration(video.duration);
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoRef, syncPlayback, comparison, currentTake]);

  // Auto-stop at end of take if in sync mode
  useEffect(() => {
    if (!videoRef?.current || !comparison || !syncPlayback) return;
    
    const video = videoRef.current;
    const take = getCurrentTake();
    
    if (take && isPlaying) {
      const takeEnd = parseTime(take.endTime);
      
      if (currentTime >= takeEnd) {
        video.pause();
        setIsPlaying(false);
      }
    }
  }, [currentTime, isPlaying, syncPlayback, comparison, currentTake]);

  if (!isOpen || !comparison) {
    return null;
  }

  const { takeA, takeB } = comparison;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Take Comparison - {comparison.groupName}
            </h2>
            <p className="text-sm text-gray-600">
              Compare quality, delivery, and content between takes
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Sync Toggle */}
            <div className="flex items-center gap-2">
              <Switch 
                checked={syncPlayback}
                onCheckedChange={setSyncPlayback}
                id="sync-playback"
              />
              <label htmlFor="sync-playback" className="text-sm text-gray-700">
                Sync Playback
              </label>
            </div>
            
            <Button onClick={onClose} variant="outline" size="sm">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Video Controls */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <Button
              onClick={handlePlayPause}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            
            <Button
              onClick={() => setIsMuted(!isMuted)}
              size="sm"
              variant="outline"
              className="px-2"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            
            {/* Take Switcher */}
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-gray-600">Current:</span>
              <Button
                onClick={() => switchToTake('A')}
                size="sm"
                variant={currentTake === 'A' ? 'default' : 'outline'}
                className={currentTake === 'A' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                Take A
              </Button>
              <Button
                onClick={() => switchToTake('B')}
                size="sm"
                variant={currentTake === 'B' ? 'default' : 'outline'}
                className={currentTake === 'B' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                Take B
              </Button>
            </div>
            
            {/* Time Display */}
            <div className="ml-auto text-sm text-gray-600 font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          {/* Take A */}
          <TakeComparisonCard
            take={takeA}
            label="Take A"
            isActive={currentTake === 'A'}
            isSelected={selectedSide === 'A'}
            onSelect={() => handleSelectTake(takeA)}
            onSwitchTo={() => switchToTake('A')}
            currentTime={currentTime}
            className="border-blue-200"
          />

          {/* Take B */}
          <TakeComparisonCard
            take={takeB}
            label="Take B"
            isActive={currentTake === 'B'}
            isSelected={selectedSide === 'B'}
            onSelect={() => handleSelectTake(takeB)}
            onSwitchTo={() => switchToTake('B')}
            currentTime={currentTime}
            className="border-green-200"
          />
        </div>

        {/* Quality Comparison Summary */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <h3 className="font-medium text-gray-900 mb-4">Quality Comparison</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Overall Scores */}
            <Card className="p-4">
              <h4 className="font-medium text-gray-900 mb-3">Overall Quality</h4>
              <QualityComparison
                scoreA={takeA.qualityScore}
                scoreB={takeB.qualityScore}
                labelA="Take A"
                labelB="Take B"
              />
            </Card>

            {/* Issues Comparison */}
            <Card className="p-4">
              <h4 className="font-medium text-gray-900 mb-3">Issues Found</h4>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-600">Take A:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {takeA.issues.map((issue, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className={`text-xs ${
                          issue.severity === 'high'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : issue.severity === 'medium'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}
                      >
                        {issue.type.replace('_', ' ')}
                      </Badge>
                    ))}
                    {takeA.issues.length === 0 && (
                      <span className="text-sm text-green-600">No issues</span>
                    )}
                  </div>
                </div>
                
                <div>
                  <span className="text-sm text-gray-600">Take B:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {takeB.issues.map((issue, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className={`text-xs ${
                          issue.severity === 'high'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : issue.severity === 'medium'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}
                      >
                        {issue.type.replace('_', ' ')}
                      </Badge>
                    ))}
                    {takeB.issues.length === 0 && (
                      <span className="text-sm text-green-600">No issues</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Qualities Comparison */}
            <Card className="p-4">
              <h4 className="font-medium text-gray-900 mb-3">Strengths</h4>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-600">Take A:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {takeA.qualities.map((quality, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="text-xs bg-green-50 text-green-700 border-green-200"
                      >
                        {quality.type.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <span className="text-sm text-gray-600">Take B:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {takeB.qualities.map((quality, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="text-xs bg-green-50 text-green-700 border-green-200"
                      >
                        {quality.type.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// Individual Take Comparison Card
interface TakeComparisonCardProps {
  take: Take;
  label: string;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onSwitchTo: () => void;
  currentTime: number;
  className?: string;
}

function TakeComparisonCard({
  take,
  label,
  isActive,
  isSelected,
  onSelect,
  onSwitchTo,
  currentTime,
  className = ''
}: TakeComparisonCardProps) {
  const parseTime = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return parseInt(minutes) * 60 + parseFloat(seconds);
    }
    return parseFloat(timeStr);
  };

  const formatTime = (timeStr: string): string => {
    const parts = timeStr.split(':');
    if (parts.length === 2) return timeStr;
    const totalSeconds = parseFloat(timeStr);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isInBounds = currentTime >= parseTime(take.startTime) && currentTime <= parseTime(take.endTime);

  return (
    <Card className={`p-4 transition-all duration-200 ${
      isActive ? 'ring-2 ring-blue-500 shadow-lg' : ''
    } ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">{label}</h3>
          {isActive && (
            <Badge className="bg-blue-100 text-blue-800">
              Active
            </Badge>
          )}
          {isSelected && (
            <CheckCircle className="w-4 h-4 text-green-600" />
          )}
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={onSwitchTo}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            <Play className="w-3 h-3 mr-1" />
            Play
          </Button>
          
          <Button
            onClick={onSelect}
            size="sm"
            className={`text-xs ${
              isSelected 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-purple-600 hover:bg-purple-700'
            }`}

          >
            {isSelected ? 'Selected' : 'Select This'}
          </Button>
        </div>
      </div>

      {/* Time and Quality */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-gray-500" />
          <span className="text-sm text-gray-600 font-mono">
            {formatTime(take.startTime)} - {formatTime(take.endTime)}
          </span>
        </div>
        
        <QualityMeter 
          score={take.qualityScore} 
          size="md"
          showScore={true}
        />
        
        {/* Progress indicator */}
        {isActive && isInBounds && (
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        )}
      </div>

      {/* Transcript */}
      {take.transcript && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">"{take.transcript}"</p>
        </div>
      )}

      {/* Issues */}
      {take.issues.length > 0 && (
        <div className="mb-3">
          <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-orange-500" />
            Issues
          </h4>
          <div className="space-y-1">
            {take.issues.map((issue, index) => (
              <div key={index} className="text-xs text-gray-600">
                <span className={`font-medium ${
                  issue.severity === 'high' ? 'text-red-600' :
                  issue.severity === 'medium' ? 'text-orange-600' : 'text-yellow-600'
                }`}>
                  {issue.type.replace('_', ' ')}:
                </span> {issue.description}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Qualities */}
      {take.qualities.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            Strengths
          </h4>
          <div className="space-y-1">
            {take.qualities.map((quality, index) => (
              <div key={index} className="text-xs text-gray-600">
                <span className="font-medium text-green-600">
                  {quality.type.replace('_', ' ')}:
                </span> {quality.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
