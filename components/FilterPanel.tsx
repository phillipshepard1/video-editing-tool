import { useState } from 'react';
import { SegmentCategory, FilterState, EnhancedSegment } from '@/lib/types/segments';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronRight, Filter, Trash2, CheckCircle, XCircle, AlertCircle, Sparkles } from 'lucide-react';

interface FilterPanelProps {
  segments: EnhancedSegment[];
  filterState: FilterState;
  onFilterChange: (newState: FilterState) => void;
  onBulkAction: (category: SegmentCategory, action: 'keep' | 'remove') => void;
}

const CATEGORY_META = {
  [SegmentCategory.BAD_TAKE]: { 
    icon: '🔄', 
    label: 'Bad Takes', 
    color: 'destructive' as const,
    description: 'Inferior versions of content'
  },
  [SegmentCategory.PAUSE]: { 
    icon: '⏸️', 
    label: 'Pauses', 
    color: 'warning' as const,
    description: 'Silence > 2 seconds'
  },
  [SegmentCategory.FALSE_START]: { 
    icon: '🔁', 
    label: 'False Starts', 
    color: 'warning' as const,
    description: 'Incomplete attempts'
  },
  [SegmentCategory.FILLER_WORDS]: { 
    icon: '💬', 
    label: 'Filler Words', 
    color: 'secondary' as const,
    description: 'Excessive um, uh, like'
  },
  [SegmentCategory.TECHNICAL]: { 
    icon: '⚠️', 
    label: 'Technical Issues', 
    color: 'destructive' as const,
    description: 'Audio/video problems'
  },
  [SegmentCategory.REDUNDANT]: { 
    icon: '♻️', 
    label: 'Redundant', 
    color: 'default' as const,
    description: 'Repeated content (may be intentional)'
  },
  [SegmentCategory.TANGENT]: { 
    icon: '↗️', 
    label: 'Tangents', 
    color: 'default' as const,
    description: 'Off-topic (may add personality)'
  },
  [SegmentCategory.LOW_ENERGY]: { 
    icon: '📉', 
    label: 'Low Energy', 
    color: 'default' as const,
    description: 'Quiet delivery (may fit mood)'
  },
  [SegmentCategory.LONG_EXPLANATION]: { 
    icon: '📝', 
    label: 'Long Explanations', 
    color: 'default' as const,
    description: 'Extended sections (may be needed)'
  },
  [SegmentCategory.WEAK_TRANSITION]: { 
    icon: '🔀', 
    label: 'Weak Transitions', 
    color: 'default' as const,
    description: 'Awkward changes (may be natural)'
  }
};

export function FilterPanel({ segments, filterState, onFilterChange, onBulkAction }: FilterPanelProps) {
  const [showSecondary, setShowSecondary] = useState(false);
  
  const primaryCategories = [
    SegmentCategory.BAD_TAKE,
    SegmentCategory.PAUSE,
    SegmentCategory.FALSE_START,
    SegmentCategory.FILLER_WORDS,
    SegmentCategory.TECHNICAL
  ];
  
  const secondaryCategories = [
    SegmentCategory.REDUNDANT,
    SegmentCategory.TANGENT,
    SegmentCategory.LOW_ENERGY,
    SegmentCategory.LONG_EXPLANATION,
    SegmentCategory.WEAK_TRANSITION
  ];
  
  // Check if only one category is active (isolation mode)
  const activePrimaryCount = primaryCategories.filter(cat => filterState[cat]).length;
  const activeSecondaryCount = secondaryCategories.filter(cat => filterState[cat]).length;
  const isIsolated = (activePrimaryCount + activeSecondaryCount) === 1;
  
  // Count segments by category and severity
  const getCategoryCount = (category: SegmentCategory) => {
    return segments.filter(s => {
      if (!s.category) return false;
      
      // Handle legacy category mapping
      if (category === SegmentCategory.PAUSE && s.category === 'pause') return true;
      if (category === SegmentCategory.FILLER_WORDS && s.category === 'filler') return true;
      if (category === SegmentCategory.REDUNDANT && s.category === 'redundant') return true;
      if (category === SegmentCategory.TANGENT && s.category === 'off-topic') return true;
      if (category === SegmentCategory.TECHNICAL && s.category === 'technical') return true;
      
      // Direct match for new format
      return s.category === category;
    }).length;
  };
  
  const getSeverityBreakdown = (category: SegmentCategory) => {
    const categorySegments = segments.filter(s => {
      if (!s.category) return false;
      
      // Handle legacy category mapping
      if (category === SegmentCategory.PAUSE && s.category === 'pause') return true;
      if (category === SegmentCategory.FILLER_WORDS && s.category === 'filler') return true;
      if (category === SegmentCategory.REDUNDANT && s.category === 'redundant') return true;
      if (category === SegmentCategory.TANGENT && s.category === 'off-topic') return true;
      if (category === SegmentCategory.TECHNICAL && s.category === 'technical') return true;
      
      // Direct match for new format
      return s.category === category;
    });
    
    return {
      high: categorySegments.filter(s => s.severity === 'high').length,
      medium: categorySegments.filter(s => s.severity === 'medium').length,
      low: categorySegments.filter(s => s.severity === 'low').length
    };
  };
  
  const activeSegmentCount = segments.filter(segment => {
    if (!filterState[segment.category]) return false;
    if (filterState.showOnlyHighSeverity && segment.severity !== 'high') return false;
    if (segment.confidence < filterState.minConfidence) return false;
    return true;
  }).length;
  
  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            <CardTitle>Smart Filters</CardTitle>
            {isIsolated && (
              <Badge variant="default" className="text-xs animate-pulse">
                <Sparkles className="h-3 w-3 mr-1" />
                Isolated
              </Badge>
            )}
          </div>
          <Badge variant="secondary" className="font-mono">
            {activeSegmentCount}/{segments.length}
          </Badge>
        </div>
        <CardDescription>
          Control which segments to review
        </CardDescription>
        
        {/* Quick Actions */}
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newState = { ...filterState };
              primaryCategories.forEach(cat => newState[cat] = true);
              secondaryCategories.forEach(cat => newState[cat] = true);
              onFilterChange(newState);
            }}
            className="text-xs"
          >
            Show All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newState = { ...filterState };
              primaryCategories.forEach(cat => newState[cat] = false);
              secondaryCategories.forEach(cat => newState[cat] = false);
              onFilterChange(newState);
            }}
            className="text-xs"
          >
            Hide All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newState = { ...filterState };
              primaryCategories.forEach(cat => newState[cat] = true);
              secondaryCategories.forEach(cat => newState[cat] = false);
              onFilterChange(newState);
            }}
            className="text-xs"
          >
            Reset
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Primary Filters */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Standard Cuts
            </h4>
            <Badge variant="default" className="text-xs">Recommended</Badge>
          </div>
          
          <div className="space-y-3">
            {primaryCategories.map(category => {
              const count = getCategoryCount(category);
              const severity = getSeverityBreakdown(category);
              const meta = CATEGORY_META[category];
              
              // Check if this category is isolated (only one active)
              const isThisIsolated = isIsolated && filterState[category];
              
              return (
                <div key={category} className="group">
                  <div
                    onClick={(e) => {
                      // Only handle click if not clicking on the switch
                      if (e.target === e.currentTarget || !e.target.closest('[data-switch]')) {
                        e.preventDefault();
                        // If already isolated, show all primary categories
                        // Otherwise, isolate this category
                        const newState = { ...filterState };
                        if (isThisIsolated) {
                          primaryCategories.forEach(cat => newState[cat] = true);
                        } else {
                          primaryCategories.forEach(cat => newState[cat] = cat === category);
                          secondaryCategories.forEach(cat => newState[cat] = false);
                        }
                        onFilterChange(newState);
                      }
                    }}
                    className={`
                      w-full text-left rounded-lg border transform transition-all duration-200 ease-in-out
                      ${isThisIsolated 
                        ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground border-primary shadow-xl scale-[1.02] hover:scale-[1.03]' 
                        : filterState[category]
                          ? 'bg-card hover:bg-accent/50 border-border hover:scale-[1.01]'
                          : 'bg-muted/30 hover:bg-muted/50 border-muted opacity-60 hover:opacity-80'
                      }
                      hover:shadow-lg cursor-pointer active:scale-[0.99]
                    `}
                    title={isThisIsolated ? "Click to show all categories" : "Click to show only this category"}
                  >
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div data-switch onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={filterState[category]}
                            onCheckedChange={(checked) => {
                              onFilterChange({
                                ...filterState,
                                [category]: checked
                              });
                            }}
                            className="data-[state=checked]:bg-primary"
                          />
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{meta.icon}</span>
                            <span className={`font-medium ${isThisIsolated ? 'text-primary-foreground' : ''}`}>
                              {meta.label}
                            </span>
                            {isThisIsolated && (
                              <Sparkles className="h-3 w-3 ml-1 animate-pulse" />
                            )}
                            {count > 0 && (
                              <Badge 
                                variant={isThisIsolated ? "secondary" : "outline"} 
                                className={`ml-auto ${isThisIsolated ? 'bg-primary-foreground/20 text-primary-foreground' : ''}`}
                              >
                                {count}
                              </Badge>
                            )}
                          </div>
                          <p className={`text-xs mt-1 ${
                            isThisIsolated ? 'text-primary-foreground/80' : 'text-muted-foreground'
                          }`}>
                            {meta.description}
                          </p>
                        </div>
                      </div>
                    
                    {count > 0 && (
                      <div className="flex items-center gap-2 ml-4">
                        {/* Severity indicators */}
                        <div className="flex gap-1">
                          {severity.high > 0 && (
                            <Badge variant="destructive" className="text-xs px-2">
                              {severity.high}H
                            </Badge>
                          )}
                          {severity.medium > 0 && (
                            <Badge variant="warning" className="text-xs px-2">
                              {severity.medium}M
                            </Badge>
                          )}
                          {severity.low > 0 && (
                            <Badge variant="secondary" className="text-xs px-2">
                              {severity.low}L
                            </Badge>
                          )}
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onBulkAction(category, 'remove')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Secondary Filters (Collapsible) */}
        <div>
          <button
            onClick={() => setShowSecondary(!showSecondary)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSecondary ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            OPTIONAL CUTS
            <Badge variant="outline" className="ml-2">
              {secondaryCategories.reduce((sum, cat) => sum + getCategoryCount(cat), 0)} available
            </Badge>
          </button>
          
          {showSecondary && (
            <div className="mt-4 space-y-3">
              {secondaryCategories.map(category => {
                const count = getCategoryCount(category);
                const severity = getSeverityBreakdown(category);
                const meta = CATEGORY_META[category];
                const isThisIsolated = isIsolated && filterState[category];
                
                return (
                  <div key={category} className="group">
                    <div
                      onClick={(e) => {
                        // Only handle click if not clicking on the switch
                        if (e.target === e.currentTarget || !e.target.closest('[data-switch]')) {
                          e.preventDefault();
                          // If already isolated, show all secondary categories
                          // Otherwise, isolate this category
                          const newState = { ...filterState };
                          if (isThisIsolated) {
                            secondaryCategories.forEach(cat => newState[cat] = true);
                          } else {
                            primaryCategories.forEach(cat => newState[cat] = false);
                            secondaryCategories.forEach(cat => newState[cat] = cat === category);
                          }
                          onFilterChange(newState);
                        }
                      }}
                      className={`
                        w-full text-left rounded-lg border transform transition-all duration-200 ease-in-out
                        ${isThisIsolated 
                          ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground border-primary shadow-xl scale-[1.02] hover:scale-[1.03]' 
                          : filterState[category]
                            ? 'bg-card hover:bg-accent/50 border-border hover:scale-[1.01]'
                            : 'bg-muted/30 hover:bg-muted/50 border-muted opacity-60 hover:opacity-80'
                        }
                        hover:shadow-lg cursor-pointer active:scale-[0.99]
                      `}
                      title={isThisIsolated ? "Click to show all optional categories" : "Click to show only this category"}
                    >
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div data-switch onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={filterState[category]}
                              onCheckedChange={(checked) => {
                                onFilterChange({
                                  ...filterState,
                                  [category]: checked
                                });
                              }}
                              className="data-[state=checked]:bg-primary"
                            />
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{meta.icon}</span>
                              <span className={`font-medium ${isThisIsolated ? 'text-primary-foreground' : ''}`}>
                                {meta.label}
                              </span>
                              {isThisIsolated && (
                                <Sparkles className="h-3 w-3 ml-1 animate-pulse" />
                              )}
                              {count > 0 && (
                                <Badge 
                                  variant={isThisIsolated ? "secondary" : "outline"} 
                                  className={`ml-auto ${isThisIsolated ? 'bg-primary-foreground/20 text-primary-foreground' : ''}`}
                                >
                                  {count}
                                </Badge>
                              )}
                            </div>
                            <p className={`text-xs mt-1 ${
                              isThisIsolated ? 'text-primary-foreground/80' : 'text-muted-foreground'
                            }`}>
                              {meta.description}
                            </p>
                          </div>
                        </div>
                        
                        {count > 0 && (
                          <div className="flex items-center gap-2 ml-4">
                            {/* Severity indicators */}
                            <div className="flex gap-1">
                              {severity.high > 0 && (
                                <Badge variant="destructive" className="text-xs px-2">
                                  {severity.high}H
                                </Badge>
                              )}
                              {severity.medium > 0 && (
                                <Badge variant="warning" className="text-xs px-2">
                                  {severity.medium}M
                                </Badge>
                              )}
                              {severity.low > 0 && (
                                <Badge variant="secondary" className="text-xs px-2">
                                  {severity.low}L
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <Separator />
        
        {/* Advanced Filters */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Advanced Options
          </h4>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch
                  checked={filterState.showOnlyHighSeverity}
                  onCheckedChange={(checked) => {
                    onFilterChange({
                      ...filterState,
                      showOnlyHighSeverity: checked
                    });
                  }}
                />
                <div>
                  <span className="text-sm font-medium">High severity only</span>
                  <p className="text-xs text-muted-foreground">
                    Show only critical issues
                  </p>
                </div>
              </label>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Confidence threshold
                </label>
                <span className="text-sm font-mono text-muted-foreground">
                  {(filterState.minConfidence * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[filterState.minConfidence * 100]}
                onValueChange={(value) => {
                  onFilterChange({
                    ...filterState,
                    minConfidence: value[0] / 100
                  });
                }}
                min={50}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Hide suggestions below this confidence level
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}