/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PDFDatabaseVisionIntegration
 *
 * Integrates PDFProcessingAgent with PDF database for automatic vision extraction
 * when PDFs are loaded from the database dropdown.
 *
 * Features:
 * - Auto-run vision extraction when PDF loaded from database
 * - Store extraction results in database alongside PDF
 * - Cache results to avoid re-processing
 * - Option to toggle auto-extraction on/off
 * - Retrieve cached extraction results
 */

import AppStateManager from '../state/AppStateManager';
import StatusManager from '../utils/status';
import { PDFProcessingAgent } from './PDFProcessingAgent';
import { PDFDatabaseService, type StoredPDF } from './PDFDatabaseService';
import type { PDFProcessingResult } from '../types';

// ==================== TYPES ====================

export interface ExtractionCacheEntry {
    pdfId: string;
    extractionResult: PDFProcessingResult;
    timestamp: number;
    version: string; // For cache invalidation
}

export interface PDFWithExtraction extends StoredPDF {
    extractionCache?: {
        timestamp: number;
        hasExtraction: boolean;
        fieldCount: number;
        estimatedCost: number;
    };
}

// ==================== CONSTANTS ====================

const EXTRACTION_CACHE_KEY = 'pdf_vision_extractions';
const CACHE_VERSION = '1.0';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ==================== STATE MANAGEMENT ====================

let autoExtractionEnabled = true;
let extractionInProgress = false;
let cachedExtractions = new Map<string, ExtractionCacheEntry>();

// Load cached extractions from localStorage on init
function loadCacheFromStorage(): void {
    try {
        const stored = localStorage.getItem(EXTRACTION_CACHE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            cachedExtractions = new Map(
                Object.entries(parsed).map(([key, value]: [string, any]) => [
                    key,
                    {
                        pdfId: value.pdfId,
                        extractionResult: value.extractionResult,
                        timestamp: value.timestamp,
                        version: value.version
                    } as ExtractionCacheEntry
                ])
            );
            console.log(`[PDFDatabaseVisionIntegration] Loaded ${cachedExtractions.size} cached extractions`);
        }
    } catch (error) {
        console.error('[PDFDatabaseVisionIntegration] Failed to load cache from storage:', error);
    }
}

function saveCacheToStorage(): void {
    try {
        const obj = Object.fromEntries(cachedExtractions);
        localStorage.setItem(EXTRACTION_CACHE_KEY, JSON.stringify(obj));
    } catch (error) {
        console.error('[PDFDatabaseVisionIntegration] Failed to save cache to storage:', error);
    }
}

// ==================== PUBLIC API ====================

export const PDFDatabaseVisionIntegration = {
    /**
     * Initialize the integration
     */
    async init(): Promise<void> {
        loadCacheFromStorage();
        console.log('[PDFDatabaseVisionIntegration] Initialized with auto-extraction:', autoExtractionEnabled);
    },

    /**
     * Set whether to automatically run extraction when loading PDFs
     */
    setAutoExtraction(enabled: boolean): void {
        autoExtractionEnabled = enabled;
        console.log('[PDFDatabaseVisionIntegration] Auto-extraction:', enabled ? 'enabled' : 'disabled');
        StatusManager.show(
            `Vision extraction auto-run: ${enabled ? 'enabled' : 'disabled'}`,
            'info'
        );
    },

    /**
     * Check if auto-extraction is enabled
     */
    isAutoExtractionEnabled(): boolean {
        return autoExtractionEnabled;
    },

    /**
     * Called when a PDF is loaded from the database
     * Optionally runs vision extraction if auto-extraction is enabled
     */
    async onPDFLoaded(pdfId: string, options?: { autoExtract?: boolean }): Promise<void> {
        const shouldAutoExtract = options?.autoExtract ?? autoExtractionEnabled;

        if (!shouldAutoExtract) {
            console.log('[PDFDatabaseVisionIntegration] Auto-extraction disabled, skipping');
            return;
        }

        // Check if extraction already cached
        const cached = cachedExtractions.get(pdfId);
        if (cached && !this.isCacheExpired(cached)) {
            console.log('[PDFDatabaseVisionIntegration] Using cached extraction for:', pdfId);
            AppStateManager.setState({
                visionExtractionData: cached.extractionResult,
                lastExtraction: {
                    pdfId,
                    timestamp: cached.timestamp,
                    cached: true
                }
            });

            StatusManager.show(
                `Loaded cached extraction (${cached.extractionResult.coordinates.size} fields)`,
                'info'
            );
            return;
        }

        // Run extraction
        await this.extractAndStoreResults(pdfId);
    },

    /**
     * Run vision extraction and store results
     */
    async extractAndStoreResults(pdfId: string): Promise<PDFProcessingResult | null> {
        if (extractionInProgress) {
            StatusManager.show('Extraction already in progress', 'warning');
            return null;
        }

        if (!AppStateManager.getState().pdfDoc) {
            StatusManager.show('No PDF loaded for extraction', 'warning');
            return null;
        }

        extractionInProgress = true;

        try {
            StatusManager.show('Starting vision-based extraction...', 'info');

            // Run the extraction
            const result = await PDFProcessingAgent.processDocument({
                dpi: 150,
                pagesPerBatch: 3,
                maxParallel: 2
            });

            if (!result) {
                throw new Error('Extraction failed');
            }

            // Store result in cache
            const cacheEntry: ExtractionCacheEntry = {
                pdfId,
                extractionResult: result,
                timestamp: Date.now(),
                version: CACHE_VERSION
            };

            cachedExtractions.set(pdfId, cacheEntry);
            saveCacheToStorage();

            // Update state
            AppStateManager.setState({
                visionExtractionData: result,
                lastExtraction: {
                    pdfId,
                    timestamp: Date.now(),
                    cached: false
                }
            });

            console.log('[PDFDatabaseVisionIntegration] Stored extraction results for:', pdfId);

            return result;

        } catch (error) {
            console.error('[PDFDatabaseVisionIntegration] Extraction failed:', error);
            StatusManager.show('Extraction failed - check console for details', 'error');
            return null;
        } finally {
            extractionInProgress = false;
        }
    },

    /**
     * Get cached extraction for a PDF
     */
    getCachedExtraction(pdfId: string): PDFProcessingResult | null {
        const cached = cachedExtractions.get(pdfId);
        if (cached && !this.isCacheExpired(cached)) {
            return cached.extractionResult;
        }
        return null;
    },

    /**
     * Check if a PDF has cached extraction
     */
    hasCachedExtraction(pdfId: string): boolean {
        const cached = cachedExtractions.get(pdfId);
        return cached !== undefined && !this.isCacheExpired(cached);
    },

    /**
     * Clear cache for a specific PDF (useful after re-extraction)
     */
    clearCache(pdfId?: string): void {
        if (pdfId) {
            cachedExtractions.delete(pdfId);
            console.log('[PDFDatabaseVisionIntegration] Cleared cache for:', pdfId);
        } else {
            cachedExtractions.clear();
            console.log('[PDFDatabaseVisionIntegration] Cleared all cache');
        }
        saveCacheToStorage();
    },

    /**
     * Force re-extraction (bypass cache)
     */
    async forceReExtraction(pdfId: string): Promise<PDFProcessingResult | null> {
        this.clearCache(pdfId);
        return this.extractAndStoreResults(pdfId);
    },

    /**
     * Get extraction statistics
     */
    getStats(): {
        cacheSize: number;
        autoExtractionEnabled: boolean;
        extractionInProgress: boolean;
    } {
        return {
            cacheSize: cachedExtractions.size,
            autoExtractionEnabled,
            extractionInProgress
        };
    },

    /**
     * Get all cached extraction metadata (for UI display)
     */
    getCacheMetadata(): Array<{
        pdfId: string;
        fieldCount: number;
        timestamp: number;
        estimatedCost: number;
        isExpired: boolean;
    }> {
        return Array.from(cachedExtractions.values()).map(entry => ({
            pdfId: entry.pdfId,
            fieldCount: entry.extractionResult.coordinates.size,
            timestamp: entry.timestamp,
            estimatedCost: entry.extractionResult.processingStats.estimatedCost,
            isExpired: this.isCacheExpired(entry)
        }));
    },

    /**
     * Export extraction data for a PDF
     */
    exportExtractionData(pdfId: string, format: 'json' | 'csv' = 'json'): string | null {
        const cached = this.getCachedExtraction(pdfId);
        if (!cached) return null;

        if (format === 'json') {
            return JSON.stringify({
                pdfId,
                extraction: cached.extraction,
                coordinates: Array.from(cached.coordinates.entries()),
                processingStats: cached.processingStats,
                exportedAt: new Date().toISOString()
            }, null, 2);
        } else if (format === 'csv') {
            // Convert to CSV format
            const rows: string[] = [
                'Field,Value,Confidence,Page,X,Y,Width,Height'
            ];

            cached.coordinates.forEach((coordList, fieldName) => {
                const value = (cached.extraction as any)[fieldName] || '';
                coordList.forEach(coord => {
                    rows.push(
                        `"${fieldName}","${value}","1.0",${coord.pageNum},${coord.normalizedX},${coord.normalizedY},${coord.normalizedWidth},${coord.normalizedHeight}`
                    );
                });
            });

            return rows.join('\n');
        }

        return null;
    },

    /**
     * Check if cache entry has expired
     */
    isCacheExpired(entry: ExtractionCacheEntry): boolean {
        const age = Date.now() - entry.timestamp;
        return age > CACHE_TTL;
    }
};

export default PDFDatabaseVisionIntegration;
