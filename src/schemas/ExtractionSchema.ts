/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ExtractionSchema
 *
 * Unified schema for extracting ALL clinical study data in a single AI call.
 * Maps to the 8-step form wizard with all fields from the Clinical Extractor.
 *
 * This schema is used for:
 * 1. File Search grounding - single query extracts everything
 * 2. Response validation - ensures complete data
 * 3. Form population - maps directly to UI fields
 */

import { Type } from '@google/genai';

// ==================== COMPLETE EXTRACTION SCHEMA ====================

/**
 * Complete extraction result from a clinical study
 */
export interface ClinicalStudyExtraction {
    // Step 1: Study Identification
    studyIdentification: {
        doi: string | null;
        pmid: string | null;
        citation: string;
        firstAuthor: string;
        publicationYear: number | null;
        journal: string;
        title: string;
    };

    // Step 2: Eligibility & PICO-T
    eligibility: {
        population: string;
        intervention: string;
        comparator: string;
        outcomes: string;
        timing: string;
        studyType: string;
        inclusionCriteria: string[];
        exclusionCriteria: string[];
    };

    // Step 3: Study Quality
    studyQuality: {
        selectionBias: string;
        performanceBias: string;
        detectionBias: string;
        attritionBias: string;
        reportingBias: string;
        otherBias: string;
        overallRisk: 'low' | 'moderate' | 'high' | 'unclear';
        qualityScore: number | null;
        qualityTool: string;
    };

    // Step 4: Baseline Characteristics
    baselineCharacteristics: {
        totalPatients: number;
        arms: Array<{
            name: string;
            n: number;
            meanAge: number | null;
            ageSD: number | null;
            malePercent: number | null;
            gcsMedian: number | null;
            gcsRange: string | null;
        }>;
        comorbidities: string[];
    };

    // Step 5: Indications for Surgery
    indications: {
        primaryIndication: string;
        secondaryIndications: string[];
        radiologicalCriteria: string[];
        clinicalCriteria: string[];
        timingOfSurgery: string;
        surgeryType: string;
    };

    // Step 6: Interventions
    interventions: {
        surgicalProcedures: Array<{
            name: string;
            technique: string;
            duration: number | null;
            complications: string[];
        }>;
        conservativeTreatment: string[];
        followUpDuration: string;
        followUpSchedule: string[];
    };

    // Step 7: Outcomes
    outcomes: {
        primaryOutcome: string;
        secondaryOutcomes: string[];
        mortality: Array<{
            timepoint: string;
            surgicalArm: number | null;
            conservativeArm: number | null;
            pValue: number | null;
            oddsRatio: number | null;
            confidenceInterval: string | null;
        }>;
        functionalOutcomes: Array<{
            scale: string;
            timepoint: string;
            surgicalArm: string;
            conservativeArm: string;
            pValue: number | null;
        }>;
        mrsDistribution: Array<{
            timepoint: string;
            arm: string;
            mrs0: number | null;
            mrs1: number | null;
            mrs2: number | null;
            mrs3: number | null;
            mrs4: number | null;
            mrs5: number | null;
            mrs6: number | null;
        }>;
    };

    // Step 8: Complications & Predictors
    complicationsAndPredictors: {
        surgicalComplications: Array<{
            name: string;
            incidence: number | null;
            severity: string;
        }>;
        medicalComplications: Array<{
            name: string;
            incidence: number | null;
        }>;
        predictorsGoodOutcome: string[];
        predictorsPoorOutcome: string[];
        predictorsMortality: string[];
        subgroupAnalyses: Array<{
            subgroup: string;
            finding: string;
            pValue: number | null;
        }>;
    };

    // Metadata
    extractionMetadata: {
        confidence: number;
        extractionDate: string;
        modelUsed: string;
        warnings: string[];
    };
}

// ==================== GEMINI SCHEMA FOR FILE SEARCH ====================

/**
 * Gemini Type schema for structured extraction
 * Used with responseMimeType: 'application/json'
 */
export const GeminiExtractionSchema = {
    type: Type.OBJECT,
    properties: {
        studyIdentification: {
            type: Type.OBJECT,
            properties: {
                doi: { type: Type.STRING, nullable: true },
                pmid: { type: Type.STRING, nullable: true },
                citation: { type: Type.STRING },
                firstAuthor: { type: Type.STRING },
                publicationYear: { type: Type.NUMBER, nullable: true },
                journal: { type: Type.STRING },
                title: { type: Type.STRING }
            },
            required: ['citation', 'firstAuthor', 'journal', 'title']
        },
        eligibility: {
            type: Type.OBJECT,
            properties: {
                population: { type: Type.STRING },
                intervention: { type: Type.STRING },
                comparator: { type: Type.STRING },
                outcomes: { type: Type.STRING },
                timing: { type: Type.STRING },
                studyType: { type: Type.STRING },
                inclusionCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
                exclusionCriteria: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['population', 'intervention', 'comparator', 'outcomes', 'timing', 'studyType']
        },
        studyQuality: {
            type: Type.OBJECT,
            properties: {
                selectionBias: { type: Type.STRING },
                performanceBias: { type: Type.STRING },
                detectionBias: { type: Type.STRING },
                attritionBias: { type: Type.STRING },
                reportingBias: { type: Type.STRING },
                otherBias: { type: Type.STRING },
                overallRisk: { type: Type.STRING },
                qualityScore: { type: Type.NUMBER, nullable: true },
                qualityTool: { type: Type.STRING }
            }
        },
        baselineCharacteristics: {
            type: Type.OBJECT,
            properties: {
                totalPatients: { type: Type.NUMBER },
                arms: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            n: { type: Type.NUMBER },
                            meanAge: { type: Type.NUMBER, nullable: true },
                            ageSD: { type: Type.NUMBER, nullable: true },
                            malePercent: { type: Type.NUMBER, nullable: true },
                            gcsMedian: { type: Type.NUMBER, nullable: true },
                            gcsRange: { type: Type.STRING, nullable: true }
                        },
                        required: ['name', 'n']
                    }
                },
                comorbidities: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['totalPatients', 'arms']
        },
        indications: {
            type: Type.OBJECT,
            properties: {
                primaryIndication: { type: Type.STRING },
                secondaryIndications: { type: Type.ARRAY, items: { type: Type.STRING } },
                radiologicalCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
                clinicalCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
                timingOfSurgery: { type: Type.STRING },
                surgeryType: { type: Type.STRING }
            },
            required: ['primaryIndication', 'surgeryType']
        },
        interventions: {
            type: Type.OBJECT,
            properties: {
                surgicalProcedures: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            technique: { type: Type.STRING },
                            duration: { type: Type.NUMBER, nullable: true },
                            complications: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ['name', 'technique']
                    }
                },
                conservativeTreatment: { type: Type.ARRAY, items: { type: Type.STRING } },
                followUpDuration: { type: Type.STRING },
                followUpSchedule: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['surgicalProcedures', 'followUpDuration']
        },
        outcomes: {
            type: Type.OBJECT,
            properties: {
                primaryOutcome: { type: Type.STRING },
                secondaryOutcomes: { type: Type.ARRAY, items: { type: Type.STRING } },
                mortality: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            timepoint: { type: Type.STRING },
                            surgicalArm: { type: Type.NUMBER, nullable: true },
                            conservativeArm: { type: Type.NUMBER, nullable: true },
                            pValue: { type: Type.NUMBER, nullable: true },
                            oddsRatio: { type: Type.NUMBER, nullable: true },
                            confidenceInterval: { type: Type.STRING, nullable: true }
                        },
                        required: ['timepoint']
                    }
                },
                functionalOutcomes: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            scale: { type: Type.STRING },
                            timepoint: { type: Type.STRING },
                            surgicalArm: { type: Type.STRING },
                            conservativeArm: { type: Type.STRING },
                            pValue: { type: Type.NUMBER, nullable: true }
                        },
                        required: ['scale', 'timepoint']
                    }
                },
                mrsDistribution: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            timepoint: { type: Type.STRING },
                            arm: { type: Type.STRING },
                            mrs0: { type: Type.NUMBER, nullable: true },
                            mrs1: { type: Type.NUMBER, nullable: true },
                            mrs2: { type: Type.NUMBER, nullable: true },
                            mrs3: { type: Type.NUMBER, nullable: true },
                            mrs4: { type: Type.NUMBER, nullable: true },
                            mrs5: { type: Type.NUMBER, nullable: true },
                            mrs6: { type: Type.NUMBER, nullable: true }
                        },
                        required: ['timepoint', 'arm']
                    }
                }
            },
            required: ['primaryOutcome', 'mortality']
        },
        complicationsAndPredictors: {
            type: Type.OBJECT,
            properties: {
                surgicalComplications: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            incidence: { type: Type.NUMBER, nullable: true },
                            severity: { type: Type.STRING }
                        },
                        required: ['name']
                    }
                },
                medicalComplications: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            incidence: { type: Type.NUMBER, nullable: true }
                        },
                        required: ['name']
                    }
                },
                predictorsGoodOutcome: { type: Type.ARRAY, items: { type: Type.STRING } },
                predictorsPoorOutcome: { type: Type.ARRAY, items: { type: Type.STRING } },
                predictorsMortality: { type: Type.ARRAY, items: { type: Type.STRING } },
                subgroupAnalyses: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            subgroup: { type: Type.STRING },
                            finding: { type: Type.STRING },
                            pValue: { type: Type.NUMBER, nullable: true }
                        },
                        required: ['subgroup', 'finding']
                    }
                }
            }
        },
        extractionMetadata: {
            type: Type.OBJECT,
            properties: {
                confidence: { type: Type.NUMBER },
                extractionDate: { type: Type.STRING },
                modelUsed: { type: Type.STRING },
                warnings: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['confidence', 'extractionDate', 'modelUsed']
        }
    },
    required: [
        'studyIdentification',
        'eligibility',
        'baselineCharacteristics',
        'indications',
        'interventions',
        'outcomes',
        'extractionMetadata'
    ]
};

// ==================== EXTRACTION PROMPT ====================

/**
 * System prompt for comprehensive clinical study extraction
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are an expert medical research data extractor specializing in clinical studies, particularly neurosurgical interventions.

Your task is to extract ALL relevant clinical data from the provided research paper into a structured JSON format.

IMPORTANT GUIDELINES:
1. Extract exact values when available - do not paraphrase numerical data
2. Use null for missing or unclear data - do not guess
3. Include units where applicable (e.g., "45 ± 12 years", "72 hours")
4. For arrays, include all items found - empty array [] if none found
5. Confidence score should reflect data completeness (0.0-1.0)
6. Add warnings for ambiguous or potentially incorrect extractions

FOCUS AREAS:
- Study identification (DOI, PMID, authors, journal)
- PICO-T elements (Population, Intervention, Comparator, Outcomes, Timing)
- Study quality and risk of bias
- Patient demographics and baseline characteristics
- Surgical indications and procedures
- Mortality and functional outcomes (especially mRS)
- Complications and outcome predictors

Extract ALL data that matches the schema structure. Be thorough but accurate.`;

export default {
    GeminiExtractionSchema,
    EXTRACTION_SYSTEM_PROMPT
};
