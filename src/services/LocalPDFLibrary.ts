/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LocalPDFLibrary - Manages local PDF library with IndexedDB storage
 *
 * Features:
 * - Store uploaded PDFs locally (no backend needed)
 * - Populate dropdown with stored PDFs
 * - Instant loading on selection
 * - Track reviewed status
 */

import { PDFDatabaseService, type PDFListItem } from './PDFDatabaseService';
import PDFLoader from '../pdf/PDFLoader';
import StatusManager from '../utils/status';
import AppStateManager from '../state/AppStateManager';
import GeminiFilesService from './GeminiFilesService';
import PDFDatabaseVisionIntegration from './PDFDatabaseVisionIntegration';

export const LocalPDFLibrary = {
    /**
     * Initialize the library and populate dropdown
     */
    async init(): Promise<void> {
        await this.populateDropdown();
        this.setupEventListeners();
        console.log('[LocalPDFLibrary] Initialized');
    },

    /**
     * Populate dropdown with stored PDFs
     */
    async populateDropdown(): Promise<void> {
        const dropdown = document.getElementById('pdf-library-select') as HTMLSelectElement;
        if (!dropdown) {
            console.warn('[LocalPDFLibrary] Dropdown not found');
            return;
        }

        try {
            const pdfs = await PDFDatabaseService.listPDFs();

            // Clear and add placeholder
            dropdown.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = pdfs.length > 0
                ? `Select PDF (${pdfs.length} stored)...`
                : 'No PDFs stored - Upload one!';
            dropdown.appendChild(placeholder);

            // Add each PDF
            pdfs.forEach(pdf => {
                const option = document.createElement('option');
                option.value = pdf.id;
                const sizeKB = (pdf.fileSize / 1024).toFixed(1);
                const date = new Date(pdf.uploadDate).toLocaleDateString();
                option.textContent = `${pdf.name} (${pdf.pageCount}p, ${sizeKB}KB) - ${date}`;
                dropdown.appendChild(option);
            });

            console.log(`[LocalPDFLibrary] Loaded ${pdfs.length} PDFs into dropdown`);
        } catch (error) {
            console.error('[LocalPDFLibrary] Failed to populate dropdown:', error);
            dropdown.innerHTML = '<option value="">Error loading library</option>';
        }
    },

    /**
     * Setup event listeners for dropdown and file input
     */
    setupEventListeners(): void {
        // Dropdown selection
        const dropdown = document.getElementById('pdf-library-select') as HTMLSelectElement;
        if (dropdown) {
            dropdown.addEventListener('change', async (e) => {
                const id = (e.target as HTMLSelectElement).value;
                if (id) {
                    await this.loadPDF(id);
                }
            });
        }

        // File upload - use the dedicated pdf-file-input
        const fileInput = document.getElementById('pdf-file-input') as HTMLInputElement;
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file && file.type === 'application/pdf') {
                    try {
                        StatusManager.show(`Loading "${file.name}"...`, 'info');

                        // Load PDF first to get page count
                        await PDFLoader.loadPDF(file);

                        // Get page count from state
                        const state = AppStateManager.getState();
                        const pageCount = state.totalPages || 0;

                        // Store in database
                        const name = file.name.replace('.pdf', '');
                        const id = await PDFDatabaseService.storePDF(file, name, pageCount);

                        // Update state with library ID
                        AppStateManager.setState({ currentLibraryPdfId: id });

                        // Refresh dropdown
                        await this.populateDropdown();

                        // Select the newly uploaded PDF
                        const dropdown = document.getElementById('pdf-library-select') as HTMLSelectElement;
                        if (dropdown) {
                            dropdown.value = id;
                        }

                        StatusManager.show(`Stored "${name}" in library`, 'success');

                        // Auto-upload to Gemini Files API (non-blocking)
                        GeminiFilesService.uploadFile(file).then(geminiFile => {
                            if (geminiFile) {
                                console.log(`[LocalPDFLibrary] Auto-uploaded to Gemini: ${geminiFile.name}`);
                            }
                        });
                    } catch (error) {
                        console.error('[LocalPDFLibrary] Failed to upload PDF:', error);
                        StatusManager.show('Failed to upload PDF', 'error');
                    }

                    // Clear input for next upload
                    fileInput.value = '';
                }
            });
        }
    },

    /**
     * Load a PDF from the library by ID
     */
    async loadPDF(id: string): Promise<void> {
        try {
            StatusManager.show('Loading PDF...', 'info');

            const pdf = await PDFDatabaseService.getPDF(id);
            if (!pdf) {
                StatusManager.show('PDF not found in library', 'error');
                return;
            }

            // Convert ArrayBuffer to File
            const blob = new Blob([pdf.data], { type: 'application/pdf' });
            const file = new File([blob], pdf.fileName, { type: 'application/pdf' });

            // Load into viewer
            await PDFLoader.loadPDF(file);

            // Update state
            AppStateManager.setState({ currentLibraryPdfId: id });

            StatusManager.show(`Loaded: ${pdf.name}`, 'success');
            console.log(`[LocalPDFLibrary] Loaded PDF: ${pdf.name}`);

            // Trigger vision extraction if auto-extraction is enabled
            // This runs asynchronously in the background
            setTimeout(() => {
                PDFDatabaseVisionIntegration.onPDFLoaded(id, { autoExtract: true }).catch(error => {
                    console.error('[LocalPDFLibrary] Vision extraction error:', error);
                });
            }, 500);

            // Auto-upload to Gemini Files API (non-blocking)
            GeminiFilesService.uploadFile(file).then(geminiFile => {
                if (geminiFile) {
                    console.log(`[LocalPDFLibrary] Auto-uploaded to Gemini: ${geminiFile.name}`);
                }
            });
        } catch (error) {
            console.error('[LocalPDFLibrary] Failed to load PDF:', error);
            StatusManager.show('Failed to load PDF', 'error');
        }
    },

    /**
     * Delete a PDF from the library
     */
    async deletePDF(id: string): Promise<void> {
        try {
            await PDFDatabaseService.deletePDF(id);
            await this.populateDropdown();
            StatusManager.show('PDF deleted from library', 'success');
        } catch (error) {
            console.error('[LocalPDFLibrary] Failed to delete PDF:', error);
            StatusManager.show('Failed to delete PDF', 'error');
        }
    },

    /**
     * Get storage statistics
     */
    async getStats(): Promise<{ count: number; totalSizeMB: number }> {
        const stats = await PDFDatabaseService.getStorageStats();
        return {
            count: stats.count,
            totalSizeMB: stats.totalSize / (1024 * 1024)
        };
    },

    /**
     * Store current PDF (if loaded via drag-drop or other means)
     */
    async storeCurrentPDF(name?: string): Promise<string | null> {
        const state = AppStateManager.getState();
        if (!state.pdfDoc || !state.pdfBase64Data) {
            StatusManager.show('No PDF loaded to store', 'warning');
            return null;
        }

        try {
            // Convert base64 to ArrayBuffer
            const base64 = state.pdfBase64Data.split(',')[1] || state.pdfBase64Data;
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            const blob = new Blob([bytes], { type: 'application/pdf' });
            const fileName = name || state.documentName || 'Untitled.pdf';
            const file = new File([blob], fileName, { type: 'application/pdf' });

            const id = await PDFDatabaseService.storePDF(
                file,
                fileName.replace('.pdf', ''),
                state.totalPages
            );

            AppStateManager.setState({ currentLibraryPdfId: id });
            await this.populateDropdown();

            StatusManager.show(`Stored "${fileName}" in library`, 'success');
            return id;
        } catch (error) {
            console.error('[LocalPDFLibrary] Failed to store current PDF:', error);
            StatusManager.show('Failed to store PDF', 'error');
            return null;
        }
    }
};

export default LocalPDFLibrary;
