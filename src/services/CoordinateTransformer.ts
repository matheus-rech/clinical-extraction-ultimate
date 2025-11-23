/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CoordinateTransformer - Handles coordinate system conversions between
 * normalized (0-1) coordinates from Vision API and PDF.js display coordinates.
 *
 * Coordinate Systems:
 * 1. Normalized (0-1): Vision API returns bounding boxes as fractions
 * 2. PDF coordinates: Original PDF space (72 DPI, origin bottom-left)
 * 3. Display coordinates: Viewport space with scale (origin top-left)
 */

import type { Coordinates } from '../types';

/**
 * Normalized bounding box from Vision API (0-1 range)
 */
export interface NormalizedBoundingBox {
    /** Normalized X (0-1), left edge */
    x: number;
    /** Normalized Y (0-1), top edge */
    y: number;
    /** Normalized width (0-1) */
    width: number;
    /** Normalized height (0-1) */
    height: number;
}

/**
 * Page dimensions for coordinate conversion
 */
export interface PageDimensions {
    /** Width in PDF points */
    pdfWidth: number;
    /** Height in PDF points */
    pdfHeight: number;
    /** Width in pixels at current scale */
    displayWidth: number;
    /** Height in pixels at current scale */
    displayHeight: number;
}

/**
 * Bounding box with page reference
 */
export interface BoundingBoxCoordinate {
    /** Page number (1-indexed) */
    pageNum: number;
    /** X in PDF coordinates */
    x: number;
    /** Y in PDF coordinates */
    y: number;
    /** Width in PDF coordinates */
    width: number;
    /** Height in PDF coordinates */
    height: number;
    /** Original normalized X (0-1) */
    normalizedX: number;
    /** Original normalized Y (0-1) */
    normalizedY: number;
    /** Original normalized width (0-1) */
    normalizedWidth: number;
    /** Original normalized height (0-1) */
    normalizedHeight: number;
}

export const CoordinateTransformer = {
    /**
     * Convert normalized (0-1) coordinates to PDF coordinates
     *
     * Vision API returns normalized coordinates where:
     * - (0,0) is top-left
     * - (1,1) is bottom-right
     *
     * PDF coordinates:
     * - Origin is bottom-left
     * - Units are points (72 per inch)
     */
    normalizedToPdf(
        normalized: NormalizedBoundingBox,
        pdfDimensions: { width: number; height: number }
    ): Coordinates {
        const { width: pdfWidth, height: pdfHeight } = pdfDimensions;

        return {
            // X stays the same direction
            x: normalized.x * pdfWidth,
            // Y flips: PDF has origin at bottom-left
            y: pdfHeight - (normalized.y + normalized.height) * pdfHeight,
            width: normalized.width * pdfWidth,
            height: normalized.height * pdfHeight
        };
    },

    /**
     * Convert PDF coordinates to display/viewport coordinates
     *
     * Display coordinates:
     * - Origin is top-left (like HTML)
     * - Scaled by viewport scale factor
     */
    pdfToDisplay(
        pdfCoords: Coordinates,
        pdfHeight: number,
        scale: number
    ): Coordinates {
        return {
            x: pdfCoords.x * scale,
            // Flip Y back for display (HTML origin is top-left)
            y: (pdfHeight - pdfCoords.y - pdfCoords.height) * scale,
            width: pdfCoords.width * scale,
            height: pdfCoords.height * scale
        };
    },

    /**
     * Convert normalized coordinates directly to display coordinates
     * (combines normalizedToPdf and pdfToDisplay)
     */
    normalizedToDisplay(
        normalized: NormalizedBoundingBox,
        dimensions: PageDimensions,
        scale: number
    ): Coordinates {
        const { displayWidth, displayHeight } = dimensions;

        return {
            x: normalized.x * displayWidth,
            y: normalized.y * displayHeight,
            width: normalized.width * displayWidth,
            height: normalized.height * displayHeight
        };
    },

    /**
     * Create a full BoundingBoxCoordinate from normalized input
     */
    createBoundingBoxCoordinate(
        pageNum: number,
        normalized: NormalizedBoundingBox,
        pdfDimensions: { width: number; height: number }
    ): BoundingBoxCoordinate {
        const pdfCoords = this.normalizedToPdf(normalized, pdfDimensions);

        return {
            pageNum,
            x: pdfCoords.x,
            y: pdfCoords.y,
            width: pdfCoords.width,
            height: pdfCoords.height,
            normalizedX: normalized.x,
            normalizedY: normalized.y,
            normalizedWidth: normalized.width,
            normalizedHeight: normalized.height
        };
    },

    /**
     * Validate that coordinates are within page bounds
     */
    validateCoordinates(
        coords: Coordinates,
        pageWidth: number,
        pageHeight: number
    ): boolean {
        return (
            coords.x >= 0 &&
            coords.y >= 0 &&
            coords.x + coords.width <= pageWidth &&
            coords.y + coords.height <= pageHeight
        );
    },

    /**
     * Clamp coordinates to page bounds
     */
    clampToPage(
        coords: Coordinates,
        pageWidth: number,
        pageHeight: number
    ): Coordinates {
        const x = Math.max(0, Math.min(coords.x, pageWidth));
        const y = Math.max(0, Math.min(coords.y, pageHeight));
        const width = Math.min(coords.width, pageWidth - x);
        const height = Math.min(coords.height, pageHeight - y);

        return { x, y, width, height };
    },

    /**
     * Calculate overlap between two bounding boxes
     * Returns value between 0 (no overlap) and 1 (complete overlap)
     */
    calculateOverlap(box1: Coordinates, box2: Coordinates): number {
        const xOverlap = Math.max(0,
            Math.min(box1.x + box1.width, box2.x + box2.width) -
            Math.max(box1.x, box2.x)
        );
        const yOverlap = Math.max(0,
            Math.min(box1.y + box1.height, box2.y + box2.height) -
            Math.max(box1.y, box2.y)
        );

        const intersectionArea = xOverlap * yOverlap;
        const box1Area = box1.width * box1.height;
        const box2Area = box2.width * box2.height;
        const unionArea = box1Area + box2Area - intersectionArea;

        return unionArea > 0 ? intersectionArea / unionArea : 0;
    },

    /**
     * Merge overlapping bounding boxes into one
     */
    mergeBoundingBoxes(boxes: Coordinates[]): Coordinates {
        if (boxes.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        if (boxes.length === 1) {
            return { ...boxes[0] };
        }

        const minX = Math.min(...boxes.map(b => b.x));
        const minY = Math.min(...boxes.map(b => b.y));
        const maxX = Math.max(...boxes.map(b => b.x + b.width));
        const maxY = Math.max(...boxes.map(b => b.y + b.height));

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
};

export default CoordinateTransformer;
