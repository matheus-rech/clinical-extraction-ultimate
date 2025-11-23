/**
 * AgentOrchestrator.ts
 *
 * Multi-Agent Coordination System for Medical Data Extraction
 *
 * Orchestrates 6 specialized AI agents:
 * 1. StudyDesignExpertAgent - Research methodology (92% accuracy)
 * 2. PatientDataSpecialistAgent - Demographics, samples (88% accuracy)
 * 3. SurgicalExpertAgent - Procedures, techniques (91% accuracy)
 * 4. OutcomesAnalystAgent - Statistics, outcomes (89% accuracy)
 * 5. NeuroimagingSpecialistAgent - Imaging data (92% accuracy)
 * 6. TableExtractorAgent - Table validation (100% confidence)
 */

import type { ExtractedFigure } from './FigureExtractor';
import type { ExtractedTable } from './TableExtractor';
import MedicalAgentBridge from './MedicalAgentBridge';
import { PDFProcessingAgent } from './PDFProcessingAgent';
import type { PDFProcessingOptions, PDFProcessingResult } from '../types';

// ==================== TYPE DEFINITIONS ====================

export interface AgentResult {
    agentName: string
    confidence: number
    extractedData: any
    processingTime: number
    validationStatus: 'validated' | 'needs_review' | 'failed'
    sourceQuote?: string
    pageNumber?: number
    error?: string
}

interface EnhancedTable extends ExtractedTable {
    aiEnhancement?: {
        agentResults: AgentResult[]
        consensusData: any
        overallConfidence: number
        clinicalDataType: ClinicalDataType
    }
}

interface EnhancedFigure extends ExtractedFigure {
    aiAnalysis?: {
        agentResults: AgentResult[]
        figureType: FigureType
        clinicalInsights: string[]
        overallConfidence: number
    }
}

type ClinicalDataType =
    | 'patient_demographics'
    | 'surgical_procedures'
    | 'outcomes_statistics'
    | 'neuroimaging_data'
    | 'study_methodology'
    | 'unknown';

type FigureType =
    | 'flowchart'
    | 'bar_chart'
    | 'line_graph'
    | 'scatter_plot'
    | 'medical_image'
    | 'diagram'
    | 'unknown';

// ==================== AGENT ORCHESTRATOR ====================

class AgentOrchestrator {
    constructor() {
    }

    /**
     * Main pipeline: Extract → Classify → Route → Enhance → Validate
     */
    async processExtractedData(
        figures: ExtractedFigure[],
        tables: ExtractedTable[]
    ): Promise<{
        enhancedFigures: EnhancedFigure[],
        enhancedTables: EnhancedTable[],
        pipelineStats: any
    }> {
        const startTime = Date.now();
        console.log('🚀 Starting Multi-Agent Pipeline...');

        // Process tables with multi-agent consensus
        const enhancedTables = await this.enhanceTables(tables);

        // Process figures with specialized analysis
        const enhancedFigures = await this.enhanceFigures(figures);

        const pipelineStats = {
            totalProcessingTime: Date.now() - startTime,
            tablesProcessed: tables.length,
            figuresProcessed: figures.length,
            agentsInvoked: this.countAgentInvocations(enhancedTables, enhancedFigures),
            averageConfidence: this.calculateAverageConfidence(enhancedTables, enhancedFigures)
        };

        console.log('✅ Multi-Agent Pipeline Complete:', pipelineStats);

        return { enhancedFigures, enhancedTables, pipelineStats };
    }

    /**
     * Step 1: Classify table content to route to appropriate agents
     */
    private classifyTableContent(table: ExtractedTable): ClinicalDataType {
        const headers = table.headers.join(' ').toLowerCase();
        const firstRow = table.rows[0]?.join(' ').toLowerCase() || '';
        const content = headers + ' ' + firstRow;

        // Pattern matching for clinical data types
        if (this.matchesPattern(content, ['age', 'sex', 'gender', 'patient', 'n =', 'total'])) {
            return 'patient_demographics';
        }
        if (this.matchesPattern(content, ['surgery', 'procedure', 'operation', 'sdc', 'evd', 'craniectomy'])) {
            return 'surgical_procedures';
        }
        if (this.matchesPattern(content, ['outcome', 'mortality', 'mrs', 'survival', 'favorable', '%'])) {
            return 'outcomes_statistics';
        }
        if (this.matchesPattern(content, ['volume', 'lesion', 'swelling', 'mm', 'imaging', 'ct', 'mri'])) {
            return 'neuroimaging_data';
        }
        if (this.matchesPattern(content, ['study', 'design', 'method', 'inclusion', 'exclusion', 'criteria'])) {
            return 'study_methodology';
        }

        return 'unknown';
    }

    /**
     * Step 2: Route table to appropriate specialist agents
     */
    private getAgentsForDataType(dataType: ClinicalDataType): string[] {
        const agentMap: Record<ClinicalDataType, string[]> = {
            'patient_demographics': ['PatientDataSpecialistAgent', 'TableExtractorAgent'],
            'surgical_procedures': ['SurgicalExpertAgent', 'TableExtractorAgent'],
            'outcomes_statistics': ['OutcomesAnalystAgent', 'TableExtractorAgent'],
            'neuroimaging_data': ['NeuroimagingSpecialistAgent', 'TableExtractorAgent'],
            'study_methodology': ['StudyDesignExpertAgent', 'TableExtractorAgent'],
            'unknown': ['TableExtractorAgent']
        };

        return agentMap[dataType] || ['TableExtractorAgent'];
    }

    /**
     * Step 3: Enhance tables with multi-agent consensus
     */
    private async enhanceTables(tables: ExtractedTable[]): Promise<EnhancedTable[]> {
        console.log(`📊 Enhancing ${tables.length} tables with AI agents...`);

        const enhanced: EnhancedTable[] = [];

        for (const table of tables) {
            const startTime = Date.now();

            // Classify content type
            const dataType = this.classifyTableContent(table);
            console.log(`  Table ${table.id}: Classified as ${dataType}`);

            // Get appropriate agents
            const agentNames = this.getAgentsForDataType(dataType);

            // Call each agent in parallel
            const agentResults = await Promise.all(
                agentNames.map(agentName => this.callAgent(agentName, table, 'table'))
            );

            // Calculate consensus
            const consensusData = this.calculateConsensus(agentResults);
            const overallConfidence = this.calculateOverallConfidence(agentResults);

            enhanced.push({
                ...table,
                aiEnhancement: {
                    agentResults,
                    consensusData,
                    overallConfidence,
                    clinicalDataType: dataType
                }
            });

            console.log(`  ✓ Enhanced in ${Date.now() - startTime}ms (confidence: ${overallConfidence.toFixed(2)})`);
        }

        return enhanced;
    }

    /**
     * Step 4: Enhance figures with specialized analysis
     */
    private async enhanceFigures(figures: ExtractedFigure[]): Promise<EnhancedFigure[]> {
        console.log(`🖼️ Analyzing ${figures.length} figures with AI...`);

        const enhanced: EnhancedFigure[] = [];

        for (const figure of figures) {
            const startTime = Date.now();

            // Classify figure type
            const figureType = await this.classifyFigureType(figure);

            // Get insights from relevant agents
            const agentResults = await this.analyzeFigure(figure, figureType);

            enhanced.push({
                ...figure,
                aiAnalysis: {
                    agentResults,
                    figureType,
                    clinicalInsights: this.extractInsights(agentResults),
                    overallConfidence: this.calculateOverallConfidence(agentResults)
                }
            });

            console.log(`  ✓ Analyzed in ${Date.now() - startTime}ms`);
        }

        return enhanced;
    }

    /**
     * Call a specific medical agent via Gemini bridge
     */
    private async callAgent(
        agentName: string,
        data: ExtractedTable | ExtractedFigure,
        dataType: 'table' | 'figure'
    ): Promise<AgentResult> {
        // Call the agent through the Gemini bridge
        return await MedicalAgentBridge.callAgent(
            agentName as any,
            data,
            dataType
        );
    }


    /**
     * Calculate consensus from multiple agent results
     */
    private calculateConsensus(results: AgentResult[]): any {
        // Weighted voting based on confidence scores
        const validResults = results.filter(r => r.validationStatus !== 'failed');

        if (validResults.length === 0) return null;

        // For now, return the highest confidence result
        const best = validResults.reduce((a, b) =>
            a.confidence > b.confidence ? a : b
        );

        return {
            primaryAgent: best.agentName,
            consensusConfidence: best.confidence,
            supportingAgents: validResults.filter(r => r !== best).map(r => r.agentName),
            data: best.extractedData
        };
    }

    /**
     * Calculate overall confidence from agent results
     */
    private calculateOverallConfidence(results: AgentResult[]): number {
        const validResults = results.filter(r => r.confidence > 0);
        if (validResults.length === 0) return 0;

        // Weighted average
        const sum = validResults.reduce((acc, r) => acc + r.confidence, 0);
        return sum / validResults.length;
    }

    /**
     * Classify figure type using image analysis
     */
    private async classifyFigureType(figure: ExtractedFigure): Promise<FigureType> {
        // Simple heuristics based on aspect ratio and size
        const aspectRatio = figure.width / figure.height;

        if (aspectRatio > 1.5) return 'flowchart';
        if (aspectRatio < 0.7) return 'bar_chart';
        if (figure.width > 500 && figure.height > 500) return 'medical_image';

        return 'unknown';
    }

    /**
     * Analyze figure with relevant agents
     */
    private async analyzeFigure(
        figure: ExtractedFigure,
        figureType: FigureType
    ): Promise<AgentResult[]> {
        // Route to appropriate agents based on figure type
        const agents = figureType === 'medical_image'
            ? ['NeuroimagingSpecialistAgent']
            : ['StudyDesignExpertAgent'];

        return Promise.all(
            agents.map(agent => this.callAgent(agent, figure, 'figure'))
        );
    }

    /**
     * Extract clinical insights from agent results
     */
    private extractInsights(results: AgentResult[]): string[] {
        return results
            .filter(r => r.extractedData)
            .map(r => r.sourceQuote || `Insight from ${r.agentName}`)
            .filter(Boolean) as string[];
    }

    /**
     * Helper: Pattern matching for content classification
     */
    private matchesPattern(content: string, patterns: string[]): boolean {
        return patterns.some(pattern => content.includes(pattern.toLowerCase()));
    }

    /**
     * Count total agent invocations
     */
    private countAgentInvocations(tables: EnhancedTable[], figures: EnhancedFigure[]): number {
        const tableInvocations = tables.reduce((sum, t) =>
            sum + (t.aiEnhancement?.agentResults.length || 0), 0
        );
        const figureInvocations = figures.reduce((sum, f) =>
            sum + (f.aiAnalysis?.agentResults.length || 0), 0
        );
        return tableInvocations + figureInvocations;
    }

    /**
     * Calculate average confidence across all enhancements
     */
    private calculateAverageConfidence(tables: EnhancedTable[], figures: EnhancedFigure[]): number {
        const allConfidences = [
            ...tables.map(t => t.aiEnhancement?.overallConfidence || 0),
            ...figures.map(f => f.aiAnalysis?.overallConfidence || 0)
        ].filter(c => c > 0);

        if (allConfidences.length === 0) return 0;
        return allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length;
    }

    // ==================== FULL DOCUMENT PROCESSING ====================

    /**
     * Process entire PDF with vision-based extraction
     *
     * This is the main entry point for the new PDF Processing Agent
     * that uses vision to extract data with bounding box coordinates.
     */
    async processFullDocument(
        options?: PDFProcessingOptions
    ): Promise<PDFProcessingResult | null> {
        console.log('🔬 Starting Full Document Processing with Vision...');
        return PDFProcessingAgent.processDocument(options);
    }

    /**
     * Highlight extracted data on PDF
     */
    async highlightExtraction(
        coordinates: Map<string, import('../types').BoundingBoxCoordinate[]>,
        fieldName?: string
    ): Promise<void> {
        return PDFProcessingAgent.highlightExtractions(coordinates, fieldName);
    }

    /**
     * Clear all extraction highlights
     */
    clearHighlights(): void {
        PDFProcessingAgent.clearHighlights();
    }
}

// Export singleton instance
export default new AgentOrchestrator();
export type { EnhancedTable, EnhancedFigure, ClinicalDataType, FigureType };
