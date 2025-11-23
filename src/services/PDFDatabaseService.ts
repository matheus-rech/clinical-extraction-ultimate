/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PDFDatabaseService
 *
 * Manages a local database of uploaded PDFs for quick access and selection.
 * Uses IndexedDB for persistent storage of PDF data and metadata.
 */

// ==================== TYPES ====================

export interface StoredPDF {
    id: string;
    name: string;
    fileName: string;
    uploadDate: number;
    pageCount: number;
    fileSize: number;
    data: ArrayBuffer;
    metadata?: {
        doi?: string;
        pmid?: string;
        authors?: string;
        journal?: string;
        year?: number;
    };
}

export interface PDFListItem {
    id: string;
    name: string;
    fileName: string;
    uploadDate: number;
    pageCount: number;
    fileSize: number;
}

// ==================== DATABASE SERVICE ====================

const DB_NAME = 'clinical_extractor_pdfs';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB connection
 */
async function initDB(): Promise<IDBDatabase> {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[PDFDatabase] Failed to open database:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('[PDFDatabase] Database opened successfully');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('name', 'name', { unique: false });
                store.createIndex('uploadDate', 'uploadDate', { unique: false });
                store.createIndex('fileName', 'fileName', { unique: false });
                console.log('[PDFDatabase] Object store created');
            }
        };
    });
}

export const PDFDatabaseService = {
    /**
     * Store a PDF in the database
     */
    async storePDF(
        file: File,
        name: string,
        pageCount: number,
        metadata?: StoredPDF['metadata']
    ): Promise<string> {
        const database = await initDB();
        const id = `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const arrayBuffer = await file.arrayBuffer();

        const storedPDF: StoredPDF = {
            id,
            name,
            fileName: file.name,
            uploadDate: Date.now(),
            pageCount,
            fileSize: file.size,
            data: arrayBuffer,
            metadata
        };

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(storedPDF);

            request.onsuccess = () => {
                console.log(`[PDFDatabase] Stored PDF: ${name} (${id})`);
                resolve(id);
            };

            request.onerror = () => {
                console.error('[PDFDatabase] Failed to store PDF:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * Get a PDF by ID
     */
    async getPDF(id: string): Promise<StoredPDF | null> {
        const database = await initDB();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = () => {
                console.error('[PDFDatabase] Failed to get PDF:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * Get list of all stored PDFs (without data for performance)
     */
    async listPDFs(): Promise<PDFListItem[]> {
        const database = await initDB();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const items: PDFListItem[] = (request.result || []).map((pdf: StoredPDF) => ({
                    id: pdf.id,
                    name: pdf.name,
                    fileName: pdf.fileName,
                    uploadDate: pdf.uploadDate,
                    pageCount: pdf.pageCount,
                    fileSize: pdf.fileSize
                }));

                // Sort by upload date (newest first)
                items.sort((a, b) => b.uploadDate - a.uploadDate);
                resolve(items);
            };

            request.onerror = () => {
                console.error('[PDFDatabase] Failed to list PDFs:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * Delete a PDF by ID
     */
    async deletePDF(id: string): Promise<void> {
        const database = await initDB();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log(`[PDFDatabase] Deleted PDF: ${id}`);
                resolve();
            };

            request.onerror = () => {
                console.error('[PDFDatabase] Failed to delete PDF:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * Update PDF metadata
     */
    async updateMetadata(id: string, metadata: StoredPDF['metadata']): Promise<void> {
        const database = await initDB();
        const pdf = await this.getPDF(id);

        if (!pdf) {
            throw new Error(`PDF not found: ${id}`);
        }

        pdf.metadata = { ...pdf.metadata, ...metadata };

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(pdf);

            request.onsuccess = () => {
                console.log(`[PDFDatabase] Updated metadata for: ${id}`);
                resolve();
            };

            request.onerror = () => {
                console.error('[PDFDatabase] Failed to update metadata:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * Rename a PDF
     */
    async renamePDF(id: string, newName: string): Promise<void> {
        const database = await initDB();
        const pdf = await this.getPDF(id);

        if (!pdf) {
            throw new Error(`PDF not found: ${id}`);
        }

        pdf.name = newName;

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(pdf);

            request.onsuccess = () => {
                console.log(`[PDFDatabase] Renamed PDF to: ${newName}`);
                resolve();
            };

            request.onerror = () => {
                console.error('[PDFDatabase] Failed to rename PDF:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * Clear all stored PDFs
     */
    async clearAll(): Promise<void> {
        const database = await initDB();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('[PDFDatabase] Cleared all PDFs');
                resolve();
            };

            request.onerror = () => {
                console.error('[PDFDatabase] Failed to clear PDFs:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * Get total storage used
     */
    async getStorageStats(): Promise<{ count: number; totalSize: number }> {
        const pdfs = await this.listPDFs();
        const totalSize = pdfs.reduce((sum, pdf) => sum + pdf.fileSize, 0);
        return { count: pdfs.length, totalSize };
    }
};

export default PDFDatabaseService;
