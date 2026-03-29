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
  portsNeeded?: number;
  processorsNeeded?: number;
  processorLabel?: string;
  shippingCost?: number;
  installCost?: number;
  structuralCost?: number;
  electricalCost?: number;
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
    totalModules?: number;
    weightKgPerCab?: number; maxPowerWPerCab?: number;
    totalWeightKg?: number; totalWeightLbs?: number; totalMaxPowerW?: number;
    nits?: number;
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
  /** Callback to add a new screen to LED Cost Sheet */
  onAddScreen?: () => void;
  /** Callback to remove a screen by name from LED Cost Sheet */
  onRemoveScreen?: (screenName: string) => void;
  /** Callback when user changes quantity for a display */
  onQtyChange?: (displayName: string, qty: number) => void;
  /** Callback when user clicks "Fix" on a row — triggers AI repair agent */
  onRepairRow?: (displayName: string, rowIndex: number) => void;
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
  // ANC format — electrical columns use Jeremy's 208V circuit formula:
  // One 20A 208V circuit = max 3328W. Cabs/circuit = floor(3328 / W per cab). Circuits = ceil(totalCabs / cabsPerCircuit).
  const cols = [
    "Display", "RFP H (ft)", "RFP W (ft)", "RFP NITs",
    "Vendor", "Product", "Pitch",
    "H (ft)", "W (ft)", "H (px)", "W (px)",
    "SqFt/Screen", "Qty", "Total SqFt",
    "NITs", "Spec Match", "Service",
    "Modules", "Weight (lbs)", "W/Cab", "Total Power (W)",
    "BTU/hr", "Cab/Circuit", "Circuits (208V)",
    "$/SqFt", "Display Cost", "Processor", "Shipping", "Total Cost",
    "Margin %", "Selling Price",
  ];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  // Build a used-index tracker so duplicate names get matched to different pricing entries
  const usedPricingIdx = new Set<number>();

  const dataRows: SheetRow[] = input.screens.map((spec) => {
    const bidPitch = spec.pixelPitchMm ?? 0;
    const bidW = spec.widthFt ?? 0;
    const bidH = spec.heightFt ?? 0;
    const bidWPx = spec.widthPx ?? (bidPitch > 0 ? Math.round(bidW * 304.8 / bidPitch) : 0);
    const bidHPx = spec.heightPx ?? (bidPitch > 0 ? Math.round(bidH * 304.8 / bidPitch) : 0);
    const qty = spec.quantity || 1;

    // Match pricing by name, but if there are duplicate names, pick the next unused entry
    let pdIdx = input.pricingDisplays.findIndex((d, i) => d.name === spec.name && !usedPricingIdx.has(i));
    if (pdIdx === -1) pdIdx = input.pricingDisplays.findIndex((d) => d.name === spec.name);
    if (pdIdx >= 0) usedPricingIdx.add(pdIdx);
    const pd = pdIdx >= 0 ? input.pricingDisplays[pdIdx] : undefined;
    const mp = pd?.matchedProduct;

    // Product-matched dimensions take priority when a product is selected.
    // Check spec.activeWidthFt/activeHeightFt first (persisted from handleProductSelect),
    // then matchedProduct, then fall back to RFP/bid dimensions.
    const hasSpecDims = spec.activeWidthFt && spec.activeHeightFt;
    const hasProductDims = mp?.activeWidthFt && mp?.activeHeightFt;
    const displayH = hasSpecDims ? spec.activeHeightFt! : hasProductDims ? mp.activeHeightFt : bidH;
    const displayW = hasSpecDims ? spec.activeWidthFt! : hasProductDims ? mp.activeWidthFt : bidW;
    const activePitch = hasProductDims && mp.pitch ? mp.pitch : bidPitch;
    const displayPxH = (hasProductDims && mp.resolutionY) ? mp.resolutionY : bidHPx;
    const displayPxW = (hasProductDims && mp.resolutionX) ? mp.resolutionX : bidWPx;
    const sqFtPerScreen = displayH * displayW;
    const totalSqFt = sqFtPerScreen * qty;

    // Derive stable $/sqft rate from pricing data
    // NOTE: pd.hardwareCost already includes quantity, pd.areaSqFt does NOT.
    // Use (areaSqFt × qty) to back-derive the true per-sqft rate.
    const pricingSqFt = pd?.areaSqFt ?? 0;
    const pricingTotalSqFt = pricingSqFt * qty;
    const ratePerSqFt = pricingTotalSqFt > 0 ? (pd?.hardwareCost ?? 0) / pricingTotalSqFt : 0;
    const displayCost = ratePerSqFt * totalSqFt;
    const processorCost = pd?.processorCost ?? 0;
    const shippingCost = pd?.shippingCost ?? 0;
    const totalCost = displayCost + processorCost + shippingCost;
    const margin = pd?.blendedMarginPct ?? 0;
    const sellingPrice = margin > 0 ? totalCost / (1 - margin) : totalCost;

    const vendor = mp?.manufacturer ?? "";
    const productLabel = mp?.model ?? "";
    const nits = mp?.nits ?? spec.brightnessNits ?? null;
    const serviceType = spec.serviceType ?? "";
    const totalModules = mp?.totalModules ?? null;
    const totalWeightLbs = mp?.totalWeightLbs ?? null;
    const wattsPerCab = mp?.maxPowerWPerCab ?? null;
    const totalMaxPowerW = mp?.totalMaxPowerW ?? null;
    // BTU/hr = Watts × 3.412
    const btuPerHr = totalMaxPowerW ? Math.round(totalMaxPowerW * 3.412) : null;
    // Jeremy's 208V circuit formula: 20A × 208V × 0.8 NEC = 3328W per circuit
    const WATTS_PER_CIRCUIT = 3328; // 20A 208V 2-Pole 1PH, 80% NEC derating
    const cabsPerCircuit = wattsPerCab ? Math.floor(WATTS_PER_CIRCUIT / wattsPerCab) : null;
    const circuits208V = (totalModules && cabsPerCircuit && cabsPerCircuit > 0)
      ? Math.ceil(totalModules / cabsPerCircuit) : null;

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

    // RFP-requested specs (always from original RFP extraction, never overwritten)
    const rfpNits = spec.brightnessNits ?? null;

    return {
      cells: [
        c(spec.name, {
          bold: true,
          onClick: firstPage && input.onSourcePageClick ? () => input.onSourcePageClick!(firstPage) : undefined,
          onRemove: input.onRemoveScreen ? () => input.onRemoveScreen!(spec.name) : undefined,
          onRepair: input.onRepairRow ? () => input.onRepairRow!(spec.name, input.screens.indexOf(spec)) : undefined,
        }),
        num(bidH > 0 ? Math.round(bidH * 100) / 100 : null),               // RFP H (ft)
        num(bidW > 0 ? Math.round(bidW * 100) / 100 : null),               // RFP W (ft)
        num(rfpNits),                                                        // RFP NITs
        c(vendor),
        productCell,
        c(activePitch > 0 ? `${activePitch}mm` : "", { align: "center" }),
        num(displayH > 0 ? Math.round(displayH * 100) / 100 : null),       // H(ft) — editable
        num(displayW > 0 ? Math.round(displayW * 100) / 100 : null),       // W(ft) — editable
        num(displayPxH > 0 ? displayPxH : null),
        num(displayPxW > 0 ? displayPxW : null),
        num(Math.round(sqFtPerScreen * 100) / 100 || null),
        // Qty — editable via dropdown (1-20)
        input.onQtyChange
          ? {
              value: String(qty),
              align: "center" as const,
              dropdown: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
              onDropdownChange: (val: string) => input.onQtyChange!(spec.name, parseInt(val, 10) || 1),
            }
          : num(qty, { align: "center" }),
        num(Math.round(totalSqFt * 100) / 100 || null),
        num(nits),
        // Spec Match — compare product NITs vs RFP NITs
        (() => {
          if (!rfpNits || !nits) return c("—", { align: "center" });
          const ratio = nits / rfpNits;
          if (ratio >= 1) return c("✓ MEETS", { align: "center", className: "text-emerald-600 font-semibold" });
          if (ratio >= 0.9) {
            const delta = Math.round((1 - ratio) * 100 * 10) / 10;
            return c(`⚠ -${delta}%`, { align: "center", className: "text-amber-600 font-semibold" });
          }
          const delta = Math.round((1 - ratio) * 100 * 10) / 10;
          return c(`✗ -${delta}%`, { align: "center", className: "text-red-600 font-semibold" });
        })(),
        c(serviceType || "—", { align: "center" }),
        num(totalModules),
        num(totalWeightLbs),
        num(wattsPerCab),
        num(totalMaxPowerW),
        num(btuPerHr),
        num(cabsPerCircuit),
        num(circuits208V, { bold: true }),
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
  let totalModulesAll = 0;
  let totalWeightLbsAll = 0;
  let totalPowerWAll = 0;
  input.screens.forEach((spec) => {
    const pd = input.pricingDisplays.find((d) => d.name === spec.name);
    const h = spec.heightFt ?? 0;
    const w = spec.widthFt ?? 0;
    const q = spec.quantity || 1;
    const sqFt = h * w * q;
    const pricingSqFt = pd?.areaSqFt ?? 0;
    const pricingTotalSqFt = pricingSqFt * q;
    const rate = pricingTotalSqFt > 0 ? (pd?.hardwareCost ?? 0) / pricingTotalSqFt : 0;
    totalDisplayCost += rate * sqFt;
    totalProcessorCost += pd?.processorCost ?? 0;
    totalShippingCost += pd?.shippingCost ?? 0;
    totalSqFtAll += sqFt;
    totalModulesAll += pd?.matchedProduct?.totalModules ?? 0;
    totalWeightLbsAll += pd?.matchedProduct?.totalWeightLbs ?? 0;
    totalPowerWAll += pd?.matchedProduct?.totalMaxPowerW ?? 0;
  });
  const totalLedCost = totalDisplayCost + totalProcessorCost + totalShippingCost;
  // Blended margin for total
  const totalLedSell = input.screens.reduce((s, spec) => {
    const pd = input.pricingDisplays.find((d) => d.name === spec.name);
    const h = spec.heightFt ?? 0;
    const w = spec.widthFt ?? 0;
    const q = spec.quantity || 1;
    const sqFt = h * w * q;
    const pricingSqFt = pd?.areaSqFt ?? 0;
    const pricingTotalSqFt = pricingSqFt * q;
    const rate = pricingTotalSqFt > 0 ? (pd?.hardwareCost ?? 0) / pricingTotalSqFt : 0;
    const dc = rate * sqFt;
    const pc = pd?.processorCost ?? 0;
    const sc = pd?.shippingCost ?? 0;
    const tc = dc + pc + sc;
    const m = pd?.blendedMarginPct ?? 0;
    return s + (m > 0 ? tc / (1 - m) : tc);
  }, 0);
  const blendedMarginTotal = totalLedSell > 0 ? (totalLedSell - totalLedCost) / totalLedSell : 0;

  const totalBtuPerHr = totalPowerWAll > 0 ? Math.round(totalPowerWAll * 3.412) : null;
  // Sum circuits across all displays (each display has its own cab/circuit ratio)
  const totalCircuits208V = input.screens.reduce((sum, spec) => {
    const pd = input.pricingDisplays.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;
    if (!mp?.totalModules || !mp?.maxPowerWPerCab) return sum;
    const cabsPerCir = Math.floor(3328 / mp.maxPowerWPerCab);
    return sum + (cabsPerCir > 0 ? Math.ceil(mp.totalModules / cabsPerCir) : 0);
  }, 0);
  const totalRow: SheetRow = {
    cells: [
      c(`TOTAL (${input.screens.length} displays)`, { bold: true }),
      c(""), c(""), c(""),                                               // RFP H, RFP W, RFP NITs
      c(""), c(""), c(""),                                               // Vendor, Product, Pitch
      c(""), c(""), c(""), c(""),                                        // H, W, H(px), W(px)
      c(""),                                                              // SqFt/Screen
      c(""),                                                              // Qty
      num(Math.round(totalSqFtAll * 100) / 100, { bold: true }),         // Total SqFt
      c(""), c(""), c(""),                                                 // NITs, Spec Match, Service
      num(totalModulesAll > 0 ? totalModulesAll : null, { bold: true }),
      num(totalWeightLbsAll > 0 ? totalWeightLbsAll : null, { bold: true }),
      c(""),
      num(totalPowerWAll > 0 ? totalPowerWAll : null, { bold: true }),
      num(totalBtuPerHr, { bold: true }),
      c(""),
      num(totalCircuits208V > 0 ? totalCircuits208V : null, { bold: true, highlight: true }),
      c(""),
      curr(totalDisplayCost, { bold: true }),
      curr(totalProcessorCost, { bold: true }),
      curr(totalShippingCost, { bold: true }),
      curr(totalLedCost, { bold: true, highlight: true }),
      pct(blendedMarginTotal, { bold: true }),
      curr(totalLedSell, { bold: true, highlight: true }),
    ],
    isTotal: true,
  };

  // "Add Screen" row
  const addScreenRow: SheetRow | null = input.onAddScreen
    ? {
        cells: [
          c("+ Add Screen", {
            className: "text-[#0A52EF] hover:underline cursor-pointer text-[10px] italic",
            onClick: input.onAddScreen,
          }),
          ...Array.from({ length: cols.length - 1 }, () => c("")),
        ],
      }
    : null;

  return {
    name: "LED Cost Sheet",
    color: "#0A52EF",
    columns: cols,
    rows: [headerRow, ...dataRows, { cells: [], isSeparator: true }, totalRow, ...(addScreenRow ? [addScreenRow] : [])],
    // Editable: Name=0, H(ft)=4, W(ft)=5, Qty=9, Display Cost=21, Processor=22, Shipping=23, Margin%=25
    editableColumns: [0, 4, 5, 9, 21, 22, 23, 25],
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
  const defaultServiceMargin = 0.20;

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

  // Section 3: CMS placeholder
  lineItems.push({
    cells: [
      c("CMS (Content Management System)", { bold: true }),
      curr(0),
      curr(0),
      curr(0),
      pct(0.10, { className: "text-amber-600" }),
    ],
  });

  // Section 4: Scoring placeholder
  lineItems.push({
    cells: [
      c("Scoring System", { bold: true }),
      curr(0),
      curr(0),
      curr(0),
      pct(0.10, { className: "text-amber-600" }),
    ],
  });

  // Section 5: Custom line items
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

function buildPageTriage(input: RfpWorkbookInput): SheetTab | null {
  if (!input.triage || input.triage.length === 0) return null;
  const cols = ["Page", "Category", "Relevance", "Drawing"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const dataRows: SheetRow[] = input.triage.map((t) => ({
    cells: [
      c(t.pageNumber ?? "", {
        align: "center",
        onClick: t.pageNumber && input.onSourcePageClick ? () => input.onSourcePageClick!(t.pageNumber) : undefined,
      }),
      c((t.category || t.message || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())),
      c(t.relevance != null ? `${t.relevance}%` : "", {
        align: "center",
        className: (t.relevance ?? 0) >= 70 ? "text-emerald-600" : (t.relevance ?? 0) >= 40 ? "text-amber-600" : "text-muted-foreground",
      }),
      c(t.isDrawing ? "YES" : "", {
        align: "center",
        bold: !!t.isDrawing,
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
// Sheet: Install (Base) — per-zone structural/labor/electrical
// ═══════════════════════════════════════════════════════════════════════════

function buildInstallBase(input: RfpWorkbookInput): SheetTab {
  const cols = ["Description", "Category", "Est. Cost", "Margin %", "Selling Price"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const defaultMargin = 0.10; // 10% default for install categories
  const allRows: SheetRow[] = [];

  // Per-display zone breakdown
  for (const d of input.pricingDisplays.filter((x) => !x.isCustom)) {
    // Zone header
    allRows.push({
      cells: [c(d.name, { bold: true, header: true, span: 5 })],
      isHeader: true,
    });

    const structural = d.structuralCost ?? 0;
    const install = d.installCost ?? 0;
    const pm = d.pmCost ?? 0;
    const eng = d.engCost ?? 0;

    // Structural Materials
    const structItems = [
      { label: "Steel / Mounting Structure", cost: structural * 0.45 },
      { label: "Clips / Brackets / Hardware", cost: structural * 0.15 },
      { label: "Rigging / Hoisting Equipment", cost: structural * 0.20 },
      { label: "Catwalk / Access Platform", cost: structural * 0.10 },
      { label: "Miscellaneous Structural", cost: structural * 0.10 },
    ];
    if (structural > 0) {
      allRows.push({
        cells: [c("Structural Materials", { bold: true, className: "text-blue-600" }), c(""), c(""), c(""), c("")],
        isHeader: true,
      });
      for (const item of structItems) {
        const sell = item.cost / (1 - defaultMargin);
        allRows.push({
          cells: [
            c(`  ${item.label}`),
            c("Structural"),
            curr(Math.round(item.cost)),
            pct(defaultMargin),
            curr(Math.round(sell)),
          ],
        });
      }
    }

    // Structural Labor and LED Installation
    const installItems = [
      { label: "Crew Labor (Install)", cost: install * 0.40 },
      { label: "Travel / Per Diem", cost: install * 0.10 },
      { label: "Heavy Equipment Rental", cost: install * 0.15 },
      { label: "LED Component Installation", cost: install * 0.25 },
      { label: "Commissioning / Testing", cost: install * 0.10 },
    ];
    if (install > 0) {
      allRows.push({
        cells: [c("Structural Labor & LED Install", { bold: true, className: "text-blue-600" }), c(""), c(""), c(""), c("")],
        isHeader: true,
      });
      for (const item of installItems) {
        const sell = item.cost / (1 - defaultMargin);
        allRows.push({
          cells: [
            c(`  ${item.label}`),
            c("Installation"),
            curr(Math.round(item.cost)),
            pct(defaultMargin),
            curr(Math.round(sell)),
          ],
        });
      }
    }

    // Electrical and Data
    const elecCost = (pm + eng) * 0.6; // Approximate electrical from PM+Eng
    const dataCost = (pm + eng) * 0.4;
    if (pm + eng > 0) {
      allRows.push({
        cells: [c("Electrical & Data", { bold: true, className: "text-blue-600" }), c(""), c(""), c(""), c("")],
        isHeader: true,
      });
      const elecItems = [
        { label: "Conduit / Wire / Panels", cost: elecCost * 0.50 },
        { label: "Data Cables / Fiber", cost: dataCost * 0.50 },
        { label: "Electrical Labor", cost: elecCost * 0.50 },
        { label: "Data Termination Labor", cost: dataCost * 0.50 },
      ];
      for (const item of elecItems) {
        const sell = item.cost / (1 - defaultMargin);
        allRows.push({
          cells: [
            c(`  ${item.label}`),
            c("Electrical"),
            curr(Math.round(item.cost)),
            pct(defaultMargin),
            curr(Math.round(sell)),
          ],
        });
      }
    }

    // Zone subtotal
    const zoneCost = structural + install + pm + eng;
    const zoneSell = zoneCost / (1 - defaultMargin);
    allRows.push({ cells: [], isSeparator: true });
    allRows.push({
      cells: [
        c(`${d.name} — Subtotal`, { bold: true }),
        c(""),
        curr(Math.round(zoneCost), { bold: true }),
        pct(defaultMargin, { bold: true }),
        curr(Math.round(zoneSell), { bold: true }),
      ],
      isTotal: true,
    });
    allRows.push({ cells: [], isSeparator: true });
  }

  // PM / General Conditions section
  allRows.push({
    cells: [c("PROJECT MANAGEMENT / GENERAL CONDITIONS", { bold: true, header: true, span: 5 })],
    isHeader: true,
  });
  const pmItems = [
    { label: "Project Management", pct: 0.40 },
    { label: "Structural Engineering", pct: 0.30 },
    { label: "Electrical Engineering", pct: 0.15 },
    { label: "Permits", pct: 0.10 },
    { label: "As-Built Documentation", pct: 0.05 },
  ];
  const totalEng = input.pricingDisplays.reduce((s, d) => s + (d.engCost ?? 0), 0);
  const totalPm = input.pricingDisplays.reduce((s, d) => s + (d.pmCost ?? 0), 0);
  const pmBucket = totalPm + totalEng;
  for (const item of pmItems) {
    const cost = Math.round(pmBucket * item.pct);
    const sell = cost / (1 - defaultMargin);
    allRows.push({
      cells: [
        c(`  ${item.label}`),
        c("PM/GC"),
        curr(cost),
        pct(defaultMargin),
        curr(Math.round(sell)),
      ],
    });
  }

  // Grand total
  const grandCost = input.pricingDisplays.reduce((s, d) =>
    s + (d.installCost ?? 0) + (d.structuralCost ?? 0) + (d.pmCost ?? 0) + (d.engCost ?? 0), 0);
  const grandSell = grandCost / (1 - defaultMargin);
  allRows.push({ cells: [], isSeparator: true });
  allRows.push({
    cells: [
      c("TOTAL ALL INSTALL", { bold: true }),
      c(""),
      curr(Math.round(grandCost), { bold: true, highlight: true }),
      pct(defaultMargin, { bold: true }),
      curr(Math.round(grandSell), { bold: true, highlight: true }),
    ],
    isTotal: true,
  });

  return {
    name: "Install (Base)",
    color: "#059669",
    columns: cols,
    rows: [headerRow, ...allRows],
    editableColumns: [2, 3], // Cost and Margin % editable
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet: Extended Warranty — Year 3-10 pricing tiers
// ═══════════════════════════════════════════════════════════════════════════

function buildExtendedWarranty(input: RfpWorkbookInput): SheetTab {
  const cols = ["Year", "LED Parts", "License Fee", "Cost (Parts)", "Retail (Parts)", "Annual Labor", "Cost (P+L)", "Retail (P+L)"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  // Base LED parts cost scaled from total hardware
  const totalHw = input.pricingDisplays.reduce((s, d) => s + d.hardwareCost, 0);
  const warrantyMargin = 0.10;
  // Standard warranty: ~1% of LED cost yr 3-5, ~2% yr 6-8, ~3.5% yr 9-10
  const tiers = [
    { years: "Year 3", partsPct: 0.010, laborBase: 15000 },
    { years: "Year 4", partsPct: 0.010, laborBase: 15000 },
    { years: "Year 5", partsPct: 0.010, laborBase: 15000 },
    { years: "Year 6", partsPct: 0.020, laborBase: 21500 },
    { years: "Year 7", partsPct: 0.020, laborBase: 21500 },
    { years: "Year 8", partsPct: 0.020, laborBase: 21500 },
    { years: "Year 9", partsPct: 0.035, laborBase: 24000 },
    { years: "Year 10", partsPct: 0.035, laborBase: 24000 },
  ];

  const dataRows: SheetRow[] = tiers.map((t) => {
    const ledParts = Math.round(totalHw * t.partsPct);
    const licenseFee = 0;
    const costParts = ledParts + licenseFee;
    const retailParts = Math.round(costParts / (1 - warrantyMargin));
    const labor = t.laborBase;
    const costPL = costParts + labor;
    const retailPL = Math.round(costPL / (1 - warrantyMargin));
    return {
      cells: [
        c(t.years, { bold: true }),
        curr(ledParts),
        curr(licenseFee),
        curr(costParts),
        curr(retailParts),
        curr(labor),
        curr(costPL, { bold: true }),
        curr(retailPL, { bold: true }),
      ],
    };
  });

  // Totals
  const totalLedParts = tiers.reduce((s, t) => s + Math.round(totalHw * t.partsPct), 0);
  const totalLabor = tiers.reduce((s, t) => s + t.laborBase, 0);
  const totalCostPL = totalLedParts + totalLabor;
  const totalRetailPL = Math.round(totalCostPL / (1 - warrantyMargin));

  const totalRow: SheetRow = {
    cells: [
      c("TOTAL", { bold: true }),
      curr(totalLedParts, { bold: true }),
      curr(0),
      curr(totalLedParts, { bold: true }),
      curr(Math.round(totalLedParts / (1 - warrantyMargin)), { bold: true }),
      curr(totalLabor, { bold: true }),
      curr(totalCostPL, { bold: true, highlight: true }),
      curr(totalRetailPL, { bold: true, highlight: true }),
    ],
    isTotal: true,
  };

  return {
    name: "Extended Warranty",
    color: "#7C3AED",
    columns: cols,
    rows: [headerRow, ...dataRows, { cells: [], isSeparator: true }, totalRow],
    editableColumns: [1, 5], // LED Parts and Annual Labor editable
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet: Responsibility Matrix — ANC vs Purchaser
// ═══════════════════════════════════════════════════════════════════════════

function buildResponsibilityMatrix(input: RfpWorkbookInput): SheetTab {
  const cols = ["Description", "ANC", "Purchaser"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const sections: Array<{ title: string; items: Array<{ desc: string; anc: boolean }> }> = [
    {
      title: "ADMINISTRATIVE",
      items: [
        { desc: "Project Management / Scheduling", anc: true },
        { desc: "Submittal Drawings / Engineering", anc: true },
        { desc: "Structural Engineering", anc: true },
        { desc: "Electrical Engineering", anc: true },
        { desc: "Permits and Approvals", anc: false },
        { desc: "Site Access / Scheduling Coordination", anc: false },
        { desc: "Insurance / Bonding", anc: true },
      ],
    },
    {
      title: "PHYSICAL INSTALLATION",
      items: [
        { desc: "LED Display Shipping to Site", anc: true },
        { desc: "Unloading / Staging at Venue", anc: true },
        { desc: "Removal of Existing Displays", anc: true },
        { desc: "Secondary Structural Steel Fabrication", anc: true },
        { desc: "Secondary Structural Steel Installation", anc: true },
        { desc: "LED Display Component Installation", anc: true },
        { desc: "Heavy Equipment / Crane Rental", anc: true },
        { desc: "Electrical — Conduit, Wire, Panels", anc: true },
        { desc: "Data — Fiber, Cat6, Termination", anc: true },
        { desc: "Power to Display (Primary Feed)", anc: false },
        { desc: "Network Connection to Control Room", anc: false },
      ],
    },
    {
      title: "PROJECT CLOSE-OUT",
      items: [
        { desc: "Display Commissioning / Calibration", anc: true },
        { desc: "Content Management System Setup", anc: true },
        { desc: "Operator Training", anc: true },
        { desc: "As-Built Documentation", anc: true },
        { desc: "Punch List / Final Walkthrough", anc: true },
        { desc: "Spare Parts Delivery (3%)", anc: true },
        { desc: "Event Support (First 3 Events)", anc: true },
      ],
    },
    {
      title: "GENERAL CONDITIONS",
      items: [
        { desc: "Site Utilities (Power, Water, Restrooms)", anc: false },
        { desc: "Dumpster / Waste Removal", anc: false },
        { desc: "Security During Install", anc: false },
        { desc: "Weather Protection / Tarping", anc: true },
        { desc: "Safety / OSHA Compliance", anc: true },
      ],
    },
  ];

  const allRows: SheetRow[] = [];
  for (const section of sections) {
    allRows.push({
      cells: [c(section.title, { bold: true, header: true, span: 3 })],
      isHeader: true,
    });
    for (const item of section.items) {
      allRows.push({
        cells: [
          c(item.desc),
          c(item.anc ? "YES" : "", { bold: item.anc, align: "center", className: item.anc ? "text-emerald-600" : "" }),
          c(!item.anc ? "YES" : "", { bold: !item.anc, align: "center", className: !item.anc ? "text-amber-600" : "" }),
        ],
      });
    }
    allRows.push({ cells: [], isSeparator: true });
  }

  return {
    name: "Resp. Matrix",
    color: "#0891B2",
    columns: cols,
    rows: [headerRow, ...allRows],
    editableColumns: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet: Form (Vendor Spec) — detailed specs per display
// ═══════════════════════════════════════════════════════════════════════════

function buildVendorSpecForm(input: RfpWorkbookInput): SheetTab {
  // Dynamic columns: one per display
  const displays = input.pricingDisplays.filter((d) => !d.isCustom);
  const cols = ["Specification", ...displays.map((d) => d.name)];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  // Spec rows — extract from screens + matched products
  const specFields: Array<{ label: string; getter: (d: typeof displays[0], spec: typeof input.screens[0]) => string }> = [
    { label: "Manufacturer", getter: (d) => d.matchedProduct?.manufacturer ?? "—" },
    { label: "Model", getter: (d) => d.matchedProduct?.model ?? "—" },
    { label: "Pixel Pitch (mm)", getter: (d, s) => s.pixelPitchMm ? `${s.pixelPitchMm}mm` : "—" },
    { label: "Width (ft)", getter: (d, s) => s.widthFt ? `${Math.round(s.widthFt * 100) / 100}'` : "—" },
    { label: "Height (ft)", getter: (d, s) => s.heightFt ? `${Math.round(s.heightFt * 100) / 100}'` : "—" },
    { label: "Width (px)", getter: (d, s) => {
      const px = s.widthPx ?? (s.pixelPitchMm && s.widthFt ? Math.round(s.widthFt * 304.8 / s.pixelPitchMm) : 0);
      return px > 0 ? String(px) : "—";
    }},
    { label: "Height (px)", getter: (d, s) => {
      const px = s.heightPx ?? (s.pixelPitchMm && s.heightFt ? Math.round(s.heightFt * 304.8 / s.pixelPitchMm) : 0);
      return px > 0 ? String(px) : "—";
    }},
    { label: "Total SQ FT", getter: (d) => d.areaSqFt > 0 ? `${Math.round(d.areaSqFt * 100) / 100}` : "—" },
    { label: "Quantity", getter: (d) => `${d.quantity}` },
    { label: "NIT Requirement", getter: (d, s) => s.brightnessNits ? `${s.brightnessNits.toLocaleString()}` : "—" },
    { label: "Service Access", getter: (d, s) => s.serviceType ?? "—" },
    { label: "Indoor / Outdoor", getter: () => input.project.isOutdoor ? "Outdoor" : "Indoor" },
    { label: "IP Rating", getter: (d, s) => input.project.isOutdoor ? "IP65" : "IP40" },
    { label: "Refresh Rate", getter: () => "≥ 3,840 Hz" },
    { label: "Brightness", getter: (d, s) => {
      const nits = s.brightnessNits;
      return nits ? `${nits.toLocaleString()} NITs` : "—";
    }},
    { label: "Viewing Angle", getter: () => "≥ 160° H / 140° V" },
    { label: "Power (per panel)", getter: () => "~750W max" },
    { label: "Spare Panels (3%)", getter: (d, s) => {
      const pitch = s.pixelPitchMm ?? 10;
      const sqft = d.areaSqFt;
      // Rough panel count estimate
      const panelSqFt = pitch <= 4 ? 2.5 : pitch <= 8 ? 4.5 : 7.0;
      const panels = Math.ceil(sqft / panelSqFt) * d.quantity;
      return `${Math.ceil(panels * 0.03)}`;
    }},
  ];

  const dataRows: SheetRow[] = specFields.map((sf) => ({
    cells: [
      c(sf.label, { bold: true }),
      ...displays.map((d) => {
        const spec = input.screens.find((s) => s.name === d.name);
        return c(spec ? sf.getter(d, spec) : "—");
      }),
    ],
  }));

  return {
    name: "Form",
    color: "#6366F1",
    columns: cols,
    rows: [headerRow, ...dataRows],
    editableColumns: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet: Config — panel layout per display
// ═══════════════════════════════════════════════════════════════════════════

function buildConfig(input: RfpWorkbookInput): SheetTab {
  const cols = ["Display", "Model", "Panels/W", "Panels/H", "Total Panels", "Controllers", "Fiber Conv."];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const dataRows: SheetRow[] = input.screens.map((spec) => {
    const pd = input.pricingDisplays.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;
    const pitch = spec.pixelPitchMm ?? 10;
    const wFt = spec.activeWidthFt ?? mp?.activeWidthFt ?? spec.widthFt ?? 0;
    const hFt = spec.activeHeightFt ?? mp?.activeHeightFt ?? spec.heightFt ?? 0;

    // Estimate panel counts from display size and pitch
    const panelW = pitch <= 4 ? 1.64 : pitch <= 8 ? 1.64 : 3.28; // panel width in ft
    const panelH = pitch <= 4 ? 1.64 : pitch <= 8 ? 1.64 : 3.28;
    const panelsW = wFt > 0 ? Math.ceil(wFt / panelW) : 0;
    const panelsH = hFt > 0 ? Math.ceil(hFt / panelH) : 0;
    const totalPanels = panelsW * panelsH * (spec.quantity || 1);

    // NovaStar 660 Pro: 8 ports, 650K px per port
    const wPx = spec.widthPx ?? (pitch > 0 ? Math.round(wFt * 304.8 / pitch) : 0);
    const hPx = spec.heightPx ?? (pitch > 0 ? Math.round(hFt * 304.8 / pitch) : 0);
    const totalPx = wPx * hPx * (spec.quantity || 1);
    const ports = totalPx > 0 ? Math.ceil(totalPx / 650000) : 0;
    const controllers = ports > 0 ? Math.ceil(ports / 8) : 0;
    const fiberConv = controllers * 2; // 2 per controller (send + receive)

    return {
      cells: [
        c(spec.name, { bold: true }),
        c(mp?.model ?? "—"),
        num(panelsW || null),
        num(panelsH || null),
        num(totalPanels || null, { bold: true }),
        num(controllers || null, { bold: true }),
        num(fiberConv || null),
      ],
    };
  });

  const totalPanels = dataRows.reduce((s, r) => s + (typeof r.cells[4]?.value === "number" ? r.cells[4].value : 0), 0);
  const totalControllers = dataRows.reduce((s, r) => s + (typeof r.cells[5]?.value === "number" ? r.cells[5].value : 0), 0);

  const totalRow: SheetRow = {
    cells: [
      c("TOTAL", { bold: true }),
      c(""),
      c(""), c(""),
      num(totalPanels || null, { bold: true, highlight: true }),
      num(totalControllers || null, { bold: true, highlight: true }),
      num(totalControllers * 2 || null, { bold: true }),
    ],
    isTotal: true,
  };

  return {
    name: "Config.",
    color: "#EC4899",
    columns: cols,
    rows: [headerRow, ...dataRows, { cells: [], isSeparator: true }, totalRow],
    editableColumns: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet: Travel — per-person daily rates, weekly rollup
// ═══════════════════════════════════════════════════════════════════════════

function buildTravel(input: RfpWorkbookInput): SheetTab {
  const cols = ["Category", "Rate", "Qty", "Subtotal"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  // Master travel key
  const travelItems = [
    { label: "Flight (Round Trip)", rate: 600, qty: 2 },
    { label: "Car Rental (per day)", rate: 125, qty: 7 },
    { label: "Taxi / Rideshare", rate: 35, qty: 4 },
    { label: "Per Diem (per day)", rate: 75, qty: 7 },
    { label: "Lodging (per night)", rate: 185, qty: 7 },
    { label: "Mileage / Fuel", rate: 30, qty: 5 },
  ];

  const dataRows: SheetRow[] = [];

  // Travel key section
  dataRows.push({
    cells: [c("TRAVEL KEY (per person)", { bold: true, header: true, span: 4 })],
    isHeader: true,
  });
  for (const item of travelItems) {
    dataRows.push({
      cells: [
        c(item.label),
        curr(item.rate),
        num(item.qty, { align: "center" }),
        curr(item.rate * item.qty, { bold: true }),
      ],
    });
  }
  const weeklyPerPerson = travelItems.reduce((s, i) => s + i.rate * i.qty, 0);
  dataRows.push({
    cells: [
      c("Weekly Total (per person)", { bold: true }),
      c(""), c(""),
      curr(weeklyPerPerson, { bold: true }),
    ],
    isTotal: true,
  });

  // Crew estimate: 2 people, estimate weeks from display count
  const displayCount = input.screens.length;
  const estWeeks = Math.max(2, Math.ceil(displayCount * 1.5));
  const crewSize = 2;

  dataRows.push({ cells: [], isSeparator: true });
  dataRows.push({
    cells: [c("PROJECT TRAVEL ESTIMATE", { bold: true, header: true, span: 4 })],
    isHeader: true,
  });
  dataRows.push({
    cells: [c("Crew Size"), c(""), num(crewSize, { align: "center" }), c("")],
  });
  dataRows.push({
    cells: [c("Estimated Weeks"), c(""), num(estWeeks, { align: "center" }), c("")],
  });
  dataRows.push({
    cells: [c("Weekly Cost (crew)"), c(""), c(""), curr(weeklyPerPerson * crewSize, { bold: true })],
  });
  dataRows.push({ cells: [], isSeparator: true });

  const totalTravel = weeklyPerPerson * crewSize * estWeeks;
  dataRows.push({
    cells: [
      c("TOTAL PROJECT TRAVEL", { bold: true }),
      c(""), c(""),
      curr(totalTravel, { bold: true, highlight: true }),
    ],
    isTotal: true,
  });

  return {
    name: "Travel",
    color: "#F59E0B",
    columns: cols,
    rows: [headerRow, ...dataRows],
    editableColumns: [1, 2], // Rate and Qty editable
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet: P&L — Revenue vs Budget vs Margin
// ═══════════════════════════════════════════════════════════════════════════

function buildPandL(input: RfpWorkbookInput): SheetTab {
  const cols = ["Category", "Revenue", "Budgeted Cost", "Committed PO", "Margin $"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const summary = input.pricingSummary;
  const displays = input.pricingDisplays;

  // Derive category totals from pricing data
  const ledCost = displays.reduce((s, d) => s + d.hardwareCost + (d.processorCost ?? 0) + (d.shippingCost ?? 0), 0);
  const installCost = displays.reduce((s, d) => s + (d.installCost ?? 0), 0);
  const structuralCost = displays.reduce((s, d) => s + (d.structuralCost ?? 0), 0);
  const pmCost = displays.reduce((s, d) => s + (d.pmCost ?? 0), 0);
  const engCost = displays.reduce((s, d) => s + (d.engCost ?? 0), 0);

  const totalCost = summary?.totalCost ?? 0;
  const totalSell = summary?.totalSellingPrice ?? 0;

  const categories = [
    { label: "LED Displays", cost: ledCost },
    { label: "Installation Labor", cost: installCost },
    { label: "Structural Materials", cost: structuralCost },
    { label: "PM / General Conditions", cost: pmCost },
    { label: "Engineering / Permits", cost: engCost },
    { label: "ANC Travel", cost: 0 },
    { label: "Bond", cost: 0 },
    { label: "Tax", cost: 0 },
  ];

  const dataRows: SheetRow[] = [];

  // Header section
  dataRows.push({
    cells: [c("PROJECTS BUDGET", { bold: true, header: true, span: 5 })],
    isHeader: true,
  });
  dataRows.push({
    cells: [
      c("Base Contract Total", { bold: true }),
      curr(totalSell, { bold: true }),
      curr(totalCost),
      curr(0), // Committed POs — user fills in
      curr(totalSell - totalCost, { bold: true }),
    ],
  });
  dataRows.push({ cells: [], isSeparator: true });

  // Category breakdown
  dataRows.push({
    cells: [c("COST BREAKDOWN", { bold: true, header: true, span: 5 })],
    isHeader: true,
  });
  for (const cat of categories) {
    // Revenue = cost / (1 - blended margin)
    const margin = summary?.blendedMarginPct ? summary.blendedMarginPct / 100 : 0.10;
    const revenue = cat.cost > 0 ? cat.cost / (1 - margin) : 0;
    dataRows.push({
      cells: [
        c(cat.label),
        curr(Math.round(revenue)),
        curr(Math.round(cat.cost)),
        curr(0), // PO — user fills
        curr(Math.round(revenue - cat.cost)),
      ],
    });
  }

  dataRows.push({ cells: [], isSeparator: true });
  dataRows.push({
    cells: [
      c("GRAND TOTAL", { bold: true }),
      curr(Math.round(totalSell), { bold: true, highlight: true }),
      curr(Math.round(totalCost), { bold: true }),
      curr(0, { bold: true }),
      curr(Math.round(totalSell - totalCost), { bold: true, highlight: true }),
    ],
    isTotal: true,
  });

  return {
    name: "P&L",
    color: "#DC2626",
    columns: cols,
    rows: [headerRow, ...dataRows],
    editableColumns: [3], // Committed PO column editable
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet: Cash Flow — monthly payment schedule
// ═══════════════════════════════════════════════════════════════════════════

function buildCashFlow(input: RfpWorkbookInput): SheetTab {
  const cols = ["Milestone", "% of Contract", "Revenue", "Cost", "Net"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const totalSell = input.pricingSummary?.totalSellingPrice ?? 0;
  const totalCost = input.pricingSummary?.totalCost ?? 0;

  // Standard ANC payment terms: 50/20/20/10
  const milestones = [
    { label: "Contract Signed", pct: 0.50 },
    { label: "Product Shipping", pct: 0.20 },
    { label: "Substantial Completion", pct: 0.20 },
    { label: "Final Sign-Off", pct: 0.10 },
  ];

  const dataRows: SheetRow[] = [];

  dataRows.push({
    cells: [c("PAYMENT TERMS: 50/20/20/10", { bold: true, header: true, span: 5 })],
    isHeader: true,
  });

  for (const ms of milestones) {
    const rev = Math.round(totalSell * ms.pct);
    const cost = Math.round(totalCost * ms.pct);
    dataRows.push({
      cells: [
        c(ms.label, { bold: true }),
        pct(ms.pct),
        curr(rev),
        curr(cost),
        curr(rev - cost, { bold: true, className: rev - cost >= 0 ? "text-emerald-600" : "text-red-600" }),
      ],
    });
  }

  dataRows.push({ cells: [], isSeparator: true });
  dataRows.push({
    cells: [
      c("TOTAL", { bold: true }),
      pct(1.0, { bold: true }),
      curr(Math.round(totalSell), { bold: true, highlight: true }),
      curr(Math.round(totalCost), { bold: true }),
      curr(Math.round(totalSell - totalCost), { bold: true, highlight: true }),
    ],
    isTotal: true,
  });

  return {
    name: "Cash Flow",
    color: "#F97316",
    columns: cols,
    rows: [headerRow, ...dataRows],
    editableColumns: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet: PO's — Purchase Order tracking
// ═══════════════════════════════════════════════════════════════════════════

function buildPurchaseOrders(input: RfpWorkbookInput): SheetTab {
  const cols = ["PO #", "Vendor", "Description", "Category", "Amount"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const projectCode = (input.project.clientName || "PRJ").substring(0, 6).toUpperCase().replace(/\s/g, "");
  let poNum = 1;
  const dataRows: SheetRow[] = [];

  // Pre-populate PO slots from pricing data
  for (const d of input.pricingDisplays.filter((x) => !x.isCustom)) {
    const vendor = d.matchedProduct?.manufacturer ?? "TBD";
    // LED PO
    dataRows.push({
      cells: [
        c(`${projectCode}-${String(poNum++).padStart(3, "0")}`),
        c(vendor),
        c(`${d.name} — LED Display`),
        c("LED"),
        curr(Math.round(d.hardwareCost + (d.processorCost ?? 0) + (d.shippingCost ?? 0))),
      ],
    });
  }

  // Install PO
  const totalInstall = input.pricingDisplays.reduce((s, d) => s + (d.installCost ?? 0), 0);
  if (totalInstall > 0) {
    dataRows.push({
      cells: [
        c(`${projectCode}-${String(poNum++).padStart(3, "0")}`),
        c("TBD — Install Contractor"),
        c("Installation Labor"),
        c("Install"),
        curr(Math.round(totalInstall)),
      ],
    });
  }

  // Structural PO
  const totalStructural = input.pricingDisplays.reduce((s, d) => s + (d.structuralCost ?? 0), 0);
  if (totalStructural > 0) {
    dataRows.push({
      cells: [
        c(`${projectCode}-${String(poNum++).padStart(3, "0")}`),
        c("TBD — Structural Engineer"),
        c("Structural Engineering"),
        c("Structural"),
        curr(Math.round(totalStructural)),
      ],
    });
  }

  // Engineering PO
  const totalEng = input.pricingDisplays.reduce((s, d) => s + (d.engCost ?? 0), 0);
  if (totalEng > 0) {
    dataRows.push({
      cells: [
        c(`${projectCode}-${String(poNum++).padStart(3, "0")}`),
        c("TBD — Electrical Engineer"),
        c("Electrical Engineering"),
        c("Engineering"),
        curr(Math.round(totalEng)),
      ],
    });
  }

  // Empty PO slots for user to fill
  for (let i = 0; i < 5; i++) {
    dataRows.push({
      cells: [
        c(`${projectCode}-${String(poNum++).padStart(3, "0")}`),
        c(""),
        c(""),
        c(""),
        curr(0),
      ],
    });
  }

  // Total
  const totalPO = dataRows.reduce((s, r) => {
    const val = r.cells[4];
    return s + (typeof val?.value === "number" ? val.value : 0);
  }, 0);

  const totalRow: SheetRow = {
    cells: [
      c("TOTAL COMMITTED", { bold: true }),
      c(""), c(""), c(""),
      curr(totalPO, { bold: true, highlight: true }),
    ],
    isTotal: true,
  };

  return {
    name: "PO's",
    color: "#B45309",
    columns: cols,
    rows: [headerRow, ...dataRows, { cells: [], isSeparator: true }, totalRow],
    editableColumns: [1, 2, 3, 4], // Vendor, Description, Category, Amount all editable
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheet: Vendor Pricing — panel-by-panel BOM from manufacturer
// ═══════════════════════════════════════════════════════════════════════════

function buildVendorPricing(input: RfpWorkbookInput): SheetTab {
  const cols = ["Display", "Model", "Panel Qty", "Screen Qty", "Total Panels", "Unit Price", "Total Amount", "US$/SqFt"];

  const headerRow: SheetRow = {
    cells: cols.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const dataRows: SheetRow[] = [];

  for (const d of input.pricingDisplays.filter((x) => !x.isCustom)) {
    const mp = d.matchedProduct;
    const spec = input.screens.find((s) => s.name === d.name);
    const pitch = spec?.pixelPitchMm ?? 10;
    const wFt = spec?.activeWidthFt ?? mp?.activeWidthFt ?? spec?.widthFt ?? 0;
    const hFt = spec?.activeHeightFt ?? mp?.activeHeightFt ?? spec?.heightFt ?? 0;

    // Estimate panel count
    const panelW = pitch <= 4 ? 1.64 : pitch <= 8 ? 1.64 : 3.28;
    const panelH = pitch <= 4 ? 1.64 : pitch <= 8 ? 1.64 : 3.28;
    const panelsW = wFt > 0 ? Math.ceil(wFt / panelW) : 0;
    const panelsH = hFt > 0 ? Math.ceil(hFt / panelH) : 0;
    const panelQty = panelsW * panelsH;
    const screenQty = d.quantity;
    const totalPanels = panelQty * screenQty;
    const unitPrice = totalPanels > 0 ? d.hardwareCost / totalPanels : 0;
    const totalAreaSqFt = d.areaSqFt * screenQty;
    const ratePerSqFt = totalAreaSqFt > 0 ? d.hardwareCost / totalAreaSqFt : 0;

    dataRows.push({
      cells: [
        c(d.name, { bold: true }),
        c(mp?.model ?? "—"),
        num(panelQty || null),
        num(screenQty),
        num(totalPanels || null, { bold: true }),
        curr(Math.round(unitPrice)),
        curr(Math.round(d.hardwareCost), { bold: true }),
        curr(Math.round(ratePerSqFt * 100) / 100),
      ],
    });
  }

  // Subtotal
  const totalAmount = dataRows.reduce((s, r) => {
    const val = r.cells[6];
    return s + (typeof val?.value === "number" ? val.value : 0);
  }, 0);

  const totalRow: SheetRow = {
    cells: [
      c("TOTAL", { bold: true }),
      c(""), c(""), c(""), c(""),
      c(""),
      curr(totalAmount, { bold: true, highlight: true }),
      c(""),
    ],
    isTotal: true,
  };

  // Notes
  const noteRows: SheetRow[] = [
    { cells: [], isSeparator: true },
    { cells: [c("Notes:", { bold: true, span: 8 })], isHeader: true },
    { cells: [c("• 3% standard spare parts for panels only", { span: 8 })] },
    { cells: [c("• 3 years standard warranty included", { span: 8 })] },
    { cells: [c("• DDP (Delivered Duty Paid) unless noted", { span: 8 })] },
  ];

  return {
    name: "Vendor Pricing",
    color: "#475569",
    columns: cols,
    rows: [headerRow, ...dataRows, { cells: [], isSeparator: true }, totalRow, ...noteRows],
    editableColumns: [5, 6], // Unit Price and Total Amount editable
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main builder
// ═══════════════════════════════════════════════════════════════════════════

export function buildRfpWorkbook(input: RfpWorkbookInput): WorkbookData {
  const projectLabel = input.project.projectName || input.project.venue || "RFP Analysis";

  const bidFormSheet = buildBidFormSheet(input);

  const triageSheet = buildPageTriage(input);

  const sheets: SheetTab[] = [
    buildLedCostSheet(input),
    buildProcessorCount(input),
    buildMarginAnalysis(input),
    buildInstallBase(input),
    ...(bidFormSheet ? [bidFormSheet] : []),
    buildProjectInfo(input),
    buildRequirements(input),
    buildConfig(input),
    buildVendorSpecForm(input),
    buildVendorPricing(input),
    buildExtendedWarranty(input),
    buildResponsibilityMatrix(input),
    buildPandL(input),
    buildCashFlow(input),
    buildPurchaseOrders(input),
    buildTravel(input),
    ...(triageSheet ? [triageSheet] : []),
  ];

  return {
    fileName: `ANC_${(input.project.clientName || projectLabel).replace(/\s+/g, "_")}_Scoping.xlsx`,
    sheets,
  };
}
