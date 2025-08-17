'use client';

import React from 'react';
import { TakeIssue, TakeQuality } from '@/lib/types/takes';
import { Badge } from '@/components/ui/badge';

interface QualityMeterProps {
  score: number; // 1-10 scale
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
  issues?: TakeIssue[];
  qualities?: TakeQuality[];
  className?: string;
}

export function QualityMeter({
  score,
  size = 'md',
  showScore = true,
  issues = [],
  qualities = [],
  className = ''
}: QualityMeterProps) {
  // Normalize score to 0-100 for percentage display
  const percentage = Math.min(Math.max(score * 10, 0), 100);
  
  // Determine color based on score
  const getScoreColor = (score: number): string => {
    if (score >= 8) return 'bg-green-500';
    if (score >= 6) return 'bg-yellow-500';
    if (score >= 4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getScoreTextColor = (score: number): string => {
    if (score >= 8) return 'text-green-700';
    if (score >= 6) return 'text-yellow-700';
    if (score >= 4) return 'text-orange-700';
    return 'text-red-700';
  };

  const getSizeClasses = (size: string): { container: string; bar: string; text: string } => {
    switch (size) {
      case 'sm':
        return {
          container: 'w-16 h-2',
          bar: 'h-2',
          text: 'text-xs'
        };
      case 'lg':
        return {
          container: 'w-32 h-4',
          bar: 'h-4',
          text: 'text-base font-semibold'
        };
      default:
        return {
          container: 'w-24 h-3',
          bar: 'h-3',
          text: 'text-sm font-medium'
        };
    }
  };

  const sizeClasses = getSizeClasses(size);
  const scoreColor = getScoreColor(score);
  const textColor = getScoreTextColor(score);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Quality Meter Bar */}
      <div className={`${sizeClasses.container} bg-gray-200 rounded-full overflow-hidden`}>
        <div
          className={`${sizeClasses.bar} ${scoreColor} transition-all duration-300 ease-out rounded-full`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {/* Score Display */}
      {showScore && (
        <span className={`${sizeClasses.text} ${textColor} font-mono`}>
          {score.toFixed(1)}
        </span>
      )}
      
      {/* Issues and Qualities Badges (for larger sizes) */}
      {size !== 'sm' && (issues.length > 0 || qualities.length > 0) && (
        <div className="flex items-center gap-1">
          {/* Quality Badges */}
          {qualities.slice(0, 2).map((quality, index) => (
            <Badge
              key={index}
              variant="outline"
              className="text-xs bg-green-50 text-green-700 border-green-200"
            >
              {quality.type.replace('_', ' ')}
            </Badge>
          ))}
          
          {/* Issue Badges */}
          {issues.slice(0, 2).map((issue, index) => (
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
          
          {/* Show count if there are more */}
          {(issues.length + qualities.length) > 4 && (
            <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600">
              +{(issues.length + qualities.length) - 4}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

interface QualityComparisonProps {
  scoreA: number;
  scoreB: number;
  labelA?: string;
  labelB?: string;
  className?: string;
}

export function QualityComparison({
  scoreA,
  scoreB,
  labelA = 'Take A',
  labelB = 'Take B',
  className = ''
}: QualityComparisonProps) {
  const winner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'tie';
  
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{labelA}</span>
        <QualityMeter score={scoreA} size="sm" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{labelB}</span>
        <QualityMeter score={scoreB} size="sm" />
      </div>
      {winner !== 'tie' && (
        <div className="text-center pt-1">
          <Badge 
            variant="outline"
            className={`text-xs ${
              winner === 'A' 
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}
          >
            {winner === 'A' ? labelA : labelB} wins by {Math.abs(scoreA - scoreB).toFixed(1)}
          </Badge>
        </div>
      )}
    </div>
  );
}