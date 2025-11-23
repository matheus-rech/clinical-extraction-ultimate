# Quick Start: PDF Database Vision Integration

## What Was Integrated?

Vision-based PDF extraction (using Gemini 2.0 Flash) is now **automatically triggered** when you load a PDF from the database dropdown.

## How It Works (TL;DR)

```
1. Select PDF from dropdown
   ↓
2. PDF loads in viewer
   ↓
3. Vision extraction runs automatically (30-60 seconds)
   ↓
4. Results cached for instant next load
   ↓
5. You can see extracted fields and highlight them on PDF
```

## Disable Auto-Extraction (Optional)

If you don't want extraction to run automatically:

```javascript
// In browser console
window.ClinicalExtractor.setAutoExtraction(false)
```

To re-enable:
```javascript
window.ClinicalExtractor.setAutoExtraction(true)
```

## Check Cache Status

```javascript
// See how many PDFs are cached
const stats = window.ClinicalExtractor.getExtractionStats()
console.log(stats)
```

## View Cached Extractions

```javascript
// See all cached PDFs with extraction info
const metadata = window.ClinicalExtractor.getCacheMetadata()
metadata.forEach(m => {
    console.log(`${m.pdfId}: ${m.fieldCount} fields extracted`)
})
```

## Force Re-Extract (Bypass Cache)

```javascript
const pdfId = 'your-pdf-id'
const result = await window.ClinicalExtractor.forceReExtraction(pdfId)
console.log('Extraction complete:', result)
```

## Export Results

```javascript
const pdfId = 'your-pdf-id'

// As JSON
const json = window.ClinicalExtractor.exportExtractionData(pdfId, 'json')
console.log(json)

// As CSV
const csv = window.ClinicalExtractor.exportExtractionData(pdfId, 'csv')
console.log(csv)
```

## Clear Cache

```javascript
// Clear specific PDF
window.ClinicalExtractor.PDFDatabaseVisionIntegration.clearCache('pdf-id')

// Clear all
window.ClinicalExtractor.PDFDatabaseVisionIntegration.clearCache()
```

## Access Extraction Data in Code

```typescript
import AppStateManager from './state/AppStateManager'

// Get extracted data
const state = AppStateManager.getState()
const extraction = state.visionExtractionData

if (extraction) {
    console.log('Extraction found!')
    console.log('Fields with coordinates:', extraction.coordinates.size)
    console.log('Processing cost: $', extraction.processingStats.estimatedCost)

    // Get coordinates for specific field
    const titleCoords = extraction.coordinates.get('studyIdentification.title')
    console.log('Title location:', titleCoords)
}
```

## Highlight Extractions on PDF

```javascript
const state = window.ClinicalExtractor.AppStateManager.getState()
if (state.visionExtractionData) {
    // Highlight all extractions
    await window.ClinicalExtractor.PDFProcessingAgent.highlightExtractions(
        state.visionExtractionData.coordinates
    )

    // Or highlight specific field
    await window.ClinicalExtractor.PDFProcessingAgent.highlightExtractions(
        state.visionExtractionData.coordinates,
        'studyIdentification.title'
    )
}
```

## Clear Highlights

```javascript
window.ClinicalExtractor.PDFProcessingAgent.clearHighlights()
```

## Troubleshooting

### Q: Auto-extraction not running
**A:** Check if enabled:
```javascript
window.ClinicalExtractor.isAutoExtractionEnabled()
// Should return true
```

### Q: Getting old cached results
**A:** Clear cache and re-extract:
```javascript
const pdfId = 'your-pdf-id'
await window.ClinicalExtractor.forceReExtraction(pdfId)
```

### Q: Extraction taking too long
**A:** Check network and API quota. If persistently slow:
```javascript
// Disable auto-extraction
window.ClinicalExtractor.setAutoExtraction(false)
// Extract only when needed
await window.ClinicalExtractor.extractAndStoreResults(pdfId)
```

### Q: Out of storage space
**A:** Clear old cache:
```javascript
// See what's taking space
window.ClinicalExtractor.getCacheMetadata().forEach(m => {
    if (m.isExpired) {
        window.ClinicalExtractor.PDFDatabaseVisionIntegration.clearCache(m.pdfId)
    }
})
```

## API Quick Reference

| Function | Purpose | Example |
|----------|---------|---------|
| `setAutoExtraction(bool)` | Enable/disable auto-extract | `setAutoExtraction(false)` |
| `isAutoExtractionEnabled()` | Check if enabled | `isAutoExtractionEnabled()` |
| `extractAndStoreResults(id)` | Manual extraction | `extractAndStoreResults('pdf-123')` |
| `getCachedExtraction(id)` | Get cached result | `getCachedExtraction('pdf-123')` |
| `forceReExtraction(id)` | Re-extract bypassing cache | `forceReExtraction('pdf-123')` |
| `getExtractionStats()` | Get cache stats | `getExtractionStats()` |
| `getCacheMetadata()` | List all cached extractions | `getCacheMetadata()` |
| `exportExtractionData(id, fmt)` | Export as JSON/CSV | `exportExtractionData('pdf-123', 'json')` |

## File Locations

- **Main Integration:** `src/services/PDFDatabaseVisionIntegration.ts`
- **Documentation:** `docs/PDF_DATABASE_VISION_INTEGRATION.md`
- **Integration Summary:** `INTEGRATION_SUMMARY.md`
- **Vision Extraction:** `src/services/PDFProcessingAgent.ts`
- **State:** `src/state/AppStateManager.ts`
- **PDF Library:** `src/services/LocalPDFLibrary.ts`

## Performance Notes

- **First load:** 30-60 seconds (extraction runs)
- **Cached load:** <100ms (instant)
- **API cost:** ~$0.001/page at 150 DPI
- **Cache size:** ~50-100 PDFs in browser storage
- **Cache TTL:** 7 days

## Next Steps

1. **Test workflow:** Select a PDF from dropdown and watch extraction run
2. **Check cache:** Run `getCacheMetadata()` to see results
3. **Export data:** Try `exportExtractionData(pdfId, 'json')`
4. **Read full docs:** See `docs/PDF_DATABASE_VISION_INTEGRATION.md` for advanced usage

---

**Need help?** Check the full documentation at `docs/PDF_DATABASE_VISION_INTEGRATION.md`
