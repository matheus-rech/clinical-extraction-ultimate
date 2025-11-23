/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main Entry Point - Clinical Extractor
 * Integrates all modules and initializes the application
 */


// ==================== IMPORTS ====================

// Core State & Configuration
import AppStateManager from './state/AppStateManager';
import ExtractionTracker from './data/ExtractionTracker';
import FormManager, { setDependencies as setFormManagerDeps } from './forms/FormManager';
import DynamicFields, {
    setDependencies as setDynamicFieldsDeps,
    addIndication,
    addIntervention,
    addArm,
    addMortality,
    addMRS,
    addComplication,
    addPredictor,
    removeElement,
    updateArmSelectors
} from './forms/DynamicFields';

// PDF Modules
import PDFLoader from './pdf/PDFLoader';
import PDFRenderer from './pdf/PDFRenderer';
import TextSelection from './pdf/TextSelection';

// Services
import {
    generatePICO,
    generateSummary,
    validateFieldWithAI,
    findMetadata,
    handleExtractTables,
    handleImageAnalysis,
    handleDeepAnalysis
} from './services/AIService';
import { MultiProviderAIClient } from './services/MultiProviderAIClient';
import { AIProvider } from './config';
import AuthManager from './services/AuthManager';
import SearchService from './services/SearchService';
import SemanticSearchService from './services/SemanticSearchService';
import AnnotationService from './services/AnnotationService';
import BackendProxyService from './services/BackendProxyService';
import SamplePDFService from './services/SamplePDFService';
import PDFLibraryService from './services/PDFLibraryService'; // Import is here but will be dynamically imported later if backend is available
import CitationService, { jumpToCitation } from './services/CitationService';
import LRUCache from './utils/LRUCache';
import CircuitBreaker from './utils/CircuitBreaker';
import {
    exportJSON,
    exportCSV,
    exportExcel,
    exportAudit,
    exportAnnotatedPDF,
    exportProvenance,
    exportCitationAuditJSON,
    exportCitationAuditCSV
} from './services/ExportManager';
import FigureExtractor from './services/FigureExtractor';
import TableExtractor from './services/TableExtractor';
import AgentOrchestrator from './services/AgentOrchestrator';
import DiagnosticsPanel from './services/DiagnosticsPanel';
import BackendHealthMonitor from './services/BackendHealthMonitor';
import BackendClient from './services/BackendClient';
import { getCitationSidebar } from './components/CitationSidebar';
import { citationAPIClient } from './services/CitationAPIClient';
import citationAuditTrail from './services/CitationAuditTrail';
import citationUIEnhancer from './services/CitationUIEnhancer';
import FileSearchCitationExtractor from './services/FileSearchCitationExtractor';
import { PDFProcessingAgent } from './services/PDFProcessingAgent';
import { PDFPageRenderer } from './services/PDFPageRenderer';
import { CoordinateTransformer } from './services/CoordinateTransformer';
import LocalPDFLibrary from './services/LocalPDFLibrary';
import GeminiFilesService from './services/GeminiFilesService';
import PDFDatabaseVisionIntegration from './services/PDFDatabaseVisionIntegration';

// Utilities
import {
    calculateBoundingBox,
    addExtractionMarker,
    addExtractionMarkersForPage,
    autoAdvanceField,
    clearSearchMarkers,
    blobToBase64
} from './utils/helpers';
import StatusManager from './utils/status';
import MemoryManager from './utils/memory';
import { initializeErrorBoundary, triggerCrashStateSave } from './utils/errorBoundary';
import { checkAndOfferRecovery, triggerManualRecovery } from './utils/errorRecovery';

// ==================== DEPENDENCY INJECTION ====================

/**
 * Set up module dependencies
 * Some modules need references to other modules to avoid circular dependencies
 */
function setupDependencies() {
    // ExtractionTracker needs AppStateManager, StatusManager, PDFRenderer
    ExtractionTracker.setDependencies({
        appStateManager: AppStateManager,
        statusManager: StatusManager,
        pdfRenderer: PDFRenderer
    });

    // Explicitly reload data after dependencies are set (fixes E2E test reliability)
    // This ensures localStorage data is loaded with proper dependencies in place
    ExtractionTracker.loadFromStorage();

    // DynamicFields needs FormManager (must be set before FormManager init)
    setDynamicFieldsDeps({
        formManager: FormManager
    });

    // FormManager needs multiple dependencies
    setFormManagerDeps({
        appStateManager: AppStateManager,
        statusManager: StatusManager,
        dynamicFields: DynamicFields
    });

    // CitationService needs access to canvas and scale
    CitationService.setDependencies({
        getCanvas: () => PDFRenderer.currentCanvas,
        getScale: () => AppStateManager.getState().scale || 1.0
    });

    // BackendHealthMonitor needs BackendClient for health checks
    BackendHealthMonitor.setBackendClient(BackendClient);

    // BackendProxyService needs BackendClient for auth header injection
    BackendProxyService.setBackendClient(BackendClient);

    // Initialize Citation UI Enhancer for badges and tooltips
    // This should run after other services are initialized
    setTimeout(() => {
        citationUIEnhancer.initialize();
        console.log('✓ Citation UI Enhancer initialized');
    }, 100);
}

// ==================== PDF.JS CONFIGURATION ====================

/**
 * Configure PDF.js worker
 */
function configurePDFJS() {
    // Wait for PDF.js to load if not already available
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        console.log('✓ PDF.js worker configured');
    } else {
        console.warn('⚠ PDF.js library not loaded yet, will retry...');
        // Retry after a short delay
        setTimeout(() => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                console.log('✓ PDF.js worker configured (retry)');
            } else {
                console.error('❌ PDF.js library failed to load. Check network connection and CDN availability.');
            }
        }, 500);
    }
}

// ==================== SEARCH FUNCTIONS ====================

/**
 * Toggle the search interface visibility
 */
function toggleSearchInterface() {
    document.getElementById('search-interface')?.classList.toggle('active');
}

/**
 * Search for text in the PDF document using SearchService
 */
async function searchInPDF() {
    const query = (document.getElementById('search-query') as HTMLInputElement).value.trim();
    if (!query) {
        StatusManager.show('Please enter text to search', 'warning');
        return;
    }

    const state = AppStateManager.getState();
    if (!state.pdfDoc) {
        StatusManager.show('Please load a PDF first', 'warning');
        return;
    }

    StatusManager.show('Searching across all pages...', 'info');

    try {
        const results = await SearchService.search(query);

        // Display results
        const resultsContainer = document.getElementById('search-results');
        if (resultsContainer) {
            if (results.length === 0) {
                resultsContainer.innerHTML = '<li>No results found</li>';
            } else {
                resultsContainer.innerHTML = results.map((result, idx) => `
                    <li>
                        <strong>Page ${result.page}</strong> (Result ${idx + 1}/${results.length})<br>
                        <em>${result.context}</em>
                    </li>
                `).join('');

                // Highlight results on current page
                SearchService.highlightResults(state.currentPage);

                // If current page has results, ensure they're visible
                const resultsOnCurrentPage = results.filter(r => r.page === state.currentPage);
                if (resultsOnCurrentPage.length > 0) {
                    // Re-render page to apply highlights
                    await PDFRenderer.renderPage(state.currentPage, TextSelection);
                }
            }
        }

        StatusManager.show(`Found ${results.length} result(s)`, 'success');
    } catch (error) {
        console.error('Search error:', error);
        StatusManager.show('Search failed', 'error');
    }
}

// ==================== EVENT LISTENERS ====================

/**
 * Set up all event listeners for the application
 */
function setupEventListeners() {
    // PDF Library Dropdown
    const pdfLibrarySelect = document.getElementById('pdf-library-select') as HTMLSelectElement;

    if (pdfLibrarySelect) {
        pdfLibrarySelect.addEventListener('change', async (e) => {
            const libraryId = (e.target as HTMLSelectElement).value;
            if (libraryId) {
                try {
                    await PDFLibraryService.loadFromLibrary(libraryId);
                } catch (error) {
                    console.error('Failed to load PDF from library:', error);
                    StatusManager.show('Failed to load PDF from library', 'error');
                }
            }
        });
        console.log('✓ PDF library dropdown wired');
    } else {
        console.warn('⚠ PDF library dropdown not found');
    }

    // PDF Navigation
    const prevPageBtn = document.getElementById('pdf-prev-page');
    const nextPageBtn = document.getElementById('pdf-next-page');
    const pageNumInput = document.getElementById('page-num') as HTMLInputElement;

    if (prevPageBtn) {
        prevPageBtn.onclick = () => {
            const state = AppStateManager.getState();
            if (state.currentPage > 1) {
                PDFRenderer.renderPage(state.currentPage - 1, TextSelection);
            }
        };
    }

    if (nextPageBtn) {
        nextPageBtn.onclick = () => {
            const state = AppStateManager.getState();
            if (state.currentPage < state.totalPages) {
                PDFRenderer.renderPage(state.currentPage + 1, TextSelection);
            }
        };
    }

    if (pageNumInput) {
        const handlePageNavigation = async (e: Event) => {
            const inputElement = e.target as HTMLInputElement;
            let pageNum = parseInt(inputElement.value);
            const state = AppStateManager.getState();

            // Clamp page number to valid range
            if (isNaN(pageNum)) {
                pageNum = state.currentPage;
            } else if (pageNum < 1) {
                pageNum = 1;
            } else if (pageNum > state.totalPages) {
                pageNum = state.totalPages;
            }

            // Update input value IMMEDIATELY after clamping (before async renderPage)
            inputElement.value = pageNum.toString();

            // Navigate to clamped page number
            await PDFRenderer.renderPage(pageNum, TextSelection);
        };

        pageNumInput.onchange = handlePageNavigation;

        // Also handle Enter key press
        pageNumInput.addEventListener('keydown', async (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                await handlePageNavigation(e);
            }
        });
    }

    // Zoom Controls
    const zoomSelect = document.getElementById('zoom-level') as HTMLSelectElement;
    const fitWidthBtn = document.getElementById('fit-width');

    if (zoomSelect) {
        zoomSelect.onchange = (e) => {
            const scale = parseFloat((e.target as HTMLSelectElement).value);
            AppStateManager.setState({ scale });
            PDFRenderer.renderPage(AppStateManager.getState().currentPage, TextSelection);
        };
    }

    if (fitWidthBtn) {
        fitWidthBtn.onclick = async () => {
            const state = AppStateManager.getState();
            if (!state.pdfDoc) return;

            const container = document.getElementById('pdf-container');
            if (!container) return;

            const containerWidth = container.clientWidth - 40; // Account for padding
            try {
                const page = await state.pdfDoc.getPage(state.currentPage);
                const viewport = page.getViewport({ scale: 1.0 });
                const newScale = containerWidth / viewport.width;

                AppStateManager.setState({ scale: newScale });
                if (zoomSelect) {
                    zoomSelect.value = newScale.toFixed(2);
                }
                await PDFRenderer.renderPage(state.currentPage, TextSelection);
            } catch (error) {
                console.error('Fit Width Error:', error);
                StatusManager.show('Could not fit PDF to width', 'error');
            }
        };
    }

    // Drag and Drop for Upload Area
    const uploadArea = document.getElementById('upload-area');
    const pdfFile = document.getElementById('pdf-file') as HTMLInputElement;

    if (uploadArea && pdfFile) {
        // Make sure upload area is visible on load
        uploadArea.style.display = 'block';
        
        // Click to browse
        uploadArea.addEventListener('click', () => pdfFile.click());

        uploadArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pdfFile.click();
            }
        });

        // File input change handler
        pdfFile.addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file && file.type === 'application/pdf') {
                PDFLoader.loadPDF(file);
            } else if (file) {
                StatusManager.show('Please select a valid PDF file', 'warning');
            }
        });

        // Drag and drop handlers
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.background = '#e3f2fd';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.background = '';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.background = '';
            const file = e.dataTransfer?.files[0];
            if (file && file.type === 'application/pdf') {
                PDFLoader.loadPDF(file);
            } else {
                StatusManager.show('Please drop a valid PDF file', 'warning');
            }
        });
        
        console.log('✓ PDF upload area initialized and visible');
    } else {
        console.warn('⚠️ Upload area or file input not found');
    }

    // Image Upload for Analysis
    const imageUploadInput = document.getElementById('image-upload-input') as HTMLInputElement;
    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
                const preview = document.getElementById('image-preview') as HTMLImageElement;
                const analyzeBtn = document.getElementById('analyze-image-btn') as HTMLButtonElement;

                if (preview) {
                    preview.src = URL.createObjectURL(file);
                    preview.style.display = 'block';
                    preview.onload = () => URL.revokeObjectURL(preview.src);
                }

                if (analyzeBtn) {
                    analyzeBtn.disabled = false;
                }
            }
        });
    }

    // Export Buttons - Explicit bindings for reliability
    const exportExcelBtn = document.getElementById('export-excel-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportAuditBtn = document.getElementById('export-audit-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');

    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', () => {
            if (window.ClinicalExtractor?.exportExcel) {
                window.ClinicalExtractor.exportExcel();
            }
        });
    }

    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', () => {
            if (window.ClinicalExtractor?.exportJSON) {
                window.ClinicalExtractor.exportJSON();
            }
        });
    }

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            if (window.ClinicalExtractor?.exportCSV) {
                window.ClinicalExtractor.exportCSV();
            }
        });
    }

    if (exportAuditBtn) {
        exportAuditBtn.addEventListener('click', () => {
            if (window.ClinicalExtractor?.exportAudit) {
                window.ClinicalExtractor.exportAudit();
            }
        });
    }

    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            if (window.ClinicalExtractor?.exportAnnotatedPDF) {
                window.ClinicalExtractor.exportAnnotatedPDF();
            }
        });
    }

    // Memory Management
    MemoryManager.registerEventListener(window, 'beforeunload', () => {
        MemoryManager.cleanup();
    });
}

// ==================== EXTRACTION HANDLERS ====================

/**
 * Extract all figures from current PDF
 */
async function extractFiguresFromPDF() {
    const state = AppStateManager.getState();

    if (!state.pdfDoc) {
        StatusManager.show('Please load a PDF first', 'warning');
        return;
    }

    if (state.isProcessing) {
        StatusManager.show('Already processing...', 'warning');
        return;
    }

    AppStateManager.setState({ isProcessing: true });
    StatusManager.showLoading(true);
    StatusManager.show('Extracting figures from PDF...', 'info');

    try {
        const allFigures: any[] = [];
        const allDiagnostics: any[] = [];

        // Extract from all pages
        for (let pageNum = 1; pageNum <= state.pdfDoc.numPages; pageNum++) {
            const page = await state.pdfDoc.getPage(pageNum);
            const { figures, diagnostics } = await FigureExtractor.extractFiguresFromPage(page, pageNum);

            allFigures.push(...figures);
            allDiagnostics.push(diagnostics);

            console.log(`Page ${pageNum}: ${figures.length} figures (${diagnostics.processingTime}ms)`);
        }

        // Update state with extracted figures
        AppStateManager.setState({ extractedFigures: allFigures });

        StatusManager.show(
            `Successfully extracted ${allFigures.length} figures from ${state.pdfDoc.numPages} pages`,
            'success'
        );

        console.log('Figure extraction diagnostics:', allDiagnostics);
        console.log('Extracted figures:', allFigures);

    } catch (error: any) {
        console.error('Figure extraction error:', error);
        StatusManager.show(`Failed to extract figures: ${error.message}`, 'error');
    } finally {
        AppStateManager.setState({ isProcessing: false });
        StatusManager.showLoading(false);
    }
}

/**
 * Extract all tables from current PDF
 */
async function extractTablesFromPDF() {
    const state = AppStateManager.getState();

    if (!state.pdfDoc) {
        StatusManager.show('Please load a PDF first', 'warning');
        return;
    }

    if (state.isProcessing) {
        StatusManager.show('Already processing...', 'warning');
        return;
    }

    AppStateManager.setState({ isProcessing: true });
    StatusManager.showLoading(true);
    StatusManager.show('Extracting tables from PDF...', 'info');

    try {
        const allTables: any[] = [];

        // Extract from all pages
        for (let pageNum = 1; pageNum <= state.pdfDoc.numPages; pageNum++) {
            const page = await state.pdfDoc.getPage(pageNum);
            const tables = await TableExtractor.extractTablesFromPage(page, pageNum);

            allTables.push(...tables);

            console.log(`Page ${pageNum}: ${tables.length} tables`);
        }

        // Update state with extracted tables
        AppStateManager.setState({ extractedTables: allTables });

        // Render table regions if visualization is enabled
        if (PDFRenderer.showTableRegions && state.currentPage) {
            const pageTables = allTables.filter(t => t.pageNum === state.currentPage);
            PDFRenderer.renderTableRegions(pageTables, state.scale);
        }

        StatusManager.show(
            `Successfully extracted ${allTables.length} tables from ${state.pdfDoc.numPages} pages`,
            'success'
        );

        console.log('Extracted tables:', allTables);

    } catch (error: any) {
        console.error('Table extraction error:', error);
        StatusManager.show(`Failed to extract tables: ${error.message}`, 'error');
    } finally {
        AppStateManager.setState({ isProcessing: false });
        StatusManager.showLoading(false);
    }
}

/**
 * Toggle bounding box visualization and re-render
 */
async function toggleBoundingBoxes() {
    PDFRenderer.toggleBoundingBoxes();
    const state = AppStateManager.getState();
    if (state.currentPage) {
        await PDFRenderer.renderPage(state.currentPage, TextSelection);
    }
}

/**
 * Toggle table region visualization and re-render
 */
async function toggleTableRegions() {
    PDFRenderer.toggleTableRegions();
    const state = AppStateManager.getState();

    // Extract tables if not already done
    if (!state.extractedTables || state.extractedTables.length === 0) {
        await extractTablesFromPDF();
    }

    if (state.currentPage) {
        await PDFRenderer.renderPage(state.currentPage, TextSelection);
    }
}

/**
 * FULL MULTI-AGENT PIPELINE
 * Extract → Classify → Route → Enhance → Validate
 */
async function runFullAIPipeline() {
    const state = AppStateManager.getState();

    if (!state.pdfDoc) {
        StatusManager.show('Please load a PDF first', 'warning');
        return;
    }

    if (state.isProcessing) {
        StatusManager.show('Already processing...', 'warning');
        return;
    }

    AppStateManager.setState({ isProcessing: true });
    StatusManager.showLoading(true);
    StatusManager.show('🚀 Starting Multi-Agent Pipeline...', 'info');

    try {
        // Step 1: Extract figures and tables geometrically
        console.log('📊 Step 1: Geometric Extraction...');
        const figures = state.extractedFigures || await extractAndReturnFigures();
        const tables = state.extractedTables || await extractAndReturnTables();

        StatusManager.show(`Extracted ${figures.length} figures and ${tables.length} tables. Routing to AI agents...`, 'info');

        // Step 2: Route to specialized medical agents
        console.log('🤖 Step 2: Multi-Agent Analysis...');
        const { enhancedFigures, enhancedTables, pipelineStats } =
            await AgentOrchestrator.processExtractedData(figures, tables);

        // Step 3: Update state with enhanced data
        AppStateManager.setState({
            extractedFigures: enhancedFigures,
            extractedTables: enhancedTables
        });

        // Step 4: Display results
        displayPipelineResults(enhancedTables, enhancedFigures, pipelineStats);

        StatusManager.show(
            `✅ Pipeline Complete! Processed ${pipelineStats.tablesProcessed} tables + ${pipelineStats.figuresProcessed} figures with ${pipelineStats.agentsInvoked} agent calls (Avg confidence: ${(pipelineStats.averageConfidence * 100).toFixed(1)}%)`,
            'success'
        );

        console.log('🎉 Multi-Agent Pipeline Results:', {
            enhancedTables,
            enhancedFigures,
            pipelineStats
        });

    } catch (error: any) {
        console.error('Pipeline error:', error);
        StatusManager.show(`Pipeline failed: ${error.message}`, 'error');
    } finally {
        AppStateManager.setState({ isProcessing: false });
        StatusManager.showLoading(false);
    }
}

/**
 * Helper: Extract figures and return them
 */
async function extractAndReturnFigures() {
    const state = AppStateManager.getState();
    const allFigures: any[] = [];

    for (let pageNum = 1; pageNum <= state.pdfDoc.numPages; pageNum++) {
        const page = await state.pdfDoc.getPage(pageNum);
        const { figures } = await FigureExtractor.extractFiguresFromPage(page, pageNum);
        allFigures.push(...figures);
    }

    AppStateManager.setState({ extractedFigures: allFigures });
    return allFigures;
}

/**
 * Helper: Extract tables and return them
 */
async function extractAndReturnTables() {
    const state = AppStateManager.getState();
    const allTables: any[] = [];

    for (let pageNum = 1; pageNum <= state.pdfDoc.numPages; pageNum++) {
        const page = await state.pdfDoc.getPage(pageNum);
        const tables = await TableExtractor.extractTablesFromPage(page, pageNum);
        allTables.push(...tables);
    }

    AppStateManager.setState({ extractedTables: allTables });
    return allTables;
}

/**
 * Display pipeline results in UI
 */
function displayPipelineResults(enhancedTables: any[], enhancedFigures: any[], stats: any) {
    console.log('\n=== 🎯 MULTI-AGENT PIPELINE RESULTS ===\n');

    // Display enhanced tables
    enhancedTables.forEach((table, idx) => {
        console.log(`\n📊 Table ${idx + 1} (${table.id}):`);
        console.log(`  Data Type: ${table.aiEnhancement?.clinicalDataType || 'unknown'}`);
        console.log(`  Overall Confidence: ${(table.aiEnhancement?.overallConfidence * 100).toFixed(1)}%`);
        console.log(`  Agents Called: ${table.aiEnhancement?.agentResults.length || 0}`);

        table.aiEnhancement?.agentResults.forEach((result: any) => {
            console.log(`    - ${result.agentName}: ${(result.confidence * 100).toFixed(1)}% (${result.validationStatus})`);
        });

        if (table.aiEnhancement?.consensusData) {
            console.log(`  Consensus: ${table.aiEnhancement.consensusData.primaryAgent}`);
        }
    });

    // Display enhanced figures
    enhancedFigures.forEach((figure, idx) => {
        console.log(`\n🖼️ Figure ${idx + 1} (${figure.id}):`);
        console.log(`  Type: ${figure.aiAnalysis?.figureType || 'unknown'}`);
        console.log(`  Confidence: ${(figure.aiAnalysis?.overallConfidence * 100).toFixed(1)}%`);
        console.log(`  Insights: ${figure.aiAnalysis?.clinicalInsights.length || 0}`);
    });

    console.log('\n=== 📈 PIPELINE STATISTICS ===');
    console.log(`Total Processing Time: ${stats.totalProcessingTime}ms`);
    console.log(`Agents Invoked: ${stats.agentsInvoked}`);
    console.log(`Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
    console.log('\n=====================================\n');
}

// ==================== WINDOW API EXPOSURE ====================

/**
 * Toggle semantic search panel
 */
function toggleSemanticSearch() {
    const panel = document.getElementById('semantic-search-panel');
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Perform semantic search
 */
async function performSemanticSearch() {
    const input = document.getElementById('semantic-search-input') as HTMLInputElement;
    const resultsDiv = document.getElementById('semantic-search-results');

    if (!input || !resultsDiv) return;

    const query = input.value.trim();
    if (!query) {
        StatusManager.show('Please enter a search query', 'warning');
        return;
    }

    try {
        StatusManager.showLoading(true);
        const results = await SemanticSearchService.search(query);

        if (results.length === 0) {
            resultsDiv.innerHTML = '<p style="color: #666; font-style: italic;">No results found</p>';
        } else {
            resultsDiv.innerHTML = results.map((result, idx) => `
                <div style="padding: 8px; margin: 4px 0; background: white; border-left: 3px solid #0288d1; border-radius: 4px; cursor: pointer;" onclick="window.ClinicalExtractor.jumpToPage(${result.pageNum})">
                    <div style="font-size: 12px; color: #666;">Result ${idx + 1} • Page ${result.pageNum} • Score: ${result.score.toFixed(2)}</div>
                    <div style="margin-top: 4px;">${result.text.substring(0, 150)}${result.text.length > 150 ? '...' : ''}</div>
                </div>
            `).join('');
        }

        StatusManager.show(`Found ${results.length} results`, 'success');
    } catch (error) {
        console.error('Semantic search error:', error);
        StatusManager.show('Search failed. Check console for details.', 'error');
    } finally {
        StatusManager.showLoading(false);
    }
}

/**
 * Jump to specific page
 */
async function jumpToPage(pageNum: number) {
    const state = AppStateManager.getState();
    if (!state.pdfDoc) {
        StatusManager.show('No PDF loaded', 'warning');
        return;
    }

    await PDFRenderer.renderPage(pageNum, TextSelection);
}

/**
 * Highlight a citation on the PDF
 */
async function highlightCitationOnPDF(citationIndex: number) {
    const state = AppStateManager.getState();
    if (!state.pdfDoc || !state.citationMap) {
        StatusManager.show('No PDF loaded or citation map not available', 'warning');
        return;
    }

    await jumpToCitation(
        citationIndex,
        state.citationMap,
        async (pageNum: number) => {
            await PDFRenderer.renderPage(pageNum, TextSelection);
        }
    );
}

/**
 * Toggle annotation tools panel
 */
function toggleAnnotationTools() {
    const panel = document.getElementById('annotation-tools-panel');
    if (panel) {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            const state = AppStateManager.getState();
            const pdfContainer = document.getElementById('pdf-container');
            if (state.pdfDoc && pdfContainer) {
                const canvas = pdfContainer.querySelector('canvas');
                if (canvas && state.currentPage) {
                    AnnotationService.initializeLayer(state.currentPage, pdfContainer);
                    StatusManager.show('Annotation tools enabled. Click on PDF to annotate.', 'info');
                }
            }
        }
    }
}

/**
 * Set annotation tool
 */
function setAnnotationTool(tool: string) {
    const colorSelect = document.getElementById('annotation-color') as HTMLSelectElement;
    const color = colorSelect ? colorSelect.value : 'yellow';

    AnnotationService.setTool(tool as any);
    AnnotationService.setColor(color as any);

    StatusManager.show(`Annotation tool: ${tool} (${color})`, 'info');
}

/**
 * Configure backend proxy
 */
function configureBackendProxy() {
    const baseURL = prompt('Enter backend API base URL:', 'https://api.example.com');
    if (!baseURL) return;

    const timeout = parseInt(prompt('Enter timeout (ms):', '5000') || '5000');
    const retryAttempts = parseInt(prompt('Enter retry attempts:', '3') || '3');

    BackendProxyService.configure({
        baseURL,
        timeout,
        retryAttempts,
        retryDelay: 1000,
        cacheEnabled: true,
        cacheTTL: 60000,
        rateLimitPerSecond: 10
    });

    StatusManager.show(`Backend proxy configured: ${baseURL}`, 'success');
}

/**
 * Expose all functions to the window object for HTML onclick handlers
 */
function exposeWindowAPI() {
    window.ClinicalExtractor = {
        // Helper Functions (6)
        calculateBoundingBox,
        addExtractionMarker,
        addExtractionMarkersForPage,
        autoAdvanceField,
        clearSearchMarkers,
        blobToBase64,

        // Field Management Functions (9)
        addIndication,
        addIntervention,
        addArm,
        addMortality,
        addMRS,
        addComplication,
        addPredictor,
        removeElement,
        updateArmSelectors,

        // AI Functions (7)
        generatePICO,
        generateSummary,
        validateFieldWithAI,
        findMetadata,
        handleExtractTables,
        handleImageAnalysis,
        handleDeepAnalysis,

        // Export Functions (8)
        exportJSON,
        exportCSV,
        exportExcel,
        exportAudit,
        exportAnnotatedPDF,
        exportProvenance,
        exportCitationAuditJSON,
        exportCitationAuditCSV,

        // Search Functions (4)
        toggleSearchInterface,
        searchInPDF,
        nextSearchResult: () => {
            const result = SearchService.nextResult();
            if (result) {
                PDFRenderer.renderPage(result.page, TextSelection);
                SearchService.highlightResults(result.page);
            }
        },
        previousSearchResult: () => {
            const result = SearchService.previousResult();
            if (result) {
                PDFRenderer.renderPage(result.page, TextSelection);
                SearchService.highlightResults(result.page);
            }
        },

        // New: Figure/Table Extraction & Visualization (4)
        extractFiguresFromPDF,
        extractTablesFromPDF,
        toggleBoundingBoxes,
        toggleTableRegions,

        // New: Multi-Agent Pipeline (1)
        runFullAIPipeline,

        // New: Vision-Based PDF Processing Agent (5)
        PDFProcessingAgent,
        PDFPageRenderer,
        CoordinateTransformer,
        processFullDocument: async (options?: any) => {
            return AgentOrchestrator.processFullDocument(options);
        },
        highlightExtraction: async (coordinates: Map<string, any>, fieldName?: string) => {
            return AgentOrchestrator.highlightExtraction(coordinates, fieldName);
        },

        // AI Provider Management
        setAIProvider: (provider: AIProvider) => {
            MultiProviderAIClient.setProvider(provider);
        },
        getAIProvider: () => {
            return MultiProviderAIClient.getProvider();
        },
        getAvailableProviders: () => {
            return MultiProviderAIClient.getAvailableProviders();
        },
        MultiProviderAIClient,

        // Local PDF Library (IndexedDB)
        LocalPDFLibrary,
        storeCurrentPDF: async (name?: string) => LocalPDFLibrary.storeCurrentPDF(name),
        loadPDFFromLibrary: async (id: string) => LocalPDFLibrary.loadPDF(id),
        deletePDFFromLibrary: async (id: string) => LocalPDFLibrary.deletePDF(id),

        // Vision Extraction Integration
        PDFDatabaseVisionIntegration,
        setAutoExtraction: (enabled: boolean) => PDFDatabaseVisionIntegration.setAutoExtraction(enabled),
        isAutoExtractionEnabled: () => PDFDatabaseVisionIntegration.isAutoExtractionEnabled(),
        extractAndStoreResults: async (pdfId: string) => PDFDatabaseVisionIntegration.extractAndStoreResults(pdfId),
        getCachedExtraction: (pdfId: string) => PDFDatabaseVisionIntegration.getCachedExtraction(pdfId),
        forceReExtraction: async (pdfId: string) => PDFDatabaseVisionIntegration.forceReExtraction(pdfId),
        getExtractionStats: () => PDFDatabaseVisionIntegration.getStats(),
        getCacheMetadata: () => PDFDatabaseVisionIntegration.getCacheMetadata(),
        exportExtractionData: (pdfId: string, format?: 'json' | 'csv') => PDFDatabaseVisionIntegration.exportExtractionData(pdfId, format),

        SemanticSearchService,
        AnnotationService,
        BackendProxyService,
        SamplePDFService,
        PDFLibraryService,

        toggleSemanticSearch,
        performSemanticSearch,
        triggerVisionExtraction,
        jumpToPage,
        toggleAnnotationTools,
        setAnnotationTool,
        configureBackendProxy,

        // Sample PDF loading
        loadSamplePDF: async () => {
            try {
                await SamplePDFService.loadDefaultSample();
            } catch (error) {
                console.error('Failed to load sample PDF:', error);
                StatusManager.show('Failed to load sample PDF. Check console for details.', 'error');
            }
        },

        // Expose core managers for debugging
        AppStateManager,
        ExtractionTracker,
        FormManager,
        StatusManager,

        // Citation functions and services
        CitationService,
        citationAuditTrail,
        citationUIEnhancer,
        highlightCitation: highlightCitationOnPDF,

        // Recovery functions
        triggerCrashStateSave,
        triggerManualRecovery
    };

    // Also expose individual functions for backward compatibility with HTML onclick handlers
    // This allows onclick="generatePICO()" to work directly
    Object.assign(window, window.ClinicalExtractor);

    // Also expose SamplePDFService methods directly
    (window as any).SamplePDFService = SamplePDFService;

    // Expose GeminiFilesService for debugging
    (window as any).GeminiFilesService = GeminiFilesService;

    console.log('Clinical Extractor API exposed to window');
}

// ==================== TEST VISION EXTRACTION ====================

/**
 * Test Vision-Based PDF Extraction
 * This function triggers the PDFProcessingAgent to extract data using Gemini Vision API
 */
async function triggerVisionExtraction() {
    const state = AppStateManager.getState();

    // Validate prerequisites
    if (!state.pdfDoc) {
        StatusManager.show('Please load a PDF first', 'warning');
        return;
    }

    if (state.isProcessing) {
        StatusManager.show('Already processing...', 'warning');
        return;
    }

    // Show status
    const visionStatusEl = document.getElementById('vision-status');
    if (visionStatusEl) {
        visionStatusEl.style.display = 'inline';
        visionStatusEl.textContent = 'Initializing...';
    }

    AppStateManager.setState({ isProcessing: true });
    StatusManager.showLoading(true);
    StatusManager.show('👁️ Starting Vision-Based Extraction...', 'info');

    try {
        console.log('='.repeat(60));
        console.log('TEST: VISION-BASED PDF PROCESSING AGENT');
        console.log('='.repeat(60));

        // Call the PDFProcessingAgent
        const result = await PDFProcessingAgent.processDocument({
            dpi: 150,           // 150 DPI for balance between quality and cost
            pagesPerBatch: 3,   // Process 3 pages per API call
            maxParallel: 2      // 2 parallel batches
        });

        if (!result) {
            console.warn('Vision extraction returned null');
            StatusManager.show('Vision extraction failed - check console for details', 'error');
            return;
        }

        console.log('\n📊 EXTRACTION RESULTS:');
        console.log('='.repeat(60));
        console.log('Pages Processed:', result.processingStats.pagesProcessed);
        console.log('Total Time:', `${result.processingStats.totalTime}ms`);
        console.log('API Calls:', result.processingStats.apiCalls);
        console.log('Estimated Cost:', `$${result.processingStats.estimatedCost.toFixed(4)}`);
        console.log('Fields with Coordinates:', result.coordinates.size);
        console.log('='.repeat(60));

        // Display coordinate information
        if (result.coordinates.size > 0) {
            console.log('\n🎯 EXTRACTED FIELDS WITH COORDINATES:');
            let fieldIndex = 1;
            for (const [fieldName, coords] of result.coordinates.entries()) {
                console.log(`  ${fieldIndex}. ${fieldName}: ${coords.length} coordinate(s)`);
                coords.forEach((coord, idx) => {
                    console.log(`     - Coord ${idx + 1}: Page ${coord.pageNum}, Bbox [${coord.normalizedX.toFixed(3)}, ${coord.normalizedY.toFixed(3)}, ${coord.normalizedWidth.toFixed(3)}, ${coord.normalizedHeight.toFixed(3)}]`);
                });
                fieldIndex++;
            }
        }

        // Display extraction data
        if (result.extraction) {
            console.log('\n📝 EXTRACTED DATA:');
            console.log(JSON.stringify(result.extraction, null, 2));
        }

        // Store result for debugging
        (window as any)._lastVisionResult = result;
        console.log('\n✅ Result stored in window._lastVisionResult');
        console.log('='.repeat(60));

        // Update UI status
        const statusText = `✅ Vision extraction complete! ${result.coordinates.size} fields with coordinates`;
        if (visionStatusEl) {
            visionStatusEl.textContent = statusText;
        }
        StatusManager.show(statusText, 'success', 8000);

        // Optional: Highlight extractions on current page
        if (result.coordinates.size > 0) {
            console.log('\n🔍 Highlighting extractions on current page...');
            await PDFProcessingAgent.highlightExtractions(result.coordinates);
            console.log('✓ Highlighting complete');
        }

    } catch (error: any) {
        console.error('Vision extraction error:', error);
        console.error('Stack trace:', error.stack);
        StatusManager.show(`Vision extraction failed: ${error.message}`, 'error', 10000);
        if (visionStatusEl) {
            visionStatusEl.textContent = '❌ Failed';
        }
    } finally {
        AppStateManager.setState({ isProcessing: false });
        StatusManager.showLoading(false);
    }
}

// ==================== CLEANUP REGISTRATION ====================

/**
 * Register cleanup functions for all modules that need cleanup
 * This creates a central cleanup registry without circular dependencies
 */
function registerCleanupCallbacks() {
    // Register PDFRenderer cleanup
    MemoryManager.registerCleanup('PDFRenderer', () => {
        PDFRenderer.cleanup();
    });

    // Register AnnotationService cleanup
    MemoryManager.registerCleanup('AnnotationService', () => {
        AnnotationService.cleanup();
    });

    console.log('Cleanup callbacks registered');
}

// ==================== INITIALIZATION ====================

/**
 * Initialize the application
 */
async function initializeApp() {
    try {
        console.log('Initializing Clinical Extractor...');

        initializeErrorBoundary();
        console.log('✓ Error Boundary initialized');

        // 1. Set up module dependencies
        setupDependencies();
        console.log('✓ Dependencies configured');

        // 2. Initialize core modules
        ExtractionTracker.init();
        console.log('✓ Extraction Tracker initialized');

        FormManager.initialize();
        console.log('✓ Form Manager initialized');

        // Initialize and wait for authentication to complete
        console.log('🔐 Initializing authentication...');
        const isAuthenticated = await AuthManager.ensureAuthenticated();
        console.log('✓ Backend authentication initialized');

        // Initialize local PDF library (IndexedDB - always available)
        try {
            console.log('📚 Initializing local PDF library...');
            await LocalPDFLibrary.init();
            console.log('✓ Local PDF library initialized');
        } catch (error) {
            console.warn('⚠️ Could not initialize local PDF library:', error);
        }

        // Initialize vision extraction integration
        try {
            console.log('👁️ Initializing vision extraction integration...');
            await PDFDatabaseVisionIntegration.init();
            console.log('✓ Vision extraction integration initialized');
        } catch (error) {
            console.warn('⚠️ Could not initialize vision extraction integration:', error);
        }

        // Load backend PDF library only if authenticated
        if (isAuthenticated) {
            try {
                console.log('📚 Loading backend PDF library...');
                await PDFLibraryService.populateLibraryDropdown();
                console.log('✓ Backend PDF library loaded');
            } catch (error) {
                console.warn('⚠️ Could not load backend PDF library:', error);
            }
        } else {
            console.log('ℹ️ Running in frontend-only mode - using local PDF library only');
        }

        // Check backend health
        BackendHealthMonitor.checkHealth();


        // Test backend connectivity
        try {
            const healthCheck = await fetch('/api/health');
            if (healthCheck.ok) {
                console.log('✅ Backend is reachable at /api/health');
            } else {
                console.warn('⚠️ Backend health check failed with status:', healthCheck.status);
            }
        } catch (error) {
            console.error('❌ Backend is not reachable:', error);
            console.log('💡 Make sure backend workflow is running on port 8080');
        }

        // 3. Configure PDF.js
        configurePDFJS();
        console.log('✓ PDF.js configured');

        // 4. Register cleanup callbacks
        registerCleanupCallbacks();
        console.log('✓ Cleanup callbacks registered');

        // 5. Expose window API FIRST (before event listeners, so onclick handlers work)
        exposeWindowAPI();
        console.log('✓ Window API exposed');

        // 6. Set up event listeners
        setupEventListeners();
        console.log('✓ Event listeners configured');

        await checkAndOfferRecovery();
        console.log('✓ Crash recovery check complete');

        // 8. Initialize Backend Health Monitoring (optional, auto-checks every 60s)
        // Health monitor configured but not auto-started to avoid unnecessary API calls
        BackendHealthMonitor.configure({
            checkInterval: 60000,    // 1 minute
            cacheTTL: 30000,         // 30 seconds
            autoStart: false         // Manual start only when needed
        });
        console.log('✓ Backend Health Monitor configured');

        // 9. Initialize Diagnostics Panel
        DiagnosticsPanel.initialize();
        console.log('✓ Diagnostics Panel initialized');

        // 10. Initialize Citation Sidebar
        const citationSidebar = getCitationSidebar();
        console.log('✓ Citation Sidebar initialized');

        // Add button to show Citation Sidebar
        const citationBtn = document.createElement('button');
        citationBtn.textContent = '📑 Show Citations';
        citationBtn.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 10000; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;';
        citationBtn.onclick = () => {
            citationSidebar.toggle();
        };
        document.body.appendChild(citationBtn);

        // 11. Show initial status
        StatusManager.show('Clinical Extractor Ready. Load a PDF to begin.', 'info');
        console.log('✓ Clinical Extractor initialization complete');

    } catch (error) {
        console.error('Failed to initialize Clinical Extractor:', error);
        // Show error to user
        const statusElement = document.getElementById('extraction-status');
        if (statusElement) {
            statusElement.textContent = 'Initialization error - please refresh the page';
            statusElement.style.color = '#ff4444';
        }
    }
}

// ==================== ENTRY POINT ====================

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM already loaded - run immediately
    initializeApp();
}

// Debug helper: Check if functions are available
(window as any).checkClinicalExtractor = () => {
    console.log('Clinical Extractor API Check:');
    console.log('- window.ClinicalExtractor:', !!window.ClinicalExtractor);
    console.log('- window.generatePICO:', typeof (window as any).generatePICO);
    console.log('- window.SamplePDFService:', !!(window as any).SamplePDFService);
    console.log('- window.pdfjsLib:', !!window.pdfjsLib);
    console.log('- PDF elements:', {
        uploadBtn: !!document.getElementById('pdf-upload-btn'),
        fileInput: !!document.getElementById('pdf-file'),
        sampleBtn: !!document.getElementById('load-sample-btn')
    });
};

// Export for debugging
export { AppStateManager, ExtractionTracker, FormManager, StatusManager };