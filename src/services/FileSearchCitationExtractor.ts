/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * FileSearchCitationExtractor
 *
 * Extracts citation information from Gemini File Search API responses
 * and connects them to PDF text for highlighting.
 *
 * The grounding metadata from File Search contains:
 * - groundingChunks: Source documents with snippets
 * - groundingSupports: Links response text to source chunks
 *
 * This service extracts the snippet text and finds the exact location
 * in the PDF for highlighting.
 */

import { FileSearchConfig } from '../config';

// ==================== TYPES ====================

/**
 * Grounding chunk from File Search response
 */
interface GroundingChunk {
    retrievedContext?: {
        uri: string;
        title?: string;
        snippet?: string;
    };
    web?: {
        uri: string;
        title: string;
    };
}

/**
 * Grounding support linking response to source
 */
interface GroundingSupport {
    segment: {
        startIndex: number;
        endIndex: number;
        text: string;
    };
    groundingChunkIndices: number[];
    confidenceScores?: number[];
}

/**
 * Grounding metadata from Gemini response
 */
interface GroundingMetadata {
    groundingChunks?: GroundingChunk[];
    groundingSupports?: GroundingSupport[];
    searchEntryPoint?: {
        renderedContent: string;
    };
    retrievalMetadata?: {
        googleSearchDynamicRetrievalScore?: number;
    };
}

/**
 * Extracted citation with source and location info
 */
export interface ExtractedCitation {
    /** Unique ID for this citation */
    id: string;
    /** The text snippet from the source document */
    sourceSnippet: string;
    /** The response text that this citation supports */
    responseText: string;
    /** Start index in response text */
    responseStartIndex: number;
    /** End index in response text */
    responseEndIndex: number;
    /** Confidence score (0-1) */
    confidence: number;
    /** URI of the source document */
    sourceUri?: string;
    /** Title of the source */
    sourceTitle?: string;
    /** Page number if found */
    pageNumber?: number;
    /** Bounding box if found */
    boundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

/**
 * Result of searching for citation in PDF
 */
export interface CitationSearchResult {
    found: boolean;
    pageNumber?: number;
    matchedText?: string;
    boundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    similarity?: number;
}

// ==================== MAIN SERVICE ====================

export const FileSearchCitationExtractor = {
    /**
     * Extract all citations from a Gemini response with grounding metadata
     */
    extractCitations(
        responseText: string,
        groundingMetadata: GroundingMetadata
    ): ExtractedCitation[] {
        const citations: ExtractedCitation[] = [];

        if (!groundingMetadata?.groundingChunks || !groundingMetadata?.groundingSupports) {
            console.log('[FileSearchCitationExtractor] No grounding metadata found');
            return citations;
        }

        const chunks = groundingMetadata.groundingChunks;
        const supports = groundingMetadata.groundingSupports;

        supports.forEach((support, supportIndex) => {
            support.groundingChunkIndices.forEach((chunkIndex, i) => {
                const chunk = chunks[chunkIndex];
                if (!chunk) return;

                // Get snippet from retrieved context or web
                const snippet = chunk.retrievedContext?.snippet || '';
                const uri = chunk.retrievedContext?.uri || chunk.web?.uri || '';
                const title = chunk.retrievedContext?.title || chunk.web?.title || '';

                // Get confidence score
                const confidence = support.confidenceScores?.[i] ?? 0.8;

                const citation: ExtractedCitation = {
                    id: `citation-${supportIndex}-${i}`,
                    sourceSnippet: snippet,
                    responseText: support.segment.text,
                    responseStartIndex: support.segment.startIndex,
                    responseEndIndex: support.segment.endIndex,
                    confidence,
                    sourceUri: uri,
                    sourceTitle: title,
                };

                citations.push(citation);
            });
        });

        console.log(`[FileSearchCitationExtractor] Extracted ${citations.length} citations`);
        return citations;
    },

    /**
     * Search for citation text in PDF and return location
     * Uses fuzzy matching to handle OCR variations
     */
    async searchTextInPDF(
        searchText: string,
        pdfTextByPage: Map<number, string>
    ): Promise<CitationSearchResult> {
        if (!searchText || searchText.length < 10) {
            return { found: false };
        }

        // Normalize search text
        const normalizedSearch = normalizeText(searchText);

        let bestMatch: CitationSearchResult = { found: false };
        let bestSimilarity = 0;

        // Search each page
        for (const [pageNum, pageText] of pdfTextByPage) {
            const normalizedPage = normalizeText(pageText);

            // Try exact match first
            if (normalizedPage.includes(normalizedSearch)) {
                const index = normalizedPage.indexOf(normalizedSearch);
                return {
                    found: true,
                    pageNumber: pageNum,
                    matchedText: searchText,
                    similarity: 1.0,
                };
            }

            // Try fuzzy match with sliding window
            const windowSize = normalizedSearch.length;
            for (let i = 0; i <= normalizedPage.length - windowSize; i += 10) {
                const window = normalizedPage.substring(i, i + windowSize);
                const similarity = calculateSimilarity(normalizedSearch, window);

                if (similarity > bestSimilarity && similarity > 0.7) {
                    bestSimilarity = similarity;
                    bestMatch = {
                        found: true,
                        pageNumber: pageNum,
                        matchedText: pageText.substring(i, i + searchText.length),
                        similarity,
                    };
                }
            }
        }

        return bestMatch;
    },

    /**
     * Process citations and find their locations in PDF
     * Returns citations enriched with page numbers and bounding boxes
     */
    async locateCitationsInPDF(
        citations: ExtractedCitation[],
        pdfTextByPage: Map<number, string>,
        searchTextFn?: (text: string) => Promise<CitationSearchResult>
    ): Promise<ExtractedCitation[]> {
        const locatedCitations: ExtractedCitation[] = [];

        for (const citation of citations) {
            // Search for the source snippet in the PDF
            const searchResult = searchTextFn
                ? await searchTextFn(citation.sourceSnippet)
                : await this.searchTextInPDF(citation.sourceSnippet, pdfTextByPage);

            if (searchResult.found) {
                locatedCitations.push({
                    ...citation,
                    pageNumber: searchResult.pageNumber,
                    boundingBox: searchResult.boundingBox,
                });

                console.log(
                    `[FileSearchCitationExtractor] Located citation on page ${searchResult.pageNumber}: ` +
                    `"${citation.sourceSnippet.substring(0, 50)}..."`
                );
            } else {
                // Still include citation but without location
                locatedCitations.push(citation);
                console.log(
                    `[FileSearchCitationExtractor] Could not locate: "${citation.sourceSnippet.substring(0, 50)}..."`
                );
            }
        }

        return locatedCitations;
    },

    /**
     * Highlight a citation in the PDF viewer
     * Integrates with the existing PDFRenderer highlighting system
     */
    highlightCitation(
        citation: ExtractedCitation,
        highlightFn: (pageNum: number, bbox: { x: number; y: number; width: number; height: number }, color?: string) => void
    ): boolean {
        if (!citation.pageNumber || !citation.boundingBox) {
            console.warn('[FileSearchCitationExtractor] Citation has no location data');
            return false;
        }

        // Use different colors based on confidence
        const color = citation.confidence > 0.9
            ? 'rgba(0, 255, 0, 0.3)'   // Green for high confidence
            : citation.confidence > 0.7
                ? 'rgba(255, 255, 0, 0.3)' // Yellow for medium
                : 'rgba(255, 165, 0, 0.3)'; // Orange for lower

        highlightFn(citation.pageNumber, citation.boundingBox, color);

        console.log(
            `[FileSearchCitationExtractor] Highlighted citation on page ${citation.pageNumber} ` +
            `(confidence: ${(citation.confidence * 100).toFixed(0)}%)`
        );

        return true;
    },

    /**
     * Create a citation sidebar entry for display
     */
    formatCitationForDisplay(citation: ExtractedCitation): string {
        const confidenceLabel = citation.confidence > 0.9
            ? '🟢 High'
            : citation.confidence > 0.7
                ? '🟡 Medium'
                : '🟠 Low';

        const pageLabel = citation.pageNumber
            ? `Page ${citation.pageNumber}`
            : 'Location unknown';

        return `
**${confidenceLabel} Confidence (${(citation.confidence * 100).toFixed(0)}%)**

> "${citation.sourceSnippet.substring(0, 150)}${citation.sourceSnippet.length > 150 ? '...' : ''}"

📍 ${pageLabel}
        `.trim();
    },

    /**
     * Check if File Search is enabled and should run in parallel
     */
    isEnabled(): boolean {
        return FileSearchConfig.enabled;
    },

    /**
     * Check if parallel mode is enabled
     */
    isParallelMode(): boolean {
        return FileSearchConfig.enabled && FileSearchConfig.parallel;
    },
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Normalize text for comparison (lowercase, remove extra whitespace)
 */
function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
}

/**
 * Calculate similarity between two strings (Jaccard similarity on words)
 */
function calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(str2.split(' ').filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
}

export default FileSearchCitationExtractor;
