# PDF Database Vision Integration Guide

## Overview

This document describes the integration of `PDFProcessingAgent` (vision-based extraction) with the PDF database selector. When a user loads a PDF from the database dropdown, the system automatically runs Gemini vision extraction and stores results for future reference.

## Architecture

### System Flow

```
User selects PDF from dropdown
         ↓
LocalPDFLibrary.loadPDF(pdfId)
         ↓
PDFLoader.loadPDF(file) - Display PDF
         ↓
PDFDatabaseVisionIntegration.onPDFLoaded(pdfId)
         ↓
Check Cache → Hit? Return cached result → Skip extraction
            ↓
          Miss? Run extraction
                ↓
PDFProcessingAgent.processDocument()
                ↓
Cache results → AppState
                ↓
User can highlight extractions on PDF
```

## Components

### 1. PDFDatabaseVisionIntegration Service
**File:** `src/services/PDFDatabaseVisionIntegration.ts`

The main integration service that:
- Manages auto-extraction feature toggle
- Caches extraction results in localStorage + Map
- Handles extraction lifecycle (run, cache, retrieve)
- Provides export functionality

#### Key Methods

```typescript
// Initialize integration and load cache from storage
await PDFDatabaseVisionIntegration.init()

// Set whether to auto-run extraction on PDF load
PDFDatabaseVisionIntegration.setAutoExtraction(true)

// Check if auto-extraction is enabled
const enabled = PDFDatabaseVisionIntegration.isAutoExtractionEnabled()

// Manually run extraction and cache results
const result = await PDFDatabaseVisionIntegration.extractAndStoreResults(pdfId)

// Retrieve cached extraction (returns null if expired/missing)
const cached = PDFDatabaseVisionIntegration.getCachedExtraction(pdfId)

// Check if extraction exists in cache
const hasCached = PDFDatabaseVisionIntegration.hasCachedExtraction(pdfId)

// Force re-extraction (bypass cache)
const result = await PDFDatabaseVisionIntegration.forceReExtraction(pdfId)

// Clear cache for specific PDF or all
PDFDatabaseVisionIntegration.clearCache(pdfId) // specific
PDFDatabaseVisionIntegration.clearCache()      // all

// Get statistics
const stats = PDFDatabaseVisionIntegration.getStats()
// {
//   cacheSize: 3,
//   autoExtractionEnabled: true,
//   extractionInProgress: false
// }

// Get metadata for all cached extractions
const metadata = PDFDatabaseVisionIntegration.getCacheMetadata()
// [
//   {
//     pdfId: "pdf-123",
//     fieldCount: 42,
//     timestamp: 1700000000000,
//     estimatedCost: 0.0042,
//     isExpired: false
//   }
// ]

// Export extraction data
const json = PDFDatabaseVisionIntegration.exportExtractionData(pdfId, 'json')
const csv = PDFDatabaseVisionIntegration.exportExtractionData(pdfId, 'csv')
```

### 2. Updated LocalPDFLibrary
**File:** `src/services/LocalPDFLibrary.ts`

Changes:
- Imports `PDFDatabaseVisionIntegration`
- Calls `onPDFLoaded()` after PDF is loaded
- Automatically triggers vision extraction if enabled

```typescript
// In loadPDF() method:
setTimeout(() => {
    PDFDatabaseVisionIntegration.onPDFLoaded(id, { autoExtract: true })
}, 500)
```

The delay ensures the PDF is fully loaded in the viewer before extraction begins.

### 3. AppState Extensions
**File:** `src/types/index.ts`

New state fields added to `AppState` interface:

```typescript
/**
 * Vision extraction result from PDFProcessingAgent with coordinates
 * Used for citation highlighting and structured data extraction
 */
visionExtractionData?: PDFProcessingResult;

/**
 * Last extraction metadata (pdfId, timestamp, cached status)
 */
lastExtraction?: {
    pdfId: string;
    timestamp: number;
    cached: boolean;
};
```

Access via:
```typescript
const state = AppStateManager.getState()
console.log(state.visionExtractionData)
console.log(state.lastExtraction)
```

### 4. Window API Exposure
**File:** `src/main.ts`

All integration methods exposed to `window.ClinicalExtractor`:

```javascript
// Browser console or HTML onclick handlers
window.ClinicalExtractor.setAutoExtraction(false)
window.ClinicalExtractor.isAutoExtractionEnabled()
window.ClinicalExtractor.extractAndStoreResults(pdfId)
window.ClinicalExtractor.getCachedExtraction(pdfId)
window.ClinicalExtractor.forceReExtraction(pdfId)
window.ClinicalExtractor.getExtractionStats()
window.ClinicalExtractor.getCacheMetadata()
window.ClinicalExtractor.exportExtractionData(pdfId, 'json')
```

## Caching Strategy

### Storage
- **In-Memory:** `Map<string, ExtractionCacheEntry>` for fast runtime access
- **Persistent:** `localStorage` with key `pdf_vision_extractions`
- **Format:** Serialized JSON

### Expiration
- **TTL:** 7 days (604,800,000 ms)
- **Check:** Performed on retrieval
- **Cleanup:** Expired entries return `null`

### Entry Structure
```typescript
{
  pdfId: string
  extractionResult: PDFProcessingResult
  timestamp: number
  version: "1.0"
}
```

## Usage Workflows

### Workflow 1: Automatic Extraction (Default)

```
1. User selects PDF from dropdown
2. PDF loads in viewer
3. Vision extraction automatically runs (500ms delay)
4. Results stored in cache
5. User can jump to extract results via AppState
```

### Workflow 2: Manual Extraction

```typescript
// Disable auto-extraction
window.ClinicalExtractor.setAutoExtraction(false)

// Later, manually trigger extraction
const result = await window.ClinicalExtractor.extractAndStoreResults(pdfId)
```

### Workflow 3: Cached Result Reuse

```typescript
// First load of a PDF
// → Extracts and caches (may take 30-60 seconds)

// Second load of the same PDF
// → Uses cached result instantly
```

### Workflow 4: Force Re-extraction

```typescript
// Bypass cache and re-extract
const result = await window.ClinicalExtractor.forceReExtraction(pdfId)

// Or manually clear cache first
window.ClinicalExtractor.PDFDatabaseVisionIntegration.clearCache(pdfId)
```

## Performance Considerations

### API Costs
- **Vision API Cost:** ~$0.001/page at 150 DPI
- **Example:** 10-page PDF ≈ $0.01
- **Optimization:** Cache reduces repeated costs

### Processing Time
- **Per PDF:** 30-60 seconds (depending on page count)
- **Batching:** 3 pages per API call, 2 parallel batches
- **Network:** May vary with connection quality

### Storage Limits
- **localStorage Limit:** ~5-10MB (varies by browser)
- **Per Entry:** ~50-100KB (varies with extraction complexity)
- **Rough Capacity:** 50-100 PDFs

### Memory Footprint
- **In-Memory Map:** Loaded at init, ~5-10MB for 50 PDFs
- **Cleanup:** Entries expire after 7 days automatically

## Integration Points

### 1. PDF Load Flow
```
main.ts (setupEventListeners)
    ↓
pdf-library-select change
    ↓
LocalPDFLibrary.loadPDF(id)
    ↓
PDFDatabaseVisionIntegration.onPDFLoaded()
    ↓
PDFProcessingAgent.processDocument()
```

### 2. State Updates
```
PDFProcessingAgent.processDocument()
    ↓
AppStateManager.setState({
    visionExtractionData: result,
    lastExtraction: { pdfId, timestamp, cached }
})
    ↓
Any subscriber notified of state change
```

### 3. Error Handling
- Vision extraction failures logged but don't block PDF load
- Status messages shown to user via `StatusManager`
- Extraction can be retried manually

## Troubleshooting

### Issue: Auto-extraction not running
**Solution:**
1. Check: `window.ClinicalExtractor.isAutoExtractionEnabled()`
2. Enable: `window.ClinicalExtractor.setAutoExtraction(true)`
3. Verify: Gemini API key is configured

### Issue: Cached results out of date
**Solution:**
1. Clear: `window.ClinicalExtractor.PDFDatabaseVisionIntegration.clearCache(pdfId)`
2. Re-extract: Load PDF again or call `forceReExtraction(pdfId)`

### Issue: Memory/storage concerns
**Solution:**
1. Check: `window.ClinicalExtractor.getExtractionStats()`
2. View: `window.ClinicalExtractor.getCacheMetadata()`
3. Clear old: `window.ClinicalExtractor.PDFDatabaseVisionIntegration.clearCache()`

### Issue: Extraction taking too long
**Solution:**
1. Verify: Network connection is stable
2. Check: Gemini API quota/rate limits
3. Try: Disable auto-extraction, extract smaller PDFs first

## Future Enhancements

### Potential Improvements
1. **Incremental Caching:** Store results per page, not whole PDF
2. **Compression:** Gzip compress cached results
3. **Cloud Sync:** Backup cache to cloud storage
4. **Partial Re-extraction:** Only update specific fields
5. **Batch Export:** Export multiple PDF extractions at once
6. **Cache Statistics UI:** Visual dashboard of cache usage
7. **Selective Extraction:** Choose which fields to extract
8. **Time-based Invalidation:** Auto-refresh cache after N days

## Testing

### Unit Tests
```bash
# Test extraction integration
npm run test -- PDFDatabaseVisionIntegration

# Test caching
npm run test -- cache
```

### E2E Tests
```bash
# Test full workflow
npx playwright test pdf-database-vision

# Test cache hit/miss
npx playwright test extraction-cache
```

### Manual Testing
```javascript
// Browser console
1. await window.ClinicalExtractor.PDFDatabaseVisionIntegration.init()
2. window.ClinicalExtractor.getExtractionStats()
3. // Load PDF from dropdown
4. // Wait for extraction
5. window.ClinicalExtractor.getCachedExtraction(pdfId)
```

## API Reference

See `PDFDatabaseVisionIntegration` service for complete API documentation.

## Related Files

- `src/services/PDFDatabaseVisionIntegration.ts` - Main integration service
- `src/services/PDFProcessingAgent.ts` - Vision extraction engine
- `src/services/LocalPDFLibrary.ts` - PDF database interface
- `src/types/index.ts` - AppState types
- `src/state/AppStateManager.ts` - State management
- `src/main.ts` - Window API exposure

## License

Apache License 2.0 - See LICENSE file
