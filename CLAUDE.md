# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

**What:** TypeScript/Vite app for extracting clinical data from medical PDFs using multi-agent AI (Gemini)

**Commands:**
```bash
npm run dev          # Start dev server (port 5000)
npm run build        # Production build
npm test             # Jest unit tests
npm run test:e2e     # Playwright E2E tests (95 tests)
npm run lint         # TypeScript check (tsc --noEmit)
npm run test:watch   # Jest watch mode
```

**Single test:** `npx jest tests/unit/AIService.test.ts`
**Single E2E test:** `npx playwright test 03-ai-pico-extraction.spec.ts`
**Type check file:** `npx tsc src/services/AIService.ts --noEmit`

## Environment Setup

```bash
# Frontend-only (dev)
echo 'VITE_GEMINI_API_KEY=your_key' > .env.local
npm install && npm run dev

# With backend (production)
cd backend && poetry install && cp .env.example .env
# Add GEMINI_API_KEY to backend/.env
poetry run uvicorn app.main:app --reload
# In separate terminal:
echo 'VITE_BACKEND_URL=http://localhost:8000' > .env.local
npm install && npm run dev
```

## Architecture Overview

### Core Data Flow
```
PDF Upload → PDFLoader → PDFRenderer → TextSelection/AI Extraction
                ↓
        AppStateManager (singleton, Observer pattern)
                ↓
        ExtractionTracker (localStorage persistence)
                ↓
        ExportManager (JSON/CSV/Excel/HTML)
```

### Multi-Agent AI Pipeline
```
PDF Text → AgentOrchestrator → 6 Medical Agents (Gemini) → Consensus Voting
```

Agents: StudyDesignExpert, PatientDataSpecialist, SurgicalExpert, OutcomesAnalyst, NeuroimagingSpecialist, TableExtractor

### Key Patterns

1. **Dependency Injection** - Services inject dependencies in `main.ts` via `setDependencies()`
2. **State Management** - `AppStateManager` singleton with Observer pattern
3. **Backend-First with Fallback** - Try backend API, fallback to direct Gemini calls
4. **Circuit Breaker** - `CircuitBreaker.ts` for API fault tolerance
5. **LRU Caching** - `CacheManager.ts` for PDF text, HTTP responses, AI results

### Module Organization

- `src/main.ts` - Entry point, orchestration, Window API (40+ exposed functions)
- `src/state/` - AppStateManager (global state)
- `src/services/` - Core services (AI, agents, export, search, citations)
- `src/pdf/` - PDF loading, rendering, text selection
- `src/forms/` - 8-step form wizard
- `src/utils/` - Helpers, error handling, caching

### Critical Files

- **State:** `src/state/AppStateManager.ts`
- **AI Core:** `src/services/AIService.ts` (7 Gemini functions)
- **Multi-Agent:** `src/services/AgentOrchestrator.ts`, `src/services/MedicalAgentBridge.ts`
- **Types:** `src/types/index.ts` (all interfaces)
- **Config:** `src/config/index.ts`

## Adding New Features

### New AI Function
1. Add to `src/services/AIService.ts`
2. Export function
3. Add to Window API in `main.ts`

### New Service
1. Create in `src/services/`
2. If needs DI, add `setDependencies()` pattern
3. Initialize in `main.ts`
4. Export to Window API if needed from HTML

## TypeScript Configuration

- **Target:** ES2022
- **Module Resolution:** bundler (Vite)
- **JSX:** React mode (no React dependency)
- **noEmit:** true (Vite handles compilation)

## Testing

**Unit tests:** `tests/unit/` (Jest) - 7 suites
**E2E tests:** `tests/e2e-playwright/` (Playwright) - 8 suites, 95 tests

AI-dependent tests require `VITE_GEMINI_API_KEY` in `.env.local`.

## Common Gotchas

1. **Processing lock** - Check `state.isProcessing` before AI calls
2. **PDF state** - Always verify `state.pdfDoc` exists
3. **Env vars** - Vite requires `VITE_` prefix for browser exposure
4. **Window API** - HTML onclick handlers use functions from `window.ClinicalExtractor`

## Documentation

See `docs/` for detailed guides:
- `docs/ARCHITECTURE.md` - Detailed architecture
- `docs/TESTING.md` - Testing guide
- `docs/DEPLOYMENT.md` - Deployment
- `docs/FEATURES.md` - Feature status

## PDFProcessingAgent - Vision-Based Extraction

**Location:** `src/services/PDFProcessingAgent.ts` (534 lines)

### Features
- Vision extraction with Gemini 2.0 Flash
- Bounding box coordinates for highlighting
- Batch processing (3 pages/batch, 2 parallel)
- Cost estimation (~$0.001/page at 150 DPI)
- Highlight rendering on PDF canvas

### Architecture
```
PDF Upload → PDFPageRenderer (PNG @ 150 DPI)
                    ↓
            Gemini 2.0 Flash Vision API
                    ↓
    PDFProcessingAgent.processDocument()
                    ↓
        Merge results + Deduplicate
                    ↓
    ClinicalStudyExtraction + BoundingBoxCoordinate[]
                    ↓
        highlightExtractions() on PDF
```

### Key Methods
```typescript
// Main entry point - process entire PDF
const result = await PDFProcessingAgent.processDocument({
    dpi: 150,              // Image resolution
    pagesPerBatch: 3,      // Pages per API call
    maxParallel: 2         // Concurrent batches
});

// Returns:
// - extraction: Partial<ClinicalStudyExtraction>
// - coordinates: Map<string, BoundingBoxCoordinate[]>
// - processingStats: { totalTime, pagesProcessed, apiCalls, estimatedCost }

// Highlight specific field
await PDFProcessingAgent.highlightExtractions(coordinates, 'studyIdentification.title');

// Clear highlights
PDFProcessingAgent.clearHighlights();
```

### Supporting Services
- `PDFPageRenderer.ts` - Converts pages to PNG images
- `CoordinateTransformer.ts` - Normalizes bounding box coordinates
- `GeminiFilesService.ts` - File upload for grounding (optional)

### Usage from Window API
```javascript
// In browser console or HTML onclick
window.ClinicalExtractor.processFullDocument();
```

### Cost Estimation
- 150 DPI: ~$0.001/page
- 300 DPI: ~$0.004/page
- Batch of 10 pages: ~$0.01

### Key Benefits
- No text extraction issues - AI reads the image directly
- Coordinates preserved - bounding boxes come from the AI response
- Single API call - unified schema extracts everything at once
- Citation highlighting works - we have actual page coordinates
