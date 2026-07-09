/**
 * Shared types and constants for PDF template sub-components.
 * Every section receives a subset of these via props.
 */

export interface PdfColors {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    accent: string;
    text: string;
    textMuted: string;
    textLight: string;
    white: string;
    surface: string;
    border: string;
    borderLight: string;
}

export interface PdfTemplateSpacing {
    contentPaddingX: number;
    headerToIntroGap: number;
    introToBodyGap: number;
    sectionSpacing: number;
    pricingTableGap: number;
    tableRowHeight: number;
    rowPaddingY: number;
}

/**
 * Default legal text rendered above the signature lines on proposals, LOIs, and
 * change orders (Natalia 2026-07-09 — "mass update to be this as default").
 *
 * Single source of truth: the PDF fallback (PdfSignatureBlock) and the form's
 * "Load default" button (Screens.tsx) both read this, so the document a client
 * sees always matches what the editor offers.
 *
 * NOT used by the Service Contract path — PdfServiceContract renders its
 * template's own verbatim signature language ("the Work", tax-excluded terms).
 */
export const DEFAULT_SIGNATURE_BLOCK_TEXT = `Please sign to indicate Purchaser’s agreement to purchase the Display System as described herein and to authorize ANC to commence production.

If, for any reason, Purchaser terminates this Agreement prior to the completion of the work, ANC will immediately cease all work and Purchaser will pay ANC for any work performed, work in progress, and materials purchased, if any. This document will be considered binding on both parties; however, it will be followed by a formal agreement containing standard contract language, including terms of liability, indemnification, and warranty. Payment is due within thirty (30) days of ANC’s invoice(s).`;
