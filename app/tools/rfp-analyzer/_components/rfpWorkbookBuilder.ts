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
  processorCost?: number;
  shippingCost?: number;
  installCost?: number;
  structuralCost?: number;
  pmCost?: number;
  engCost?: number;
  totalCost: number;
  totalSellingPrice: number;
  blendedMarginPct: number;
  costSource: string;
  rateCardEstimate: number | null;
  matchedProduct: {
    manufacturer: string; model: string; pitch: number; fitScore: number;
    activeWidthFt?: number; activeHeightFt?: number;
    resolutionX?: number; resolutionY?: number;
  } | null;
  isCustom?: boolean;
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

export interface SpecMismatchItem {
  displayName: string;
  field: string;
  pdfValue: string | number | null;
  bidFormValue: string | number | null;
  severity: "critical" | "warning";
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
  /** RFP vs bid form spec discrepancies */
  specMismatches?: SpecMismatchItem[];
  /** Callback for source page jumps (passed as onClick on cells) */
  onSourcePageClick?: (page: number) => void;
  /** Available products for dropdown selector */
  availableProducts?: Array<{ id: string; label: string; pitch: number; name: string }>;
  /** Callback when user selects a product for a display */
  onProductSelect?: (displayName: string, productId: string) => void;
  /** Callback to add a custom line item to Margin Analysis */
  onAddLineItem?: () => void;
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
  // ANC format: Display | Vendor | Product | Pitch | H(ft) | W(ft) | H(px) | W(px) | SqFt/Screen | Qty | Total SqFt | NITs | Service | $/SqFt | Display Cost | Processor | Shipping | Total Cost | Margin % | Selling Price
  const cols = [
    "Display", "Vendor", "Product", "Pitch",
    "H (ft)", "W (ft)", "H (px)", "W (px)",
    "SqFt/Screen", "Qty", "Total SqFt",
    "NITs", "Service",
    "$/SqFt", "Display Cost", "Processor", "Shipping", "Total Cost",
    "Margin %", "Selling Price",
  ];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const dataRows: SheetRow[] = input.screens.map((spec) => {
    const bidPitch = spec.pixelPitchMm ?? 0;
    const bidW = spec.widthFt ?? 0;
    const bidH = spec.heightFt ?? 0;
    const bidWPx = spec.widthPx ?? (bidPitch > 0 ? Math.round(bidW * 304.8 / bidPitch) : 0);
    const bidHPx = spec.heightPx ?? (bidPitch > 0 ? Math.round(bidH * 304.8 / bidPitch) : 0);
    const qty = spec.quantity || 1;

    const pd = input.pricingDisplays.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;

    const activeH = mp?.activeHeightFt ?? bidH;
    const activeW = mp?.activeWidthFt ?? bidW;
    const activePxH = mp?.resolutionY ?? bidHPx;
    const activePxW = mp?.resolutionX ?? bidWPx;
    const sqFtPerScreen = activeH * activeW;
    const totalSqFt = sqFtPerScreen * qty;

    // Derive stable $/sqft rate from pricing data
    const pricingSqFt = pd?.areaSqFt ?? 0;
    const ratePerSqFt = pricingSqFt > 0 ? (pd?.hardwareCost ?? 0) / pricingSqFt : 0;
    const displayCost = ratePerSqFt * totalSqFt;
    const processorCost = pd?.processorCost ?? 0;
    const shippingCost = pd?.shippingCost ?? 0;
    const totalCost = displayCost + processorCost + shippingCost;
    const margin = pd?.blendedMarginPct ?? 0;
    const sellingPrice = margin > 0 ? totalCost / (1 - margin) : totalCost;

    const vendor = mp?.manufacturer ?? "";
    const productLabel = mp?.model ?? "";
    const nits = spec.brightnessNits ?? null;
    const serviceType = spec.serviceType ?? "";

    const sourcePages = spec.sourcePages || [];
    const firstPage = sourcePages[0];

    // Product dropdown
    const dropdownOpts = input.availableProducts
      ? [...input.availableProducts]
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((p) => ({ value: p.id, label: p.label }))
      : undefined;
    const matchedProductId = mp && input.availableProducts
      ? input.availableProducts.find((p) => p.name === mp.model || p.label === mp.model)?.id || ""
      : "";
    const productCell: SheetCell = dropdownOpts && dropdownOpts.length > 0
      ? {
          value: matchedProductId,
          dropdown: dropdownOpts,
          onDropdownChange: input.onProductSelect
            ? (val: string) => input.onProductSelect!(spec.name, val)
            : undefined,
        }
      : c(productLabel || "No match", {
          className: productLabel ? undefined : "text-red-500 italic text-[10px]",
        });

    return {
      cells: [
        c(spec.name, {
          bold: true,
          onClick: firstPage && input.onSourcePageClick ? () => input.onSourcePageClick!(firstPage) : undefined,
        }),
        c(vendor),
        productCell,
        c(bidPitch > 0 ? `${bidPitch}mm` : "", { align: "center" }),
        num(activeH > 0 ? Math.round(activeH * 100) / 100 : null),       // H(ft) — editable
        num(activeW > 0 ? Math.round(activeW * 100) / 100 : null),       // W(ft) — editable
        num(activePxH > 0 ? activePxH : null),
        num(activePxW > 0 ? activePxW : null),
        num(Math.round(sqFtPerScreen * 100) / 100 || null),
        num(qty, { align: "center" }),                                     // Qty — editable
        num(Math.round(totalSqFt * 100) / 100 || null),
        num(nits),
        c(serviceType || "—", { align: "center" }),
        curr(ratePerSqFt > 0 ? ratePerSqFt : 0),
        curr(displayCost),                                                 // Display Cost — editable
        curr(processorCost),                                               // Processor — editable
        curr(shippingCost),                                                // Shipping — editable
        curr(totalCost, { bold: true }),
        pct(margin, {
          className: margin >= 0.25 ? "text-emerald-600" : margin >= 0.15 ? "text-amber-600" : "text-red-600",
        }),                                                                // Margin % — editable
        curr(sellingPrice, { bold: true }),
      ],
    };
  });

  // Total row
  let totalDisplayCost = 0;
  let totalProcessorCost = 0;
  let totalShippingCost = 0;
  let totalSqFtAll = 0;
  input.screens.forEach((spec) => {
    const pd = input.pricingDisplays.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;
    const h = mp?.activeHeightFt ?? (spec.heightFt ?? 0);
    const w = mp?.activeWidthFt ?? (spec.widthFt ?? 0);
    const q = spec.quantity || 1;
    const sqFt = h * w * q;
    const pricingSqFt = pd?.areaSqFt ?? 0;
    const rate = pricingSqFt > 0 ? (pd?.hardwareCost ?? 0) / pricingSqFt : 0;
    totalDisplayCost += rate * sqFt;
    totalProcessorCost += pd?.processorCost ?? 0;
    totalShippingCost += pd?.shippingCost ?? 0;
    totalSqFtAll += sqFt;
  });
  const totalLedCost = totalDisplayCost + totalProcessorCost + totalShippingCost;
  // Blended margin for total
  const totalLedSell = input.screens.reduce((s, spec) => {
    const pd = input.pricingDisplays.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;
    const h = mp?.activeHeightFt ?? (spec.heightFt ?? 0);
    const w = mp?.activeWidthFt ?? (spec.widthFt ?? 0);
    const q = spec.quantity || 1;
    const sqFt = h * w * q;
    const pricingSqFt = pd?.areaSqFt ?? 0;
    const rate = pricingSqFt > 0 ? (pd?.hardwareCost ?? 0) / pricingSqFt : 0;
    const dc = rate * sqFt;
    const pc = pd?.processorCost ?? 0;
    const sc = pd?.shippingCost ?? 0;
    const tc = dc + pc + sc;
    const m = pd?.blendedMarginPct ?? 0;
    return s + (m > 0 ? tc / (1 - m) : tc);
  }, 0);
  const blendedMarginTotal = totalLedSell > 0 ? (totalLedSell - totalLedCost) / totalLedSell : 0;

  const totalRow: SheetRow = {
    cells: [
      c(`TOTAL (${input.screens.length} displays)`, { bold: true }),
      c(""), c(""), c(""),
      c(""), c(""), c(""), c(""),
      c(""),
      c(""),
      num(Math.round(totalSqFtAll * 100) / 100, { bold: true }),
      c(""), c(""), c(""),
      curr(totalDisplayCost, { bold: true }),
      curr(totalProcessorCost, { bold: true }),
      curr(totalShippingCost, { bold: true }),
      curr(totalLedCost, { bold: true, highlight: true }),
      pct(blendedMarginTotal, { bold: true }),
      curr(totalLedSell, { bold: true, highlight: true }),
    ],
    isTotal: true,
  };

  return {
    name: "LED Cost Sheet",
    color: "#0A52EF",
    columns: cols,
    rows: [headerRow, ...dataRows, { cells: [], isSeparator: true }, totalRow],
    // Editable: H(ft)=4, W(ft)=5, Qty=9, Display Cost=14, Processor=15, Shipping=16, Margin%=18
    editableColumns: [4, 5, 9, 14, 15, 16, 18],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet 2: Margin Analysis
// ═══════════════════════════════════════════════════════════════════════════

function buildMarginAnalysis(input: RfpWorkbookInput): SheetTab {
  // ANC flat format: one row per line item (displays + service categories)
  const cols = ["Line Item", "Cost", "Selling Price", "Margin $", "Margin %"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const lineItems: SheetRow[] = [];

  // Section 1: LED Displays (each display as a line item — LED hardware + processor + shipping)
  for (const d of input.pricingDisplays.filter((x) => !x.isCustom)) {
    const ledTotal = d.hardwareCost + (d.processorCost ?? 0) + (d.shippingCost ?? 0);
    const sell = d.blendedMarginPct > 0 ? ledTotal / (1 - d.blendedMarginPct) : ledTotal;
    const marginDollar = sell - ledTotal;
    lineItems.push({
      cells: [
        c(d.name, { bold: true }),
        curr(ledTotal),
        curr(sell),
        curr(marginDollar),
        pct(d.blendedMarginPct, {
          className: d.blendedMarginPct >= 0.25 ? "text-emerald-600" : d.blendedMarginPct >= 0.15 ? "text-amber-600" : "text-red-600",
        }),
      ],
    });
  }

  // Section 2: Service categories (aggregated across all displays)
  const serviceCategories: Array<{ label: string; field: string; }> = [
    { label: "Structural Materials", field: "structuralCost" },
    { label: "Installation Labor", field: "installCost" },
    { label: "PM / Gen. Conditions", field: "pmCost" },
    { label: "Engineering / Permits", field: "engCost" },
  ];

  // Use first display's margin as default for services, or 10%
  const defaultServiceMargin = input.pricingDisplays[0]?.blendedMarginPct ?? 0.10;

  for (const cat of serviceCategories) {
    const cost = input.pricingDisplays.reduce((s, d) => s + ((d as any)[cat.field] ?? 0), 0);
    if (cost === 0) continue; // skip empty categories
    const margin = defaultServiceMargin;
    const sell = margin > 0 ? cost / (1 - margin) : cost;
    const marginDollar = sell - cost;
    lineItems.push({
      cells: [
        c(cat.label, { bold: true }),
        curr(cost),
        curr(sell),
        curr(marginDollar),
        pct(margin, {
          className: margin >= 0.25 ? "text-emerald-600" : margin >= 0.15 ? "text-amber-600" : "text-red-600",
        }),
      ],
    });
  }

  // Section 3: Custom line items
  for (const d of input.pricingDisplays.filter((x) => x.isCustom)) {
    const cost = d.hardwareCost + (d.installCost ?? 0) + (d.structuralCost ?? 0) + (d.pmCost ?? 0) + (d.engCost ?? 0);
    const sell = d.blendedMarginPct > 0 ? cost / (1 - d.blendedMarginPct) : cost;
    const marginDollar = sell - cost;
    lineItems.push({
      cells: [
        c(d.name, { bold: true, className: "text-blue-600" }),
        curr(cost),
        curr(sell),
        curr(marginDollar),
        pct(d.blendedMarginPct, {
          className: d.blendedMarginPct >= 0.25 ? "text-emerald-600" : d.blendedMarginPct >= 0.15 ? "text-amber-600" : "text-red-600",
        }),
      ],
    });
  }

  // Total row
  const totalCost = lineItems.reduce((s, r) => {
    const val = r.cells[1];
    return s + (typeof val?.value === "number" ? val.value : (parseFloat(String(val?.value ?? "0").replace(/[,$]/g, "")) || 0));
  }, 0);
  const totalSell = lineItems.reduce((s, r) => {
    const val = r.cells[2];
    return s + (typeof val?.value === "number" ? val.value : (parseFloat(String(val?.value ?? "0").replace(/[,$]/g, "")) || 0));
  }, 0);
  const totalMarginDollar = totalSell - totalCost;
  const totalMarginPct = totalSell > 0 ? (totalSell - totalCost) / totalSell : 0;

  const totalRow: SheetRow = {
    cells: [
      c("TOTAL", { bold: true }),
      curr(totalCost, { bold: true, highlight: true }),
      curr(totalSell, { bold: true, highlight: true }),
      curr(totalMarginDollar, { bold: true }),
      pct(totalMarginPct, { bold: true }),
    ],
    isTotal: true,
  };

  // Add Line Item row
  const addRow: SheetRow | null = input.onAddLineItem
    ? {
        cells: [
          c("+ Add Line Item", {
            bold: true,
            className: "text-blue-600 cursor-pointer hover:text-blue-800",
            onClick: input.onAddLineItem,
          }),
          c(""), c(""), c(""), c(""),
        ],
      }
    : null;

  const summary = input.pricingSummary;
  const rows = summary
    ? [headerRow, ...lineItems, { cells: [], isSeparator: true }, totalRow, ...(addRow ? [addRow] : [])]
    : [headerRow, { cells: [c("Run pricing preview to populate", { span: cols.length, align: "center" })], isSeparator: false }];

  return {
    name: "Margin Analysis",
    color: "#217346",
    columns: cols,
    rows,
    // Editable: Cost(1), Margin %(4)
    editableColumns: [1, 4],
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
    editableColumns: [],
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
    editableColumns: [],
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
    editableColumns: [],
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
    editableColumns: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet 7: Bid Form (shows match results when a bid form was auto-filled)
// ═══════════════════════════════════════════════════════════════════════════

function buildBidFormSheet(input: RfpWorkbookInput): SheetTab | null {
  if (!input.bidFormResult) return null;

  const hasMismatches = (input.specMismatches?.length ?? 0) > 0;
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

  // Mismatch section — appended below match results when discrepancies exist
  const mismatchRows: SheetRow[] = [];
  if (hasMismatches) {
    mismatchRows.push({ cells: [], isSeparator: true });
    mismatchRows.push({
      cells: [
        c(`SPEC DISCREPANCIES (${input.specMismatches!.length})`, { bold: true, header: true, span: 5 }),
      ],
      isHeader: true,
    });
    // Mismatch header
    mismatchRows.push({
      cells: [
        c("Display", { bold: true }),
        c("Field", { bold: true }),
        c("RFP / PDF Value", { bold: true }),
        c("Bid Form Value", { bold: true }),
        c("Severity", { bold: true }),
      ],
      isHeader: true,
    });
    for (const mm of input.specMismatches!) {
      mismatchRows.push({
        cells: [
          c(mm.displayName, { bold: true }),
          c(mm.field),
          c(String(mm.pdfValue ?? "—")),
          c(String(mm.bidFormValue ?? "—")),
          c(mm.severity === "critical" ? "CRITICAL" : "Warning", {
            bold: mm.severity === "critical",
            className: mm.severity === "critical" ? "text-red-600" : "text-amber-600",
          }),
        ],
      });
    }
  }

  return {
    name: hasMismatches ? `Bid Form (${input.specMismatches!.length} flags)` : "Bid Form",
    color: hasMismatches ? "#DC2626" : "#D97706",
    columns: cols,
    rows: [headerRow, ...matchRows, ...unmatchedBlockRows, ...unmatchedScreenRows, { cells: [], isSeparator: true }, summaryRow, ...mismatchRows],
    editableColumns: [],
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
