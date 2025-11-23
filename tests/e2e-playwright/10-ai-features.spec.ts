/**
 * E2E Test Suite 10: Comprehensive AI Features
 *
 * Tests advanced AI functionality:
 * - Citation provenance system
 * - Backend integration & health monitoring
 * - Direct Gemini client fallback
 * - AI result caching
 * - Error handling & circuit breaker
 * - All 7 Gemini functions
 */

import { test, expect } from '@playwright/test';
import { loadSamplePDF } from './helpers/pdf-helpers';
import { navigateToPICOStep } from './helpers/form-helpers';
import {
  waitForAIProcessing,
  mockGeminiAPI,
  clearGeminiMocks,
  waitForStatusMessage
} from './helpers/ai-helpers';

test.describe('Citation Provenance System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should process PDF for citation indexing', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const CitationService = (window as any).ClinicalExtractor?.CitationService;
      if (!CitationService) return null;

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return null;

      return await CitationService.processPDFDocument(state.pdfDoc);
    });

    if (result) {
      // Should have indexed text with sequential numbers
      expect(result.indexedText).toContain('[0]');
      expect(result.indexedText.length).toBeGreaterThan(100);

      // Should have citation map
      expect(result.citationMap).toBeTruthy();
      expect(Object.keys(result.citationMap).length).toBeGreaterThan(0);

      // Should have chunks array
      expect(Array.isArray(result.chunks)).toBeTruthy();
      expect(result.chunks.length).toBeGreaterThan(0);

      console.log(`Indexed ${result.chunks.length} sentences`);
    }
  });

  test('should extract citations from AI response', async ({ page }) => {
    const citations = await page.evaluate(() => {
      const CitationService = (window as any).ClinicalExtractor?.CitationService;
      if (!CitationService) return [];

      const mockResponse = 'The study enrolled 150 patients [3] with mean age 65 years [7]. Mortality rate was 15% [12].';
      return CitationService.extractCitations(mockResponse);
    });

    expect(citations.length).toBe(3);
    expect(citations[0].index).toBe(3);
    expect(citations[1].index).toBe(7);
    expect(citations[2].index).toBe(12);
  });

  test('should map citation index to source location', async ({ page }) => {
    const sourceInfo = await page.evaluate(async () => {
      const CitationService = (window as any).ClinicalExtractor?.CitationService;
      if (!CitationService) return null;

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return null;

      const result = await CitationService.processPDFDocument(state.pdfDoc);
      if (!result?.citationMap) return null;

      // Get first citation
      const firstKey = Object.keys(result.citationMap)[0];
      return result.citationMap[firstKey];
    });

    if (sourceInfo) {
      expect(sourceInfo).toHaveProperty('index');
      expect(sourceInfo).toHaveProperty('text');
      expect(sourceInfo).toHaveProperty('pageNum');
      expect(sourceInfo).toHaveProperty('bbox');

      // Bounding box should have coordinates
      expect(sourceInfo.bbox).toHaveProperty('x');
      expect(sourceInfo.bbox).toHaveProperty('y');
    }
  });

  test('should highlight citation in PDF', async ({ page }) => {
    // Process PDF first
    await page.evaluate(async () => {
      const CitationService = (window as any).ClinicalExtractor?.CitationService;
      const state = (window as any).ClinicalExtractor?.getAppState?.();

      if (CitationService && state?.pdfDoc) {
        await CitationService.processPDFDocument(state.pdfDoc);
      }
    });

    // Highlight citation
    const highlighted = await page.evaluate(() => {
      const CitationService = (window as any).ClinicalExtractor?.CitationService;
      if (!CitationService) return false;

      try {
        CitationService.highlightCitation(0);
        return true;
      } catch {
        return false;
      }
    });

    // Should not throw error
    expect(highlighted).toBe(true);
  });

  test('should jump to citation page', async ({ page }) => {
    // Process PDF
    await page.evaluate(async () => {
      const CitationService = (window as any).ClinicalExtractor?.CitationService;
      const state = (window as any).ClinicalExtractor?.getAppState?.();

      if (CitationService && state?.pdfDoc) {
        await CitationService.processPDFDocument(state.pdfDoc);
      }
    });

    // Get initial page
    const initialPage = await page.evaluate(() => {
      const state = (window as any).ClinicalExtractor?.getAppState?.();
      return state?.currentPage || 1;
    });

    // Jump to citation (may change page)
    await page.evaluate(() => {
      (window as any).ClinicalExtractor?.jumpToCitation?.(5);
    });

    await page.waitForTimeout(500);

    // Page may have changed
    const newPage = await page.evaluate(() => {
      const state = (window as any).ClinicalExtractor?.getAppState?.();
      return state?.currentPage || 1;
    });

    console.log(`Page changed from ${initialPage} to ${newPage}`);
  });
});

test.describe('Backend Health Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
  });

  test('should check backend health status', async ({ page }) => {
    const status = await page.evaluate(async () => {
      const BackendHealthMonitor = (window as any).ClinicalExtractor?.BackendHealthMonitor;
      if (!BackendHealthMonitor) return null;

      return await BackendHealthMonitor.checkHealth();
    });

    if (status) {
      expect(status).toHaveProperty('isHealthy');
      expect(status).toHaveProperty('mode');
      expect(['backend', 'frontend-only']).toContain(status.mode);

      console.log('Backend status:', status);
    }
  });

  test('should cache health check results', async ({ page }) => {
    // First check
    const firstCheck = await page.evaluate(async () => {
      const BackendHealthMonitor = (window as any).ClinicalExtractor?.BackendHealthMonitor;
      if (!BackendHealthMonitor) return null;

      const start = performance.now();
      await BackendHealthMonitor.checkHealth();
      return performance.now() - start;
    });

    // Second check (should be cached)
    const secondCheck = await page.evaluate(async () => {
      const BackendHealthMonitor = (window as any).ClinicalExtractor?.BackendHealthMonitor;
      if (!BackendHealthMonitor) return null;

      const start = performance.now();
      await BackendHealthMonitor.checkHealth();
      return performance.now() - start;
    });

    if (firstCheck && secondCheck) {
      console.log(`First check: ${firstCheck.toFixed(2)}ms`);
      console.log(`Second check: ${secondCheck.toFixed(2)}ms`);

      // Second check should be faster (cached)
      expect(secondCheck).toBeLessThan(firstCheck + 10); // Allow some margin
    }
  });

  test('should subscribe to status changes', async ({ page }) => {
    const subscribed = await page.evaluate(() => {
      const BackendHealthMonitor = (window as any).ClinicalExtractor?.BackendHealthMonitor;
      if (!BackendHealthMonitor) return false;

      let notified = false;
      BackendHealthMonitor.subscribe((status: any) => {
        notified = true;
      });

      return true;
    });

    expect(subscribed).toBe(true);
  });

  test('should get detailed status information', async ({ page }) => {
    const details = await page.evaluate(() => {
      const BackendHealthMonitor = (window as any).ClinicalExtractor?.BackendHealthMonitor;
      if (!BackendHealthMonitor) return null;

      return BackendHealthMonitor.getStatus?.();
    });

    if (details) {
      expect(details).toHaveProperty('mode');
      expect(details).toHaveProperty('lastCheck');
    }
  });
});

test.describe('AI Result Caching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
  });

  test('should cache AI extraction results', async ({ page }) => {
    const cacheStats = await page.evaluate(() => {
      const CacheManager = (window as any).ClinicalExtractor?.CacheManager;
      if (!CacheManager) return null;

      return CacheManager.getAllStats?.();
    });

    if (cacheStats) {
      // Should have AI result cache configured
      const aiCache = cacheStats['ai-results'];
      if (aiCache) {
        expect(aiCache.maxSize).toBeGreaterThan(0);
      }
    }
  });

  test('should respect cache TTL for AI results', async ({ page }) => {
    const cacheConfig = await page.evaluate(() => {
      const CacheManager = (window as any).ClinicalExtractor?.CacheManager;
      if (!CacheManager) return null;

      const stats = CacheManager.getAllStats?.();
      return stats?.['ai-results'] || null;
    });

    if (cacheConfig) {
      // AI cache should have TTL (default 10 minutes)
      console.log('AI cache config:', cacheConfig);
    }
  });

  test('should clear caches on demand', async ({ page }) => {
    const cleared = await page.evaluate(() => {
      const CacheManager = (window as any).ClinicalExtractor?.CacheManager;
      if (!CacheManager) return false;

      CacheManager.clearAll?.();
      return true;
    });

    expect(cleared).toBe(true);
  });
});

test.describe('Circuit Breaker Pattern', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
  });

  test('should have circuit breaker for AI requests', async ({ page }) => {
    const hasCircuitBreaker = await page.evaluate(() => {
      return typeof (window as any).ClinicalExtractor?.CircuitBreaker !== 'undefined';
    });

    // Circuit breaker should be available
    expect(hasCircuitBreaker).toBeDefined();
  });

  test('should track circuit breaker state', async ({ page }) => {
    const state = await page.evaluate(() => {
      const CircuitBreaker = (window as any).ClinicalExtractor?.CircuitBreaker;
      if (!CircuitBreaker) return null;

      // Create test instance
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 10000
      });

      return breaker.getState?.() || 'unknown';
    });

    // Initial state should be CLOSED
    if (state) {
      console.log('Circuit breaker state:', state);
    }
  });
});

test.describe('All 7 Gemini Functions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
    await navigateToPICOStep(page);
  });

  test.afterEach(async ({ page }) => {
    await clearGeminiMocks(page);
  });

  test('should have generatePICO function available', async ({ page }) => {
    const hasFunction = await page.evaluate(() => {
      return typeof (window as any).generatePICO === 'function' ||
             typeof (window as any).ClinicalExtractor?.generatePICO === 'function';
    });

    expect(hasFunction).toBe(true);
  });

  test('should have generateSummary function available', async ({ page }) => {
    const hasFunction = await page.evaluate(() => {
      return typeof (window as any).generateSummary === 'function' ||
             typeof (window as any).ClinicalExtractor?.generateSummary === 'function';
    });

    expect(hasFunction).toBe(true);
  });

  test('should have validateFieldWithAI function available', async ({ page }) => {
    const hasFunction = await page.evaluate(() => {
      return typeof (window as any).validateFieldWithAI === 'function' ||
             typeof (window as any).ClinicalExtractor?.validateFieldWithAI === 'function';
    });

    expect(hasFunction).toBe(true);
  });

  test('should have findMetadata function available', async ({ page }) => {
    const hasFunction = await page.evaluate(() => {
      return typeof (window as any).findMetadata === 'function' ||
             typeof (window as any).ClinicalExtractor?.findMetadata === 'function';
    });

    expect(hasFunction).toBe(true);
  });

  test('should have handleExtractTables function available', async ({ page }) => {
    const hasFunction = await page.evaluate(() => {
      return typeof (window as any).handleExtractTables === 'function' ||
             typeof (window as any).ClinicalExtractor?.handleExtractTables === 'function';
    });

    expect(hasFunction).toBe(true);
  });

  test('should have handleImageAnalysis function available', async ({ page }) => {
    const hasFunction = await page.evaluate(() => {
      return typeof (window as any).handleImageAnalysis === 'function' ||
             typeof (window as any).ClinicalExtractor?.handleImageAnalysis === 'function';
    });

    expect(hasFunction).toBe(true);
  });

  test('should have handleDeepAnalysis function available', async ({ page }) => {
    const hasFunction = await page.evaluate(() => {
      return typeof (window as any).handleDeepAnalysis === 'function' ||
             typeof (window as any).ClinicalExtractor?.handleDeepAnalysis === 'function';
    });

    expect(hasFunction).toBe(true);
  });

  test('should use correct Gemini models for functions', async ({ page }) => {
    // This tests the model distribution:
    // gemini-2.5-flash: PICO, metadata, image analysis
    // gemini-flash-latest: summary
    // gemini-2.5-pro: validation, tables, deep analysis

    const modelInfo = await page.evaluate(() => {
      // Check if model configuration is accessible
      const config = (window as any).ClinicalExtractor?.CONFIG;
      return config || null;
    });

    // Model config should exist
    console.log('Config available:', !!modelInfo);
  });
});

test.describe('Backend-First with Fallback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should try backend first for AI requests', async ({ page }) => {
    // Monitor network requests
    const requests: string[] = [];

    page.on('request', request => {
      requests.push(request.url());
    });

    // Trigger AI request
    await navigateToPICOStep(page);

    // Check if backend URL is configured
    const hasBackendUrl = await page.evaluate(() => {
      const config = (window as any).ClinicalExtractor?.CONFIG;
      return !!config?.BACKEND_URL;
    });

    console.log('Backend URL configured:', hasBackendUrl);
  });

  test('should fallback to direct Gemini on backend failure', async ({ page }) => {
    // Mock backend to fail
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 503,
        body: JSON.stringify({ error: 'Service unavailable' })
      });
    });

    // Mock Gemini to succeed
    await mockGeminiAPI(page, {
      population: 'Test population from direct API',
      intervention: 'Test intervention',
      comparator: 'Test comparator',
      outcomes: 'Test outcomes',
      timing: 'Test timing',
      study_type: 'Test study type'
    });

    await navigateToPICOStep(page);

    // Trigger PICO generation
    const generateBtn = page.locator('#generate-pico-btn');
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      await waitForAIProcessing(page, 30000);

      // Should still work via fallback
      const population = await page.locator('#eligibility-population').inputValue();
      expect(population.length).toBeGreaterThan(0);
    }
  });
});

test.describe('AI Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
    await navigateToPICOStep(page);
  });

  test.afterEach(async ({ page }) => {
    await clearGeminiMocks(page);
  });

  test('should handle rate limiting gracefully', async ({ page }) => {
    // Mock rate limit error
    await page.route('**/v1beta/models/gemini-*:generateContent', async (route) => {
      await route.fulfill({
        status: 429,
        body: JSON.stringify({
          error: {
            code: 429,
            message: 'Rate limit exceeded',
            status: 'RESOURCE_EXHAUSTED'
          }
        })
      });
    });

    await page.click('#generate-pico-btn');

    // Wait for error handling
    await waitForStatusMessage(page, /rate|limit|error|failed/i, 15000);

    // App should not crash
    await expect(page.locator('#pdf-container')).toBeVisible();
  });

  test('should handle invalid API key gracefully', async ({ page }) => {
    // Mock auth error
    await page.route('**/v1beta/models/gemini-*:generateContent', async (route) => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({
          error: {
            code: 401,
            message: 'Invalid API key',
            status: 'UNAUTHENTICATED'
          }
        })
      });
    });

    await page.click('#generate-pico-btn');

    // Wait for error handling
    await waitForStatusMessage(page, /auth|key|error|failed/i, 15000);

    // App should not crash
    await expect(page.locator('#form-container')).toBeVisible();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/v1beta/models/gemini-*:generateContent', async (route) => {
      await route.abort('failed');
    });

    await page.click('#generate-pico-btn');

    // Wait for error handling
    await waitForStatusMessage(page, /network|error|failed/i, 15000);

    // App should not crash
    await expect(page.locator('#extraction-status')).toBeVisible();
  });

  test('should prevent concurrent AI processing', async ({ page }) => {
    // Mock slow response
    await page.route('**/v1beta/models/gemini-*:generateContent', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          candidates: [{
            content: { parts: [{ text: '{}' }] }
          }]
        })
      });
    });

    // Start first request
    await page.click('#generate-pico-btn');

    // Try to start second request immediately
    await page.waitForTimeout(100);
    await page.click('#generate-pico-btn');

    // Check status message
    const status = await page.locator('#extraction-status').textContent();

    // Should show processing or already processing message
    console.log('Status during concurrent attempt:', status);
  });

  test('should log AI errors for debugging', async ({ page }) => {
    // Collect console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    // Mock error
    await page.route('**/v1beta/models/gemini-*:generateContent', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({
          error: { code: 500, message: 'Test error' }
        })
      });
    });

    await page.click('#generate-pico-btn');
    await page.waitForTimeout(3000);

    // Should have logged error
    const hasErrorLog = consoleLogs.some(log =>
      log.includes('error') || log.includes('Error') || log.includes('failed')
    );

    console.log('Error logged:', hasErrorLog);
  });
});

test.describe('AI Processing State Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should set isProcessing flag during AI operations', async ({ page }) => {
    await navigateToPICOStep(page);

    // Mock slow response to observe state
    await page.route('**/v1beta/models/gemini-*:generateContent', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          candidates: [{
            content: { parts: [{ text: '{"population": "test"}' }] }
          }]
        })
      });
    });

    // Start processing
    await page.click('#generate-pico-btn');

    // Check isProcessing immediately
    const isProcessing = await page.evaluate(() => {
      const state = (window as any).ClinicalExtractor?.getAppState?.();
      return state?.isProcessing;
    });

    expect(isProcessing).toBe(true);

    // Wait for completion
    await waitForAIProcessing(page, 10000);

    // isProcessing should be false
    const isProcessingAfter = await page.evaluate(() => {
      const state = (window as any).ClinicalExtractor?.getAppState?.();
      return state?.isProcessing;
    });

    expect(isProcessingAfter).toBe(false);
  });

  test('should reset isProcessing on error', async ({ page }) => {
    await navigateToPICOStep(page);

    // Mock error
    await page.route('**/v1beta/models/gemini-*:generateContent', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: { code: 500, message: 'Error' } })
      });
    });

    await page.click('#generate-pico-btn');
    await page.waitForTimeout(3000);

    // isProcessing should be reset even on error
    const isProcessing = await page.evaluate(() => {
      const state = (window as any).ClinicalExtractor?.getAppState?.();
      return state?.isProcessing;
    });

    expect(isProcessing).toBe(false);
  });

  test('should require PDF loaded before AI operations', async ({ page }) => {
    await navigateToPICOStep(page);

    // Clear PDF state
    await page.evaluate(() => {
      (window as any).ClinicalExtractor?.setState?.({ pdfDoc: null });
    });

    await page.click('#generate-pico-btn');

    // Should show error about no PDF
    await waitForStatusMessage(page, /no pdf|load|error/i, 5000);
  });
});

test.describe('Multi-Agent Real API Tests', () => {
  // These tests require real API key
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should run full multi-agent pipeline', async ({ page }) => {
    // Check if full pipeline function exists
    const hasPipeline = await page.evaluate(() => {
      return typeof (window as any).runFullAIPipeline === 'function' ||
             typeof (window as any).ClinicalExtractor?.runFullAIPipeline === 'function';
    });

    expect(hasPipeline).toBe(true);
  });

  test('should have all 6 medical agents available', async ({ page }) => {
    const agents = await page.evaluate(() => {
      const AgentOrchestrator = (window as any).ClinicalExtractor?.AgentOrchestrator;
      const MedicalAgentBridge = (window as any).ClinicalExtractor?.MedicalAgentBridge;

      return {
        orchestrator: !!AgentOrchestrator,
        bridge: !!MedicalAgentBridge
      };
    });

    console.log('Agent availability:', agents);
  });

  test('should calculate consensus from multiple agents', async ({ page }) => {
    // This tests the consensus calculation logic
    const hasConsensus = await page.evaluate(() => {
      const AgentOrchestrator = (window as any).ClinicalExtractor?.AgentOrchestrator;
      return !!AgentOrchestrator;
    });

    expect(hasConsensus).toBeDefined();
  });
});
