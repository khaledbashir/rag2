/**
 * Service-sheet Mirror Mode — shared types.
 *
 * A "service sheet" is Natalia's Property/Event Budget Overview workbook shape
 * (e.g. "Carolina Panthers 2026-2028 Service Contract.xlsx"): an Income section
 * whose column-B line items are client-facing, per-contract-year value columns
 * (2, 3, 5, 10 years — variable), and everything from the Expenses row down
 * internal-only (costs, EBITDA, capex, depreciation, % return).
 *
 * Mirror rule applies: values are carried exactly as Excel displays them —
 * no math, no recalculation. The client-facing output is the Service Proposal
 * fee table (ITEM × contract years + YEARLY TOTAL).
 */

export interface ServicePricingCell {
  /** Raw cell value from Excel (cached formula result). */
  raw: number | string | null;
  /** Exactly what Excel displays (cell.w when available, else formatted raw). */
  display: string;
}

export type ServicePricingRowKind = "line" | "note";

export interface ServicePricingRow {
  /** Column-B label, verbatim. */
  label: string;
  /** One cell per contract-year column, aligned with yearLabels. */
  cells: ServicePricingCell[];
  /**
   * "line" = client-facing fee line. "note" = footnote-style row (e.g.
   * "*20% Bundle Discount Added") rendered under the table, never as a fee row.
   */
  kind: ServicePricingRowKind;
  /** 0-based source row index in the sheet (diagnostics). */
  sourceRow: number;
}

export interface ServicePricingTotalRow {
  /** Verbatim Excel label (e.g. "TOTAL INCOME"). Renderers may relabel for client output. */
  label: string;
  cells: ServicePricingCell[];
  sourceRow: number;
}

export interface ServicePricingDocument {
  sourceSheet: string;
  fileName: string;
  /** Client/team name from the sheet's "Team:" row or the file name. */
  clientName: string | null;
  /** Contract-year column labels, verbatim (e.g. ["26/27", "27/28"]). */
  yearLabels: string[];
  /** Client-facing rows: column B from below Income: to above the Expenses row. */
  rows: ServicePricingRow[];
  /** The Excel total row for the client-facing block, when present. */
  totalRow: ServicePricingTotalRow | null;
  /** Number of contract years = yearLabels.length. */
  termYears: number;
  /** Term start/end years when derivable (file name "2026-2028", sheet "26-28"). */
  termStartYear: number | null;
  termEndYear: number | null;
  currency: "CAD" | "USD" | "GBP" | "EUR";
  metadata: {
    importedAt: string;
    warnings: string[];
  };
}

/** Prefill values recognized from the workbook for the Service Proposal/Contract setup. */
export interface ServiceSheetPrefill {
  clientName: string | null;
  venueName: string | null;
  venueAddress: string | null;
  /** League when the client resolves to a known team (drives intro prose). */
  league: string | null;
  termYears: number;
  termStartYear: number | null;
  termEndYear: number | null;
}

export interface ServiceSheetParseResult {
  document: ServicePricingDocument;
  prefill: ServiceSheetPrefill;
}
