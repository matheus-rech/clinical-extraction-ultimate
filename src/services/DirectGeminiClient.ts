/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DirectGeminiClient - Fallback AI client for direct Gemini API calls
 *
 * Used when the backend is unavailable. Calls Gemini API directly from the browser.
 *
 * ⚠️ SECURITY WARNING:
 * This client exposes the API key to the frontend and should only be used
 * for development/testing or when backend is unavailable.
 *
 * For production use, always prefer BackendAIClient which keeps API keys secure.
 *
 * Implements Phase 2 fallback of Backend Migration Plan v2.0
 */

import { GoogleGenAI, Type } from '@google/genai';
import type {
    PICORequest,
    PICOResponse,
    SummaryRequest,
    SummaryResponse,
    ValidationRequest,
    ValidationResponse,
    MetadataRequest,
    MetadataResponse,
    TableExtractionRequest,
    TableExtractionResponse,
    ImageAnalysisRequest,
    ImageAnalysisResponse,
    DeepAnalysisRequest,
    DeepAnalysisResponse,
} from './BackendAIClient';

// ==================== CONFIGURATION ====================

/**
 * Get Gemini API key from environment
 */
const getApiKey = (): string => {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) {
        throw new Error(
            'VITE_GEMINI_API_KEY not configured. ' +
            'Add it to .env.local for direct Gemini access, ' +
            'or use the backend which handles API keys securely.'
        );
    }
    return key;
};

/**
 * Create Gemini client instance
 */
const createClient = (): GoogleGenAI => {
    return new GoogleGenAI({ apiKey: getApiKey() });
};

// ==================== CONFIGURATION ====================

/**
 * Get configuration from environment variables
 */
const getConfig = () => ({
    model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-pro-preview-06-05',
    temperature: parseFloat(import.meta.env.VITE_GEMINI_TEMPERATURE || '0.2'),
    outputFormat: import.meta.env.VITE_GEMINI_OUTPUT_FORMAT || 'json',
});

/**
 * Model IDs for different tasks
 * Now uses gemini-2.5-pro as default for all operations
 */
const MODELS = {
    FAST: import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-pro-preview-06-05',
    PRO: import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-pro-preview-06-05',
    FLASH: import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-pro-preview-06-05',
};

/**
 * Default generation config with temperature from environment
 */
const getGenerationConfig = () => ({
    temperature: getConfig().temperature,
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 8192,
});

// ==================== DIRECT GEMINI CLIENT ====================

/**
 * DirectGeminiClient - Fallback client for direct Gemini API calls
 *
 * Mirrors BackendAIClient interface for seamless fallback:
 * 1. generatePICO() - PICO-T extraction
 * 2. generateSummary() - Key findings summary
 * 3. validateField() - Field validation
 * 4. findMetadata() - Metadata search
 * 5. extractTables() - Table extraction
 * 6. analyzeImage() - Image analysis
 * 7. deepAnalysis() - Deep document analysis
 */
export const DirectGeminiClient = {
    /**
     * 1. Generate PICO-T summary
     */
    async generatePICO(request: PICORequest): Promise<PICOResponse> {
        try {
            const ai = createClient();

            const prompt = `You are a medical research expert. Extract the PICO-T elements from this clinical study.

Return a JSON object with these fields:
- population: Patient population characteristics
- intervention: Main intervention studied
- comparator: Control or comparison group
- outcomes: Primary and secondary outcomes
- timing: Study duration and follow-up
- study_type: Type of study (RCT, cohort, case-control, etc.)

Document text:
${request.pdf_text}`;

            const response = await ai.models.generateContent({
                model: MODELS.PRO,
                contents: prompt,
                config: {
                    ...getGenerationConfig(),
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            population: { type: Type.STRING },
                            intervention: { type: Type.STRING },
                            comparator: { type: Type.STRING },
                            outcomes: { type: Type.STRING },
                            timing: { type: Type.STRING },
                            study_type: { type: Type.STRING },
                        },
                        required: ['population', 'intervention', 'comparator', 'outcomes', 'timing', 'study_type'],
                    },
                },
            });

            return JSON.parse(response.text || '{}');
        } catch (error) {
            console.error('DirectGeminiClient.generatePICO failed:', error);
            throw new Error(
                `Failed to generate PICO-T: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    },

    /**
     * 2. Generate summary
     */
    async generateSummary(request: SummaryRequest): Promise<SummaryResponse> {
        try {
            const ai = createClient();

            const prompt = `You are a medical research expert. Generate a concise summary of the key findings from this clinical study.

The summary should be 2-3 paragraphs covering:
- Main findings and conclusions
- Key statistics and outcomes
- Clinical implications

Document text:
${request.pdf_text}`;

            const response = await ai.models.generateContent({
                model: MODELS.PRO,
                contents: prompt,
                config: getGenerationConfig(),
            });

            return { summary: response.text || '' };
        } catch (error) {
            console.error('DirectGeminiClient.generateSummary failed:', error);
            throw new Error(
                `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    },

    /**
     * 3. Validate field
     */
    async validateField(request: ValidationRequest): Promise<ValidationResponse> {
        try {
            const ai = createClient();

            const prompt = `You are a medical research validation expert. Validate the following extracted field against the source document.

Field: ${request.field_id}
Extracted Value: ${request.field_value}

Return a JSON object with:
- is_supported: boolean indicating if the value is supported by the document
- quote: exact quote from the document that supports or contradicts the value
- confidence: confidence score from 0.0 to 1.0

Document text:
${request.pdf_text}`;

            const response = await ai.models.generateContent({
                model: MODELS.PRO,
                contents: prompt,
                config: {
                    ...getGenerationConfig(),
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            is_supported: { type: Type.BOOLEAN },
                            quote: { type: Type.STRING },
                            confidence: { type: Type.NUMBER },
                        },
                        required: ['is_supported', 'quote', 'confidence'],
                    },
                },
            });

            return JSON.parse(response.text || '{}');
        } catch (error) {
            console.error('DirectGeminiClient.validateField failed:', error);
            throw new Error(
                `Failed to validate field: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    },

    /**
     * 4. Find metadata
     */
    async findMetadata(request: MetadataRequest): Promise<MetadataResponse> {
        try {
            const ai = createClient();

            const prompt = `You are a medical literature expert. Extract bibliographic metadata from this document.

Return a JSON object with:
- doi: DOI identifier (format: 10.xxxx/xxxxx) or null
- pmid: PubMed ID or null
- journal: Journal name or null
- year: Publication year as number or null

Document text:
${request.pdf_text}`;

            const response = await ai.models.generateContent({
                model: MODELS.FLASH,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            doi: { type: Type.STRING, nullable: true },
                            pmid: { type: Type.STRING, nullable: true },
                            journal: { type: Type.STRING, nullable: true },
                            year: { type: Type.NUMBER, nullable: true },
                        },
                    },
                },
            });

            return JSON.parse(response.text || '{}');
        } catch (error) {
            console.error('DirectGeminiClient.findMetadata failed:', error);
            throw new Error(
                `Failed to find metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    },

    /**
     * 5. Extract tables
     */
    async extractTables(request: TableExtractionRequest): Promise<TableExtractionResponse> {
        try {
            const ai = createClient();

            const prompt = `You are a medical data extraction expert. Extract all tables from this document.

For each table, provide:
- title: Table title or caption
- description: Brief description of what the table contains
- data: 2D array of strings representing the table data (including headers)

Return a JSON object with a "tables" array.

Document text:
${request.pdf_text}`;

            const response = await ai.models.generateContent({
                model: MODELS.PRO,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            tables: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        data: {
                                            type: Type.ARRAY,
                                            items: {
                                                type: Type.ARRAY,
                                                items: { type: Type.STRING },
                                            },
                                        },
                                    },
                                    required: ['title', 'description', 'data'],
                                },
                            },
                        },
                        required: ['tables'],
                    },
                },
            });

            return JSON.parse(response.text || '{"tables": []}');
        } catch (error) {
            console.error('DirectGeminiClient.extractTables failed:', error);
            throw new Error(
                `Failed to extract tables: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    },

    /**
     * 6. Analyze image
     */
    async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResponse> {
        try {
            const ai = createClient();

            // Extract base64 data and mime type
            const base64Match = request.image_base64.match(/^data:(.+);base64,(.+)$/);
            const mimeType = base64Match ? base64Match[1] : 'image/png';
            const base64Data = base64Match ? base64Match[2] : request.image_base64;

            const response = await ai.models.generateContent({
                model: MODELS.FLASH,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                inlineData: {
                                    mimeType,
                                    data: base64Data,
                                },
                            },
                            {
                                text: request.prompt || 'Analyze this medical image and describe what you see.',
                            },
                        ],
                    },
                ],
            });

            return { analysis: response.text || '' };
        } catch (error) {
            console.error('DirectGeminiClient.analyzeImage failed:', error);
            throw new Error(
                `Failed to analyze image: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    },

    /**
     * 7. Deep analysis
     */
    async deepAnalysis(request: DeepAnalysisRequest): Promise<DeepAnalysisResponse> {
        try {
            const ai = createClient();

            const prompt = request.prompt || `Perform a deep analysis of this medical research document.
Consider methodology, statistical validity, clinical implications, limitations, and future research directions.`;

            const response = await ai.models.generateContent({
                model: MODELS.PRO,
                contents: `${prompt}

Document text:
${request.pdf_text}`,
                config: {
                    thinkingConfig: {
                        thinkingBudget: 32768,
                    },
                },
            });

            return { analysis: response.text || '' };
        } catch (error) {
            console.error('DirectGeminiClient.deepAnalysis failed:', error);
            throw new Error(
                `Failed to perform deep analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    },

    /**
     * Health check - verify API key is configured
     */
    async healthCheck(): Promise<boolean> {
        try {
            getApiKey();
            return true;
        } catch {
            return false;
        }
    },
};

export default DirectGeminiClient;
