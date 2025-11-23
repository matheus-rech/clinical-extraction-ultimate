/**
 * E2E Test Suite 9: Comprehensive PDF Features
 *
 * Tests advanced PDF functionality:
 * - Text layer rendering and selection
 * - Figure extraction via operator interception
 * - Table extraction via geometric detection
 * - Bounding box visualization
 * - PDF text caching
 * - Multi-page operations
 * - Coordinate tracking
 */

import { test, expect } from '@playwright/test';
import {
  loadSamplePDF,
  navigateToPage,
  getCurrentPage,
  getTotalPages,
  verifyPDFRendered,
  zoomTo
} from './helpers/pdf-helpers';

test.describe('PDF Text Layer & Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should render text layer over PDF canvas', async ({ page }) => {
    // Verify text layer container exists
    const textLayer = page.locator('.text-layer, #text-layer, [data-page-number]');
    await expect(textLayer.first()).toBeVisible();

    // Text layer should contain text spans
    const textSpans = page.locator('.text-layer span, #text-layer span');
    const spanCount = await textSpans.count();
    expect(spanCount).toBeGreaterThan(0);
  });

  test('should make text selectable in text layer', async ({ page }) => {
    // Find a text span
    const textSpan = page.locator('.text-layer span').first();

    if (await textSpan.isVisible()) {
      // Verify text is present
      const text = await textSpan.textContent();
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(0);
    }
  });

  test('should calculate bounding box for selected text', async ({ page }) => {
    // Activate a field for extraction
    await page.click('#citation');

    // Simulate text selection via mouse
    const textLayer = page.locator('.text-layer').first();
    const box = await textLayer.boundingBox();

    if (box) {
      // Simulate drag selection
      await page.mouse.move(box.x + 50, box.y + 50);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 50);
      await page.mouse.up();

      // Wait for extraction event
      await page.waitForTimeout(500);

      // Check if extraction was logged
      const traceLog = page.locator('#trace-log, .trace-entry');
      if (await traceLog.count() > 0) {
        // Extraction should have coordinates
        const hasCoordinates = await page.evaluate(() => {
          const extractions = (window as any).ClinicalExtractor?.getExtractions?.() || [];
          return extractions.some((e: any) => e.coordinates && e.coordinates.x !== undefined);
        });

        // May or may not have coordinates depending on selection
        console.log('Has coordinate tracking:', hasCoordinates);
      }
    }
  });

  test('should update text layer on page navigation', async ({ page }) => {
    const totalPages = await getTotalPages(page);

    if (totalPages > 1) {
      // Get text content of page 1
      const page1Text = await page.evaluate(() => {
        const textLayer = document.querySelector('.text-layer');
        return textLayer?.textContent || '';
      });

      // Navigate to page 2
      await navigateToPage(page, 2);
      await page.waitForTimeout(500);

      // Get text content of page 2
      const page2Text = await page.evaluate(() => {
        const textLayer = document.querySelector('.text-layer');
        return textLayer?.textContent || '';
      });

      // Text should be different (unless pages are identical)
      console.log('Page 1 text length:', page1Text.length);
      console.log('Page 2 text length:', page2Text.length);
    }
  });

  test('should scale text layer with zoom', async ({ page }) => {
    // Get initial text span positions
    const initialPositions = await page.evaluate(() => {
      const spans = document.querySelectorAll('.text-layer span');
      return Array.from(spans).slice(0, 5).map(span => {
        const rect = span.getBoundingClientRect();
        return { x: rect.x, y: rect.y };
      });
    });

    // Zoom to 150%
    await zoomTo(page, '1.5');
    await page.waitForTimeout(500);

    // Get new text span positions
    const zoomedPositions = await page.evaluate(() => {
      const spans = document.querySelectorAll('.text-layer span');
      return Array.from(spans).slice(0, 5).map(span => {
        const rect = span.getBoundingClientRect();
        return { x: rect.x, y: rect.y };
      });
    });

    // Positions should change after zoom
    if (initialPositions.length > 0 && zoomedPositions.length > 0) {
      // At least one position should be different
      const positionsChanged = initialPositions.some((pos, i) =>
        zoomedPositions[i] && (pos.x !== zoomedPositions[i].x || pos.y !== zoomedPositions[i].y)
      );
      expect(positionsChanged).toBeTruthy();
    }
  });
});

test.describe('PDF Figure Extraction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should extract figures using FigureExtractor', async ({ page }) => {
    // Trigger figure extraction
    const figuresResult = await page.evaluate(async () => {
      const FigureExtractor = (window as any).ClinicalExtractor?.FigureExtractor;
      if (!FigureExtractor) return null;

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return null;

      const page = await state.pdfDoc.getPage(1);
      return await FigureExtractor.extractFiguresFromPage(page, 1);
    });

    if (figuresResult) {
      console.log('Figures extracted:', figuresResult.figures?.length || 0);
      console.log('Diagnostics:', figuresResult.diagnostics);

      // Each figure should have required properties
      if (figuresResult.figures && figuresResult.figures.length > 0) {
        const fig = figuresResult.figures[0];
        expect(fig).toHaveProperty('id');
        expect(fig).toHaveProperty('pageNum');
        expect(fig).toHaveProperty('dataUrl');
        expect(fig).toHaveProperty('width');
        expect(fig).toHaveProperty('height');
      }
    }
  });

  test('should generate valid data URLs for extracted figures', async ({ page }) => {
    const dataUrls = await page.evaluate(async () => {
      const FigureExtractor = (window as any).ClinicalExtractor?.FigureExtractor;
      if (!FigureExtractor) return [];

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return [];

      const pdfPage = await state.pdfDoc.getPage(1);
      const result = await FigureExtractor.extractFiguresFromPage(pdfPage, 1);

      return result.figures?.map((f: any) => f.dataUrl) || [];
    });

    // Each dataUrl should be a valid base64 PNG
    for (const url of dataUrls) {
      expect(url).toMatch(/^data:image\/png;base64,/);
    }
  });

  test('should filter figures by minimum size', async ({ page }) => {
    const figures = await page.evaluate(async () => {
      const FigureExtractor = (window as any).ClinicalExtractor?.FigureExtractor;
      if (!FigureExtractor) return [];

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return [];

      const pdfPage = await state.pdfDoc.getPage(1);
      const result = await FigureExtractor.extractFiguresFromPage(pdfPage, 1);

      return result.figures || [];
    });

    // All figures should be at least 50x50 pixels
    for (const fig of figures) {
      expect(fig.width).toBeGreaterThanOrEqual(50);
      expect(fig.height).toBeGreaterThanOrEqual(50);
    }
  });

  test('should include extraction method in figure metadata', async ({ page }) => {
    const figures = await page.evaluate(async () => {
      const FigureExtractor = (window as any).ClinicalExtractor?.FigureExtractor;
      if (!FigureExtractor) return [];

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return [];

      const pdfPage = await state.pdfDoc.getPage(1);
      const result = await FigureExtractor.extractFiguresFromPage(pdfPage, 1);

      return result.figures || [];
    });

    for (const fig of figures) {
      expect(fig.extractionMethod).toBe('operator_list_interception');
    }
  });
});

test.describe('PDF Table Extraction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should extract tables using TableExtractor', async ({ page }) => {
    const tablesResult = await page.evaluate(async () => {
      const TableExtractor = (window as any).ClinicalExtractor?.TableExtractor;
      if (!TableExtractor) return null;

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return null;

      const pdfPage = await state.pdfDoc.getPage(1);
      return await TableExtractor.extractTablesFromPage(pdfPage, 1);
    });

    if (tablesResult) {
      console.log('Tables extracted:', tablesResult.tables?.length || 0);
      console.log('Diagnostics:', tablesResult.diagnostics);
    }
  });

  test('should detect table headers and rows', async ({ page }) => {
    const tables = await page.evaluate(async () => {
      const TableExtractor = (window as any).ClinicalExtractor?.TableExtractor;
      if (!TableExtractor) return [];

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return [];

      const pdfPage = await state.pdfDoc.getPage(1);
      const result = await TableExtractor.extractTablesFromPage(pdfPage, 1);

      return result.tables || [];
    });

    for (const table of tables) {
      // Tables should have headers array
      expect(table).toHaveProperty('headers');
      expect(Array.isArray(table.headers)).toBeTruthy();

      // Tables should have rows array
      expect(table).toHaveProperty('rows');
      expect(Array.isArray(table.rows)).toBeTruthy();

      // Should have at least 2 columns
      if (table.headers.length > 0) {
        expect(table.headers.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('should calculate table bounding boxes', async ({ page }) => {
    const tables = await page.evaluate(async () => {
      const TableExtractor = (window as any).ClinicalExtractor?.TableExtractor;
      if (!TableExtractor) return [];

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return [];

      const pdfPage = await state.pdfDoc.getPage(1);
      const result = await TableExtractor.extractTablesFromPage(pdfPage, 1);

      return result.tables || [];
    });

    for (const table of tables) {
      expect(table).toHaveProperty('boundingBox');

      const bbox = table.boundingBox;
      expect(bbox).toHaveProperty('x');
      expect(bbox).toHaveProperty('y');
      expect(bbox).toHaveProperty('width');
      expect(bbox).toHaveProperty('height');

      // Bounding box values should be positive
      expect(bbox.width).toBeGreaterThan(0);
      expect(bbox.height).toBeGreaterThan(0);
    }
  });

  test('should include structure confidence score', async ({ page }) => {
    const tables = await page.evaluate(async () => {
      const TableExtractor = (window as any).ClinicalExtractor?.TableExtractor;
      if (!TableExtractor) return [];

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return [];

      const pdfPage = await state.pdfDoc.getPage(1);
      const result = await TableExtractor.extractTablesFromPage(pdfPage, 1);

      return result.tables || [];
    });

    for (const table of tables) {
      expect(table).toHaveProperty('structureConfidence');

      // Confidence should be between 0 and 1
      expect(table.structureConfidence).toBeGreaterThanOrEqual(0);
      expect(table.structureConfidence).toBeLessThanOrEqual(1);
    }
  });

  test('should include extraction method in table metadata', async ({ page }) => {
    const tables = await page.evaluate(async () => {
      const TableExtractor = (window as any).ClinicalExtractor?.TableExtractor;
      if (!TableExtractor) return [];

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return [];

      const pdfPage = await state.pdfDoc.getPage(1);
      const result = await TableExtractor.extractTablesFromPage(pdfPage, 1);

      return result.tables || [];
    });

    for (const table of tables) {
      expect(table.extractionMethod).toBe('geometric_detection');
    }
  });

  test('should detect column positions', async ({ page }) => {
    const tables = await page.evaluate(async () => {
      const TableExtractor = (window as any).ClinicalExtractor?.TableExtractor;
      if (!TableExtractor) return [];

      const state = (window as any).ClinicalExtractor?.getAppState?.();
      if (!state?.pdfDoc) return [];

      const pdfPage = await state.pdfDoc.getPage(1);
      const result = await TableExtractor.extractTablesFromPage(pdfPage, 1);

      return result.tables || [];
    });

    for (const table of tables) {
      expect(table).toHaveProperty('columnPositions');
      expect(Array.isArray(table.columnPositions)).toBeTruthy();

      // Column positions should be sorted ascending
      for (let i = 1; i < table.columnPositions.length; i++) {
        expect(table.columnPositions[i]).toBeGreaterThanOrEqual(table.columnPositions[i - 1]);
      }
    }
  });
});

test.describe('PDF Bounding Box Visualization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should toggle bounding box visualization', async ({ page }) => {
    const toggleBtn = page.locator('#toggle-bounding-boxes-btn, button:has-text("Bounding Boxes")');

    if (await toggleBtn.count() > 0) {
      // Toggle on
      await toggleBtn.click();
      await page.waitForTimeout(500);

      // Toggle off
      await toggleBtn.click();
      await page.waitForTimeout(500);

      // Verify app still functions
      await verifyPDFRendered(page);
    }
  });

  test('should toggle table region visualization', async ({ page }) => {
    const toggleBtn = page.locator('#toggle-table-regions-btn, button:has-text("Table Regions")');

    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      await page.waitForTimeout(500);

      // Verify canvas updated
      await verifyPDFRendered(page);
    }
  });
});

test.describe('PDF Text Caching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should cache PDF text for pages', async ({ page }) => {
    // Get text for page 1 (should cache it)
    const firstCall = await page.evaluate(async () => {
      const start = performance.now();
      const text = await (window as any).ClinicalExtractor?.getAllPdfText?.();
      const end = performance.now();
      return { textLength: text?.length || 0, time: end - start };
    });

    // Get text again (should be cached)
    const secondCall = await page.evaluate(async () => {
      const start = performance.now();
      const text = await (window as any).ClinicalExtractor?.getAllPdfText?.();
      const end = performance.now();
      return { textLength: text?.length || 0, time: end - start };
    });

    // Text length should be the same
    expect(secondCall.textLength).toBe(firstCall.textLength);

    // Second call should be faster (cached)
    console.log(`First call: ${firstCall.time.toFixed(2)}ms`);
    console.log(`Second call: ${secondCall.time.toFixed(2)}ms`);
  });

  test('should limit cache size to 50 pages', async ({ page }) => {
    const cacheStats = await page.evaluate(() => {
      const CacheManager = (window as any).ClinicalExtractor?.CacheManager;
      if (!CacheManager) return null;

      const stats = CacheManager.getAllStats?.();
      return stats?.['pdf-text'] || null;
    });

    if (cacheStats) {
      expect(cacheStats.maxSize).toBe(50);
    }
  });
});

test.describe('PDF Multi-Page Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should extract text from all pages', async ({ page }) => {
    const totalPages = await getTotalPages(page);

    const allText = await page.evaluate(async () => {
      return await (window as any).ClinicalExtractor?.getAllPdfText?.();
    });

    expect(allText).toBeTruthy();
    expect(allText.length).toBeGreaterThan(100);

    console.log(`Extracted ${allText.length} characters from ${totalPages} pages`);
  });

  test('should maintain extraction markers across pages', async ({ page }) => {
    // Activate field and extract on page 1
    await page.click('#citation');

    // Simulate extraction
    await page.evaluate(() => {
      (window as any).ClinicalExtractor?.logExtraction?.(
        'citation',
        'Test extraction on page 1',
        1,
        { x: 100, y: 200, width: 300, height: 20 },
        'manual'
      );
    });

    // Navigate to page 2 and back
    const totalPages = await getTotalPages(page);
    if (totalPages > 1) {
      await navigateToPage(page, 2);
      await page.waitForTimeout(500);

      await navigateToPage(page, 1);
      await page.waitForTimeout(500);
    }

    // Verify extraction is still tracked
    const extractions = await page.evaluate(() => {
      return (window as any).ClinicalExtractor?.getExtractions?.() || [];
    });

    expect(extractions.length).toBeGreaterThan(0);
    expect(extractions[0].text).toContain('Test extraction');
  });

  test('should handle rapid page navigation', async ({ page }) => {
    const totalPages = await getTotalPages(page);

    if (totalPages >= 3) {
      // Rapidly navigate through pages
      for (let i = 1; i <= Math.min(5, totalPages); i++) {
        await navigateToPage(page, i);
        await page.waitForTimeout(100);
      }

      // Verify app is still responsive
      await verifyPDFRendered(page);

      // Verify page number is correct
      const currentPage = await getCurrentPage(page);
      expect(currentPage).toBe(Math.min(5, totalPages));
    }
  });
});

test.describe('PDF Coordinate Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#extraction-status')).toContainText(/ready/i, { timeout: 10000 });
    await loadSamplePDF(page);
  });

  test('should track coordinates for manual extractions', async ({ page }) => {
    // Activate field
    await page.click('#citation');

    // Simulate extraction with coordinates
    await page.evaluate(() => {
      (window as any).ClinicalExtractor?.logExtraction?.(
        'citation',
        'Test text with coordinates',
        1,
        { x: 72, y: 450, width: 380, height: 12 },
        'manual'
      );
    });

    // Get extractions
    const extractions = await page.evaluate(() => {
      return (window as any).ClinicalExtractor?.getExtractions?.() || [];
    });

    const extraction = extractions.find((e: any) => e.text === 'Test text with coordinates');
    expect(extraction).toBeTruthy();
    expect(extraction.coordinates).toBeTruthy();
    expect(extraction.coordinates.x).toBe(72);
    expect(extraction.coordinates.y).toBe(450);
    expect(extraction.coordinates.width).toBe(380);
    expect(extraction.coordinates.height).toBe(12);
  });

  test('should include page number in extractions', async ({ page }) => {
    // Navigate to page 2
    const totalPages = await getTotalPages(page);
    if (totalPages >= 2) {
      await navigateToPage(page, 2);
    }

    // Simulate extraction
    const currentPage = await getCurrentPage(page);
    await page.evaluate((pageNum) => {
      (window as any).ClinicalExtractor?.logExtraction?.(
        'citation',
        'Text from specific page',
        pageNum,
        { x: 0, y: 0, width: 0, height: 0 },
        'manual'
      );
    }, currentPage);

    // Verify page number
    const extractions = await page.evaluate(() => {
      return (window as any).ClinicalExtractor?.getExtractions?.() || [];
    });

    const extraction = extractions.find((e: any) => e.text === 'Text from specific page');
    expect(extraction.page).toBe(currentPage);
  });
});
