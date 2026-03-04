/**
 * PricingTable Types - Enterprise-grade data model for Natalia's Mirror Mode
 *
 * This is the SINGLE SOURCE OF TRUTH for all pricing data flowing to PDF templates.
 * Any Excel format (Margin Analysis, Bid Form, etc.) gets normalized to this structure.
 */

export interface PricingLineItem {
  /** Line item description (e.g., "LG Product Cost: Ceiling LED Video Displays") */
  description: string;

  /** Selling price to client (Cost and Margin are NEVER exposed in client PDF) */
  sellingPrice: number;

  /** Internal cost from Excel — used only in internal Margin Analysis export, never in client PDF */
  cost?: number;

  /** If true, show "INCLUDED" badge instead of $0.00 */
  isIncluded: boolean;

  /** If true, the original Excel cell said "Excluded" */
  isExcluded?: boolean;

  /** Original text from Excel cell ("Excluded", "Included", "N/A", "TBD", etc.) — displayed as-is in PDF */
  textValue?: string;

  /** Original row index from Excel (for debugging/auditing) */
  sourceRow?: number;

  /** True if this row was hidden in the original Excel */
  isHidden?: boolean;
}

export interface AlternateItem {
  /** Alternate description (e.g., "LG Product Cost: Change to 3.91mm Display") */
  description: string;

  /** Price difference - NEGATIVE means savings (e.g., -434677) */
  priceDifference: number;

  /** Original row index from Excel */
  sourceRow?: number;
}

export interface TaxInfo {
  /** Display label (e.g., "Tax 13%", "HST 13%") */
  label: string;

  /** Tax rate as decimal (e.g., 0.13 for 13%) */
  rate: number;

  /** Calculated tax amount */
  amount: number;
}

export interface PricingTable {
  /** Unique identifier for this table */
  id: string;

  /** Table header/location name (e.g., "G9 CEILING LED DISPLAYS") */
  name: string;

  /** Currency code detected from sheet name or content */
  currency: "CAD" | "USD" | "GBP" | "EUR";

  /** All line items in this pricing table */
  items: PricingLineItem[];

  /** Subtotal before tax (sum of all items) */
  subtotal: number;

  /** Tax information (null if no tax row found) */
  tax: TaxInfo | null;

  /** Bond amount (often $0) */
  bond: number;

  /** Grand total including tax and bond */
  grandTotal: number;

  /** Alternate options for this table (rendered separately) */
  alternates: AlternateItem[];

  /** Starting row in Excel (for debugging) */
  sourceStartRow?: number;

  /** Ending row in Excel (for debugging) */
  sourceEndRow?: number;
}

export interface PricingDocument {
  /** All pricing tables extracted from the Excel */
  tables: PricingTable[];

  /** Detected pricing mode */
  mode: "MIRROR" | "CALCULATED";

  /** Source sheet name (e.g., "Margin Analysis (CAD)") */
  sourceSheet: string;

  /** Currency detected from sheet name or content */
  currency: "CAD" | "USD" | "GBP" | "EUR";

  /** Combined grand total across all tables */
  documentTotal: number;

  /** Resp Matrix / Statement of Work (null if no sheet found) */
  respMatrix?: RespMatrix | null;

  /** Import metadata */
  metadata: {
    importedAt: string;
    fileName: string;
    tablesCount: number;
    itemsCount: number;
    alternatesCount: number;
    warnings?: string[];
    validation?: PricingValidationReport;
    parserStrictVersion?: string;
    sourceWorkbookHash?: string;
  };
}

export interface PricingValidationEvidence {
  marginSheetDetected: string | null;
  headerRowIndex: number | null;
  sectionCount: number;
  respMatrixSheetCandidates: string[];
  respMatrixSheetUsed: string | null;
  respMatrixCategoryCount: number;
}

export interface PricingValidationReport {
  status: "PASS" | "FAIL";
  strict: boolean;
  errors: string[];
  warnings: string[];
  evidence: PricingValidationEvidence;
}

// ============================================================================
// RESP MATRIX (Statement of Work)
// ============================================================================

export interface RespMatrixItem {
  /** Full text from column B */
  description: string;
  /** "X", "Include Statement", "Included Statement", "NA", "", or custom text */
  anc: string;
  /** "X", "", "Editable", or custom text like "X (PCL)" */
  purchaser: string;
}

export interface RespMatrixCategory {
  /** Category name, e.g. "PHYSICAL INSTALLATION" */
  name: string;
  /** All items under this category */
  items: RespMatrixItem[];
}

export interface RespMatrix {
  /** Project name from row 1-2 */
  projectName: string;
  /** Date from row 2-3 */
  date: string;
  /** Detected rendering format */
  format: "short" | "long" | "hybrid";
  /** Parsed categories with items */
  categories: RespMatrixCategory[];
}

/**
 * Helper to create a unique table ID
 */
export function createTableId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return `table-${index}-${slug}`;
}

/**
 * Helper to detect currency from sheet name or content
 */
export function detectCurrency(sheetName: string, content?: string): "CAD" | "USD" | "GBP" | "EUR" {
  const text = `${sheetName} ${content || ""}`.toUpperCase();
  if (text.includes("GBP") || text.includes("BRITISH") || text.includes("POUND") || text.includes("£")) return "GBP";
  if (text.includes("EUR") || text.includes("EURO") || text.includes("€")) return "EUR";
  if (text.includes("CAD") || text.includes("CANADIAN")) return "CAD";
  if (text.includes("USD") || text.includes("US DOLLAR")) return "USD";
  // Default to USD if not specified
  return "USD";
}

/**
 * Helper to format currency for display
 */
export function formatPricingCurrency(amount: number, currency: "CAD" | "USD" | "GBP" | "EUR"): string {
  const locale = currency === "CAD" ? "en-CA" : currency === "GBP" ? "en-GB" : currency === "EUR" ? "de-DE" : "en-US";
  const roundedAmount = Math.round(amount);
  const normalizedAmount = Object.is(roundedAmount, -0) ? 0 : roundedAmount;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(normalizedAmount);
}
