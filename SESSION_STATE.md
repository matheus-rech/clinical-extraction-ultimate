# Session State - November 23, 2025 00:10 AM

## Current Status

### What Was Built
- **PDFProcessingAgent** - Vision-based extraction with Gemini 2.0 Flash (534 lines)
- **PDFPageRenderer** - PDF to image conversion (291 lines)
- **CoordinateTransformer** - Bounding box handling (241 lines)
- **PDFDatabaseVisionIntegration** - Auto-extraction on PDF load (464 lines)
- **UI Controls** - Vision button added to toolbar

### Configuration Changes
- `.env.local` - Backend disabled (`VITE_BACKEND_API_URL=`)
- `vite.config.ts` - Proxy to 8080 commented out
- `BackendClient.ts` - Added `BACKEND_DISABLED` check for empty URL

### Issues Being Debugged
1. **Vision extraction returns null** - Need to check why
   - Possible: `isProcessing` state stuck at true
   - Possible: Error in PDFProcessingAgent

2. **Browser cache** - Old code still showing `Backend URL: http://localhost:8080`
   - Solution: Hard refresh (Cmd+Shift+R)

### Running Services
- **Vite dev server**: http://localhost:5001
- **Chrome with debugging**: port 9222 (just started)

### Chrome DevTools MCP
- **Installed**: `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest`
- **Status**: Needs Claude Code restart to activate

## Next Steps

1. **Restart Claude Code** to pick up Chrome DevTools MCP
2. **Hard refresh browser** to get updated BackendClient code
3. **Test Vision extraction** in console:
   ```javascript
   // Check state
   window.ClinicalExtractor.getState().isProcessing

   // Reset if needed
   window.ClinicalExtractor.setState({ isProcessing: false })

   // Try extraction
   await window.ClinicalExtractor.processFullDocument()
   ```

4. **Debug with Chrome DevTools MCP** - execute JS, check console, profile performance

## Key Files
- `src/services/PDFProcessingAgent.ts` - Main vision extraction
- `src/services/BackendClient.ts` - Backend URL logic (line 7-36)
- `src/main.ts` - Window API (line 973+)
- `.env.local` - Environment config

## Database
- **Type**: IndexedDB (browser storage, not SQL)
- **PDFs stored**: 1 (Winslow 2023)
- **Cached extractions**: 1
