# Integration Code Examples

## Example 1: Add Toggle Button for Auto-Extraction

### HTML
```html
<button id="toggle-auto-extract" onclick="toggleAutoExtraction()">
    Auto-Extract: ON
</button>

<script>
function toggleAutoExtraction() {
    const isEnabled = window.ClinicalExtractor.isAutoExtractionEnabled()
    const newState = !isEnabled
    window.ClinicalExtractor.setAutoExtraction(newState)

    const btn = document.getElementById('toggle-auto-extract')
    btn.textContent = `Auto-Extract: ${newState ? 'ON' : 'OFF'}`
    btn.style.background = newState ? '#4caf50' : '#f44336'
}
</script>
```

---

## Example 2: Display Cache Statistics in UI

### JavaScript
```typescript
import AppStateManager from './state/AppStateManager'

function displayCacheStats() {
    const stats = window.ClinicalExtractor.getExtractionStats()
    const metadata = window.ClinicalExtractor.getCacheMetadata()

    console.log('=== CACHE STATISTICS ===')
    console.log(`Total PDFs cached: ${stats.cacheSize}`)
    console.log(`Auto-extraction: ${stats.autoExtractionEnabled ? 'Enabled' : 'Disabled'}`)
    console.log(`Extraction in progress: ${stats.extractionInProgress}`)

    console.log('\n=== CACHED EXTRACTIONS ===')
    metadata.forEach((entry, idx) => {
        console.log(
            `${idx + 1}. ${entry.pdfId}: ${entry.fieldCount} fields, ` +
            `Cost: $${entry.estimatedCost.toFixed(4)}, ` +
            `Expired: ${entry.isExpired ? 'Yes' : 'No'}`
        )
    })
}

// Call it
displayCacheStats()
```

---

## Example 3: Auto-Save Extraction on PDF Load

### TypeScript Service
```typescript
import AppStateManager from '../state/AppStateManager'
import { PDFDatabaseVisionIntegration } from './PDFDatabaseVisionIntegration'

export const AutoSaveExtractionService = {
    /**
     * Subscribe to PDF loads and auto-save extractions
     */
    initialize(): void {
        AppStateManager.subscribe((state) => {
            // When vision extraction completes
            if (state.visionExtractionData && state.lastExtraction) {
                const { pdfId, timestamp, cached } = state.lastExtraction

                // Only save new extractions (not from cache)
                if (!cached) {
                    this.saveExtractionToBackend(
                        pdfId,
                        state.visionExtractionData
                    )
                }
            }
        })
    },

    /**
     * Save extraction to backend API
     */
    private async saveExtractionToBackend(
        pdfId: string,
        extraction: any
    ): Promise<void> {
        try {
            const data = {
                pdfId,
                timestamp: Date.now(),
                extraction,
                coordinateCount: extraction.coordinates.size,
                processingTime: extraction.processingStats.totalTime,
                cost: extraction.processingStats.estimatedCost
            }

            const response = await fetch('/api/extractions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })

            if (response.ok) {
                console.log('[AutoSave] Extraction saved successfully')
            }
        } catch (error) {
            console.error('[AutoSave] Failed to save extraction:', error)
        }
    }
}
```

---

## Example 4: Create Export Button

### HTML + JavaScript
```html
<button id="export-extraction" onclick="exportCurrentExtraction()">
    Export Extraction
</button>

<script>
async function exportCurrentExtraction() {
    const state = window.ClinicalExtractor.AppStateManager.getState()

    if (!state.lastExtraction) {
        alert('No extraction data to export')
        return
    }

    const pdfId = state.lastExtraction.pdfId
    const format = prompt('Export format?', 'json')

    if (!format) return

    const data = window.ClinicalExtractor.exportExtractionData(pdfId, format)
    if (!data) {
        alert('Failed to export')
        return
    }

    // Download file
    const blob = new Blob([data], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extraction-${pdfId}.${format === 'json' ? 'json' : 'csv'}`
    a.click()
    URL.revokeObjectURL(url)
}
</script>
```

---

## Example 5: Monitor Extraction Progress

### TypeScript
```typescript
import AppStateManager from '../state/AppStateManager'
import StatusManager from '../utils/status'

export const ExtractionProgressMonitor = {
    private lastProcessingState = false

    /**
     * Watch for extraction progress changes
     */
    initialize(): void {
        AppStateManager.subscribe((state) => {
            // Extraction started
            if (state.isProcessing && !this.lastProcessingState) {
                this.onExtractionStart()
            }

            // Extraction completed
            if (!state.isProcessing && this.lastProcessingState) {
                if (state.visionExtractionData) {
                    this.onExtractionComplete(state.visionExtractionData)
                } else {
                    this.onExtractionFailed()
                }
            }

            this.lastProcessingState = state.isProcessing
        })
    },

    onExtractionStart(): void {
        console.log('👁️ Vision extraction started...')
        StatusManager.show('Vision extraction in progress...', 'info')
    },

    onExtractionComplete(result: any): void {
        console.log(`✅ Vision extraction complete!`)
        console.log(`   Fields found: ${result.coordinates.size}`)
        console.log(`   Time: ${result.processingStats.totalTime}ms`)
        console.log(`   Cost: $${result.processingStats.estimatedCost.toFixed(4)}`)

        StatusManager.show(
            `Extraction complete: ${result.coordinates.size} fields found`,
            'success'
        )
    },

    onExtractionFailed(): void {
        console.log('❌ Vision extraction failed')
        StatusManager.show('Extraction failed - check console for details', 'error')
    }
}
```

---

## Example 6: Conditional Extraction Based on PDF Size

### TypeScript
```typescript
import { PDFDatabaseService } from './PDFDatabaseService'
import { PDFDatabaseVisionIntegration } from './PDFDatabaseVisionIntegration'

export const SmartExtractionService = {
    /**
     * Only auto-extract PDFs under a certain size
     */
    async onPDFLoaded(pdfId: string): Promise<void> {
        const pdf = await PDFDatabaseService.getPDF(pdfId)
        if (!pdf) return

        // Size thresholds
        const MAX_SIZE_MB = 5
        const sizeMB = pdf.fileSize / (1024 * 1024)

        // Skip extraction for large PDFs
        if (sizeMB > MAX_SIZE_MB) {
            console.log(`PDF too large (${sizeMB.toFixed(1)}MB), skipping auto-extraction`)
            return
        }

        // Extract small PDFs
        console.log(`PDF size OK (${sizeMB.toFixed(1)}MB), auto-extracting...`)
        await PDFDatabaseVisionIntegration.extractAndStoreResults(pdfId)
    }
}
```

---

## Example 7: Cache Cleanup Service

### TypeScript
```typescript
import { PDFDatabaseVisionIntegration } from './PDFDatabaseVisionIntegration'

export const CacheCleanupService = {
    /**
     * Run cleanup every hour
     */
    initialize(): void {
        setInterval(() => {
            this.cleanupExpiredEntries()
        }, 60 * 60 * 1000) // 1 hour
    },

    /**
     * Remove expired cache entries
     */
    private cleanupExpiredEntries(): void {
        const metadata = PDFDatabaseVisionIntegration.getCacheMetadata()
        const expiredCount = metadata.filter(m => m.isExpired).length

        if (expiredCount === 0) {
            console.log('[CacheCleanup] No expired entries')
            return
        }

        console.log(`[CacheCleanup] Removing ${expiredCount} expired entries...`)

        metadata.forEach(entry => {
            if (entry.isExpired) {
                PDFDatabaseVisionIntegration.clearCache(entry.pdfId)
            }
        })

        const stats = PDFDatabaseVisionIntegration.getStats()
        console.log(`[CacheCleanup] Done. ${stats.cacheSize} entries remaining`)
    }
}
```

---

## Example 8: UI Component for Cache Management

### React/TypeScript
```typescript
import React, { useState, useEffect } from 'react'

export const CacheManagementPanel: React.FC = () => {
    const [metadata, setMetadata] = useState<any[]>([])
    const [stats, setStats] = useState<any>(null)

    useEffect(() => {
        refreshStats()
        const interval = setInterval(refreshStats, 5000)
        return () => clearInterval(interval)
    }, [])

    const refreshStats = () => {
        const meta = window.ClinicalExtractor.getCacheMetadata()
        const stat = window.ClinicalExtractor.getExtractionStats()
        setMetadata(meta)
        setStats(stat)
    }

    const handleClearAll = () => {
        if (confirm('Clear all cached extractions?')) {
            window.ClinicalExtractor.PDFDatabaseVisionIntegration.clearCache()
            refreshStats()
        }
    }

    const handleClearOne = (pdfId: string) => {
        window.ClinicalExtractor.PDFDatabaseVisionIntegration.clearCache(pdfId)
        refreshStats()
    }

    const handleExport = (pdfId: string) => {
        const json = window.ClinicalExtractor.exportExtractionData(pdfId, 'json')
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${pdfId}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    if (!stats) return <div>Loading...</div>

    return (
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h2>Cache Management</h2>

            <div style={{ marginBottom: '20px' }}>
                <p>
                    <strong>Total Cached:</strong> {stats.cacheSize} PDFs
                </p>
                <p>
                    <strong>Auto-Extract:</strong> {stats.autoExtractionEnabled ? '✓' : '✗'}
                </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <button
                    onClick={handleClearAll}
                    style={{
                        padding: '8px 12px',
                        background: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Clear All Cache
                </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                        <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd' }}>
                            PDF ID
                        </th>
                        <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd' }}>
                            Fields
                        </th>
                        <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd' }}>
                            Cost
                        </th>
                        <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd' }}>
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {metadata.map((entry) => (
                        <tr key={entry.pdfId}>
                            <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                                {entry.pdfId.substring(0, 12)}...
                            </td>
                            <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                                {entry.fieldCount}
                            </td>
                            <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                                ${entry.estimatedCost.toFixed(4)}
                            </td>
                            <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                                <button
                                    onClick={() => handleExport(entry.pdfId)}
                                    style={{
                                        marginRight: '4px',
                                        padding: '4px 8px',
                                        fontSize: '12px',
                                        background: '#2196F3',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Export
                                </button>
                                <button
                                    onClick={() => handleClearOne(entry.pdfId)}
                                    style={{
                                        padding: '4px 8px',
                                        fontSize: '12px',
                                        background: '#f44336',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
```

---

## Example 9: Error Recovery

### TypeScript
```typescript
import { PDFDatabaseVisionIntegration } from './PDFDatabaseVisionIntegration'
import StatusManager from '../utils/status'

export const ExtractionErrorRecovery = {
    /**
     * Handle extraction failures gracefully
     */
    async retryExtraction(
        pdfId: string,
        maxAttempts: number = 3
    ): Promise<boolean> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`[Retry] Attempt ${attempt}/${maxAttempts}...`)
                StatusManager.show(
                    `Retrying extraction... Attempt ${attempt}/${maxAttempts}`,
                    'info'
                )

                const result = await PDFDatabaseVisionIntegration.extractAndStoreResults(pdfId)

                if (result) {
                    console.log('[Retry] Success!')
                    StatusManager.show('Extraction succeeded!', 'success')
                    return true
                }
            } catch (error) {
                console.error(`[Retry] Attempt ${attempt} failed:`, error)

                // Wait before retrying
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
                }
            }
        }

        StatusManager.show(
            `Extraction failed after ${maxAttempts} attempts`,
            'error'
        )
        return false
    }
}
```

---

## Example 10: Analytics Tracking

### TypeScript
```typescript
import AppStateManager from '../state/AppStateManager'

export const ExtractionAnalytics = {
    private stats = {
        totalExtractions: 0,
        totalCacheHits: 0,
        totalCacheMisses: 0,
        totalCost: 0,
        totalTime: 0
    }

    /**
     * Track extraction analytics
     */
    initialize(): void {
        AppStateManager.subscribe((state) => {
            if (state.visionExtractionData && state.lastExtraction) {
                const { cached } = state.lastExtraction
                const { processingStats } = state.visionExtractionData

                this.stats.totalExtractions++

                if (cached) {
                    this.stats.totalCacheHits++
                } else {
                    this.stats.totalCacheMisses++
                    this.stats.totalCost += processingStats.estimatedCost
                    this.stats.totalTime += processingStats.totalTime
                }

                this.logStats()
            }
        })
    },

    /**
     * Log current analytics
     */
    private logStats(): void {
        console.log('=== EXTRACTION ANALYTICS ===')
        console.log(`Total Extractions: ${this.stats.totalExtractions}`)
        console.log(`Cache Hits: ${this.stats.totalCacheHits}`)
        console.log(`Cache Misses: ${this.stats.totalCacheMisses}`)
        console.log(`Hit Rate: ${((this.stats.totalCacheHits / this.stats.totalExtractions) * 100).toFixed(1)}%`)
        console.log(`Total Cost: $${this.stats.totalCost.toFixed(4)}`)
        console.log(`Average Time per Extract: ${(this.stats.totalTime / this.stats.totalCacheMisses).toFixed(0)}ms`)
    }
}
```

---

## Integration Points Summary

All examples use these main integration points:

```typescript
// Main service
window.ClinicalExtractor.PDFDatabaseVisionIntegration

// Methods on service
.init()                              // Initialize
.setAutoExtraction(bool)            // Enable/disable
.isAutoExtractionEnabled()          // Check status
.onPDFLoaded(pdfId, options)        // Called on PDF load
.extractAndStoreResults(pdfId)      // Manual extraction
.getCachedExtraction(pdfId)         // Get from cache
.forceReExtraction(pdfId)           // Re-extract
.clearCache(pdfId)                  // Clear cache
.getStats()                         // Get statistics
.getCacheMetadata()                 // Get metadata
.exportExtractionData(pdfId, fmt)   // Export data

// State access
window.ClinicalExtractor.AppStateManager.getState()
  .visionExtractionData              // Extraction result
  .lastExtraction                    // Metadata

// Vision agent
window.ClinicalExtractor.PDFProcessingAgent
  .highlightExtractions()            // Show highlights
  .clearHighlights()                 // Remove highlights
```

---

**For more information, see:**
- Main documentation: `docs/PDF_DATABASE_VISION_INTEGRATION.md`
- Quick start: `QUICK_START_INTEGRATION.md`
- Integration summary: `INTEGRATION_SUMMARY.md`
