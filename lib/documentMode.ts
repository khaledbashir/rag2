import { DOCUMENT_MODES } from "@/services/rfp/productCatalog";
import type { DocumentMode as CatalogDocumentMode } from "@/services/rfp/productCatalog";

export type DocumentMode = "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT";

export function resolveDocumentMode(details: any): DocumentMode {
  const explicit = details?.documentMode;
  if (explicit === "BUDGET" || explicit === "PROPOSAL" || explicit === "LOI" || explicit === "CONTRACT") return explicit;

  const documentType = details?.documentType;
  if (documentType === "LOI") return "LOI";
  if (documentType === "CONTRACT") return "CONTRACT";

  const pricingType = details?.pricingType;
  if (pricingType === "Hard Quoted") return "PROPOSAL";

  return "BUDGET";
}

/**
 * Apply document mode defaults - HYBRID TEMPLATE APPROACH
 *
 * Derives defaults from DOCUMENT_MODES config in productCatalog.ts (single source of truth).
 * In the Hybrid Template, Notes, Scope of Work, and Signatures are
 * OPTIONAL for ALL document types (Budget, Proposal, LOI, Contract).
 *
 * We only set defaults if the values are undefined - we don't force
 * them based on document type anymore. Users can toggle any section
 * regardless of document mode.
 */
export function applyDocumentModeDefaults(mode: DocumentMode, current: any) {
  const base = { ...(current || {}) };
  base.documentMode = mode;

  const catalogMode = mode.toLowerCase() as CatalogDocumentMode;
  const config = DOCUMENT_MODES[catalogMode] || DOCUMENT_MODES.proposal;

  // Only set defaults if undefined - respect user's explicit choices
  // This allows universal toggles for all document types
  if (base.showPaymentTerms === undefined) base.showPaymentTerms = config.includePaymentTerms;
  if (base.showSignatureBlock === undefined) base.showSignatureBlock = config.includeSignatures;
  if (base.showNotes === undefined) base.showNotes = true;
  if (base.showScopeOfWork === undefined) base.showScopeOfWork = false;

  if (mode === "LOI" || mode === "CONTRACT") {
    if (base.showExhibitA === undefined) base.showExhibitA = true;
    if (base.showExhibitB === undefined) base.showExhibitB = true;
    if (base.showSpecifications === undefined) base.showSpecifications = false;
    return base;
  }

  // Budget and Proposal shared defaults
  if (base.showSpecifications === undefined) base.showSpecifications = true;
  if (base.showExhibitB === undefined) base.showExhibitB = false;

  if (mode === "PROPOSAL") {
    if (base.showExhibitA === undefined) base.showExhibitA = true;
    return base;
  }

  // BUDGET defaults
  if (base.showExhibitA === undefined) base.showExhibitA = false;
  return base;
}

/**
 * Force apply document mode defaults (strict overwrite)
 * used when user explicitly changes mode via UI
 */
export function forceDocumentModeDefaults(mode: DocumentMode, current: any) {
  // First get the standard defaults (fills gaps)
  const base = applyDocumentModeDefaults(mode, current);

  const catalogMode = mode.toLowerCase() as CatalogDocumentMode;
  const config = DOCUMENT_MODES[catalogMode] || DOCUMENT_MODES.proposal;

  // Strict: Overwrite these toggles to match the new mode's config
  base.showPaymentTerms = config.includePaymentTerms;
  base.showSignatureBlock = config.includeSignatures;

  return base;
}
