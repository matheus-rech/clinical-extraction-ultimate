# Visual Testing Guide - PDFProcessingAgent

## UI Layout Reference

```
┌─────────────────────────────────────────────────────────────────┐
│  Clinical Study Extraction System (Form Panel - Left)           │
│  [Fill with extracted data]                                     │
└─────────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
    FORM PANEL        PDF PANEL         TRACE PANEL
    (35% width)       (45% width)       (20% width)
    [Form fields]     [PDF Display]     [Extraction Log]
                      [Toolbar]
```

## The Vision Button Location

```
PDF Toolbar (Top of PDF Panel):
┌────────────────────────────────────────────────────────────────┐
│ [pdf-select] [Upload] [◄] [Page 1 of 15] [►] [100%] [Fit]    │
└────────────────────────────────────────────────────────────────┘

Compact Toolbar (Below PDF Toolbar - VISION BUTTON IS HERE):
┌────────────────────────────────────────────────────────────────┐
│ 🚀AI  👁️VISION  🖼️  📊  🔲  📋  🔍  ✏️  ⚙️  [Initializing...] │
│      ↑                                              ↑
│   Click here to test!                    Status display here
└────────────────────────────────────────────────────────────────┘
```

## Expected Visual Behavior

### Before Clicking Vision Button
```
PDF Page Display:
┌─────────────────────────────────────┐
│  [PDF Page 1 - No Highlights]       │
│                                     │
│  Study Title: Lorem Ipsum...        │
│                                     │
│  Background: This study examines... │
│                                     │
│  Methods: We conducted...           │
└─────────────────────────────────────┘

Status: Ready
Console: [Empty]
```

### While Processing
```
Status Bar (Bottom Right):
┌──────────────────────────────────────┐
│ 👁️ Starting Vision-Based Extraction │
└──────────────────────────────────────┘

Console Output (Partial):
============================================================
TEST: VISION-BASED PDF PROCESSING AGENT
============================================================
Rendering page 1/15...
Rendering page 2/15...
Processing batch 1/5...
```

### After Extraction Completes
```
PDF Page Display:
┌─────────────────────────────────────┐
│  [PDF Page 1 - WITH HIGHLIGHTS]     │
│                                     │
│  ╔════ Title ==════════════════════╗ │ ← Yellow highlight
│  ║ Study Title: Lorem Ipsum        ║ │   (BoundingBox)
│  ╚════════════════════════════════╗ │
│                                  ╔╩ │
│  ╔════ Population =════════════╗  ║ │
│  ║ Background: This study...   ║  ║ │
│  ╚════════════════════════════╝  ║ │
│                                  ║ │
│  ╔════ Intervention ==========╗  ║ │
│  ║ Methods: We conducted...   ║  ║ │
│  ╚════════════════════════════╝  ║ │
│                                  ║ │
└─────────────────────────────────────┘

Status Bar (Bottom Right):
┌──────────────────────────────────────────────────────┐
│ ✅ Vision extraction complete! 23 fields with coords │
└──────────────────────────────────────────────────────┘

Vision Button Status:
👁️ Vision ✅  (or "❌ Failed" if error)
```

## Console Output Visualization

### Success Output
```javascript
// Copy of full console output with formatting:

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
  2. studyIdentification.doi: 1 coordinate(s)
     - Coord 1: Page 1, Bbox [0.050, 0.080, 0.500, 0.095]
  3. eligibility.population: 2 coordinate(s)
     - Coord 1: Page 2, Bbox [0.050, 0.250, 0.950, 0.380]
     - Coord 2: Page 3, Bbox [0.050, 0.100, 0.950, 0.230]
  4. eligibility.intervention: 1 coordinate(s)
     - Coord 1: Page 2, Bbox [0.050, 0.400, 0.950, 0.500]
  ...

📝 EXTRACTED DATA:
{
  "studyIdentification": {
    "title": "Suboccipital decompressive craniectomy in cerebellar stroke: What is the threshold?",
    "doi": "10.1016/j.jns.2016.02.033",
    "pmid": "27002821",
    "journal": "Journal of the Neurological Sciences",
    "publicationYear": 2016,
    "firstAuthor": "Kim YW"
  },
  "eligibility": {
    "population": "Patients with acute cerebellar stroke...",
    "intervention": "Suboccipital decompressive craniectomy",
    "comparator": "Conservative management",
    "outcomes": "Mortality and functional outcomes (mRS)",
    "timing": "6 months follow-up",
    "studyType": "Retrospective cohort study"
  },
  ...
}

✅ Result stored in window._lastVisionResult
============================================================
```

### Error Output
```javascript
// If extraction fails:

============================================================
TEST: VISION-BASED PDF PROCESSING AGENT
============================================================

❌ Vision extraction error: Gemini API error: 401 - Invalid API key
Stack trace: Error: Gemini API error...
    at PDFProcessingAgent.processPage (PDFProcessingAgent.ts:290)
    at PDFProcessingAgent.processBatch (PDFProcessingAgent.ts:225)
    ...
```

## Bounding Box Visualization

### What Coordinates Represent

Normalized coordinates (0-1 scale):
```
Page Dimensions (normalized 0-1):
(0, 0)                           (1, 0)
  ┌─────────────────────────────────┐
  │                                 │
  │  Title Bbox: [0.05, 0.02, ... ] │  ← 5% from left, 2% from top
  │  ┌──────────────────────────┐   │
  │  │ Study Title: Lorem...    │   │  ← 75 chars wide, 4% tall
  │  └──────────────────────────┘   │
  │                                 │
  │  Population: [0.05, 0.25, ...]  │
  │  ┌──────────────────────────┐   │
  │  │ Background: This study.. │   │  ← 45% from top
  │  └──────────────────────────┘   │
  │                                 │
(0, 1)                           (1, 1)

Bbox Format: [x, y, width, height]
- x: horizontal position (0 = left, 1 = right)
- y: vertical position (0 = top, 1 = bottom)
- width: box width as fraction of page
- height: box height as fraction of page
```

### Multiple Coordinates on Same Field

When a field spans multiple pages or has multiple instances:
```
Field: "eligibility.population"
Coordinates: [
  {
    pageNum: 2,
    normalizedX: 0.05,
    normalizedY: 0.25,
    normalizedWidth: 0.90,
    normalizedHeight: 0.13
  },
  {
    pageNum: 3,
    normalizedX: 0.05,
    normalizedY: 0.10,
    normalizedWidth: 0.90,
    normalizedHeight: 0.13
  }
]

Result: Two separate highlights on pages 2 and 3
```

## Browser Console Commands with Expected Results

### Command 1: View Entire Result
```javascript
> window._lastVisionResult
```

Output (Object tree):
```
Object {
  ▼ extraction: Object
    ▼ studyIdentification: Object
      ▼ title: "Suboccipital decompressive..."
      ▼ doi: "10.1016/j.jns.2016.02.033"
      ▼ pmid: "27002821"
  ▼ coordinates: Map(23)
    ▼ studyIdentification.title → Array(1)
      ▼ 0: Object
        ▼ pageNum: 1
        ▼ normalizedX: 0.05
        ...
  ▼ processingStats: Object
    ▼ totalTime: 4523
    ▼ pagesProcessed: 15
    ▼ apiCalls: 5
    ▼ estimatedCost: 0.0045
  ▼ warnings: Array(0)
}
```

### Command 2: List All Fields
```javascript
> Array.from(window._lastVisionResult.coordinates.keys())
```

Output:
```
Array(23)
0: "studyIdentification.title"
1: "studyIdentification.doi"
2: "studyIdentification.pmid"
3: "studyIdentification.journal"
4: "studyIdentification.publicationYear"
5: "studyIdentification.firstAuthor"
6: "eligibility.population"
7: "eligibility.intervention"
8: "eligibility.comparator"
9: "eligibility.outcomes"
10: "eligibility.timing"
11: "eligibility.studyType"
... (12 more)
```

### Command 3: Get Specific Field Coordinates
```javascript
> window._lastVisionResult.coordinates.get('studyIdentification.title')
```

Output:
```
Array(1)
0: {
  pageNum: 1,
  normalizedX: 0.0498,
  normalizedY: 0.0246,
  normalizedWidth: 0.8987,
  normalizedHeight: 0.0453
}
```

## Highlight Visualization on PDF

### Yellow Highlight Appearance
```
Original PDF Page:
┌─────────────────────────────────────┐
│ TITLE: Study Title Here             │
│                                     │
│ Background and Objective            │
│ This study aims to assess...        │
└─────────────────────────────────────┘

With Vision Extraction Highlights:
┌─────────────────────────────────────┐
│ ┌──────────────────────────────────┐│  ← Yellow border
│ │TITLE: Study Title Here           ││  ← Yellow semi-transparent fill
│ └──────────────────────────────────┘│
│                                     │
│ ┌──────────────────────────────────┐│
│ │Background and Objective          ││  ← Multiple highlights per page
│ │This study aims to assess...      ││
│ └──────────────────────────────────┘│
└─────────────────────────────────────┘

Color: RGBA(255, 255, 0, 0.3)  // Yellow with 30% transparency
Border: 2px solid RGBA(255, 200, 0, 0.8)  // Darker yellow border
```

## Error Cases - Visual Feedback

### Error 1: No PDF Loaded
```
User Action: Click 👁️ Vision without loading PDF

Visual Feedback:
┌──────────────────────────────────────┐
│ ⚠️ Please load a PDF first           │
└──────────────────────────────────────┘

Console: "Please load a PDF first (warning)"
```

### Error 2: API Key Invalid
```
User Action: Click 👁️ Vision with invalid API key

Visual Feedback:
Status Bar: ⏳ Processing... (spins for 2-3 seconds)
Then:
┌──────────────────────────────────────┐
│ ❌ Vision extraction failed:         │
│    Gemini API error: 401             │
└──────────────────────────────────────┘

Vision Button: Shows "❌ Failed"

Console: Shows full error stack trace
```

### Error 3: Processing Already in Progress
```
User Action: Click 👁️ Vision, then click again immediately

Visual Feedback:
┌──────────────────────────────────────┐
│ ⚠️ Already processing...             │
└──────────────────────────────────────┘

Vision Button: Remains unchanged
```

## Status Indicator States

```
Vision Status Element (<span id="vision-status">):

State 1: Processing
┌──────────────────────────────────┐
│ 👁️ Vision │ Rendering page 3/15  │
└──────────────────────────────────┘

State 2: Success
┌──────────────────────────────────┐
│ 👁️ Vision │ ✅ Complete! 23 fields│
└──────────────────────────────────┘

State 3: Error
┌──────────────────────────────────┐
│ 👁️ Vision │ ❌ Failed             │
└──────────────────────────────────┘

State 4: Idle (default)
┌──────────────────────────────────┐
│ 👁️ Vision │ (hidden)              │
└──────────────────────────────────┘
```

## Page Navigation with Highlights

### Scenario: Multi-page Extraction
```
1. Load 15-page PDF
2. Run vision extraction
3. Automatically highlights page 1
4. User navigates to page 2:

Page 1 Highlighted Fields:
┌─────────────────┐
│ ▌Title (highlight)
│ ▌DOI   (highlight)
│
└─────────────────┘

Page 2 Highlighted Fields:
┌─────────────────┐
│ ▌Population   (highlight)
│ ▌Intervention (highlight)
│ ▌Comparator   (highlight)
│
└─────────────────┘

Page 3: No highlights (no extracted fields on this page)

Page 4 Highlighted Fields:
┌─────────────────┐
│ ▌Outcomes (highlight)
│ ▌Timing   (highlight)
│
└─────────────────┘
```

---

## Quick Reference Checklist

As you test, verify these visual elements appear:

- [ ] Vision button is visible in compact toolbar
- [ ] Click Vision button → status shows "Initializing..."
- [ ] Console opens with detailed progress logs
- [ ] Yellow highlights appear on page 1
- [ ] Status updates show "Complete! X fields"
- [ ] Navigate pages → highlights update correctly
- [ ] Status bar shows success message (5+ seconds)
- [ ] window._lastVisionResult accessible in console
- [ ] Error cases show helpful messages
- [ ] Cost estimate displays correctly

---

**Note**: This guide uses ASCII diagrams to show expected UI behavior.
Actual rendering depends on PDF content and page dimensions.
