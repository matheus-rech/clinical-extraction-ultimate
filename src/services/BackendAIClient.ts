/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BackendAIClient - Secure AI API proxy client
 *
 * Wraps all 7 AI functions to call backend API instead of direct Gemini
 * Implements Phase 2 of Backend Migration Plan v2.0
 *
 * Security improvements:
 * - API keys never exposed to frontend
 * - Server-side authentication required
 * - Rate limiting enforced by backend
 * - Request validation and sanitization
 *
 * Architecture:
 * Frontend (BackendAIClient) → Backend (/api/ai/*) → Gemini API
 */

import BackendProxyService from './BackendProxyService';
import type { ProxyResponse } from './BackendProxyService';

// ==================== REQUEST/RESPONSE TYPES ====================

/**
 * PICO-T generation request
 */
export interface PICORequest {
    document_id?: string;
    pdf_text: string;
}

/**
 * Grounding metadata from File Search (optional)
 */
export interface GroundingMetadata {
    groundingChunks?: Array<{
        retrievedContext?: {
            uri: string;
            title?: string;
            snippet?: string;
        };
        web?: {
            uri: string;
            title: string;
        };
    }>;
    groundingSupports?: Array<{
        segment: {
            startIndex: number;
            endIndex: number;
            text: string;
        };
        groundingChunkIndices: number[];
        confidenceScores?: number[];
    }>;
}

/**
 * PICO-T generation response
 */
export interface PICOResponse {
    population: string;
    intervention: string;
    comparator: string;
    outcomes: string;
    timing: string;
    study_type: string;
    groundingMetadata?: GroundingMetadata;
}

/**
 * Summary generation request
 */
export interface SummaryRequest {
    document_id?: string;
    pdf_text: string;
}

/**
 * Summary generation response
 */
export interface SummaryResponse {
    summary: string;
    groundingMetadata?: GroundingMetadata;
}

/**
 * Field validation request
 */
export interface ValidationRequest {
    document_id?: string;
    field_id: string;
    field_value: string;
    pdf_text: string;
}

/**
 * Field validation response
 */
export interface ValidationResponse {
    is_supported: boolean;
    quote: string;
    confidence: number;
}

/**
 * Metadata extraction request
 */
export interface MetadataRequest {
    document_id?: string;
    pdf_text: string;
}

/**
 * Metadata extraction response
 */
export interface MetadataResponse {
    doi: string | null;
    pmid: string | null;
    journal: string | null;
    year: number | null;
}

/**
 * Table extraction request
 */
export interface TableExtractionRequest {
    document_id?: string;
    pdf_text: string;
}

/**
 * Table data structure
 */
export interface TableData {
    title: string;
    description: string;
    data: string[][];
}

/**
 * Table extraction response
 */
export interface TableExtractionResponse {
    tables: TableData[];
}

/**
 * Image analysis request
 */
export interface ImageAnalysisRequest {
    document_id?: string;
    image_base64: string;
    prompt: string;
}

/**
 * Image analysis response
 */
export interface ImageAnalysisResponse {
    analysis: string;
}

/**
 * Deep analysis request
 */
export interface DeepAnalysisRequest {
    document_id?: string;
    pdf_text: string;
    prompt: string;
}

/**
 * Deep analysis response
 */
export interface DeepAnalysisResponse {
    analysis: string;
}

// ==================== BACKEND AI CLIENT ====================

/**
 * BackendAIClient - Centralized client for backend AI operations
 *
 * All 7 AI functions now proxy through backend for security:
 * 1. generatePICO() - PICO-T extraction
 * 2. generateSummary() - Key findings summary
 * 3. validateField() - Field validation
 * 4. findMetadata() - Metadata search
 * 5. extractTables() - Table extraction
 * 6. analyzeImage() - Image analysis
 * 7. deepAnalysis() - Deep document analysis
 */
export const BackendAIClient = {
    /**
     * 1. Generate PICO-T summary
     * Proxies to: POST /ai/generate-pico
     */
    async generatePICO(request: PICORequest): Promise<PICOResponse> {
        try {
            const response = await BackendProxyService.request<PICOResponse>({
                url: '/ai/generate-pico',
                method: 'POST',
                body: request,
                cache: true,        // PICO extraction is deterministic, can be cached
                timeout: 60000      // 60s timeout for AI processing
            });
            return response.data;
        } catch (error) {
            console.error('BackendAIClient.generatePICO failed:', error);
            throw new Error(
                `Failed to generate PICO-T via backend: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    },

    /**
     * 2. Generate summary
     * Proxies to: POST /ai/generate-summary
     */
    async generateSummary(request: SummaryRequest): Promise<SummaryResponse> {
        try {
            const response = await BackendProxyService.request<SummaryResponse>({
                url: '/ai/generate-summary',
                method: 'POST',
                body: request,
                cache: true,        // Summary generation is deterministic, can be cached
                timeout: 60000      // 60s timeout for AI processing
            });
            return response.data;
        } catch (error) {
            console.error('BackendAIClient.generateSummary failed:', error);
            throw new Error(
                `Failed to generate summary via backend: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    },

    /**
     * 3. Validate field
     * Proxies to: POST /ai/validate-field
     */
    async validateField(request: ValidationRequest): Promise<ValidationResponse> {
        try {
            const response = await BackendProxyService.request<ValidationResponse>({
                url: '/ai/validate-field',
                method: 'POST',
                body: request,
                cache: false,       // Validation is dynamic (field value changes), don't cache
                timeout: 30000      // 30s timeout (faster than generation)
            });
            return response.data;
        } catch (error) {
            console.error('BackendAIClient.validateField failed:', error);
            throw new Error(
                `Failed to validate field via backend: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    },

    /**
     * 4. Find metadata
     * Proxies to: POST /ai/find-metadata
     */
    async findMetadata(request: MetadataRequest): Promise<MetadataResponse> {
        try {
            const response = await BackendProxyService.request<MetadataResponse>({
                url: '/ai/find-metadata',
                method: 'POST',
                body: request,
                cache: true,        // Metadata extraction is deterministic, can be cached
                timeout: 30000      // 30s timeout (faster than full PICO)
            });
            return response.data;
        } catch (error) {
            console.error('BackendAIClient.findMetadata failed:', error);
            throw new Error(
                `Failed to find metadata via backend: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    },

    /**
     * 5. Extract tables
     * Proxies to: POST /ai/extract-tables
     */
    async extractTables(request: TableExtractionRequest): Promise<TableExtractionResponse> {
        try {
            const response = await BackendProxyService.request<TableExtractionResponse>({
                url: '/ai/extract-tables',
                method: 'POST',
                body: request,
                cache: true,        // Table extraction is deterministic, can be cached
                timeout: 60000      // 60s timeout for complex table processing
            });
            return response.data;
        } catch (error) {
            console.error('BackendAIClient.extractTables failed:', error);
            throw new Error(
                `Failed to extract tables via backend: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    },

    /**
     * 6. Analyze image
     * Proxies to: POST /ai/analyze-image
     */
    async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResponse> {
        try {
            const response = await BackendProxyService.request<ImageAnalysisResponse>({
                url: '/ai/analyze-image',
                method: 'POST',
                body: request,
                cache: false,       // Image analysis with custom prompts, don't cache
                timeout: 60000      // 60s timeout for image processing
            });
            return response.data;
        } catch (error) {
            console.error('BackendAIClient.analyzeImage failed:', error);
            throw new Error(
                `Failed to analyze image via backend: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    },

    /**
     * 7. Deep analysis
     * Proxies to: POST /ai/deep-analysis
     */
    async deepAnalysis(request: DeepAnalysisRequest): Promise<DeepAnalysisResponse> {
        try {
            const response = await BackendProxyService.request<DeepAnalysisResponse>({
                url: '/ai/deep-analysis',
                method: 'POST',
                body: request,
                cache: false,       // Deep analysis with custom prompts, don't cache
                timeout: 120000     // 120s timeout for extended reasoning
            });
            return response.data;
        } catch (error) {
            console.error('BackendAIClient.deepAnalysis failed:', error);
            throw new Error(
                `Failed to perform deep analysis via backend: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    },

    /**
     * Health check - verify backend AI service is available
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await BackendProxyService.get('/health');
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            console.warn('Backend AI health check failed:', error);
            return false;
        }
    },
};

export default BackendAIClient;
