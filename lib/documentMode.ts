import { DOCUMENT_MODES } from "@/services/rfp/productCatalog";
import type { DocumentMode as CatalogDocumentMode } from "@/services/rfp/productCatalog";

export type DocumentMode = "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT" | "CHANGE_ORDER";

// Change Order config lives here (not in the RFP-protected productCatalog) so the shared module stays frozen.
const CHANGE_ORDER_CONFIG = {
  headerText: "CHANGE ORDER",
  includeSignatures: true,
  includePaymentTerms: true,
  includeLegalIntro: true,
  includeProjectSummaryFirst: false,
  includeResponsibilityMatrix: false,
};

export function getModeConfig(mode: DocumentMode) {
  if (mode === "CHANGE_ORDER") return CHANGE_ORDER_CONFIG;
  return DOCUMENT_MODES[mode.toLowerCase() as CatalogDocumentMode] || DOCUMENT_MODES.proposal;
}

export function resolveDocumentMode(details: any): DocumentMode {
  const explicit = details?.documentMode;
  if (
    explicit === "BUDGET" ||
    explicit === "PROPOSAL" ||
    explicit === "LOI" ||
    explicit === "CONTRACT" ||
    explicit === "CHANGE_ORDER"
  ) return explicit;

  const documentType = details?.documentType;
  if (documentType === "LOI") return "LOI";
  if (documentType === "CONTRACT") return "CONTRACT";
  if (documentType === "CHANGE_ORDER" || documentType === "Change Order") return "CHANGE_ORDER";

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

  const config = getModeConfig(mode);

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
    if (base.showSubstantialCompletionDate === undefined) base.showSubstantialCompletionDate = mode === "CONTRACT";
    if (base.showTermsAndConditions === undefined) base.showTermsAndConditions = mode === "CONTRACT";
    return base;
  }

  // CHANGE_ORDER defaults — amends an existing contract; signatures + payment terms on, no Exhibits, no responsibility matrix.
  if (mode === "CHANGE_ORDER") {
    if (base.showExhibitA === undefined) base.showExhibitA = false;
    if (base.showExhibitB === undefined) base.showExhibitB = false;
    if (base.showSpecifications === undefined) base.showSpecifications = false;
    if (base.showSubstantialCompletionDate === undefined) base.showSubstantialCompletionDate = false;
    if (base.showTermsAndConditions === undefined) base.showTermsAndConditions = false;
    if (base.showResponsibilityMatrix === undefined) base.showResponsibilityMatrix = false;
    if (base.showChangeOrderTotals === undefined) base.showChangeOrderTotals = true;
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

  const config = getModeConfig(mode);

  // Strict: Overwrite these toggles to match the new mode's config
  base.showPaymentTerms = config.includePaymentTerms;
  base.showSignatureBlock = config.includeSignatures;
  if (mode === "CONTRACT") {
    base.showSubstantialCompletionDate = true;
    base.showTermsAndConditions = true;
  } else if (mode === "LOI") {
    base.showSubstantialCompletionDate = false;
    base.showTermsAndConditions = false;
  }

  return base;
}
