# Vision-Based PDF Extraction Test Workflow

## Overview

This document describes how to test the **PDFProcessingAgent** - a vision-based extraction system that uses Gemini 2.0 Flash Vision API to extract clinical data from PDFs with precise bounding box coordinates.

## What Was Added

### 1. **Test Function**: `triggerVisionExtraction()`
- **Location**: `/src/main.ts` (lines 1060-1161)
- **Purpose**: Orchestrates the complete vision extraction workflow with detailed console logging
- **Exposed**: Via `window.ClinicalExtractor.triggerVisionExtraction`

### 2. **HTML Button**
- **Location**: `index.html` (line 1522)
- **Label**: "👁️ Vision" button in the compact toolbar
- **Status Display**: Real-time status updates in `#vision-status` element

### 3. **Console Logging**
The test function provides comprehensive logging with sections for:
- Extraction statistics (pages, time, API calls, cost)
- Field coordinates (normalized bounding boxes)
- Extracted data (complete JSON structure)
- Execution trace (errors, warnings)

## How to Test

### Step 1: Start the Development Server
```bash
cd /Users/matheusrech/Downloads/a_consulta-master
npm run dev
```
The app will be available at `http://localhost:5173` (or the configured port).

### Step 2: Load a Test PDF
Three options:

#### Option A: Load Sample PDF
1. Click "📤 Upload" button in PDF panel
2. Select `/Users/matheusrech/Downloads/a_consulta-master/public/Kim2016.pdf`
3. The PDF should render in the center panel

#### Option B: Use the Sample PDF Service
```javascript
// In browser console
await window.ClinicalExtractor.loadSamplePDF()
```

#### Option C: Drag and Drop
1. Drag the PDF file to the "Drop PDF file here" area in the center panel
2. Release to load it

### Step 3: Open Browser Developer Console
1. Press `F12` or `Cmd+Option+I` (macOS)
2. Switch to the "Console" tab
3. You'll see all logging here

### Step 4: Click the Vision Button
1. Locate the "👁️ Vision" button in the compact toolbar (dark bar below PDF toolbar)
2. Click it
3. Watch the console for detailed extraction progress

## Expected Output

### Console Logging Format

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
  2. eligibility.population: 2 coordinate(s)
     - Coord 1: Page 2, Bbox [0.100, 0.350, 0.800, 0.420]
     - Coord 2: Page 3, Bbox [0.100, 0.200, 0.800, 0.270]
  ...

📝 EXTRACTED DATA:
{
  "studyIdentification": {
    "title": "Suboccipital decompressive craniectomy...",
    "doi": "10.1234/example.doi",
    "pmid": "12345678",
    ...
  },
  ...
}

✅ Result stored in window._lastVisionResult
============================================================
```

### UI Status Updates
- **Status Bar**: Bottom right shows success/error messages
- **Vision Status**: "👁️ Vision" button area shows real-time status
- **Page Highlighting**: Yellow bounding boxes appear on current page showing extracted fields

## Accessing Results Programmatically

### In Browser Console

```javascript
// View the last extraction result
window._lastVisionResult

// Extract only coordinates
window._lastVisionResult.coordinates

// Extract only data
window._lastVisionResult.extraction

// View statistics
window._lastVisionResult.processingStats

// Get a specific field's coordinates
window._lastVisionResult.coordinates.get('studyIdentification.title')
```

### Example API Call
```javascript
// Manually call the extraction
const result = await window.ClinicalExtractor.PDFProcessingAgent.processDocument({
    dpi: 150,           // Image resolution
    pagesPerBatch: 3,   // Pages per API call
    maxParallel: 2      // Concurrent batches
});

console.log('Extracted fields:', result.coordinates.size);
console.log('Cost estimate:', result.processingStats.estimatedCost);
```

## Key Features Demonstrated

1. **Vision-Based Extraction**
   - Converts PDF pages to high-resolution images
   - Uses Gemini 2.0 Flash Vision API
   - Extracts structured data directly from visual representation

2. **Bounding Box Coordinates**
   - Normalized coordinates (0-1 scale) for each extracted field
   - Page numbers for multi-page PDFs
   - Ready for visual highlighting on rendered pages

3. **Cost Estimation**
   - Automatic cost calculation based on:
     - Number of pages
     - DPI (resolution) selected
     - API pricing structure

4. **Progress Tracking**
   - Real-time status updates
   - Page processing counters
   - API call tracking

5. **Error Handling**
   - Graceful error recovery
   - Detailed error logging
   - User-friendly error messages

## Files Modified

### 1. `/src/main.ts`
- **Added**: `triggerVisionExtraction()` function (102 lines)
- **Added**: Exposed function in `window.ClinicalExtractor` object
- **Location**: Lines 1054-1161, exposed at line 1009

### 2. `index.html`
- **No changes**: Vision button already exists (line 1522)
- **Status element**: Already exists for display updates (line 1523)

## Troubleshooting

### "Please load a PDF first"
- PDF didn't load properly
- Try the sample PDF: `await window.ClinicalExtractor.loadSamplePDF()`
- Check browser console for PDF loading errors

### "Already processing..."
- Previous extraction still in progress
- Wait for it to complete (check console for progress)
- Or reload the page

### API Key Issues
- Ensure `VITE_GEMINI_API_KEY` is set in `.env.local`
- Check that the key is valid and has Vision API access
- Restart dev server after changing `.env.local`

### No Coordinates Returned
- PDF may not have extractable text
- Try a different PDF
- Check console for vision API response errors
- Verify API response format matches expected schema

## Performance Notes

- **Cost**: ~$0.001/page at 150 DPI
- **Speed**: ~2-3 seconds per batch (3 pages)
- **Memory**: Efficient pagination prevents memory issues
- **Parallelism**: Process up to 2 batches concurrently

## Next Steps

1. **Verify extraction accuracy** on various PDF types
2. **Test highlighting** on different page sizes
3. **Compare costs** at different DPI levels
4. **Integrate with form fields** to auto-populate data
5. **Add batch processing** for multiple PDFs

## References

- **PDFProcessingAgent**: `/src/services/PDFProcessingAgent.ts`
- **PDFPageRenderer**: `/src/services/PDFPageRenderer.ts`
- **CoordinateTransformer**: `/src/services/CoordinateTransformer.ts`
- **AppStateManager**: `/src/state/AppStateManager.ts`
- **Test PDF**: `/public/Kim2016.pdf`

## Success Criteria

Test is successful when:
1. ✅ Vision button is clickable
2. ✅ Console shows extraction progress logs
3. ✅ Extraction completes without errors
4. ✅ Bounding boxes display on current page
5. ✅ Results stored in `window._lastVisionResult`
6. ✅ All coordinates have valid page numbers and normalized bounds
7. ✅ Cost estimate is calculated and displayed

---

**Created**: 2025-11-22
**Updated by**: Claude Code
**Test Status**: Ready for manual testing
