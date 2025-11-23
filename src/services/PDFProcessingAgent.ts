/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PDFProcessingAgent - Vision-based extraction with bounding box coordinates
 *
 * This agent:
 * 1. Converts PDF pages to high-res images
 * 2. Sends to Gemini Vision API with extraction prompts
 * 3. Extracts structured data with bounding box coordinates
 * 4. Returns coordinates for citation highlighting
 *
 * Uses hybrid approach: File Search for grounding + Vision for coordinates
 */

import AppStateManager from '../state/AppStateManager';
import StatusManager from '../utils/status';
import { logErrorWithContext, categorizeAIError, formatErrorMessage } from '../utils/aiErrorHandler';
import { PDFPageRenderer, type RenderedPage, type PageBatch } from './PDFPageRenderer';
import { CoordinateTransformer, type NormalizedBoundingBox } from './CoordinateTransformer';
import type {
    PDFProcessingResult,
    PDFProcessingOptions,
    ExtractedDataWithCoordinates,
    PageExtractionResult,
    BoundingBoxCoordinate
} from '../types';
import type { ClinicalStudyExtraction } from '../schemas/ExtractionSchema';

// ==================== PROMPTS ====================

const VISION_EXTRACTION_PROMPT = `Analyze this medical research PDF page and extract clinical study data with precise bounding box coordinates.

For each piece of data you extract, provide:
1. The field name (from schema below)
2. The extracted value
3. Confidence score (0-1)
4. Bounding box as normalized coordinates [x, y, width, height] where values are 0-1 fractions of page dimensions
5. The exact quote from the document

IMPORTANT:
- Coordinates must be precise for text highlighting
- Use top-left as origin (0,0)
- x increases rightward, y increases downward
- Bounding box should tightly fit the source text

Schema fields:
- studyIdentification.title
- studyIdentification.firstAuthor
- studyIdentification.publicationYear
- studyIdentification.journal
- studyIdentification.doi
- studyIdentification.pmid
- eligibility.population
- eligibility.intervention
- eligibility.comparator
- eligibility.outcomes
- eligibility.timing
- eligibility.studyType
- baselineCharacteristics.totalPatients
- baselineCharacteristics.arms
- outcomes.primaryOutcome
- outcomes.mortality
- complicationsAndPredictors.complications
- complicationsAndPredictors.predictors

Return JSON in this exact format:
{
  "extractions": [
    {
      "field": "studyIdentification.title",
      "value": "Study title here",
      "confidence": 0.95,
      "bbox": [0.1, 0.05, 0.8, 0.03],
      "quote": "exact text from document"
    }
  ],
  "pageMetadata": {
    "hasTable": true,
    "hasFigure": false,
    "sectionType": "methods"
  }
}`;

// ==================== TYPES ====================

interface VisionAPIResponse {
    extractions: Array<{
        field: string;
        value: any;
        confidence: number;
        bbox: [number, number, number, number];
        quote: string;
    }>;
    pageMetadata: {
        hasTable: boolean;
        hasFigure: boolean;
        sectionType: string;
    };
}

// ==================== MAIN AGENT ====================

export const PDFProcessingAgent = {
    /**
     * Process entire PDF document with vision-based extraction
     */
    async processDocument(
        options: PDFProcessingOptions = {}
    ): Promise<PDFProcessingResult | null> {
        const state = AppStateManager.getState();

        // Validate prerequisites
        if (!state.pdfDoc) {
            StatusManager.show('Please load a PDF first', 'warning');
            return null;
        }

        if (state.isProcessing) {
            StatusManager.show('Processing already in progress', 'warning');
            return null;
        }

        const startTime = Date.now();
        const warnings: string[] = [];
        let apiCalls = 0;

        try {
            AppStateManager.setState({ isProcessing: true });
            StatusManager.showLoading(true);
            StatusManager.show('Starting vision-based extraction...', 'info');

            // Default options
            const opts: Required<PDFProcessingOptions> = {
                useFileSearch: options.useFileSearch ?? false,
                targetFields: options.targetFields ?? [],
                dpi: options.dpi ?? 150,
                pagesPerBatch: options.pagesPerBatch ?? 3,
                maxParallel: options.maxParallel ?? 2
            };

            // Step 1: Render all pages to images
            StatusManager.show('Rendering PDF pages to images...', 'info');
            const renderedPages = await PDFPageRenderer.renderAllPages(
                { dpi: opts.dpi, format: 'png' },
                (completed, total) => {
                    StatusManager.show(`Rendering page ${completed}/${total}...`, 'info');
                }
            );

            // Step 2: Create batches for API calls
            const batches = PDFPageRenderer.createBatches(renderedPages, opts.pagesPerBatch);
            StatusManager.show(`Processing ${renderedPages.length} pages in ${batches.length} batches...`, 'info');

            // Step 3: Process batches with controlled parallelism
            const allPageResults: PageExtractionResult[] = [];

            for (let i = 0; i < batches.length; i += opts.maxParallel) {
                const batchChunk = batches.slice(i, i + opts.maxParallel);

                const chunkResults = await Promise.all(
                    batchChunk.map(batch => this.processBatch(batch))
                );

                apiCalls += batchChunk.length;

                // Flatten results
                for (const results of chunkResults) {
                    allPageResults.push(...results);
                }

                // Progress update
                const progress = Math.min(i + opts.maxParallel, batches.length);
                StatusManager.show(
                    `Processed ${progress}/${batches.length} batches...`,
                    'info'
                );
            }

            // Step 4: Merge and deduplicate results
            const { extraction, coordinates } = this.mergeResults(allPageResults);

            // Step 5: Calculate statistics
            const processingStats = {
                totalTime: Date.now() - startTime,
                pagesProcessed: renderedPages.length,
                apiCalls,
                estimatedCost: PDFPageRenderer.estimateCost(renderedPages.length, opts.dpi)
            };

            StatusManager.show(
                `Extraction complete! ${coordinates.size} fields with coordinates. Cost: $${processingStats.estimatedCost.toFixed(4)}`,
                'success',
                5000
            );

            return {
                extraction,
                coordinates,
                processingStats,
                warnings
            };

        } catch (error) {
            logErrorWithContext(error as Error, 'PDFProcessingAgent.processDocument');
            const categorized = categorizeAIError(error as Error, 'Vision Extraction');
            StatusManager.show(formatErrorMessage(categorized), 'error', 15000);
            return null;
        } finally {
            AppStateManager.setState({ isProcessing: false });
            StatusManager.showLoading(false);
        }
    },

    /**
     * Process a single batch of pages
     */
    async processBatch(batch: PageBatch): Promise<PageExtractionResult[]> {
        const results: PageExtractionResult[] = [];

        for (const page of batch.pages) {
            try {
                const result = await this.processPage(page);
                results.push(result);
            } catch (error) {
                console.error(`Failed to process page ${page.pageNum}:`, error);
                // Return empty result for failed page
                results.push({
                    pageNum: page.pageNum,
                    extractions: [],
                    metadata: {
                        hasTable: false,
                        hasFigure: false,
                        sectionType: 'unknown'
                    }
                });
            }
        }

        return results;
    },

    /**
     * Process a single page with Vision API
     */
    async processPage(page: RenderedPage): Promise<PageExtractionResult> {
        // Get Gemini API key
        const apiKey = (window as any).GEMINI_API_KEY ||
            import.meta.env.VITE_GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error('Gemini API key not configured');
        }

        // Call Gemini Vision API
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: VISION_EXTRACTION_PROMPT
                            },
                            {
                                inlineData: {
                                    mimeType: page.mimeType,
                                    data: page.base64Data
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json'
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Vision API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        // Parse response
        const parsedResponse = this.parseVisionResponse(data, page);

        return parsedResponse;
    },

    /**
     * Parse Vision API response with robust error handling
     */
    parseVisionResponse(data: any, page: RenderedPage): PageExtractionResult {
        try {
            // Extract text from response
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                console.warn(`No text in Vision response for page ${page.pageNum}`);
                return this.emptyPageResult(page.pageNum);
            }

            // Parse JSON - handle potential markdown code blocks
            let jsonText = text;
            if (jsonText.includes('```')) {
                const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (match) {
                    jsonText = match[1];
                }
            }

            const parsed: VisionAPIResponse = JSON.parse(jsonText.trim());

            // Validate structure
            if (!parsed.extractions || !Array.isArray(parsed.extractions)) {
                console.warn(`Invalid extraction structure for page ${page.pageNum}`);
                return this.emptyPageResult(page.pageNum);
            }

            // Convert to internal format with coordinate transformation
            const extractions: ExtractedDataWithCoordinates[] = parsed.extractions.map(ext => {
                // Convert normalized bbox to BoundingBoxCoordinate
                const [x, y, width, height] = ext.bbox;
                const normalized: NormalizedBoundingBox = { x, y, width, height };

                const coordinate = CoordinateTransformer.createBoundingBoxCoordinate(
                    page.pageNum,
                    normalized,
                    { width: page.pdfWidth, height: page.pdfHeight }
                );

                return {
                    fieldName: ext.field,
                    value: ext.value,
                    confidence: ext.confidence,
                    coordinates: [coordinate],
                    sourceQuote: ext.quote
                };
            });

            return {
                pageNum: page.pageNum,
                extractions,
                metadata: parsed.pageMetadata || {
                    hasTable: false,
                    hasFigure: false,
                    sectionType: 'unknown'
                }
            };

        } catch (error) {
            console.error(`Failed to parse Vision response for page ${page.pageNum}:`, error);
            return this.emptyPageResult(page.pageNum);
        }
    },

    /**
     * Create empty page result for error cases
     */
    emptyPageResult(pageNum: number): PageExtractionResult {
        return {
            pageNum,
            extractions: [],
            metadata: {
                hasTable: false,
                hasFigure: false,
                sectionType: 'unknown'
            }
        };
    },

    /**
     * Merge results from all pages into unified extraction
     */
    mergeResults(pageResults: PageExtractionResult[]): {
        extraction: Partial<ClinicalStudyExtraction>;
        coordinates: Map<string, BoundingBoxCoordinate[]>;
    } {
        const coordinates = new Map<string, BoundingBoxCoordinate[]>();
        const fieldValues = new Map<string, {
            value: any;
            confidence: number;
            quote: string;
        }>();

        // Collect all extractions grouped by field
        for (const pageResult of pageResults) {
            for (const ext of pageResult.extractions) {
                const fieldName = ext.fieldName;

                // Add coordinates
                if (!coordinates.has(fieldName)) {
                    coordinates.set(fieldName, []);
                }
                coordinates.get(fieldName)!.push(...ext.coordinates);

                // Keep highest confidence value
                const existing = fieldValues.get(fieldName);
                if (!existing || ext.confidence > existing.confidence) {
                    fieldValues.set(fieldName, {
                        value: ext.value,
                        confidence: ext.confidence,
                        quote: ext.sourceQuote
                    });
                }
            }
        }

        // Build extraction object
        const extraction = this.buildExtraction(fieldValues);

        return { extraction, coordinates };
    },

    /**
     * Build ClinicalStudyExtraction from field values
     */
    buildExtraction(
        fieldValues: Map<string, { value: any; confidence: number; quote: string }>
    ): Partial<ClinicalStudyExtraction> {
        const getValue = (field: string): any => {
            return fieldValues.get(field)?.value ?? null;
        };

        return {
            studyIdentification: {
                doi: getValue('studyIdentification.doi'),
                pmid: getValue('studyIdentification.pmid'),
                citation: getValue('studyIdentification.citation') || '',
                firstAuthor: getValue('studyIdentification.firstAuthor') || '',
                publicationYear: getValue('studyIdentification.publicationYear'),
                journal: getValue('studyIdentification.journal') || '',
                title: getValue('studyIdentification.title') || ''
            },
            eligibility: {
                population: getValue('eligibility.population') || '',
                intervention: getValue('eligibility.intervention') || '',
                comparator: getValue('eligibility.comparator') || '',
                outcomes: getValue('eligibility.outcomes') || '',
                timing: getValue('eligibility.timing') || '',
                studyType: getValue('eligibility.studyType') || '',
                inclusionCriteria: getValue('eligibility.inclusionCriteria') || [],
                exclusionCriteria: getValue('eligibility.exclusionCriteria') || []
            },
            baselineCharacteristics: {
                totalPatients: getValue('baselineCharacteristics.totalPatients') || 0,
                arms: getValue('baselineCharacteristics.arms') || [],
                comorbidities: getValue('baselineCharacteristics.comorbidities') || []
            }
            // Add other sections as needed
        };
    },

    /**
     * Highlight extractions on PDF using coordinates
     */
    async highlightExtractions(
        coordinates: Map<string, BoundingBoxCoordinate[]>,
        fieldName?: string
    ): Promise<void> {
        const state = AppStateManager.getState();
        if (!state.pdfDoc) return;

        // Get container
        const container = document.querySelector('.pdf-page');
        if (!container) return;

        // Clear existing highlights
        container.querySelectorAll('.vision-highlight').forEach(el => el.remove());

        // Get current page coordinates
        const currentPage = state.currentPage;
        const scale = state.scale;

        // Determine which coordinates to highlight
        const toHighlight = fieldName
            ? coordinates.get(fieldName) || []
            : Array.from(coordinates.values()).flat();

        // Filter to current page
        const pageCoords = toHighlight.filter(c => c.pageNum === currentPage);

        // Get page viewport for dimensions
        const page = await state.pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale });

        // Create highlight overlays using normalized coordinates directly
        // Vision API and HTML both use top-left origin, so we can convert directly
        for (const coord of pageCoords) {
            // Use normalized coordinates scaled to viewport
            const displayX = coord.normalizedX * viewport.width;
            const displayY = coord.normalizedY * viewport.height;
            const displayWidth = coord.normalizedWidth * viewport.width;
            const displayHeight = coord.normalizedHeight * viewport.height;

            const highlight = document.createElement('div');
            highlight.className = 'vision-highlight';
            highlight.style.cssText = `
                position: absolute;
                left: ${displayX}px;
                top: ${displayY}px;
                width: ${displayWidth}px;
                height: ${displayHeight}px;
                background-color: rgba(255, 255, 0, 0.3);
                border: 2px solid rgba(255, 200, 0, 0.8);
                pointer-events: none;
                z-index: 100;
                transition: all 0.2s ease;
            `;

            container.appendChild(highlight);
        }
    },

    /**
     * Clear all highlights
     */
    clearHighlights(): void {
        document.querySelectorAll('.vision-highlight').forEach(el => el.remove());
    }
};

export default PDFProcessingAgent;
