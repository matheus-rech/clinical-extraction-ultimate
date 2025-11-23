/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configuration constants for the Clinical Extractor application.
 * Contains PDF.js settings and application constants.
 */

// ==================== PDF.JS CONFIGURATION ====================

/**
 * PDF.js library configuration for rendering and text extraction.
 * 
 * @property workerSrc - URL to the PDF.js worker script
 * @property documentOptions - Options passed to PDF.js getDocument()
 * @property documentOptions.cMapUrl - URL to character map files for proper text extraction
 * @property documentOptions.cMapPacked - Whether character maps are in packed format
 * @property documentOptions.password - Password for encrypted PDFs (empty by default)
 * 
 * @remarks
 * Character maps (CMaps) are required for proper text extraction from PDFs
 * with non-Latin character sets (e.g., Japanese, Chinese, Arabic).
 * 
 * @see https://mozilla.github.io/pdf.js/
 */
export const PDFConfig = {
  /** URL to PDF.js worker script (handles PDF parsing in a Web Worker) */
  workerSrc: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  
  /** Options for PDF document loading */
  documentOptions: {
    /** URL to character map (CMap) files for text extraction */
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    
    /** Use packed (compressed) character maps */
    cMapPacked: true,
    
    /** Password for encrypted PDFs (empty for unprotected PDFs) */
    password: ''
  }
} as const;

// ==================== VALIDATION CONSTANTS ====================

/**
 * Maximum length for sanitized text fields (10,000 characters).
 * Prevents excessive memory usage and potential DoS attacks.
 */
export const MAX_TEXT_LENGTH = 10000;

/**
 * Maximum size of the PDF text cache (50 pages).
 * Limits memory usage while caching frequently accessed pages.
 */
export const MAX_CACHE_SIZE = 50;

/**
 * Regular expression for DOI validation.
 * Matches standard DOI format: 10.xxxx/...
 */
export const DOI_REGEX = /^10\.\d{4,}\/-?[A-Za-z0-9._;()/:]+$/;

/**
 * Regular expression for PMID validation.
 * Matches numeric PubMed IDs.
 */
export const PMID_REGEX = /^\d+$/;

/**
 * Valid year range for publication dates.
 */
export const YEAR_RANGE = {
  min: 1900,
  max: 2100
} as const;

// ==================== UI CONSTANTS ====================

/**
 * Default duration for status messages (in milliseconds).
 */
export const DEFAULT_STATUS_DURATION = 3000;

/**
 * Color scheme for status messages.
 */
export const STATUS_COLORS = {
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#f44336',
  info: '#2196F3'
} as const;

/**
 * Default PDF rendering scale (1.0 = 100%).
 */
export const DEFAULT_SCALE = 1.0;

/**
 * Total number of steps in the extraction wizard.
 */
export const TOTAL_WIZARD_STEPS = 8;

// ==================== AI CONFIGURATION ====================

/**
 * AI Provider types
 */
export type AIProvider = 'gemini' | 'anthropic' | 'openai';

/**
 * Multi-provider AI configuration from environment variables
 */
export const AIConfig = {
  /** Current provider (can be changed at runtime) */
  provider: (import.meta.env.VITE_AI_PROVIDER || 'gemini') as AIProvider,

  /** Gemini configuration */
  gemini: {
    model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash',
    apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  },

  /** Anthropic configuration */
  anthropic: {
    model: import.meta.env.VITE_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || '',
  },

  /** OpenAI configuration */
  openai: {
    model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o',
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  },

  /** Shared settings */
  temperature: parseFloat(import.meta.env.VITE_AI_TEMPERATURE || '0.2'),
  outputFormat: import.meta.env.VITE_AI_OUTPUT_FORMAT || 'json',

  /** Legacy compatibility */
  model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash',
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
} as const;

// ==================== FILE SEARCH CONFIGURATION ====================

/**
 * File Search tool configuration for parallel citation extraction
 */
export const FileSearchConfig = {
  /** Enable file search functionality */
  enabled: import.meta.env.VITE_FILE_SEARCH_ENABLED === 'true',

  /** Run file search in parallel with main PDF extraction */
  parallel: import.meta.env.VITE_FILE_SEARCH_PARALLEL === 'true',

  /** Maximum number of cached file search stores */
  maxCacheSize: 10,

  /** Cache TTL in days */
  cacheTTLDays: 7,
} as const;
