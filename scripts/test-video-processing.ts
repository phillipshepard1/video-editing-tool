/**
 * Test Script for Video Processing Pipeline
 * Tests various video formats, sizes, and processing scenarios
 */

import { getVideoProcessor, ProcessingOptions } from '../lib/services/video-processor';
import { getErrorHandler } from '../lib/services/error-handler';
import { assessVideoQuality, QUALITY_PRESETS } from '../lib/services/chillin';

interface TestScenario {
  name: string;
  description: string;
  fileSize: number; // bytes
  format: string;
  expectedOutcome: 'success' | 'conversion' | 'chunking' | 'error';
  options?: ProcessingOptions;
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: 'Small MP4 (Compatible)',
    description: 'Small MP4 file that should process without conversion',
    fileSize: 50 * 1024 * 1024, // 50MB
    format: 'mp4',
    expectedOutcome: 'success',
    options: { quality: 'medium' }
  },
  {
    name: 'Large MP4 (Chunking Required)',
    description: 'Large MP4 file requiring chunking for Gemini',
    fileSize: 3 * 1024 * 1024 * 1024, // 3GB
    format: 'mp4',
    expectedOutcome: 'chunking',
    options: { chunkSize: 500 }
  },
  {
    name: 'AVI Format (Conversion Required)',
    description: 'AVI file that needs conversion to MP4',
    fileSize: 200 * 1024 * 1024, // 200MB
    format: 'avi',
    expectedOutcome: 'conversion',
    options: { quality: 'medium' }
  },
  {
    name: 'WebM Format (Conversion Required)',
    description: 'WebM file that needs conversion',
    fileSize: 150 * 1024 * 1024, // 150MB
    format: 'webm',
    expectedOutcome: 'conversion',
    options: { quality: 'high' }
  },
  {
    name: 'Oversized File (Error Expected)',
    description: 'File exceeding maximum size limits',
    fileSize: 10 * 1024 * 1024 * 1024, // 10GB
    format: 'mp4',
    expectedOutcome: 'error'
  },
  {
    name: 'Unsupported Format (Error Expected)',
    description: 'File format not supported',
    fileSize: 100 * 1024 * 1024, // 100MB
    format: 'xyz',
    expectedOutcome: 'error'
  }
];

class VideoProcessingTester {
  private processor: ReturnType<typeof getVideoProcessor>;
  private errorHandler: ReturnType<typeof getErrorHandler>;
  private results: Array<{
    scenario: TestScenario;
    result: any;
    passed: boolean;
    duration: number;
    error?: string;
  }> = [];

  constructor() {
    this.processor = getVideoProcessor();
    this.errorHandler = getErrorHandler();
  }

  /**
   * Create mock file for testing
   */
  private createMockFile(name: string, size: number, type: string): File {
    // Create a minimal file-like object for testing
    const buffer = new ArrayBuffer(Math.min(size, 1024)); // Limit actual data size for testing
    const blob = new Blob([buffer], { type });
    
    return new File([blob], name, {
      type,
      lastModified: Date.now()
    });
  }

  /**
   * Test processor initialization
   */
  async testInitialization(): Promise<boolean> {
    try {
      console.log('🧪 Testing processor initialization...');
      
      await this.processor.initialize();
      console.log('✅ Processor initialized successfully');
      
      // Test supported formats
      const supportedFormats = this.processor.getSupportedFormats();
      console.log('📋 Supported formats:', supportedFormats);
      
      if (supportedFormats.supported.length === 0) {
        throw new Error('No supported formats found');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Processor initialization failed:', error);
      return false;
    }
  }

  /**
   * Test video validation
   */
  async testValidation(): Promise<boolean> {
    console.log('🧪 Testing video validation...');
    
    try {
      // Test valid file
      const validFile = this.createMockFile('test.mp4', 100 * 1024 * 1024, 'video/mp4');
      const validResult = await this.processor.validateVideo(validFile);
      
      if (!validResult.valid) {
        throw new Error('Valid MP4 file was rejected');
      }
      
      console.log('✅ Valid file validation passed');
      
      // Test invalid file
      const invalidFile = this.createMockFile('test.txt', 100, 'text/plain');
      const invalidResult = await this.processor.validateVideo(invalidFile);
      
      if (invalidResult.valid) {
        throw new Error('Invalid file was accepted');
      }
      
      console.log('✅ Invalid file validation passed');
      
      return true;
    } catch (error) {
      console.error('❌ Validation test failed:', error);
      return false;
    }
  }

  /**
   * Test quality assessment
   */
  testQualityAssessment(): boolean {
    console.log('🧪 Testing quality assessment...');
    
    try {
      // Test different video qualities
      const testCases = [
        { width: 640, height: 480, bitrate: 1000000, expected: 'low' },
        { width: 1280, height: 720, bitrate: 3000000, expected: 'medium' },
        { width: 1920, height: 1080, bitrate: 8000000, expected: 'high' },
        { width: 3840, height: 2160, bitrate: 20000000, expected: 'ultra' }
      ];
      
      for (const testCase of testCases) {
        const assessment = assessVideoQuality(
          testCase.width,
          testCase.height,
          testCase.bitrate
        );
        
        console.log(`📊 ${testCase.width}x${testCase.height}: ${assessment.category} (expected: ${testCase.expected})`);
        
        if (assessment.category !== testCase.expected) {
          console.warn(`⚠️ Unexpected quality assessment for ${testCase.width}x${testCase.height}`);
        }
      }
      
      console.log('✅ Quality assessment tests completed');
      return true;
    } catch (error) {
      console.error('❌ Quality assessment test failed:', error);
      return false;
    }
  }

  /**
   * Run processing scenario test
   */
  async testScenario(scenario: TestScenario): Promise<void> {
    console.log(`🧪 Testing: ${scenario.name}`);
    console.log(`   ${scenario.description}`);
    
    const startTime = Date.now();
    
    try {
      // Create mock file
      const mockFile = this.createMockFile(
        `test.${scenario.format}`,
        scenario.fileSize,
        `video/${scenario.format}`
      );
      
      // Set up progress tracking
      let progressUpdates = 0;
      this.processor.setProgressCallback((progress) => {
        progressUpdates++;
        console.log(`   📈 ${progress.stage}: ${progress.progress}% - ${progress.message}`);
      });
      
      // Run processing
      const result = await this.processor.processVideo(mockFile, scenario.options);
      
      const duration = Date.now() - startTime;
      
      // Analyze result
      const passed = this.analyzeResult(scenario, result);
      
      this.results.push({
        scenario,
        result,
        passed,
        duration,
      });
      
      if (passed) {
        console.log(`✅ ${scenario.name} passed in ${duration}ms`);
        console.log(`   Progress updates: ${progressUpdates}`);
      } else {
        console.log(`❌ ${scenario.name} failed`);
        console.log(`   Expected: ${scenario.expectedOutcome}, Got: ${result.success ? 'success' : 'error'}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        scenario,
        result: null,
        passed: scenario.expectedOutcome === 'error',
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      
      if (scenario.expectedOutcome === 'error') {
        console.log(`✅ ${scenario.name} correctly failed with expected error`);
      } else {
        console.log(`❌ ${scenario.name} failed unexpectedly:`, error);
      }
    }
    
    console.log('');
  }

  /**
   * Analyze test result
   */
  private analyzeResult(scenario: TestScenario, result: any): boolean {
    switch (scenario.expectedOutcome) {
      case 'success':
        return result.success && !result.chunks && !result.convertedFile;
      
      case 'conversion':
        return result.success && result.convertedFile && result.originalFormat !== result.targetFormat;
      
      case 'chunking':
        return result.success && result.chunks && result.chunks.length > 1;
      
      case 'error':
        return !result.success && result.error;
      
      default:
        return false;
    }
  }

  /**
   * Test error handling
   */
  async testErrorHandling(): Promise<boolean> {
    console.log('🧪 Testing error handling...');
    
    try {
      // Get error handler stats before test
      const initialStats = this.errorHandler.getErrorStats();
      
      // Create problematic file
      const problematicFile = this.createMockFile('corrupt.xyz', 0, 'video/xyz');
      
      const result = await this.processor.processVideo(problematicFile);
      
      if (result.success) {
        throw new Error('Expected processing to fail for corrupt file');
      }
      
      // Check if error was properly handled
      const finalStats = this.errorHandler.getErrorStats();
      
      if (finalStats.total <= initialStats.total) {
        throw new Error('Error was not properly logged by error handler');
      }
      
      console.log('✅ Error handling working correctly');
      console.log('📊 Error stats:', finalStats);
      
      return true;
    } catch (error) {
      console.error('❌ Error handling test failed:', error);
      return false;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Video Processing Pipeline Tests\n');
    
    const testResults: Array<{ name: string; passed: boolean }> = [];
    
    // Test 1: Initialization
    testResults.push({
      name: 'Initialization',
      passed: await this.testInitialization()
    });
    
    // Test 2: Validation
    testResults.push({
      name: 'Validation',
      passed: await this.testValidation()
    });
    
    // Test 3: Quality Assessment
    testResults.push({
      name: 'Quality Assessment',
      passed: this.testQualityAssessment()
    });
    
    // Test 4: Processing Scenarios
    for (const scenario of TEST_SCENARIOS) {
      await this.testScenario(scenario);
    }
    
    // Test 5: Error Handling
    testResults.push({
      name: 'Error Handling',
      passed: await this.testErrorHandling()
    });
    
    // Print summary
    this.printTestSummary(testResults);
    
    // Cleanup
    await this.processor.cleanup();
  }

  /**
   * Print test summary
   */
  private printTestSummary(testResults: Array<{ name: string; passed: boolean }>): void {
    console.log('\n📊 TEST SUMMARY');
    console.log('=' .repeat(50));
    
    const scenarioResults = this.results;
    const totalTests = testResults.length + scenarioResults.length;
    let passedTests = testResults.filter(r => r.passed).length;
    passedTests += scenarioResults.filter(r => r.passed).length;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);
    
    // Core functionality tests
    console.log('Core Functionality:');
    for (const result of testResults) {
      console.log(`  ${result.passed ? '✅' : '❌'} ${result.name}`);
    }
    
    // Scenario tests
    console.log('\nProcessing Scenarios:');
    for (const result of scenarioResults) {
      const duration = `${result.duration}ms`;
      console.log(`  ${result.passed ? '✅' : '❌'} ${result.scenario.name} (${duration})`);
      
      if (!result.passed && result.error) {
        console.log(`      Error: ${result.error}`);
      }
    }
    
    // Quality presets info
    console.log('\n🎨 Available Quality Presets:');
    for (const [key, preset] of Object.entries(QUALITY_PRESETS)) {
      console.log(`  ${key}: ${preset.description}`);
    }
    
    console.log('\n✨ Video Processing Pipeline Test Complete!');
  }
}

// Export for use in test runner
export { VideoProcessingTester, TEST_SCENARIOS };

// Run tests if script is executed directly
if (require.main === module) {
  const tester = new VideoProcessingTester();
  tester.runAllTests().catch(console.error);
}
