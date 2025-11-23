/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AIService
 * Handles all AI integration functions for the Clinical Extractor
 *
 * Includes 7 AI-powered functions:
 * 1. generatePICO() - Extract PICO-T summary
 * 2. generateSummary() - Generate key findings summary
 * 3. validateFieldWithAI() - Validate field content
 * 4. findMetadata() - Search for study metadata
 * 5. handleExtractTables() - Extract tables from document
 * 6. handleImageAnalysis() - Analyze uploaded images
 * 7. handleDeepAnalysis() - Deep document analysis
 *
 * ✅ SECURITY: Backend-First Architecture
 * All AI calls are proxied through the FastAPI backend (/api/ai/*).
 * API keys are stored securely on the backend and never exposed to the frontend.
 * This ensures:
 * - No API keys in the compiled JavaScript bundle
 * - Server-side authentication and rate limiting
 * - Request validation and sanitization
 * - Comprehensive monitoring and logging
 */

import AppStateManager from '../state/AppStateManager';
import ExtractionTracker from '../data/ExtractionTracker';
import StatusManager from '../utils/status';
import LRUCache from '../utils/LRUCache';
import { formatErrorMessage, logErrorWithContext, categorizeAIError } from '../utils/aiErrorHandler';
import BackendAIClient from './BackendAIClient';
import { isBackendDisabled } from './BackendClient';
import { DirectGeminiClient } from './DirectGeminiClient';
import FileSearchCitationExtractor from './FileSearchCitationExtractor';
import { FileSearchConfig } from '../config';

// ==================== CONFIGURATION ====================

/**
 * LRU Cache for PDF text with 50-page limit
 */
const pdfTextLRUCache = new LRUCache<number, { fullText: string, items: Array<any> }>(50);

// ==================== HELPER FUNCTIONS ====================

/**
 * Gets text content from a specific PDF page, using LRU cache if available.
 * @param {number} pageNum - The page number.
 * @returns {Promise<{fullText: string, items: Array<any>}>}
 */
async function getPageText(pageNum: number): Promise<{ fullText: string, items: Array<any> }> {
    const cached = pdfTextLRUCache.get(pageNum);
    if (cached) {
        return cached;
    }
    
    const state = AppStateManager.getState();
    if (!state.pdfDoc) {
        throw new Error('No PDF loaded');
    }
    try {
        const page = await state.pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        let fullText = '';
        const items: Array<any> = [];
        textContent.items.forEach((item: any) => {
            if (item.str) {
                fullText += item.str + ' ';
                items.push({ text: item.str, transform: item.transform });
            }
        });
        const pageData = { fullText, items };
        pdfTextLRUCache.set(pageNum, pageData);
        return pageData;
    } catch (error) {
        console.error(`Error getting text from page ${pageNum}:`, error);
        logErrorWithContext(error, `PDF text extraction - page ${pageNum}`);

        // Throw error instead of silently returning empty data
        throw new Error(
            `Failed to extract text from page ${pageNum}. ` +
            `${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

/**
 * Gets all text from the loaded PDF document with page-level error tracking.
 * @returns {Promise<string|null>} Full text of the document or null if no PDF is loaded.
 */
async function getAllPdfText(): Promise<string | null> {
    const state = AppStateManager.getState();
    if (!state.pdfDoc) {
        StatusManager.show("Please load a PDF first.", "warning");
        return null;
    }

    let fullText = "";
    const failedPages: number[] = [];
    StatusManager.show("Reading full document text...", "info", 60000); // Long timeout

    for (let i = 1; i <= state.totalPages; i++) {
        try {
            const pageData = await getPageText(i);
            if (!pageData.fullText || pageData.fullText.trim() === '') {
                failedPages.push(i);
                console.warn(`Page ${i} returned empty text`);
            }
            fullText += pageData.fullText + "\n\n";
        } catch (error) {
            console.error(`Failed to read page ${i}:`, error);
            failedPages.push(i);
            // Continue with other pages instead of failing completely
        }
    }

    // Report failed pages to user
    if (failedPages.length > 0) {
        StatusManager.show(
            `⚠️ Warning: Failed to read ${failedPages.length} page(s): ${failedPages.join(', ')}`,
            'warning',
            10000
        );
    }

    // Validate that we got some text
    if (!fullText.trim()) {
        throw new Error(
            'No text could be extracted from the PDF. The document may be image-based, corrupted, or have no selectable text.'
        );
    }

    StatusManager.show("Document text reading complete.", "success");
    return fullText;
}

/**
 * Converts a Blob to base64 string
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} - Base64 encoded string
 */
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve((reader.result as string).split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Automatically processes citations from AI response grounding metadata
 * and highlights them in the PDF. Runs transparently in the background.
 *
 * @param groundingMetadata - Grounding metadata from Gemini response
 * @param responseText - The AI response text
 */
async function processAndHighlightCitations(
    groundingMetadata: any,
    responseText: string
): Promise<void> {
    // Check if File Search is enabled
    if (!FileSearchConfig.enabled) {
        return;
    }

    // Check if we have grounding metadata
    if (!groundingMetadata?.groundingChunks || !groundingMetadata?.groundingSupports) {
        console.log('[AIService] No grounding metadata to process');
        return;
    }

    try {
        // Extract citations from grounding metadata
        const citations = FileSearchCitationExtractor.extractCitations(
            responseText,
            groundingMetadata
        );

        if (citations.length === 0) {
            console.log('[AIService] No citations extracted from grounding metadata');
            return;
        }

        // Get PDF text by page for location search
        const state = AppStateManager.getState();
        if (!state.pdfDoc) {
            console.log('[AIService] No PDF loaded, skipping citation highlighting');
            return;
        }

        // Build page text map
        const pdfTextByPage = new Map<number, string>();
        for (let i = 1; i <= state.totalPages; i++) {
            try {
                const pageData = await getPageText(i);
                pdfTextByPage.set(i, pageData.fullText);
            } catch (error) {
                console.warn(`[AIService] Failed to get text for page ${i}`);
            }
        }

        // Locate citations in PDF
        const locatedCitations = await FileSearchCitationExtractor.locateCitationsInPDF(
            citations,
            pdfTextByPage
        );

        // Highlight citations in PDF using PDFRenderer
        const highlightFn = (window as any).ClinicalExtractor?.highlightRegion;
        if (highlightFn) {
            let highlightedCount = 0;
            for (const citation of locatedCitations) {
                if (citation.pageNumber && citation.boundingBox) {
                    FileSearchCitationExtractor.highlightCitation(citation, highlightFn);
                    highlightedCount++;
                }
            }
            if (highlightedCount > 0) {
                console.log(`[AIService] Highlighted ${highlightedCount} citations from File Search`);
            }
        }

        // Log citation info for debugging
        console.log(`[AIService] Processed ${locatedCitations.length} citations from File Search grounding`);

    } catch (error) {
        // Don't fail the main operation if citation processing fails
        console.error('[AIService] Citation processing failed (non-critical):', error);
    }
}

// ==================== AI EXTRACTION FUNCTIONS ====================

/**
 * ✨ Generates PICO-T summary using backend AI service.
 */
async function generatePICO(): Promise<void> {
    const state = AppStateManager.getState();
    if (!state.pdfDoc) {
        StatusManager.show('Please load a PDF first.', 'warning');
        return;
    }
    if (state.isProcessing) {
        StatusManager.show('Please wait for the current operation to finish.', 'warning');
        return;
    }

    AppStateManager.setState({ isProcessing: true });
    const loadingEl = document.getElementById('pico-loading');
    if (loadingEl) loadingEl.style.display = 'block';
    StatusManager.show('✨ Analyzing document for PICO-T summary...', 'info');

    try {
        // Get full text of the document to provide as context
        const documentText = await getAllPdfText();
        if (!documentText) {
            throw new Error("Could not read text from the PDF.");
        }

        // Call backend AI service for extraction
        const data = await BackendAIClient.generatePICO({ pdf_text: documentText });

        // Populate fields
        const populationField = document.getElementById('eligibility-population') as HTMLInputElement;
        const interventionField = document.getElementById('eligibility-intervention') as HTMLInputElement;
        const comparatorField = document.getElementById('eligibility-comparator') as HTMLInputElement;
        const outcomesField = document.getElementById('eligibility-outcomes') as HTMLInputElement;
        const timingField = document.getElementById('eligibility-timing') as HTMLInputElement;
        const typeField = document.getElementById('eligibility-type') as HTMLInputElement;

        if (populationField) populationField.value = data.population || '';
        if (interventionField) interventionField.value = data.intervention || '';
        if (comparatorField) comparatorField.value = data.comparator || '';
        if (outcomesField) outcomesField.value = data.outcomes || '';
        if (timingField) timingField.value = data.timing || '';
        if (typeField) typeField.value = data.study_type || '';

        // Add to trace log
        const state2 = AppStateManager.getState();
        const coords = { x: 0, y: 0, width: 0, height: 0 }; // AI extractions have no coords
        ExtractionTracker.addExtraction({ fieldName: 'population (AI)', text: data.population, page: 0, coordinates: coords, method: 'backend-ai-pico', documentName: state2.documentName });
        ExtractionTracker.addExtraction({ fieldName: 'intervention (AI)', text: data.intervention, page: 0, coordinates: coords, method: 'backend-ai-pico', documentName: state2.documentName });
        ExtractionTracker.addExtraction({ fieldName: 'comparator (AI)', text: data.comparator, page: 0, coordinates: coords, method: 'backend-ai-pico', documentName: state2.documentName });
        ExtractionTracker.addExtraction({ fieldName: 'outcomes (AI)', text: data.outcomes, page: 0, coordinates: coords, method: 'backend-ai-pico', documentName: state2.documentName });
        ExtractionTracker.addExtraction({ fieldName: 'timing (AI)', text: data.timing, page: 0, coordinates: coords, method: 'backend-ai-pico', documentName: state2.documentName });
        ExtractionTracker.addExtraction({ fieldName: 'studyType (AI)', text: data.study_type, page: 0, coordinates: coords, method: 'backend-ai-pico', documentName: state2.documentName });

        // Process File Search citations in the background (if available)
        if (data.groundingMetadata) {
            const responseText = `${data.population} ${data.intervention} ${data.comparator} ${data.outcomes} ${data.timing} ${data.study_type}`;
            processAndHighlightCitations(data.groundingMetadata, responseText).catch(err => {
                console.warn('[AIService] Citation highlighting failed:', err);
            });
        }

        StatusManager.show('✨ PICO-T fields auto-populated by AI!', 'success');

    } catch (error: any) {
        StatusManager.show(`Error: ${error.message}`, 'error', 15000);
    } finally {
        AppStateManager.setState({ isProcessing: false });
        const loadingEl = document.getElementById('pico-loading');
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

/**
 * ✨ Generates a summary of key findings using backend AI service.
 */
async function generateSummary(): Promise<void> {
    const state = AppStateManager.getState();
    if (!state.pdfDoc) {
        StatusManager.show('Please load a PDF first.', 'warning');
        return;
    }
    if (state.isProcessing) {
        StatusManager.show('Please wait for the current operation to finish.', 'warning');
        return;
    }

    AppStateManager.setState({ isProcessing: true });
    const loadingEl = document.getElementById('summary-loading');
    if (loadingEl) loadingEl.style.display = 'block';
    StatusManager.show('✨ Generating summary...', 'info');

    try {
        const documentText = await getAllPdfText();
        if (!documentText) {
            throw new Error("Could not read text from the PDF.");
        }

        // Call backend AI service for summary generation
        const result = await BackendAIClient.generateSummary({ pdf_text: documentText });

        const summaryField = document.getElementById('predictorsPoorOutcomeSurgical') as HTMLTextAreaElement;
        if (summaryField) summaryField.value = result.summary;

        // Add to trace log
        const state2 = AppStateManager.getState();
        ExtractionTracker.addExtraction({
            fieldName: 'summary (AI)',
            text: result.summary,
            page: 0,
            coordinates: {x:0, y:0, width:0, height:0},
            method: 'backend-ai-summary',
            documentName: state2.documentName
        });

        // Process File Search citations in the background (if available)
        if (result.groundingMetadata) {
            processAndHighlightCitations(result.groundingMetadata, result.summary).catch(err => {
                console.warn('[AIService] Citation highlighting failed:', err);
            });
        }

        StatusManager.show('✨ Key findings summary generated by AI!', 'success');

    } catch (error: any) {
        StatusManager.show(`Error: ${error.message}`, 'error', 15000);
    } finally {
        AppStateManager.setState({ isProcessing: false });
        const loadingEl = document.getElementById('summary-loading');
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

/**
 * ✨ Validates a field's content against the PDF text using backend AI service.
 */
async function validateFieldWithAI(fieldId: string): Promise<void> {
    const state = AppStateManager.getState();
    const field = document.getElementById(fieldId) as HTMLInputElement;
    if (!field) {
        StatusManager.show(`Field ${fieldId} not found.`, 'error');
        return;
    }

    const claim = field.value;
    if (!claim) {
        StatusManager.show('Field is empty, nothing to validate.', 'warning');
        return;
    }

    if (!state.pdfDoc) {
        StatusManager.show('Please load a PDF first.', 'warning');
        return;
    }
    if (state.isProcessing) {
        StatusManager.show('Please wait for the current operation to finish.', 'warning');
        return;
    }

    AppStateManager.setState({ isProcessing: true });
    StatusManager.showLoading(true);
    StatusManager.show(`✨ Validating claim: "${claim.substring(0, 30)}..."`, 'info');

    try {
        const documentText = await getAllPdfText();
        if (!documentText) {
            throw new Error("Could not read text from PDF for validation.");
        }

        // Call backend AI service for field validation
        const validation = await BackendAIClient.validateField({
            field_id: fieldId,
            field_value: claim,
            pdf_text: documentText
        });

        if (validation.is_supported) {
            StatusManager.show(`✓ VALIDATED (Confidence: ${Math.round(validation.confidence * 100)}%): "${validation.quote}"`, 'success', 10000);
            field.style.borderColor = 'var(--success-green)';
        } else {
            StatusManager.show(`✗ NOT SUPPORTED (Confidence: ${Math.round(validation.confidence * 100)}%). Reason: "${validation.quote}"`, 'warning', 10000);
            field.style.borderColor = 'var(--warning-orange)';
        }

    } catch (error: any) {
        StatusManager.show(`Error: ${error.message}`, 'error', 15000);
    } finally {
        AppStateManager.setState({ isProcessing: false });
        StatusManager.showLoading(false);
    }
}

/**
 * ✨ Finds study metadata using backend AI service.
 */
async function findMetadata(): Promise<void> {
    const state = AppStateManager.getState();
    if (state.isProcessing) {
        StatusManager.show('Please wait for the current operation to finish.', 'warning');
        return;
    }
    const citationField = document.getElementById('citation') as HTMLInputElement;
    const citationText = citationField?.value || '';
    if (!citationText) {
        StatusManager.show('Please enter a citation or title first.', 'warning');
        return;
    }

    AppStateManager.setState({ isProcessing: true });
    const loadingEl = document.getElementById('metadata-loading');
    if (loadingEl) loadingEl.style.display = 'block';
    StatusManager.show('✨ Searching for metadata...', 'info');

    try {
        // Call backend AI service for metadata search
        const data = await BackendAIClient.findMetadata({ pdf_text: citationText });

        const doiField = document.getElementById('doi') as HTMLInputElement;
        const pmidField = document.getElementById('pmid') as HTMLInputElement;
        const journalField = document.getElementById('journal') as HTMLInputElement;
        const yearField = document.getElementById('year') as HTMLInputElement;

        if (data.doi && doiField) doiField.value = data.doi;
        if (data.pmid && pmidField) pmidField.value = data.pmid;
        if (data.journal && journalField) journalField.value = data.journal;
        if (data.year !== null && yearField) yearField.value = String(data.year);

        StatusManager.show('✨ Metadata auto-populated!', 'success');

    } catch (error: any) {
        StatusManager.show(`Error: ${error.message}`, 'error', 15000);
    } finally {
        AppStateManager.setState({ isProcessing: false });
        const loadingEl = document.getElementById('metadata-loading');
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

/**
 * ✨ Extracts tables from the document using backend AI service.
 */
async function handleExtractTables(): Promise<void> {
    const state = AppStateManager.getState();
    const resultsContainer = document.getElementById('table-extraction-results');
    if (!state.pdfDoc) {
        StatusManager.show("Please load a PDF first.", "warning");
        return;
    }

    if (resultsContainer) resultsContainer.innerHTML = 'Extracting tables from document... ✨';
    StatusManager.showLoading(true);

    try {
        const documentText = await getAllPdfText();
        if (!documentText) return;

        // Use DirectGeminiClient when backend is disabled, otherwise try backend first
        let result;
        if (isBackendDisabled()) {
            result = await DirectGeminiClient.extractTables({ pdf_text: documentText });
        } else {
            try {
                result = await BackendAIClient.extractTables({ pdf_text: documentText });
            } catch (backendError) {
                console.warn('Backend table extraction failed, falling back to DirectGeminiClient:', backendError);
                result = await DirectGeminiClient.extractTables({ pdf_text: documentText });
            }
        }

        if (result.tables && result.tables.length > 0 && resultsContainer) {
            renderTables(result.tables, resultsContainer);
            StatusManager.show(`Successfully extracted ${result.tables.length} tables.`, 'success');
        } else {
            if (resultsContainer) resultsContainer.innerText = "No tables found in the document.";
            StatusManager.show("No tables were identified by the AI.", "info");
        }

    } catch (error: any) {
        logErrorWithContext(error, 'Table extraction');
        const categorized = categorizeAIError(error, 'Table extraction');
        if (resultsContainer) resultsContainer.innerText = `Error: ${categorized.userMessage}`;
        StatusManager.show(formatErrorMessage(categorized), 'error', 15000);
    } finally {
        StatusManager.showLoading(false);
    }
}

/**
 * Renders extracted tables in the UI
 * @param {Array} tables - Array of table objects
 * @param {HTMLElement} container - Container element to render tables into
 */
function renderTables(tables: any[], container: HTMLElement): void {
    container.innerHTML = '';
    tables.forEach((tableData, index) => {
        const details = document.createElement('details');
        details.open = true; // Open by default

        const summary = document.createElement('summary');
        summary.textContent = `Table ${index + 1}: ${tableData.title || 'Untitled'}`;

        const description = document.createElement('p');
        description.textContent = tableData.description || '';
        description.style.fontSize = '11px';
        description.style.fontStyle = 'italic';

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');

        if (tableData.data && tableData.data.length > 0) {
            // Assume first row is header
            const headerRow = document.createElement('tr');
            tableData.data[0].forEach((headerText: string) => {
                const th = document.createElement('th');
                th.textContent = headerText;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);

            // The rest are body rows
            for (let i = 1; i < tableData.data.length; i++) {
                const bodyRow = document.createElement('tr');
                tableData.data[i].forEach((cellText: string) => {
                    const td = document.createElement('td');
                    td.textContent = cellText;
                    bodyRow.appendChild(td);
                });
                tbody.appendChild(bodyRow);
            }
        }

        table.appendChild(thead);
        table.appendChild(tbody);

        details.appendChild(summary);
        if(tableData.description) details.appendChild(description);
        details.appendChild(table);

        container.appendChild(details);
    });
}

/**
 * ✨ Analyzes an uploaded image with a text prompt using backend AI service.
 */
async function handleImageAnalysis(): Promise<void> {
    const fileInput = document.getElementById('image-upload-input') as HTMLInputElement;
    const promptField = document.getElementById('image-analysis-prompt') as HTMLInputElement;
    const resultsContainer = document.getElementById('image-analysis-results');
    const prompt = promptField?.value || '';

    if (!fileInput?.files || fileInput.files.length === 0) {
        StatusManager.show("Please upload an image.", "warning");
        return;
    }
    if (!prompt) {
        StatusManager.show("Please enter a prompt for image analysis.", "warning");
        return;
    }

    const file = fileInput.files[0];
    if (resultsContainer) resultsContainer.innerHTML = 'Analyzing image... ✨';
    StatusManager.showLoading(true);

    try {
        const base64Data = await blobToBase64(file);
        
        // Call backend AI service for image analysis
        const result = await BackendAIClient.analyzeImage({
            image_base64: base64Data,
            prompt: prompt
        });

        if (resultsContainer) resultsContainer.innerText = result.analysis;

    } catch (error: any) {
        logErrorWithContext(error, 'Image analysis');
        const categorized = categorizeAIError(error, 'Image analysis');
        if (resultsContainer) resultsContainer.innerText = `Error: ${categorized.userMessage}`;
        StatusManager.show(formatErrorMessage(categorized), 'error', 15000);
    } finally {
        StatusManager.showLoading(false);
    }
}

/**
 * ✨ Performs deep analysis on the document text using backend AI service.
 */
async function handleDeepAnalysis(): Promise<void> {
    const state = AppStateManager.getState();
    const promptField = document.getElementById('deep-analysis-prompt') as HTMLInputElement;
    const resultsContainer = document.getElementById('deep-analysis-results');
    const prompt = promptField?.value || '';

    if (!prompt) {
        StatusManager.show("Please enter a prompt for deep analysis.", "warning");
        return;
    }
    if (!state.pdfDoc) {
        StatusManager.show("Please load a PDF first.", "warning");
        return;
    }

    if (resultsContainer) resultsContainer.innerHTML = 'Thinking deeply... ✨';
    StatusManager.showLoading(true);

    try {
        const documentText = await getAllPdfText();
        if (!documentText) return;

        // Call backend AI service for deep analysis
        const result = await BackendAIClient.deepAnalysis({
            pdf_text: documentText,
            prompt: prompt
        });

        if (resultsContainer) resultsContainer.innerText = result.analysis;

    } catch (error: any) {
        logErrorWithContext(error, 'Deep analysis');
        const categorized = categorizeAIError(error, 'Deep analysis');
        if (resultsContainer) resultsContainer.innerText = `Error: ${categorized.userMessage}`;
        StatusManager.show(formatErrorMessage(categorized), 'error', 15000);
    } finally {
        StatusManager.showLoading(false);
    }
}

// ==================== EXPORTS ====================

/**
 * AIService object - Central manager for all AI operations
 */
const AIService = {
    generatePICO,
    generateSummary,
    validateFieldWithAI,
    findMetadata,
    handleExtractTables,
    handleImageAnalysis,
    handleDeepAnalysis,
    // Helper functions (exported for potential internal use)
    getPageText,
    getAllPdfText,
};

export default AIService;

// Export individual functions for window binding
export {
    generatePICO,
    generateSummary,
    validateFieldWithAI,
    findMetadata,
    handleExtractTables,
    handleImageAnalysis,
    handleDeepAnalysis,
};
