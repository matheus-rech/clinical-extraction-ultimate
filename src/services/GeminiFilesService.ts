/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GeminiFilesService - Upload and manage files in Gemini Files API
 *
 * Features:
 * - Auto-upload PDFs on load for File Search grounding
 * - Track uploaded files with metadata
 * - Handle file expiration (48h default)
 */

import AppStateManager from '../state/AppStateManager';
import StatusManager from '../utils/status';

// Types
export interface GeminiFile {
    name: string;           // e.g., "files/abc123"
    displayName: string;
    mimeType: string;
    sizeBytes: string;
    createTime: string;
    expirationTime: string;
    sha256Hash: string;
    uri: string;
    state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
}

interface UploadedFileInfo {
    fileId: string;
    uri: string;
    displayName: string;
    uploadTime: number;
    expirationTime: number;
    sizeBytes: number;
}

// Module state
let uploadedFiles: Map<string, UploadedFileInfo> = new Map();

export const GeminiFilesService = {
    /**
     * Upload a PDF file to Gemini Files API
     */
    async uploadFile(file: File): Promise<GeminiFile | null> {
        const apiKey = (window as any).GEMINI_API_KEY ||
            import.meta.env.VITE_GEMINI_API_KEY;

        if (!apiKey) {
            console.warn('[GeminiFilesService] No API key configured');
            return null;
        }

        try {
            StatusManager.show(`Uploading "${file.name}" to Gemini...`, 'info');

            // Step 1: Initiate resumable upload
            const initResponse = await fetch(
                `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'X-Goog-Upload-Protocol': 'resumable',
                        'X-Goog-Upload-Command': 'start',
                        'X-Goog-Upload-Header-Content-Length': file.size.toString(),
                        'X-Goog-Upload-Header-Content-Type': file.type,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        file: {
                            display_name: file.name
                        }
                    })
                }
            );

            if (!initResponse.ok) {
                const errorText = await initResponse.text();
                throw new Error(`Upload init failed: ${initResponse.status} - ${errorText}`);
            }

            // Get upload URL from headers
            const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL');
            if (!uploadUrl) {
                throw new Error('No upload URL received');
            }

            // Step 2: Upload file content
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Length': file.size.toString(),
                    'X-Goog-Upload-Offset': '0',
                    'X-Goog-Upload-Command': 'upload, finalize'
                },
                body: file
            });

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
            }

            const result = await uploadResponse.json();
            const geminiFile: GeminiFile = result.file;

            // Track uploaded file
            const info: UploadedFileInfo = {
                fileId: geminiFile.name,
                uri: geminiFile.uri,
                displayName: geminiFile.displayName,
                uploadTime: Date.now(),
                expirationTime: new Date(geminiFile.expirationTime).getTime(),
                sizeBytes: parseInt(geminiFile.sizeBytes)
            };
            uploadedFiles.set(file.name, info);

            // Update app state
            AppStateManager.setState({
                geminiFileUri: geminiFile.uri,
                geminiFileName: geminiFile.name
            });

            console.log(`[GeminiFilesService] Uploaded: ${geminiFile.name}`);
            StatusManager.show(`Uploaded to Gemini Files: ${file.name}`, 'success');

            return geminiFile;

        } catch (error) {
            console.error('[GeminiFilesService] Upload failed:', error);
            StatusManager.show('Failed to upload to Gemini Files API', 'warning');
            return null;
        }
    },

    /**
     * Get file info by name
     */
    async getFile(fileName: string): Promise<GeminiFile | null> {
        const apiKey = (window as any).GEMINI_API_KEY ||
            import.meta.env.VITE_GEMINI_API_KEY;

        if (!apiKey) return null;

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
            );

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('[GeminiFilesService] Get file failed:', error);
            return null;
        }
    },

    /**
     * List all uploaded files
     */
    async listFiles(): Promise<GeminiFile[]> {
        const apiKey = (window as any).GEMINI_API_KEY ||
            import.meta.env.VITE_GEMINI_API_KEY;

        if (!apiKey) return [];

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/files?key=${apiKey}`
            );

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            return data.files || [];
        } catch (error) {
            console.error('[GeminiFilesService] List files failed:', error);
            return [];
        }
    },

    /**
     * Delete a file
     */
    async deleteFile(fileName: string): Promise<boolean> {
        const apiKey = (window as any).GEMINI_API_KEY ||
            import.meta.env.VITE_GEMINI_API_KEY;

        if (!apiKey) return false;

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
                { method: 'DELETE' }
            );

            if (response.ok) {
                // Remove from tracking
                for (const [key, info] of uploadedFiles.entries()) {
                    if (info.fileId === fileName) {
                        uploadedFiles.delete(key);
                        break;
                    }
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('[GeminiFilesService] Delete file failed:', error);
            return false;
        }
    },

    /**
     * Wait for file to become ACTIVE
     */
    async waitForProcessing(fileName: string, maxWaitMs: number = 30000): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            const file = await this.getFile(fileName);

            if (file?.state === 'ACTIVE') {
                return true;
            }

            if (file?.state === 'FAILED') {
                console.error('[GeminiFilesService] File processing failed:', fileName);
                return false;
            }

            // Wait 1 second before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.warn('[GeminiFilesService] Timeout waiting for file processing');
        return false;
    },

    /**
     * Get cached file info for a document
     */
    getCachedFileInfo(documentName: string): UploadedFileInfo | undefined {
        return uploadedFiles.get(documentName);
    },

    /**
     * Check if file is still valid (not expired)
     */
    isFileValid(documentName: string): boolean {
        const info = uploadedFiles.get(documentName);
        if (!info) return false;
        return Date.now() < info.expirationTime;
    },

    /**
     * Clear all cached file info
     */
    clearCache(): void {
        uploadedFiles.clear();
    }
};

export default GeminiFilesService;
