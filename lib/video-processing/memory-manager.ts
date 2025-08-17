/**
 * Memory Manager for Video Processing
 * Monitors and manages memory usage to prevent browser crashes
 */

export interface MemoryAllocation {
  id: string;
  sizeMB: number;
  timestamp: number;
  type: 'video' | 'chunk' | 'cache' | 'temp';
}

export interface MemoryStats {
  currentUsageMB: number;
  maxUsageMB: number;
  availableMB: number;
  allocations: MemoryAllocation[];
  gcRecommended: boolean;
  warningLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface MemoryConfig {
  maxMemoryMB: number;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
  gcThresholdPercent: number;
  monitoringIntervalMs: number;
  onMemoryWarning?: (usage: number, limit: number) => void;
}

export class MemoryManager {
  private allocations = new Map<string, MemoryAllocation>();
  private config: MemoryConfig;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastGCTime = 0;
  private gcCooldownMs = 5000; // 5 seconds between GC calls
  
  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = {
      maxMemoryMB: 4096, // 4GB default
      warningThresholdPercent: 70,
      criticalThresholdPercent: 90,
      gcThresholdPercent: 80,
      monitoringIntervalMs: 2000, // Check every 2 seconds
      ...config,
    };
  }
  
  /**
   * Initialize memory monitoring
   */
  async initialize(): Promise<void> {
    try {
      // Check if Performance API is available
      if (typeof performance !== 'undefined' && performance.memory) {
        console.log('Performance memory API available');
      } else {
        console.warn('Performance memory API not available, using estimates');
      }
      
      // Start memory monitoring
      this.startMonitoring();
      
      console.log(`Memory manager initialized with ${this.config.maxMemoryMB}MB limit`);
      
    } catch (error) {
      throw new Error(`Failed to initialize memory manager: ${error}`);
    }
  }
  
  /**
   * Allocate memory for a specific operation
   */
  allocate(id: string, sizeMB: number, type: MemoryAllocation['type'] = 'temp'): boolean {
    // Check if allocation would exceed limit
    const currentUsage = this.getCurrentUsage();
    const projectedUsage = currentUsage + sizeMB;
    
    if (projectedUsage > this.config.maxMemoryMB) {
      console.warn(`Memory allocation denied: ${projectedUsage}MB would exceed ${this.config.maxMemoryMB}MB limit`);
      return false;
    }
    
    // Record allocation
    const allocation: MemoryAllocation = {
      id,
      sizeMB,
      timestamp: Date.now(),
      type,
    };
    
    this.allocations.set(id, allocation);
    
    console.log(`Allocated ${sizeMB}MB for ${id} (${type}). Total: ${projectedUsage}MB`);
    
    // Check if we should trigger GC
    if (projectedUsage > this.config.maxMemoryMB * (this.config.gcThresholdPercent / 100)) {
      this.suggestGarbageCollection();
    }
    
    return true;
  }
  
  /**
   * Deallocate memory for a specific operation
   */
  deallocate(id: string): void {
    const allocation = this.allocations.get(id);
    if (allocation) {
      this.allocations.delete(id);
      console.log(`Deallocated ${allocation.sizeMB}MB for ${id}`);
    }
  }
  
  /**
   * Check if memory can be allocated
   */
  canAllocate(sizeMB: number): boolean {
    const currentUsage = this.getCurrentUsage();
    const projectedUsage = currentUsage + sizeMB;
    return projectedUsage <= this.config.maxMemoryMB;
  }
  
  /**
   * Get current memory usage in MB
   */
  getCurrentUsage(): number {
    return Array.from(this.allocations.values())
      .reduce((total, allocation) => total + allocation.sizeMB, 0);
  }
  
  /**
   * Get actual browser memory usage (if available)
   */
  getBrowserMemoryUsage(): { usedMB: number; totalMB: number; availableMB: number } | null {
    if (typeof performance !== 'undefined' && performance.memory) {
      const memory = performance.memory;
      return {
        usedMB: memory.usedJSHeapSize / (1024 * 1024),
        totalMB: memory.totalJSHeapSize / (1024 * 1024),
        availableMB: memory.jsHeapSizeLimit / (1024 * 1024),
      };
    }
    return null;
  }
  
  /**
   * Get detailed memory statistics
   */
  getStats(): MemoryStats {
    const currentUsage = this.getCurrentUsage();
    const usagePercent = (currentUsage / this.config.maxMemoryMB) * 100;
    
    let warningLevel: MemoryStats['warningLevel'] = 'none';
    if (usagePercent >= this.config.criticalThresholdPercent) {
      warningLevel = 'critical';
    } else if (usagePercent >= this.config.warningThresholdPercent) {
      warningLevel = 'high';
    } else if (usagePercent >= 50) {
      warningLevel = 'medium';
    } else if (usagePercent >= 25) {
      warningLevel = 'low';
    }
    
    return {
      currentUsageMB: currentUsage,
      maxUsageMB: this.config.maxMemoryMB,
      availableMB: this.config.maxMemoryMB - currentUsage,
      allocations: Array.from(this.allocations.values()),
      gcRecommended: usagePercent >= this.config.gcThresholdPercent,
      warningLevel,
    };
  }
  
  /**
   * Force garbage collection if available
   */
  forceGarbageCollection(): void {
    const now = Date.now();
    
    // Respect cooldown period
    if (now - this.lastGCTime < this.gcCooldownMs) {
      console.log('GC cooldown active, skipping');
      return;
    }
    
    try {
      // Try to trigger garbage collection
      if (global.gc) {
        global.gc();
        console.log('Forced garbage collection executed');
      } else if (typeof window !== 'undefined' && (window as any).gc) {
        (window as any).gc();
        console.log('Forced garbage collection executed (window.gc)');
      } else {
        // Fallback: create memory pressure to encourage GC
        this.createMemoryPressure();
        console.log('Created memory pressure to encourage GC');
      }
      
      this.lastGCTime = now;
      
    } catch (error) {
      console.warn('Failed to force garbage collection:', error);
    }
  }
  
  /**
   * Suggest garbage collection based on usage
   */
  suggestGarbageCollection(): void {
    const stats = this.getStats();
    
    if (stats.gcRecommended) {
      console.log('Memory usage high, suggesting garbage collection');
      this.forceGarbageCollection();
    }
  }
  
  /**
   * Clear all allocations (for cleanup)
   */
  clearAllocations(): void {
    this.allocations.clear();
    console.log('All memory allocations cleared');
  }
  
  /**
   * Get allocations by type
   */
  getAllocationsByType(type: MemoryAllocation['type']): MemoryAllocation[] {
    return Array.from(this.allocations.values())
      .filter(allocation => allocation.type === type);
  }
  
  /**
   * Clean up old allocations (for leaked tracking)
   */
  cleanupOldAllocations(maxAgeMs: number = 300000): void { // 5 minutes default
    const cutoffTime = Date.now() - maxAgeMs;
    const toRemove: string[] = [];
    
    for (const [id, allocation] of this.allocations) {
      if (allocation.timestamp < cutoffTime) {
        toRemove.push(id);
        console.warn(`Cleaning up old allocation: ${id} (${allocation.sizeMB}MB)`);
      }
    }
    
    toRemove.forEach(id => this.allocations.delete(id));
  }
  
  /**
   * Set memory warning callback
   */
  setWarningCallback(callback: (usage: number, limit: number) => void): void {
    this.config.onMemoryWarning = callback;
  }
  
  /**
   * Get memory recommendations
   */
  getRecommendations(): string[] {
    const stats = this.getStats();
    const recommendations: string[] = [];
    
    if (stats.warningLevel === 'critical') {
      recommendations.push('Critical: Stop all non-essential processing immediately');
      recommendations.push('Clear browser cache and close other tabs');
      recommendations.push('Consider reducing video quality or chunk size');
    } else if (stats.warningLevel === 'high') {
      recommendations.push('High memory usage detected');
      recommendations.push('Consider processing smaller chunks');
      recommendations.push('Close unnecessary browser tabs');
    } else if (stats.warningLevel === 'medium') {
      recommendations.push('Monitor memory usage closely');
      recommendations.push('Consider reducing concurrent operations');
    }
    
    if (stats.gcRecommended) {
      recommendations.push('Garbage collection recommended');
    }
    
    // Check for potential memory leaks
    const oldAllocations = Array.from(this.allocations.values())
      .filter(a => Date.now() - a.timestamp > 600000); // 10 minutes
    
    if (oldAllocations.length > 0) {
      recommendations.push(`Potential memory leak: ${oldAllocations.length} old allocations detected`);
    }
    
    return recommendations;
  }
  
  /**
   * Shutdown memory monitoring
   */
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.clearAllocations();
    console.log('Memory manager shutdown complete');
  }
  
  // Private methods
  
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryStatus();
    }, this.config.monitoringIntervalMs);
  }
  
  private checkMemoryStatus(): void {
    const stats = this.getStats();
    
    // Check for warnings
    if (stats.warningLevel === 'critical' || stats.warningLevel === 'high') {
      if (this.config.onMemoryWarning) {
        this.config.onMemoryWarning(stats.currentUsageMB, stats.maxUsageMB);
      }
    }
    
    // Auto-cleanup old allocations
    this.cleanupOldAllocations();
    
    // Log periodic status (only if usage is significant)
    if (stats.currentUsageMB > 100) {
      console.log(`Memory status: ${stats.currentUsageMB.toFixed(1)}MB / ${stats.maxUsageMB}MB (${((stats.currentUsageMB / stats.maxUsageMB) * 100).toFixed(1)}%)`);
    }
  }
  
  private createMemoryPressure(): void {
    // Create temporary large arrays to encourage garbage collection
    const pressure: any[] = [];
    
    try {
      for (let i = 0; i < 10; i++) {
        pressure.push(new Array(1000000).fill(Math.random()));
      }
      
      // Immediately clear the arrays
      pressure.length = 0;
      
    } catch (error) {
      // Ignore errors from memory pressure creation
    }
  }
}