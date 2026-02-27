/**
 * rfpWorkbookBuilder — Transforms RFP analyzer client state into WorkbookData.
 *
 * Builds 6 interactive sheets + 4 placeholder sheets, mirroring the structure
 * of the downloadable scoping workbook (generateScopingWorkbook.ts).
 */

import type { WorkbookData, SheetTab, SheetRow, SheetCell } from "@/app/components/reusables/workbookTypes";
import type { ExtractedLEDSpec, ExtractedRequirement } from "@/services/rfp/unified/types";

// ═══════════════════════════════════════════════════════════════════════════
// Input types
// ═══════════════════════════════════════════════════════════════════════════

export interface PricingDisplay {
  name: string;
  location?: string;
  pixelPitch: number | null;
  areaSqFt: number;
  quantity: number;
  hardwareCost: number;
  installCost?: number;
  pmCost?: number;
  engCost?: number;
  totalCost: number;
  totalSellingPrice: number;
  blendedMarginPct: number;
  costSource: string;
  rateCardEstimate: number | null;
  matchedProduct: { manufacturer: string; model: string; fitScore: number } | null;
}

export interface PricingSummary {
  totalCost: number;
  totalSellingPrice: number;
  totalMargin: number;
  blendedMarginPct: number;
  displayCount: number;
  quotedCount: number;
  rateCardCount: number;
}

export interface BidFormMatchResult {
  matches: Array<{ sheetName: string; displayName: string; matchedScreen: string; confidence: number; fieldsFilled: string[] }>;
  unmatchedBlocks: string[];
  unmatchedScreens: string[];
}

export interface RfpWorkbookInput {
  project: {
    clientName: string | null;
    projectName: string | null;
    venue: string | null;
    location: string | null;
    isOutdoor: boolean;
    isUnionLabor: boolean;
    bondRequired: boolean;
    specialRequirements: string[];
  };
  screens: ExtractedLEDSpec[];
  requirements: ExtractedRequirement[];
  triage: Array<{ pageNumber: number; category: string; relevance: number; isDrawing: boolean }>;
  pricingDisplays: PricingDisplay[];
  pricingSummary: PricingSummary | null;
  bidFormResult?: BidFormMatchResult | null;
  /** Callback for source page jumps (passed as onClick on cells) */
  onSourcePageClick?: (page: number) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function c(value: string | number, opts?: Partial<SheetCell>): SheetCell {
  return { value, ...opts };
}

function curr(value: number, opts?: Partial<SheetCell>): SheetCell {
  return { value, currency: true, align: "right", ...opts };
}

function pct(value: number, opts?: Partial<SheetCell>): SheetCell {
  return { value, percent: true, align: "center", ...opts };
}

function num(value: number | null | undefined, opts?: Partial<SheetCell>): SheetCell {
  return { value: value ?? "", align: "right", ...opts };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet 1: LED Cost Sheet
// ═══════════════════════════════════════════════════════════════════════════

function buildLedCostSheet(input: RfpWorkbookInput): SheetTab {
  const cols = ["Display", "Vendor", "Pitch", "W (ft)", "H (ft)", "W (px)", "H (px)", "Qty", "Total SqFt", "$/sqft", "Total Cost"];

  // Header row
  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  // Data rows
  const dataRows: SheetRow[] = input.screens.map((spec, i) => {
    const pitch = spec.pixelPitchMm ?? 0;
    const wFt = spec.widthFt ?? 0;
    const hFt = spec.heightFt ?? 0;
    const wPx = spec.widthPx ?? (pitch > 0 ? Math.round(wFt * 304.8 / pitch) : 0);
    const hPx = spec.heightPx ?? (pitch > 0 ? Math.round(hFt * 304.8 / pitch) : 0);
    const areaSqFt = wFt * hFt;
    const qty = spec.quantity || 1;
    const totalSqFt = Math.round(areaSqFt * qty * 100) / 100;

    // Try to find matching pricing display
    const pd = input.pricingDisplays.find((d) => d.name === spec.name);
    const hwCost = pd?.hardwareCost ?? 0;
    const costPerSqFt = areaSqFt > 0 ? hwCost / (areaSqFt * qty) : 0;

    // Vendor match
    const vendor = pd?.matchedProduct
      ? `${pd.matchedProduct.manufacturer} ${pd.matchedProduct.model}`
      : "";

    // Source page click
    const sourcePages = spec.sourcePages || [];
    const firstPage = sourcePages[0];

    return {
      cells: [
        c(spec.name, {
          bold: true,
          onClick: firstPage && input.onSourcePageClick ? () => input.onSourcePageClick!(firstPage) : undefined,
        }),
        c(vendor),
        c(pitch > 0 ? `${pitch}mm` : "", { align: "center" }),
        num(wFt > 0 ? wFt : null),
        num(hFt > 0 ? hFt : null),
        num(wPx > 0 ? wPx : null),
        num(hPx > 0 ? hPx : null),
        num(qty, { align: "center" }),
        num(totalSqFt > 0 ? totalSqFt : null),
        curr(costPerSqFt > 0 ? costPerSqFt : 0),
        curr(hwCost, { bold: true }),
      ],
    };
  });

  // Total row
  const totalHwCost = input.pricingDisplays.reduce((s, d) => s + d.hardwareCost, 0);
  const totalSqFtAll = input.screens.reduce((s, spec) => {
    const w = spec.widthFt ?? 0;
    const h = spec.heightFt ?? 0;
    return s + (w * h * (spec.quantity || 1));
  }, 0);
  const totalRow: SheetRow = {
    cells: [
      c(`TOTAL (${input.screens.length} displays)`, { bold: true }),
      c(""), c(""), c(""), c(""), c(""), c(""), c(""),
      num(Math.round(totalSqFtAll * 100) / 100, { bold: true }),
      c(""),
      curr(totalHwCost, { bold: true, highlight: true }),
    ],
    isTotal: true,
  };

  return {
    name: "LED Cost Sheet",
    color: "#0A52EF",
    columns: cols,
    rows: [headerRow, ...dataRows, { cells: [], isSeparator: true }, totalRow],
    editableColumns: [0, 3, 4, 7], // Display name, W(ft), H(ft), Qty
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet 2: Margin Analysis
// ═══════════════════════════════════════════════════════════════════════════

function buildMarginAnalysis(input: RfpWorkbookInput): SheetTab {
  const cols = ["Display", "LED Hardware", "Install", "PM / GC", "Engineering", "Total Cost", "Margin %", "Selling Price"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const dataRows: SheetRow[] = input.pricingDisplays.map((d) => ({
    cells: [
      c(d.name, { bold: true }),
      curr(d.hardwareCost),
      curr(d.installCost ?? 0),
      curr(d.pmCost ?? 0),
      curr(d.engCost ?? 0),
      curr(d.totalCost, { bold: true }),
      pct(d.blendedMarginPct, {
        className: d.blendedMarginPct >= 0.25
          ? "text-emerald-600"
          : d.blendedMarginPct >= 0.15
            ? "text-amber-600"
            : "text-red-600",
      }),
      curr(d.totalSellingPrice, { bold: true }),
    ],
  }));

  const summary = input.pricingSummary;
  const totalRow: SheetRow = {
    cells: [
      c("PROJECT TOTAL", { bold: true }),
      curr(input.pricingDisplays.reduce((s, d) => s + d.hardwareCost, 0)),
      curr(input.pricingDisplays.reduce((s, d) => s + (d.installCost ?? 0), 0)),
      curr(input.pricingDisplays.reduce((s, d) => s + (d.pmCost ?? 0), 0)),
      curr(input.pricingDisplays.reduce((s, d) => s + (d.engCost ?? 0), 0)),
      curr(summary?.totalCost ?? 0, { bold: true, highlight: true }),
      pct(summary ? summary.blendedMarginPct / 100 : 0, { bold: true }),
      curr(summary?.totalSellingPrice ?? 0, { bold: true, highlight: true }),
    ],
    isTotal: true,
  };

  return {
    name: "Margin Analysis",
    color: "#217346",
    columns: cols,
    rows: summary
      ? [headerRow, ...dataRows, { cells: [], isSeparator: true }, totalRow]
      : [headerRow, { cells: [c("Run pricing preview to populate", { span: cols.length, align: "center" })], isSeparator: false }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet 3: Project Info
// ═══════════════════════════════════════════════════════════════════════════

function buildProjectInfo(input: RfpWorkbookInput): SheetTab {
  const cols = ["Field", "Value"];
  const p = input.project;

  const rows: SheetRow[] = [
    { cells: [c("PROJECT INFORMATION", { bold: true, header: true, span: 2 })], isHeader: true },
    { cells: [], isSeparator: true },
    { cells: [c("Client", { bold: true }), c(p.clientName || "—")] },
    { cells: [c("Project Name", { bold: true }), c(p.projectName || "—")] },
    { cells: [c("Venue", { bold: true }), c(p.venue || "—")] },
    { cells: [c("Location", { bold: true }), c(p.location || "—")] },
    { cells: [], isSeparator: true },
    { cells: [c("SITE CONDITIONS", { bold: true, header: true, span: 2 })], isHeader: true },
    { cells: [], isSeparator: true },
    { cells: [c("Environment", { bold: true }), c(p.isOutdoor ? "OUTDOOR" : "INDOOR", {
      bold: true,
      className: p.isOutdoor ? "text-amber-600" : "text-blue-600",
    })] },
    { cells: [c("Union Labor", { bold: true }), c(p.isUnionLabor ? "YES" : "No", {
      bold: p.isUnionLabor,
      className: p.isUnionLabor ? "text-red-600" : "",
    })] },
    { cells: [c("Bond Required", { bold: true }), c(p.bondRequired ? "YES" : "No", {
      bold: p.bondRequired,
      className: p.bondRequired ? "text-red-600" : "",
    })] },
  ];

  if (p.specialRequirements.length > 0) {
    rows.push({ cells: [], isSeparator: true });
    rows.push({ cells: [c("SPECIAL REQUIREMENTS", { bold: true, header: true, span: 2 })], isHeader: true });
    rows.push({ cells: [], isSeparator: true });
    p.specialRequirements.forEach((req, i) => {
      rows.push({ cells: [c(`${i + 1}`, { align: "center" }), c(req)] });
    });
  }

  return {
    name: "Project Info",
    color: "#6366F1",
    columns: cols,
    rows,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet 4: Requirements
// ═══════════════════════════════════════════════════════════════════════════

function buildRequirements(input: RfpWorkbookInput): SheetTab {
  const cols = ["Priority", "Category", "Description", "Source"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const dataRows: SheetRow[] = input.requirements.map((r) => ({
    cells: [
      c((r.status || "info").toUpperCase(), {
        bold: true,
        align: "center",
        className: r.status === "critical"
          ? "text-red-600"
          : r.status === "risk"
            ? "text-amber-600"
            : r.status === "verified"
              ? "text-emerald-600"
              : "text-blue-600",
      }),
      c(r.category || "General"),
      c(r.text),
      c(r.sourcePages?.join(", ") ?? "", {
        align: "center",
        onClick: r.sourcePages?.[0] && input.onSourcePageClick
          ? () => input.onSourcePageClick!(r.sourcePages![0])
          : undefined,
      }),
    ],
  }));

  if (dataRows.length === 0) {
    dataRows.push({
      cells: [c("No requirements extracted", { span: cols.length, align: "center" })],
    });
  }

  return {
    name: "Requirements",
    color: "#F59E0B",
    columns: cols,
    rows: [headerRow, ...dataRows],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet 5: Processor Count
// ═══════════════════════════════════════════════════════════════════════════

function buildProcessorCount(input: RfpWorkbookInput): SheetTab {
  const cols = ["Display", "W (px)", "H (px)", "Total Pixels", "Ports Needed", "Processors"];

  // Reference header
  const refRow: SheetRow = {
    cells: [c("NovaStar 660 Pro: 8 ports × 650K px/port", { span: cols.length, bold: true, header: true })],
    isHeader: true,
  };

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const dataRows: SheetRow[] = input.screens.map((spec) => {
    const pitch = spec.pixelPitchMm ?? 0;
    const wFt = spec.widthFt ?? 0;
    const hFt = spec.heightFt ?? 0;
    const wPx = spec.widthPx ?? (pitch > 0 ? Math.round(wFt * 304.8 / pitch) : 0);
    const hPx = spec.heightPx ?? (pitch > 0 ? Math.round(hFt * 304.8 / pitch) : 0);
    const qty = spec.quantity || 1;
    const totalPx = wPx * hPx * qty;
    const ports = totalPx > 0 ? Math.ceil(totalPx / 650000) : 0;
    const processors = ports > 0 ? Math.ceil(ports / 8) : 0;

    return {
      cells: [
        c(spec.name, { bold: true }),
        num(wPx > 0 ? wPx : null),
        num(hPx > 0 ? hPx : null),
        num(totalPx > 0 ? totalPx : null),
        num(ports > 0 ? ports : null, { align: "center" }),
        num(processors > 0 ? processors : null, { align: "center", bold: true }),
      ],
    };
  });

  // Total
  const totalProcessors = input.screens.reduce((sum, spec) => {
    const pitch = spec.pixelPitchMm ?? 0;
    const wPx = spec.widthPx ?? (pitch > 0 ? Math.round((spec.widthFt ?? 0) * 304.8 / pitch) : 0);
    const hPx = spec.heightPx ?? (pitch > 0 ? Math.round((spec.heightFt ?? 0) * 304.8 / pitch) : 0);
    const totalPx = wPx * hPx * (spec.quantity || 1);
    const ports = totalPx > 0 ? Math.ceil(totalPx / 650000) : 0;
    return sum + (ports > 0 ? Math.ceil(ports / 8) : 0);
  }, 0);

  const totalRow: SheetRow = {
    cells: [
      c("TOTAL PROCESSORS NEEDED", { bold: true }),
      c(""), c(""), c(""), c(""),
      num(totalProcessors, { bold: true, highlight: true, align: "center" }),
    ],
    isTotal: true,
  };

  return {
    name: "Processor Count",
    color: "#8B5CF6",
    columns: cols,
    rows: [refRow, { cells: [], isSeparator: true }, headerRow, ...dataRows, { cells: [], isSeparator: true }, totalRow],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet 6: Page Triage
// ═══════════════════════════════════════════════════════════════════════════

function buildPageTriage(input: RfpWorkbookInput): SheetTab {
  const cols = ["Page", "Category", "Relevance", "Drawing"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const dataRows: SheetRow[] = input.triage.map((t) => ({
    cells: [
      c(t.pageNumber, {
        align: "center",
        onClick: input.onSourcePageClick ? () => input.onSourcePageClick!(t.pageNumber) : undefined,
      }),
      c(t.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())),
      c(`${t.relevance}%`, {
        align: "center",
        className: t.relevance >= 70 ? "text-emerald-600" : t.relevance >= 40 ? "text-amber-600" : "text-muted-foreground",
      }),
      c(t.isDrawing ? "YES" : "", {
        align: "center",
        bold: t.isDrawing,
        className: t.isDrawing ? "text-blue-600" : "",
      }),
    ],
  }));

  return {
    name: "Page Triage",
    color: "#94A3B8",
    columns: cols,
    rows: [headerRow, ...dataRows],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet 7: Bid Form (shows match results when a bid form was auto-filled)
// ═══════════════════════════════════════════════════════════════════════════

function buildBidFormSheet(input: RfpWorkbookInput): SheetTab | null {
  if (!input.bidFormResult) return null;

  const cols = ["Bid Form Display", "Matched Screen", "Confidence", "Fields Filled", "Status"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const matchRows: SheetRow[] = input.bidFormResult.matches.map((m) => ({
    cells: [
      c(m.displayName, { bold: true }),
      c(m.matchedScreen),
      pct(m.confidence, {
        className: m.confidence >= 0.8 ? "text-emerald-600" : m.confidence >= 0.5 ? "text-amber-600" : "text-red-600",
      }),
      c(`${m.fieldsFilled.length} fields`),
      c("Filled", { bold: true, className: "text-emerald-600" }),
    ],
  }));

  const unmatchedBlockRows: SheetRow[] = input.bidFormResult.unmatchedBlocks.map((b) => ({
    cells: [
      c(b, { bold: true }),
      c("—"),
      c("—"),
      c("0 fields"),
      c("Unmatched", { bold: true, className: "text-amber-600" }),
    ],
  }));

  const unmatchedScreenRows: SheetRow[] = input.bidFormResult.unmatchedScreens.map((s) => ({
    cells: [
      c("—"),
      c(s, { bold: true }),
      c("—"),
      c("—"),
      c("No bid form block", { className: "text-muted-foreground" }),
    ],
  }));

  const summaryRow: SheetRow = {
    cells: [
      c(`${input.bidFormResult.matches.length} matched`, { bold: true }),
      c(`${input.bidFormResult.unmatchedBlocks.length} unmatched blocks`),
      c(""),
      c(""),
      c("Filled bid form downloaded", { bold: true }),
    ],
    isTotal: true,
  };

  return {
    name: "Bid Form",
    color: "#D97706",
    columns: cols,
    rows: [headerRow, ...matchRows, ...unmatchedBlockRows, ...unmatchedScreenRows, { cells: [], isSeparator: true }, summaryRow],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main builder
// ═══════════════════════════════════════════════════════════════════════════

export function buildRfpWorkbook(input: RfpWorkbookInput): WorkbookData {
  const projectLabel = input.project.projectName || input.project.venue || "RFP Analysis";

  const bidFormSheet = buildBidFormSheet(input);

  const sheets: SheetTab[] = [
    buildLedCostSheet(input),
    buildMarginAnalysis(input),
    ...(bidFormSheet ? [bidFormSheet] : []),
    buildProjectInfo(input),
    buildRequirements(input),
    buildProcessorCount(input),
    buildPageTriage(input),
    // Placeholder sheets — available in downloaded workbook
    { name: "P&L", color: "#F59E0B", columns: ["Revenue", "Budget", "Margin"], rows: [], placeholder: true, placeholderMessage: "P&L available in Full Scoping Workbook download" },
    { name: "Cash Flow", color: "#F59E0B", columns: ["Month", "Revenue", "Expenses"], rows: [], placeholder: true, placeholderMessage: "Cash flow projections available in Full Scoping Workbook download" },
    { name: "PO's", color: "#F59E0B", columns: ["PO #", "Vendor", "Amount"], rows: [], placeholder: true, placeholderMessage: "Purchase order tracking available in Full Scoping Workbook download" },
    { name: "Travel", color: "#F59E0B", columns: ["Category", "Cost", "Qty"], rows: [], placeholder: true, placeholderMessage: "Travel budget available in Full Scoping Workbook download" },
  ];

  return {
    fileName: `ANC_${(input.project.clientName || projectLabel).replace(/\s+/g, "_")}_Scoping.xlsx`,
    sheets,
  };
}
