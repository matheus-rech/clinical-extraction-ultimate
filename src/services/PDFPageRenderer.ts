/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PDFPageRenderer - Converts PDF pages to high-resolution images for Vision API
 *
 * This service handles:
 * - Rendering PDF pages to canvas at configurable DPI
 * - Converting to base64 PNG/JPEG for API upload
 * - Page batching for efficient API calls
 * - Caching rendered pages to avoid re-renders
 */

import AppStateManager from '../state/AppStateManager';
import LRUCache from '../utils/LRUCache';

/**
 * Options for rendering PDF pages to images
 */
export interface PageRenderOptions {
    /** DPI for rendering (default 150, higher = better quality but more cost) */
    dpi: number;
    /** Image format */
    format: 'png' | 'jpeg';
    /** JPEG quality 0-1 (only for jpeg format) */
    quality?: number;
    /** Optional page range [start, end] (1-indexed, inclusive) */
    pageRange?: [number, number];
}

/**
 * Rendered page data ready for Vision API
 */
export interface RenderedPage {
    /** Page number (1-indexed) */
    pageNum: number;
    /** Base64 encoded image data (without data URL prefix) */
    base64Data: string;
    /** MIME type */
    mimeType: string;
    /** Actual image width in pixels */
    width: number;
    /** Actual image height in pixels */
    height: number;
    /** Original PDF width in points */
    pdfWidth: number;
    /** Original PDF height in points */
    pdfHeight: number;
    /** Scale factor used (DPI / 72) */
    scale: number;
}

/**
 * Batch of pages for API call
 */
export interface PageBatch {
    /** Pages in this batch */
    pages: RenderedPage[];
    /** Batch index */
    batchIndex: number;
    /** Total batches */
    totalBatches: number;
}

// Cache for rendered pages (key: `${pageNum}_${dpi}_${format}`)
const pageImageCache = new LRUCache<string, RenderedPage>(20);

export const PDFPageRenderer = {
    /**
     * Default rendering options
     */
    defaultOptions: {
        dpi: 150,
        format: 'png' as const,
        quality: 0.85
    },

    /**
     * Render a single PDF page to an image
     */
    async renderPage(
        pageNum: number,
        options: Partial<PageRenderOptions> = {}
    ): Promise<RenderedPage> {
        const opts = { ...this.defaultOptions, ...options };
        const cacheKey = `${pageNum}_${opts.dpi}_${opts.format}`;

        // Check cache first
        const cached = pageImageCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const state = AppStateManager.getState();
        if (!state.pdfDoc) {
            throw new Error('No PDF document loaded');
        }

        // Get page from PDF.js
        const page = await state.pdfDoc.getPage(pageNum);

        // Calculate scale based on DPI (PDF default is 72 DPI)
        const scale = opts.dpi / 72;
        const viewport = page.getViewport({ scale });

        // Create canvas for rendering
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get canvas 2D context');
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render page to canvas
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Convert to base64
        const mimeType = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const dataUrl = opts.format === 'jpeg'
            ? canvas.toDataURL(mimeType, opts.quality)
            : canvas.toDataURL(mimeType);

        // Extract base64 data (remove data URL prefix)
        const base64Data = dataUrl.split(',')[1];

        // Get original PDF dimensions
        const originalViewport = page.getViewport({ scale: 1 });

        const result: RenderedPage = {
            pageNum,
            base64Data,
            mimeType,
            width: viewport.width,
            height: viewport.height,
            pdfWidth: originalViewport.width,
            pdfHeight: originalViewport.height,
            scale
        };

        // Cache the result
        pageImageCache.set(cacheKey, result);

        return result;
    },

    /**
     * Render multiple pages with progress callback
     */
    async renderPages(
        pageNums: number[],
        options: Partial<PageRenderOptions> = {},
        onProgress?: (completed: number, total: number) => void
    ): Promise<RenderedPage[]> {
        const results: RenderedPage[] = [];
        const total = pageNums.length;

        for (let i = 0; i < pageNums.length; i++) {
            const pageNum = pageNums[i];
            const rendered = await this.renderPage(pageNum, options);
            results.push(rendered);

            if (onProgress) {
                onProgress(i + 1, total);
            }
        }

        return results;
    },

    /**
     * Render all pages in the document
     */
    async renderAllPages(
        options: Partial<PageRenderOptions> = {},
        onProgress?: (completed: number, total: number) => void
    ): Promise<RenderedPage[]> {
        const state = AppStateManager.getState();
        if (!state.pdfDoc) {
            throw new Error('No PDF document loaded');
        }

        const pageNums = Array.from(
            { length: state.totalPages },
            (_, i) => i + 1
        );

        return this.renderPages(pageNums, options, onProgress);
    },

    /**
     * Create batches of pages for API calls
     *
     * @param pages - Rendered pages to batch
     * @param pagesPerBatch - Number of pages per batch (default 3)
     */
    createBatches(
        pages: RenderedPage[],
        pagesPerBatch: number = 3
    ): PageBatch[] {
        const batches: PageBatch[] = [];
        const totalBatches = Math.ceil(pages.length / pagesPerBatch);

        for (let i = 0; i < pages.length; i += pagesPerBatch) {
            const batchPages = pages.slice(i, i + pagesPerBatch);
            batches.push({
                pages: batchPages,
                batchIndex: batches.length,
                totalBatches
            });
        }

        return batches;
    },

    /**
     * Get estimated cost for rendering pages
     *
     * @param pageCount - Number of pages
     * @param dpi - DPI setting
     * @returns Estimated cost in USD
     */
    estimateCost(pageCount: number, dpi: number = 150): number {
        // Gemini Vision pricing: ~$0.00025 per image under 128k tokens
        // Higher DPI = more tokens
        const baseCost = 0.00025;
        const dpiMultiplier = dpi / 150; // 150 DPI as baseline

        return pageCount * baseCost * dpiMultiplier;
    },

    /**
     * Clear the page image cache
     */
    clearCache(): void {
        pageImageCache.clear();
    },

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; maxSize: number } {
        return {
            size: pageImageCache.size(),
            maxSize: 20
        };
    },

    /**
     * Optimize DPI based on page content type
     *
     * @param pageNum - Page number to analyze
     * @returns Recommended DPI (100 for text-heavy, 200 for tables/figures)
     */
    async getRecommendedDpi(pageNum: number): Promise<number> {
        const state = AppStateManager.getState();
        if (!state.pdfDoc) {
            return 150;
        }

        try {
            const page = await state.pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Count text items vs page area
            const viewport = page.getViewport({ scale: 1 });
            const pageArea = viewport.width * viewport.height;
            const textDensity = textContent.items.length / pageArea;

            // High text density = text-heavy page, lower DPI OK
            // Low text density = likely has figures/tables, higher DPI needed
            if (textDensity > 0.001) {
                return 100; // Text-heavy
            } else if (textDensity < 0.0005) {
                return 200; // Figure/table heavy
            }

            return 150; // Default
        } catch {
            return 150;
        }
    }
};

export default PDFPageRenderer;
