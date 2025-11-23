# Quick Test Commands for Vision Extraction

## Copy-Paste Commands for Browser Console

### 1. Load Sample PDF
```javascript
await window.ClinicalExtractor.loadSamplePDF()
```

### 2. Trigger Vision Extraction (Main Test)
```javascript
await window.ClinicalExtractor.triggerVisionExtraction()
```

### 3. View Results After Extraction
```javascript
// View the complete result object
window._lastVisionResult

// View just the extracted data
window._lastVisionResult.extraction

// View just the coordinates
window._lastVisionResult.coordinates

// View statistics
window._lastVisionResult.processingStats

// View warnings (if any)
window._lastVisionResult.warnings
```

### 4. Inspect Specific Fields
```javascript
// Get coordinates for a specific field
window._lastVisionResult.coordinates.get('studyIdentification.title')

// List all extracted fields
Array.from(window._lastVisionResult.coordinates.keys())

// Count fields with coordinates
window._lastVisionResult.coordinates.size
```

### 5. Highlight Specific Field
```javascript
// Highlight a specific field on the current page
await window.ClinicalExtractor.PDFProcessingAgent.highlightExtractions(
    window._lastVisionResult.coordinates,
    'studyIdentification.title'
)
```

### 6. Clear Highlights
```javascript
window.ClinicalExtractor.PDFProcessingAgent.clearHighlights()
```

### 7. Access Managers Directly
```javascript
// Get current app state
window.ClinicalExtractor.AppStateManager.getState()

// View extraction tracker data
window.ClinicalExtractor.ExtractionTracker.getExtractions()

// Check processing status
window.ClinicalExtractor.AppStateManager.getState().isProcessing
```

### 8. Custom Extraction with Options
```javascript
// Run extraction with custom settings
const result = await window.ClinicalExtractor.PDFProcessingAgent.processDocument({
    dpi: 200,           // Higher quality (more expensive)
    pagesPerBatch: 2,   // Fewer pages per batch
    maxParallel: 1      // Sequential processing
})

console.log('Custom extraction cost:', result.processingStats.estimatedCost)
```

### 9. Show Processing Status
```javascript
const state = window.ClinicalExtractor.AppStateManager.getState()
console.log({
    isProcessing: state.isProcessing,
    pdfLoaded: !!state.pdfDoc,
    currentPage: state.currentPage,
    totalPages: state.totalPages
})
```

## Test Workflow (Step-by-Step)

### Complete Test Sequence
```javascript
// Step 1: Load sample PDF
console.log('Step 1: Loading sample PDF...')
await window.ClinicalExtractor.loadSamplePDF()
console.log('✓ PDF loaded')

// Step 2: Check PDF is loaded
console.log('Step 2: Checking PDF state...')
const state = window.ClinicalExtractor.AppStateManager.getState()
console.log('PDF loaded:', !!state.pdfDoc)
console.log('Total pages:', state.totalPages)

// Step 3: Run vision extraction
console.log('Step 3: Starting vision extraction...')
await window.ClinicalExtractor.triggerVisionExtraction()

// Step 4: Inspect results
console.log('Step 4: Inspecting results...')
const result = window._lastVisionResult
console.log('Fields extracted:', result.coordinates.size)
console.log('Processing time:', result.processingStats.totalTime + 'ms')
console.log('Estimated cost:', '$' + result.processingStats.estimatedCost.toFixed(4))

// Step 5: List all fields
console.log('Step 5: Extracted fields:')
Array.from(result.coordinates.keys()).forEach((field, idx) => {
    const coords = result.coordinates.get(field)
    console.log(`  ${idx + 1}. ${field}: ${coords.length} coordinate(s)`)
})
```

## Performance Testing

### Measure Extraction Speed
```javascript
console.time('Vision Extraction')
const result = await window.ClinicalExtractor.PDFProcessingAgent.processDocument()
console.timeEnd('Vision Extraction')
console.log('Cost per page:', (result.processingStats.estimatedCost / result.processingStats.pagesProcessed).toFixed(4))
```

### Compare Different DPI Settings
```javascript
// Test 150 DPI
console.time('150 DPI')
const result150 = await window.ClinicalExtractor.PDFProcessingAgent.processDocument({ dpi: 150 })
console.timeEnd('150 DPI')
console.log('Cost (150 DPI):', result150.processingStats.estimatedCost)

// Test 300 DPI (higher quality, more expensive)
console.time('300 DPI')
const result300 = await window.ClinicalExtractor.PDFProcessingAgent.processDocument({ dpi: 300 })
console.timeEnd('300 DPI')
console.log('Cost (300 DPI):', result300.processingStats.estimatedCost)

// Compare
console.log('Cost difference (300/150):', (result300.processingStats.estimatedCost / result150.processingStats.estimatedCost).toFixed(2) + 'x')
```

## Debugging

### Enable Detailed Logging
```javascript
// All PDFProcessingAgent calls will log to console
console.log('PDFProcessingAgent:', window.ClinicalExtractor.PDFProcessingAgent)

// Check last error
console.error('Last extraction error:', window._lastVisionError)
```

### Inspect Bounding Boxes
```javascript
// Get all coordinates and their bounds
const result = window._lastVisionResult
result.coordinates.forEach((coords, field) => {
    coords.forEach((coord, idx) => {
        console.log(`${field} - Coord ${idx + 1}:`)
        console.log(`  Page: ${coord.pageNum}`)
        console.log(`  X: ${coord.normalizedX.toFixed(3)}`)
        console.log(`  Y: ${coord.normalizedY.toFixed(3)}`)
        console.log(`  Width: ${coord.normalizedWidth.toFixed(3)}`)
        console.log(`  Height: ${coord.normalizedHeight.toFixed(3)}`)
    })
})
```

## Troubleshooting Commands

### Check API Key
```javascript
// Verify API key is available
console.log('API Key available:', !!(window.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY))
```

### Force Reload Everything
```javascript
// Clear state and reload
window.location.reload()
```

### Check Service Status
```javascript
console.log({
    'StatusManager': !!window.ClinicalExtractor.StatusManager,
    'AppStateManager': !!window.ClinicalExtractor.AppStateManager,
    'PDFProcessingAgent': !!window.ClinicalExtractor.PDFProcessingAgent,
    'PDFPageRenderer': !!window.ClinicalExtractor.PDFPageRenderer
})
```

## Expected Console Output

### Successful Extraction
```
============================================================
TEST: VISION-BASED PDF PROCESSING AGENT
============================================================

📊 EXTRACTION RESULTS:
============================================================
Pages Processed: 15
Total Time: 4523ms
API Calls: 5
Estimated Cost: $0.0045
Fields with Coordinates: 23
============================================================

🎯 EXTRACTED FIELDS WITH COORDINATES:
  1. studyIdentification.title: 1 coordinate(s)
     - Coord 1: Page 1, Bbox [0.050, 0.025, 0.900, 0.045]
...

📝 EXTRACTED DATA:
{...}

✅ Result stored in window._lastVisionResult
============================================================
```

### Error Cases
```
FAILED: Vision extraction error: Gemini API error: 401 - Invalid API key
FAILED: Vision extraction error: Please load a PDF first
FAILED: Vision extraction error: API quota exceeded
```

---

**Tip**: Copy these commands into the browser console (F12) to test the vision extraction workflow!
