/**
 * EstimatorBridge — Converts questionnaire answers into estimator inputs
 * and transforms estimator output into Excel preview sheet data.
 *
 * This is the glue between:
 *   QuestionFlow (answers) → Estimator (calculations) → ExcelPreview (sheet data)
 */

import type { EstimatorAnswers, DisplayAnswers } from "./questions";
import { calculateBundle, type BundleItem, type BundleResult, CATEGORY_LABELS } from "@/services/estimator/bundleRules";

// ============================================================================
// TYPES — Sheet data for ExcelPreview (re-exported from shared workbookTypes)
// ============================================================================

export type { SheetCell, SheetRow, SheetTab, WorkbookData as ExcelPreviewData } from "@/app/components/reusables/workbookTypes";
import type { SheetCell, SheetRow, SheetTab, WorkbookData as ExcelPreviewData } from "@/app/components/reusables/workbookTypes";

// ============================================================================
// CONSTANTS — From validated rate card
// ============================================================================

const DEFAULT_COST_PER_SQFT: Record<string, number> = {
    "1.2": 430,
    "1.5": 380,
    "1.875": 350,
    "2.5": 335,
    "3.9": 250,
    "4": 220,
    "6": 180,
    "10": 120,
    "16": 80,
};

const STEEL_RATES: Record<string, number> = {
    simple: 25,
    standard: 35,
    complex: 55,
    heavy: 75,
};

const LED_INSTALL_RATES: Record<string, number> = {
    simple: 75,
    standard: 105,
    complex: 145,
    heavy: 145,
};

const STRUCTURE_PCT: Record<string, number> = {
    "Front/Rear": 0.20,
    "Top": 0.10,
};

/** Optional rate card from DB — passed through from useRateCard hook */
export type RateCard = Record<string, number>;

/** Resolve a rate: DB rate card first, then hardcoded fallback */
function rc(rates: RateCard | undefined, key: string, fallback: number): number {
    return rates?.[key] ?? fallback;
}

// ============================================================================
// CABINET TETRIS — Module-based layout math
// ============================================================================

export interface CabinetLayout {
    /** Product used for layout (null = no product selected) */
    productName: string | null;
    /** Cabinet dimensions in mm */
    cabinetWidthMm: number;
    cabinetHeightMm: number;
    /** Cabinet grid */
    columnsCount: number;
    rowsCount: number;
    totalCabinets: number;
    /** Actual display size (after snapping to cabinet grid) */
    actualWidthFt: number;
    actualHeightFt: number;
    actualAreaSqFt: number;
    /** Delta from requested */
    deltaWidthFt: number;
    deltaHeightFt: number;
    deltaWidthInches: number;
    deltaHeightInches: number;
    /** Weight & power from product specs */
    weightPerCabinetKg: number;
    totalWeightKg: number;
    totalWeightLbs: number;
    maxPowerPerCabinet: number;
    totalMaxPowerW: number;
    typicalPowerPerCabinet: number;
    totalTypicalPowerW: number;
    /** Heat load calculated from power */
    heatLoadBtu: number;
    /** Resolution from actual cabinet grid */
    pixelsPerCabinetW: number;
    pixelsPerCabinetH: number;
    actualResolutionW: number;
    actualResolutionH: number;
}

/** Product spec data passed from client fetch */
export interface ProductSpec {
    cabinetWidthMm: number;
    cabinetHeightMm: number;
    weightKgPerCabinet: number;
    maxPowerWattsPerCab: number;
    typicalPowerWattsPerCab?: number;
    pixelPitch: number;
    /** Module dimensions for finer granularity (optional) */
    moduleWidthMm?: number;
    moduleHeightMm?: number;
}

export function calculateCabinetLayout(
    requestedWidthFt: number,
    requestedHeightFt: number,
    product: ProductSpec | null,
    productName?: string,
): CabinetLayout | null {
    if (!product || !product.cabinetWidthMm || !product.cabinetHeightMm) return null;

    const reqWidthMm = requestedWidthFt * 304.8;
    const reqHeightMm = requestedHeightFt * 304.8;

    // Use module dimensions if available for finer granularity (Eric's request),
    // otherwise fall back to cabinet dimensions
    const unitW = product.moduleWidthMm || product.cabinetWidthMm;
    const unitH = product.moduleHeightMm || product.cabinetHeightMm;
    const usingModules = !!(product.moduleWidthMm && product.moduleHeightMm);

    // Snap to nearest whole unit count (round to closest, minimum 1)
    const cols = Math.max(1, Math.round(reqWidthMm / unitW));
    const rows = Math.max(1, Math.round(reqHeightMm / unitH));
    const total = cols * rows;

    // Calculate modules per cabinet for weight/power conversion
    const modsPerCabW = usingModules ? Math.round(product.cabinetWidthMm / unitW) : 1;
    const modsPerCabH = usingModules ? Math.round(product.cabinetHeightMm / unitH) : 1;
    const modsPerCab = modsPerCabW * modsPerCabH;
    // Weight/power per unit (module or cabinet)
    const weightPerUnit = usingModules ? product.weightKgPerCabinet / modsPerCab : product.weightKgPerCabinet;
    const maxPowerPerUnit = usingModules ? product.maxPowerWattsPerCab / modsPerCab : product.maxPowerWattsPerCab;

    const actualWidthMm = cols * unitW;
    const actualHeightMm = rows * unitH;
    const actualWidthFt = actualWidthMm / 304.8;
    const actualHeightFt = actualHeightMm / 304.8;

    const deltaWFt = actualWidthFt - requestedWidthFt;
    const deltaHFt = actualHeightFt - requestedHeightFt;

    // Pixels per unit from pitch
    const pitch = product.pixelPitch || 4;
    const pxPerCabW = Math.round(unitW / pitch);
    const pxPerCabH = Math.round(unitH / pitch);

    const typPowerPerUnit = usingModules
        ? ((product.typicalPowerWattsPerCab ?? product.maxPowerWattsPerCab * 0.6) / modsPerCab)
        : (product.typicalPowerWattsPerCab ?? product.maxPowerWattsPerCab * 0.6);
    const totalMaxW = total * maxPowerPerUnit;

    return {
        productName: productName || null,
        cabinetWidthMm: unitW,  // Shows module dims when using modules
        cabinetHeightMm: unitH,
        columnsCount: cols,
        rowsCount: rows,
        totalCabinets: total,   // "cabinets" = modules when using module-level
        actualWidthFt: Math.round(actualWidthFt * 10000) / 10000,
        actualHeightFt: Math.round(actualHeightFt * 10000) / 10000,
        actualAreaSqFt: Math.round(actualWidthFt * actualHeightFt * 100) / 100,
        deltaWidthFt: Math.round(deltaWFt * 10000) / 10000,
        deltaHeightFt: Math.round(deltaHFt * 10000) / 10000,
        deltaWidthInches: Math.round(deltaWFt * 12 * 100) / 100,
        deltaHeightInches: Math.round(deltaHFt * 12 * 100) / 100,
        weightPerCabinetKg: Math.round(weightPerUnit * 100) / 100,
        totalWeightKg: Math.round(total * weightPerUnit * 100) / 100,
        totalWeightLbs: Math.round(total * weightPerUnit * 2.20462 * 100) / 100,
        maxPowerPerCabinet: Math.round(maxPowerPerUnit),
        totalMaxPowerW: Math.round(totalMaxW),
        typicalPowerPerCabinet: Math.round(typPowerPerUnit),
        totalTypicalPowerW: Math.round(total * typPowerPerUnit),
        heatLoadBtu: Math.round(totalMaxW * 3.412), // 1W ≈ 3.412 BTU/hr
        pixelsPerCabinetW: pxPerCabW,
        pixelsPerCabinetH: pxPerCabH,
        actualResolutionW: cols * pxPerCabW,
        actualResolutionH: rows * pxPerCabH,
    };
}

// ============================================================================
// CALCULATION ENGINE (client-side, mirrors server estimator)
// ============================================================================

export interface ScreenCalc {
    name: string;
    widthFt: number;
    heightFt: number;
    areaSqFt: number;
    pixelPitch: number;
    pixelsW: number;
    pixelsH: number;
    totalPixels: number;
    costPerSqFt: number;
    hardwareCost: number;
    spareParts: number;
    structureCost: number;
    installCost: number;
    electricalCost: number;
    equipmentCost: number;
    dataCablingCost: number;
    pmCost: number;
    engineeringCost: number;
    shippingCost: number;
    demolitionCost: number;
    totalCost: number;
    marginPct: number;
    sellPrice: number;
    bondCost: number;
    salesTaxCost: number;
    finalTotal: number;
    /** Smart Assembly Bundle — auto-suggested accessories cost */
    bundleCost: number;
    /** Individual bundle items (for UI display) */
    bundleItems: BundleItem[];
    /** If targetPrice > 0, this is the reverse-calculated margin needed */
    profitShieldMargin?: number;
    /** Cabinet layout if product selected with cabinet dimensions */
    cabinetLayout?: CabinetLayout | null;
}

export function calculateDisplay(d: DisplayAnswers, answers: EstimatorAnswers, rates?: RateCard, productSpec?: ProductSpec | null): ScreenCalc {
    const w = d.widthFt || 0;
    const h = d.heightFt || 0;
    const area = w * h;
    const pitch = parseFloat(d.pixelPitch) || 4;

    const pixelsW = Math.round((w * 304.8) / pitch);
    const pixelsH = Math.round((h * 304.8) / pitch);

    // LED cost per sqft: user override > rate card (form-factor + env aware) > hardcoded pitch table
    // Priority: fascia > perimeter > outdoor/indoor > base
    const pitchNorm = d.pixelPitch.replace(".", "_");
    const isOutdoor = answers.isIndoor === false;
    const locType = (d.locationType || "wall").toLowerCase();
    const dispType = (d.displayType || "custom").toLowerCase();
    const isFascia = locType === "fascia" || dispType.includes("fascia");
    const isPerimeter = dispType.includes("perimeter") || locType === "ribbon";

    const indoorKey = `led_cost.${pitchNorm}mm`;
    const outdoorKey = `led_cost.${pitchNorm}mm_outdoor`;
    const fasciaIndoorKey = `led_cost.${pitchNorm}mm_fascia_indoor`;
    const fasciaOutdoorKey = `led_cost.${pitchNorm}mm_fascia_outdoor`;
    const perimeterKey = `led_cost.${pitchNorm}mm_perimeter`;

    // Resolve cost: most specific key first, cascade to general
    let resolvedCostPerSqFt: number;
    if (answers.costPerSqFtOverride > 0) {
        resolvedCostPerSqFt = answers.costPerSqFtOverride;
    } else if (isFascia) {
        const fasciaKey = isOutdoor ? fasciaOutdoorKey : fasciaIndoorKey;
        resolvedCostPerSqFt = rc(rates, fasciaKey,
            rc(rates, isOutdoor ? outdoorKey : indoorKey,
                DEFAULT_COST_PER_SQFT[d.pixelPitch] || 120));
    } else if (isPerimeter) {
        resolvedCostPerSqFt = rc(rates, perimeterKey,
            rc(rates, isOutdoor ? outdoorKey : indoorKey,
                DEFAULT_COST_PER_SQFT[d.pixelPitch] || 120));
    } else {
        const pitchKey = isOutdoor ? outdoorKey : indoorKey;
        resolvedCostPerSqFt = rc(rates, pitchKey,
            rc(rates, indoorKey, DEFAULT_COST_PER_SQFT[d.pixelPitch] || 120));
    }
    const costPerSqFt = resolvedCostPerSqFt;

    const sparePartsPct = rc(rates, "spare_parts.led_pct", 0.05);
    const hardwareBase = area * costPerSqFt;
    const spareParts = d.includeSpareParts ? hardwareBase * sparePartsPct : 0;
    const hardware = hardwareBase + spareParts;

    // Steel scope: existing = 5%, secondary = 12%, full = service-type based (20% or 10%)
    const steelScope = d.steelScope || "full";
    const structPct = d.useExistingStructure
        ? 0.05
        : steelScope === "existing" ? 0.05
        : steelScope === "secondary" ? 0.12
        : (STRUCTURE_PCT[d.serviceType] || 0.20);
    const structureCost = hardware * structPct;

    // Weight estimate: ~45 lbs/m² average, area in sqft → m² = area * 0.0929
    const estimatedWeightLbs = area * 0.0929 * 45;
    const steelRate = rc(rates, `install.steel_fab.${d.installComplexity}`, STEEL_RATES[d.installComplexity] || 35);
    const ledInstallRate = rc(rates, `install.led_panel.${d.installComplexity}`, LED_INSTALL_RATES[d.installComplexity] || 105);

    const installCost = (estimatedWeightLbs * steelRate) + (area * ledInstallRate);

    // Electrical: base rate + power distance multiplier
    const elecBase = area * rc(rates, "electrical.materials_per_sqft", 125);
    const powerMult = (d.powerDistance || "near") === "near" ? 1.0
        : (d.powerDistance === "medium" ? 1.3 : 1.8);
    const electricalCost = elecBase * powerMult;

    // Equipment rental (lift/crane)
    const liftType = d.liftType || "scissor";
    const equipmentCost = liftType === "none" ? 0
        : liftType === "scissor" ? rc(rates, "equipment.scissor_lift", 500)
        : liftType === "boom" ? rc(rates, "equipment.boom_lift", 1500)
        : rc(rates, "equipment.crane", 5000); // crane

    // Data cabling: copper is standard, fiber adds flat cost
    const dataCablingCost = (d.dataRunDistance || "copper") === "fiber"
        ? rc(rates, "equipment.fiber_conversion", 3000) : 0;

    // PM complexity: standard=1×, complex=2×, major=3×
    // Complex zone modifier (1.2x) applies to complex/heavy installs per rate card
    const pmComplexity = answers.pmComplexity || "standard";
    const pmMult = pmComplexity === "standard" ? 1 : pmComplexity === "complex" ? 2 : 3;
    const complexMod = (d.installComplexity === "complex" || d.installComplexity === "heavy")
        ? rc(rates, "other.complex_modifier", 1.2) : 1.0;
    const pmCost = rc(rates, "other.pm_base_fee", 5882.35) * pmMult * complexMod;
    const engineeringCost = rc(rates, "other.eng_base_fee", 4705.88) * pmMult * complexMod;
    const shippingCost = estimatedWeightLbs * 0.5; // ~$0.50/lb shipping estimate
    const demolitionCost = d.isReplacement ? 5000 : 0;

    // Supply Only mode: servicesMargin === 0 means hardware only, no install services
    const supplyOnly = answers.servicesMargin === 0;

    // Union labor multiplier (15% uplift on labor-related costs)
    const unionMult = answers.isUnion ? 1.15 : 1.0;
    const adjInstallCost = supplyOnly ? 0 : installCost * unionMult;
    const adjStructureCost = supplyOnly ? 0 : structureCost * unionMult;
    const adjElectricalCost = supplyOnly ? 0 : electricalCost * unionMult;
    const adjEquipmentCost = supplyOnly ? 0 : equipmentCost;
    const adjDataCablingCost = supplyOnly ? 0 : dataCablingCost;
    const adjPmCost = supplyOnly ? 0 : pmCost;
    const adjEngineeringCost = supplyOnly ? 0 : engineeringCost;
    const adjShippingCost = supplyOnly ? 0 : shippingCost;
    const adjDemolitionCost = supplyOnly ? 0 : demolitionCost;

    // Smart Assembly Bundle — auto-suggested accessories
    const bundleInput = {
        displayType: d.displayType || "",
        displayName: d.displayName || "",
        widthFt: w,
        heightFt: h,
        pixelPitch: d.pixelPitch,
        locationType: d.locationType || "wall",
        serviceType: d.serviceType || "Front/Rear",
        isReplacement: d.isReplacement,
        isIndoor: answers.isIndoor,
        dataRunDistance: d.dataRunDistance || "copper",
        liftType: d.liftType || "scissor",
        installComplexity: d.installComplexity || "standard",
        totalCabinets: productSpec ? (calculateCabinetLayout(w, h, productSpec)?.totalCabinets || 0) : 0,
        areaSqFt: area,
        excludedIds: d.excludedBundleItems || [],
    };
    const bundle = calculateBundle(bundleInput);
    const adjBundleCost = supplyOnly ? 0 : bundle.totalCost;

    const totalCost = hardware + adjStructureCost + adjInstallCost + adjElectricalCost
        + adjEquipmentCost + adjDataCablingCost + adjPmCost + adjEngineeringCost + adjShippingCost + adjDemolitionCost
        + adjBundleCost;

    // Tiered margins: separate LED hardware vs services margins
    // Small project tier: <100sqft gets higher services margin per rate card
    const ledMarginPct = (answers.ledMargin || answers.defaultMargin || 30) / 100;
    const smallProjectThreshold = 100; // sqft
    const smallSvcMargin = rc(rates, "margin.services_small", 0.30);
    const baseSvcMarginPct = (answers.servicesMargin !== undefined && answers.servicesMargin !== null
        ? answers.servicesMargin : (answers.defaultMargin || 30)) / 100;
    const svcMarginPct = (area < smallProjectThreshold && baseSvcMarginPct < smallSvcMargin)
        ? smallSvcMargin : baseSvcMarginPct;
    const serviceCost = adjStructureCost + adjInstallCost + adjElectricalCost
        + adjEquipmentCost + adjDataCablingCost + adjPmCost + adjEngineeringCost + adjShippingCost + adjDemolitionCost
        + adjBundleCost;
    const hardwareSell = hardware / (1 - ledMarginPct);
    const servicesSell = serviceCost / (1 - svcMarginPct);
    const sellPrice = hardwareSell + servicesSell;
    const marginPct = totalCost > 0 ? 1 - (totalCost / sellPrice) : 0;

    const bondRate = (answers.bondRate || 1.5) / 100;
    const bondCost = sellPrice * bondRate;

    const taxRate = (answers.salesTaxRate || 9.5) / 100;
    const salesTaxCost = (sellPrice + bondCost) * taxRate;

    const finalTotal = sellPrice + bondCost + salesTaxCost;

    // Profit Shield: reverse-calc what margin would be needed to hit target price
    let profitShieldMargin: number | undefined;
    if (answers.targetPrice > 0 && totalCost > 0) {
        // targetPrice = totalCost / (1 - margin) + bond + tax  ← solve for margin
        // Simplified: margin = 1 - (totalCost / (targetPrice / (1 + bondRate) / (1 + taxRate)))
        const preTaxBond = answers.targetPrice / (1 + taxRate) / (1 + bondRate);
        profitShieldMargin = preTaxBond > 0 ? (1 - (totalCost / preTaxBond)) * 100 : 0;
    }

    return {
        name: d.displayName || "Unnamed Display",
        widthFt: w,
        heightFt: h,
        areaSqFt: area,
        pixelPitch: pitch,
        pixelsW,
        pixelsH,
        totalPixels: pixelsW * pixelsH,
        costPerSqFt,
        hardwareCost: hardware,
        spareParts,
        structureCost: adjStructureCost,
        installCost: adjInstallCost,
        electricalCost: adjElectricalCost,
        equipmentCost: adjEquipmentCost,
        dataCablingCost: adjDataCablingCost,
        pmCost: adjPmCost,
        engineeringCost: adjEngineeringCost,
        shippingCost: adjShippingCost,
        demolitionCost: adjDemolitionCost,
        bundleCost: adjBundleCost,
        bundleItems: bundle.items,
        totalCost,
        marginPct,
        sellPrice,
        bondCost,
        salesTaxCost,
        finalTotal,
        profitShieldMargin,
        cabinetLayout: productSpec
            ? calculateCabinetLayout(w, h, productSpec, d.productName)
            : null,
    };
}

// ============================================================================
// BUILD PREVIEW SHEETS
// ============================================================================

function fmt(n: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export function buildPreviewSheets(answers: EstimatorAnswers, rates?: RateCard): ExcelPreviewData {
    const clientName = answers.clientName || "Client";
    const fileName = `ANC_${clientName.replace(/\s+/g, "_")}_Cost_Analysis.xlsx`;

    const calcs = answers.displays.map((d) => calculateDisplay(d, answers, rates));

    const sheets: SheetTab[] = [
        buildProjectInfo(answers, calcs),
        buildBudgetSummary(answers, calcs),
        buildDisplayDetails(answers, calcs),
        buildLaborWorksheet(answers, calcs),
    ];

    // Add Cost Category Breakdown (3A-3G) in Detailed mode
    if (answers.estimateDepth === "detailed" && calcs.length > 0) {
        // Insert after Labor Worksheet (index 3)
        sheets.splice(4, 0, buildCostCategoryBreakdown(answers, calcs, rates));
    }

    // Add Cabinet Layout sheet if any display has cabinet data
    const hasCabinets = calcs.some((c) => c.cabinetLayout);
    if (hasCabinets) {
        sheets.splice(3, 0, buildCabinetLayout(answers, calcs));
    }

    // Add Bundle Accessories sheet if any display has bundle items
    const hasBundle = calcs.some((c) => c.bundleItems.length > 0);
    if (hasBundle) {
        sheets.push(buildBundleSheet(answers, calcs));
    }

    sheets[0].active = true;
    return { fileName, sheets };
}

// --- Project Info ---
function buildProjectInfo(answers: EstimatorAnswers, calcs: ScreenCalc[]): SheetTab {
    const rows: SheetRow[] = [];
    const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    rows.push({
        cells: [{ value: "ANC COST ANALYSIS — PROJECT INFORMATION", bold: true, header: true, span: 2, align: "center" }],
        isHeader: true,
    });
    rows.push({ cells: [{ value: "" }], isSeparator: true });

    const infoRows: [string, string | number][] = [
        ["Client", answers.clientName || "—"],
        ["Project Name", answers.projectName || "—"],
        ["Location", answers.location || "—"],
        ["Date Created", now],
        ["Document Type", answers.docType === "budget" ? "Budget Estimate" : answers.docType === "loi" ? "Letter of Intent" : "Sales Quotation"],
        ["Estimate Depth", answers.estimateDepth === "rom" ? "ROM / Budget" : "Detailed"],
        ["Currency", answers.currency || "USD"],
        ["Environment", answers.isIndoor ? "Indoor" : "Outdoor"],
        ["New Installation", answers.isNewInstall ? "Yes" : "No"],
        ["Union Labor", answers.isUnion ? "Yes (+15%)" : "No"],
        ["Number of Displays", answers.displays.length],
    ];

    for (const [label, value] of infoRows) {
        rows.push({
            cells: [
                { value: label, bold: true },
                { value },
            ],
        });
    }

    rows.push({ cells: [{ value: "" }], isSeparator: true });
    rows.push({
        cells: [{ value: "FINANCIAL PARAMETERS", bold: true, header: true, span: 2 }],
        isHeader: true,
    });

    const financialRows: [string, string | number][] = [
        ["Margin Tier", answers.marginTier === "proposal" ? "Proposal (LED 38%, Svc 20%)" : "Budget (LED 15%, Svc 20%)"],
        ["LED Hardware Margin", `${answers.ledMargin || 15}%`],
        ["Installation Services Margin", answers.servicesMargin === 0 ? "Supply Only" : `${answers.servicesMargin || 20}%`],
        ["Default Blended Margin", `${answers.defaultMargin || 30}%`],
        ["Bond Rate", `${answers.bondRate || 1.5}%`],
        ["Sales Tax Rate", `${answers.salesTaxRate || 9.5}%`],
        ["Cost/sqft Override", answers.costPerSqFtOverride > 0 ? `$${answers.costPerSqFtOverride}` : "None (catalog pricing)"],
        ["PM Complexity", (answers.pmComplexity || "standard").charAt(0).toUpperCase() + (answers.pmComplexity || "standard").slice(1)],
        ["Target Price (Profit Shield)", answers.targetPrice > 0 ? fmt(answers.targetPrice) : "Not set"],
        ["CMS (Content Management)", answers.includeCms ? `Yes — ${fmt(answers.cmsAllocation)}` : "Not included"],
        ["Scoring System", answers.includeScoring ? `Yes — ${fmt(answers.scoringAllocation)}` : "Not included"],
        ["Warranty", answers.includeWarranty === "included" ? "Included (No Charge)" : answers.includeWarranty === "priced" ? `${answers.warrantyYears || 1} Year${(parseInt(answers.warrantyYears) || 1) > 1 ? "s" : ""} — ${answers.warrantyAllocation > 0 ? fmt(answers.warrantyAllocation) : "Auto-calc"}` : "Not included"],
    ];

    for (const [label, value] of financialRows) {
        rows.push({
            cells: [
                { value: label, bold: true },
                { value },
            ],
        });
    }

    if (calcs.length > 0) {
        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({
            cells: [{ value: "SUMMARY TOTALS", bold: true, header: true, span: 2 }],
            isHeader: true,
        });

        // Include CMS, Scoring, Warranty add-on costs
        const svcMPct = (answers.servicesMargin !== undefined && answers.servicesMargin !== null
            ? answers.servicesMargin : (answers.defaultMargin || 30)) / 100;
        const addOnCost = (answers.includeCms ? answers.cmsAllocation : 0)
            + (answers.includeScoring ? answers.scoringAllocation : 0)
            + (answers.includeWarranty === "priced" ? (answers.warrantyAllocation > 0 ? answers.warrantyAllocation : calcs.reduce((s, c) => s + c.hardwareCost, 0) * 0.03 * (parseInt(answers.warrantyYears) || 1)) : 0);
        const addOnSellPI = svcMPct < 1 ? addOnCost / (1 - svcMPct) : addOnCost;

        const totalCost = calcs.reduce((s, c) => s + c.totalCost, 0) + addOnCost;
        const totalSell = calcs.reduce((s, c) => s + c.sellPrice, 0) + addOnSellPI;
        const bRate = (answers.bondRate || 1.5) / 100;
        const tRate = (answers.salesTaxRate || 9.5) / 100;
        const grandTotal = totalSell + (totalSell * bRate) + ((totalSell + totalSell * bRate) * tRate);
        const blended = totalCost > 0 ? ((1 - totalCost / totalSell) * 100).toFixed(1) : "0";

        rows.push({ cells: [{ value: "Total Cost", bold: true }, { value: totalCost, currency: true }] });
        rows.push({ cells: [{ value: "Total Sell Price", bold: true }, { value: totalSell, currency: true }] });
        rows.push({ cells: [{ value: "Blended Margin %", bold: true }, { value: `${blended}%` }] });
        rows.push({ cells: [{ value: "Blended Margin $", bold: true }, { value: totalSell - totalCost, currency: true }] });
        rows.push({
            cells: [{ value: "Grand Total", bold: true }, { value: grandTotal, currency: true, bold: true, highlight: true }],
            isTotal: true,
        });
    }

    return {
        name: "Project Info",
        color: "#6366F1",
        columns: ["FIELD", "VALUE"],
        rows,
    };
}

// --- Budget Summary ---
function buildBudgetSummary(answers: EstimatorAnswers, calcs: ScreenCalc[]): SheetTab {
    const rows: SheetRow[] = [];
    const docLabel = answers.docType === "budget" ? "BUDGET ESTIMATE" : answers.docType === "loi" ? "LETTER OF INTENT" : "SALES QUOTATION";

    rows.push({
        cells: [{ value: `ANC ${docLabel} — ${answers.projectName || "PROJECT"}`, bold: true, header: true, span: 8, align: "center" }],
        isHeader: true,
    });
    rows.push({
        cells: [
            { value: `Client: ${answers.clientName || "—"}`, span: 4 },
            { value: `Location: ${answers.location || "—"}`, span: 4 },
        ],
    });
    rows.push({ cells: [{ value: "" }], isSeparator: true });
    rows.push({
        cells: [
            { value: "CATEGORY", bold: true, header: true },
            { value: "DESCRIPTION", bold: true, header: true },
            { value: "QTY", bold: true, header: true, align: "center" },
            { value: "UNIT", bold: true, header: true, align: "center" },
            { value: "COST", bold: true, header: true, align: "right" },
            { value: "SELLING PRICE", bold: true, header: true, align: "right" },
            { value: "MARGIN %", bold: true, header: true, align: "center" },
            { value: "MARGIN $", bold: true, header: true, align: "right" },
        ],
        isHeader: true,
    });

    if (calcs.length === 0) {
        rows.push({ cells: [{ value: "No displays configured yet", span: 8, align: "center" }] });
    } else {
        // LED Hardware
        rows.push({
            cells: [{ value: "1.0 LED HARDWARE", bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }],
        });
        for (let i = 0; i < calcs.length; i++) {
            const c = calcs[i];
            const d = answers.displays[i];
            const hwSell = c.hardwareCost / (1 - c.marginPct);
            const hwMarginDollar = hwSell - c.hardwareCost;
            // TVs: show model name (no pitch), LEDs: show name with pitch
            const desc = isTvDisplay(d)
                ? displayDescription(d, c)
                : `${c.name} — ${c.pixelPitch}mm`;
            rows.push({
                cells: [
                    { value: "" },
                    { value: desc },
                    { value: 1, align: "center" },
                    { value: "EA", align: "center" },
                    { value: c.hardwareCost, currency: true, align: "right" },
                    { value: hwSell, currency: true, align: "right" },
                    { value: c.marginPct, percent: true, align: "center" },
                    { value: hwMarginDollar, currency: true, align: "right" },
                ],
            });
        }

        // Services — broken out by line item
        const svcMarginPctBudget = (answers.servicesMargin !== undefined && answers.servicesMargin !== null
            ? answers.servicesMargin : (answers.defaultMargin || 30)) / 100;
        rows.push({
            cells: [{ value: "2.0 INSTALLATION SERVICES", bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }],
        });

        // Aggregate labor line items across all displays
        let totStruct = 0, totInstall = 0, totElec = 0, totEquip = 0, totPm = 0, totEng = 0, totShip = 0, totDemo = 0;
        for (const c of calcs) {
            totStruct += c.structureCost;
            totInstall += c.installCost;
            totElec += c.electricalCost;
            totEquip += c.equipmentCost + c.dataCablingCost;
            totPm += c.pmCost;
            totEng += c.engineeringCost;
            totShip += c.shippingCost;
            totDemo += c.demolitionCost;
        }

        const laborLines: [string, number][] = [
            ["Structural / Steel Fabrication", totStruct],
            ["LED Installation Labor", totInstall],
            ["Electrical & Power", totElec],
            ["Equipment Rental & Data Cabling", totEquip],
            ["Project Management", totPm],
            ["Engineering", totEng],
            ["Shipping & Logistics", totShip],
        ];
        if (totDemo > 0) laborLines.push(["Demolition / Removal", totDemo]);

        for (const [label, cost] of laborLines) {
            if (cost === 0) continue;
            const sell = svcMarginPctBudget < 1 ? cost / (1 - svcMarginPctBudget) : cost;
            const marginDollar = sell - cost;
            rows.push({
                cells: [
                    { value: "" },
                    { value: label },
                    { value: 1, align: "center" },
                    { value: "LS", align: "center" },
                    { value: cost, currency: true, align: "right" },
                    { value: sell, currency: true, align: "right" },
                    { value: svcMarginPctBudget, percent: true, align: "center" },
                    { value: marginDollar, currency: true, align: "right" },
                ],
            });
        }

        // Accessories / Bundle Items
        const allBundleItems: { name: string; cost: number }[] = [];
        for (const c of calcs) {
            if (c.bundleItems) {
                for (const item of c.bundleItems) {
                    const existing = allBundleItems.find((b) => b.name === item.name);
                    if (existing) {
                        existing.cost += item.totalCost;
                    } else {
                        allBundleItems.push({ name: item.name, cost: item.totalCost });
                    }
                }
            }
        }

        if (allBundleItems.length > 0) {
            rows.push({
                cells: [{ value: "3.0 ACCESSORIES", bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }],
            });
            for (const item of allBundleItems) {
                const sell = svcMarginPctBudget < 1 ? item.cost / (1 - svcMarginPctBudget) : item.cost;
                const marginDollar = sell - item.cost;
                rows.push({
                    cells: [
                        { value: "" },
                        { value: item.name },
                        { value: 1, align: "center" },
                        { value: "EA", align: "center" },
                        { value: item.cost, currency: true, align: "right" },
                        { value: sell, currency: true, align: "right" },
                        { value: svcMarginPctBudget, percent: true, align: "center" },
                        { value: marginDollar, currency: true, align: "right" },
                    ],
                });
            }
        }

        // CMS Section
        let cmsCost = 0;
        let cmsSell = 0;
        if (answers.includeCms && answers.cmsAllocation > 0) {
            cmsCost = answers.cmsAllocation;
            cmsSell = svcMarginPctBudget < 1 ? cmsCost / (1 - svcMarginPctBudget) : cmsCost;
            const cmsMarginDollar = cmsSell - cmsCost;
            let sectionNum = allBundleItems.length > 0 ? 4 : 3;
            // Adjust numbering: 3.0 is accessories (if present), so CMS starts at next
            const cmsLabel = `${sectionNum}.0 CMS (CONTENT MANAGEMENT)`;
            rows.push({
                cells: [{ value: cmsLabel, bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }],
            });
            rows.push({
                cells: [
                    { value: "" },
                    { value: "Content Management System" },
                    { value: 1, align: "center" },
                    { value: "LS", align: "center" },
                    { value: cmsCost, currency: true, align: "right" },
                    { value: cmsSell, currency: true, align: "right" },
                    { value: svcMarginPctBudget, percent: true, align: "center" },
                    { value: cmsMarginDollar, currency: true, align: "right" },
                ],
            });
        }

        // Scoring Section
        let scoringCost = 0;
        let scoringSell = 0;
        if (answers.includeScoring && answers.scoringAllocation > 0) {
            scoringCost = answers.scoringAllocation;
            scoringSell = svcMarginPctBudget < 1 ? scoringCost / (1 - svcMarginPctBudget) : scoringCost;
            const scoringMarginDollar = scoringSell - scoringCost;
            let sectionNum = (allBundleItems.length > 0 ? 3 : 2) + (answers.includeCms && answers.cmsAllocation > 0 ? 1 : 0) + 1;
            const scoringLabel = `${sectionNum}.0 SCORING SYSTEM`;
            rows.push({
                cells: [{ value: scoringLabel, bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }],
            });
            rows.push({
                cells: [
                    { value: "" },
                    { value: "Scoring & Timing System" },
                    { value: 1, align: "center" },
                    { value: "LS", align: "center" },
                    { value: scoringCost, currency: true, align: "right" },
                    { value: scoringSell, currency: true, align: "right" },
                    { value: svcMarginPctBudget, percent: true, align: "center" },
                    { value: scoringMarginDollar, currency: true, align: "right" },
                ],
            });
        }

        // Warranty Section
        let warrantyCost = 0;
        let warrantySell = 0;
        if (answers.includeWarranty === "included" || answers.includeWarranty === "priced") {
            const years = parseInt(answers.warrantyYears || "1") || 1;
            if (answers.includeWarranty === "priced") {
                // Use manual allocation, or auto-calc: 3% of total hardware cost per year
                const totalHw = calcs.reduce((s, c) => s + c.hardwareCost, 0);
                warrantyCost = answers.warrantyAllocation > 0 ? answers.warrantyAllocation : totalHw * 0.03 * years;
                warrantySell = svcMarginPctBudget < 1 ? warrantyCost / (1 - svcMarginPctBudget) : warrantyCost;
            }
            // For "included", warrantyCost and warrantySell stay 0
            const warrantyMarginDollar = warrantySell - warrantyCost;
            let sectionNum = (allBundleItems.length > 0 ? 3 : 2)
                + (answers.includeCms && answers.cmsAllocation > 0 ? 1 : 0)
                + (answers.includeScoring && answers.scoringAllocation > 0 ? 1 : 0) + 1;
            const warrantyLabel = `${sectionNum}.0 WARRANTY`;
            rows.push({
                cells: [{ value: warrantyLabel, bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }],
            });
            const isIncluded = answers.includeWarranty === "included";
            rows.push({
                cells: [
                    { value: "" },
                    { value: `Extended Warranty — ${years} Year${years > 1 ? "s" : ""}${isIncluded ? " (Included)" : ""}` },
                    { value: 1, align: "center" },
                    { value: "LS", align: "center" },
                    { value: isIncluded ? 0 : warrantyCost, currency: true, align: "right" },
                    { value: isIncluded ? 0 : warrantySell, currency: true, align: "right" },
                    { value: isIncluded ? 0 : svcMarginPctBudget, percent: true, align: "center" },
                    { value: isIncluded ? 0 : warrantyMarginDollar, currency: true, align: "right" },
                ],
            });
        }

        // Totals
        rows.push({ cells: [{ value: "" }], isSeparator: true });
        const totalCost = calcs.reduce((s, c) => s + c.totalCost, 0) + cmsCost + scoringCost + warrantyCost;
        const totalSell = calcs.reduce((s, c) => s + c.sellPrice, 0) + cmsSell + scoringSell + warrantySell;
        const addOnSell = cmsSell + scoringSell + warrantySell;
        const bondRate = (answers.bondRate || 1.5) / 100;
        const taxRate = (answers.salesTaxRate || 9.5) / 100;
        const baseBond = calcs.reduce((s, c) => s + c.bondCost, 0);
        const totalBond = baseBond + (addOnSell * bondRate);
        const baseTax = calcs.reduce((s, c) => s + c.salesTaxCost, 0);
        const totalTax = baseTax + ((addOnSell + addOnSell * bondRate) * taxRate);
        const grandTotal = totalSell + totalBond + totalTax;

        const totalMarginPct = totalCost > 0 ? 1 - (totalCost / totalSell) : 0;
        const totalMarginDollar = totalSell - totalCost;

        rows.push({
            cells: [{ value: "SUBTOTAL", bold: true }, { value: "" }, { value: "" }, { value: "" },
                { value: totalCost, currency: true, align: "right", bold: true },
                { value: totalSell, currency: true, align: "right", bold: true },
                { value: totalMarginPct, percent: true, align: "center", bold: true },
                { value: totalMarginDollar, currency: true, align: "right", bold: true }],
            isTotal: true,
        });
        rows.push({
            cells: [{ value: `BOND (${answers.bondRate || 1.5}%)`, bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" },
                { value: totalBond, currency: true, align: "right" }, { value: "" }, { value: "" }],
        });
        rows.push({
            cells: [{ value: `SALES TAX (${answers.salesTaxRate || 9.5}%)`, bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" },
                { value: totalTax, currency: true, align: "right" }, { value: "" }, { value: "" }],
        });
        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({
            cells: [{ value: "PROJECT TOTAL", bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" },
                { value: grandTotal, currency: true, align: "right", bold: true, highlight: true }, { value: "" }, { value: "" }],
            isTotal: true,
        });

        // Profit Shield analysis (folded from Margin Analysis)
        if (calcs[0]?.profitShieldMargin != null) {
            rows.push({ cells: [{ value: "" }], isSeparator: true });
            rows.push({
                cells: [{ value: "PROFIT SHIELD ANALYSIS", bold: true, header: true, span: 8 }],
                isHeader: true,
            });
            rows.push({
                cells: [
                    { value: "Target Price", bold: true },
                    { value: "" },
                    { value: "" },
                    { value: "" },
                    { value: "" },
                    { value: answers.targetPrice, currency: true, align: "right", highlight: true },
                    { value: "" },
                    { value: "" },
                ],
            });
            rows.push({
                cells: [
                    { value: "Required Blended Margin", bold: true },
                    { value: "" },
                    { value: "" },
                    { value: "" },
                    { value: `${calcs[0].profitShieldMargin.toFixed(1)}%` },
                    { value: "" },
                    { value: calcs[0].profitShieldMargin >= 10 ? "VIABLE" : "WARNING: LOW MARGIN", bold: true, highlight: calcs[0].profitShieldMargin < 10 },
                    { value: "" },
                ],
            });
        }
    }

    return {
        name: "Budget Summary",
        color: "#0A52EF",
        columns: ["CATEGORY", "DESCRIPTION", "QTY", "UNIT", "COST", "SELLING PRICE", "MARGIN %", "MARGIN $"],
        rows,
    };
}

// --- Display Details ---
/** Compute diagonal screen size in inches from width/height in feet */
function diagonalInches(wFt: number, hFt: number): number {
    return Math.round(Math.sqrt((wFt * 12) ** 2 + (hFt * 12) ** 2));
}

/** Check if a display is a TV/commercial display (not LED) */
function isTvDisplay(d: DisplayAnswers): boolean {
    const name = (d.productName || d.displayName || "").toLowerCase();
    const type = (d.displayType || "").toLowerCase();
    return type.includes("tv") || type.includes("commercial") || type.includes("concourse-display") ||
        name.includes("uh5j") || name.includes("sm5j") || name.includes("um5k") ||
        name.includes(" tv") || name.includes("lg ") || /\b\d{2,3}["″]/.test(name);
}

/** Build a display description: use product name + size for TVs, original name for LED */
function displayDescription(d: DisplayAnswers, c: ScreenCalc): string {
    if (isTvDisplay(d)) {
        const model = d.productName || d.displayName || c.name;
        const inches = diagonalInches(c.widthFt, c.heightFt);
        // If model already has the size, don't duplicate
        if (model.includes(`${inches}`) || model.includes(`${inches}"`)) return model;
        return `${model} (${inches}")`;
    }
    return c.name;
}

function buildDisplayDetails(answers: EstimatorAnswers, calcs: ScreenCalc[]): SheetTab {
    const rows: SheetRow[] = [];
    const COLS = 12; // Total columns

    rows.push({
        cells: [{ value: "DISPLAY SPECIFICATIONS & COSTS", bold: true, header: true, span: COLS, align: "center" }],
        isHeader: true,
    });
    rows.push({ cells: [{ value: "" }], isSeparator: true });

    if (calcs.length === 0) {
        rows.push({
            cells: [
                { value: "DISPLAY", bold: true, header: true },
                { value: "TYPE", bold: true, header: true },
                { value: "W (ft)", bold: true, header: true, align: "center" },
                { value: "H (ft)", bold: true, header: true, align: "center" },
                { value: "SQ FT", bold: true, header: true, align: "center" },
                { value: "PITCH", bold: true, header: true, align: "center" },
                { value: "PIXELS", bold: true, header: true, align: "right" },
                { value: "$/SQFT", bold: true, header: true, align: "right" },
                { value: "LED COST", bold: true, header: true, align: "right" },
                { value: "SELL PRICE", bold: true, header: true, align: "right" },
                { value: "MARGIN %", bold: true, header: true, align: "center" },
                { value: "MARGIN $", bold: true, header: true, align: "right" },
            ],
            isHeader: true,
        });
        rows.push({ cells: [{ value: "No displays configured yet", span: COLS, align: "center" }] });
    } else {
        // Separate TVs from LED displays
        const tvDisplays: { d: DisplayAnswers; c: ScreenCalc }[] = [];
        const ledDisplays: { d: DisplayAnswers; c: ScreenCalc; idx: number }[] = [];

        for (let i = 0; i < calcs.length; i++) {
            const d = answers.displays[i];
            const c = calcs[i];
            if (isTvDisplay(d)) {
                tvDisplays.push({ d, c });
            } else {
                ledDisplays.push({ d, c, idx: i });
            }
        }

        // ── LED Displays (individual rows) ──
        if (ledDisplays.length > 0) {
            rows.push({
                cells: [
                    { value: "DISPLAY", bold: true, header: true },
                    { value: "TYPE", bold: true, header: true },
                    { value: "W (ft)", bold: true, header: true, align: "center" },
                    { value: "H (ft)", bold: true, header: true, align: "center" },
                    { value: "SQ FT", bold: true, header: true, align: "center" },
                    { value: "PITCH", bold: true, header: true, align: "center" },
                    { value: "PIXELS", bold: true, header: true, align: "right" },
                    { value: "$/SQFT", bold: true, header: true, align: "right" },
                    { value: "LED COST", bold: true, header: true, align: "right" },
                    { value: "SELL PRICE", bold: true, header: true, align: "right" },
                    { value: "MARGIN %", bold: true, header: true, align: "center" },
                    { value: "MARGIN $", bold: true, header: true, align: "right" },
                ],
                isHeader: true,
            });

            for (const { d, c } of ledDisplays) {
                const hwSell = c.hardwareCost / (1 - c.marginPct);
                const marginDollar = hwSell - c.hardwareCost;
                rows.push({
                    cells: [
                        { value: displayDescription(d, c) },
                        { value: (d?.displayType || "custom").replace(/_/g, " ") },
                        { value: c.widthFt, align: "center" },
                        { value: c.heightFt, align: "center" },
                        { value: Math.round(c.areaSqFt * 100) / 100, align: "center" },
                        { value: `${c.pixelPitch}mm`, align: "center" },
                        { value: c.totalPixels.toLocaleString(), align: "right" },
                        { value: c.costPerSqFt, currency: true, align: "right" },
                        { value: c.hardwareCost, currency: true, align: "right" },
                        { value: hwSell, currency: true, align: "right" },
                        { value: c.marginPct, percent: true, align: "center" },
                        { value: marginDollar, currency: true, align: "right" },
                    ],
                });
            }
        }

        // ── TV / Commercial Displays (grouped by model + size) ──
        if (tvDisplays.length > 0) {
            if (ledDisplays.length > 0) {
                rows.push({ cells: [{ value: "" }], isSeparator: true });
            }
            rows.push({
                cells: [{ value: "COMMERCIAL DISPLAYS / TVs", bold: true, header: true, span: COLS }],
                isHeader: true,
            });
            rows.push({
                cells: [
                    { value: "MODEL", bold: true, header: true },
                    { value: "LOCATION", bold: true, header: true },
                    { value: "QTY", bold: true, header: true, align: "center" },
                    { value: "SIZE", bold: true, header: true, align: "center" },
                    { value: "", bold: true, header: true },
                    { value: "", bold: true, header: true },
                    { value: "", bold: true, header: true },
                    { value: "UNIT COST", bold: true, header: true, align: "right" },
                    { value: "TOTAL COST", bold: true, header: true, align: "right" },
                    { value: "SELL PRICE", bold: true, header: true, align: "right" },
                    { value: "MARGIN %", bold: true, header: true, align: "center" },
                    { value: "MARGIN $", bold: true, header: true, align: "right" },
                ],
                isHeader: true,
            });

            // Group TVs by product model + size
            const tvGroups = new Map<string, { model: string; location: string; inches: number; qty: number; unitCost: number; totalCost: number; totalSell: number; marginPct: number }>();
            for (const { d, c } of tvDisplays) {
                const model = d.productName || d.displayName || c.name;
                const inches = diagonalInches(c.widthFt, c.heightFt);
                const key = `${model}__${inches}`;
                const hwSell = c.hardwareCost / (1 - c.marginPct);
                const existing = tvGroups.get(key);
                if (existing) {
                    existing.qty += 1;
                    existing.totalCost += c.hardwareCost;
                    existing.totalSell += hwSell;
                } else {
                    // Derive location from display name (e.g., "Suite TV 1" → "Suite")
                    const loc = (d.displayName || c.name).replace(/\s*(tv|display|monitor)\s*\d*/gi, "").replace(/\d+$/, "").trim() || d.locationType || "";
                    tvGroups.set(key, { model, location: loc, inches, qty: 1, unitCost: c.hardwareCost, totalCost: c.hardwareCost, totalSell: hwSell, marginPct: c.marginPct });
                }
            }

            for (const g of tvGroups.values()) {
                const marginDollar = g.totalSell - g.totalCost;
                rows.push({
                    cells: [
                        { value: g.model },
                        { value: g.location },
                        { value: g.qty, align: "center" },
                        { value: `${g.inches}"`, align: "center" },
                        { value: "" },
                        { value: "" },
                        { value: "" },
                        { value: g.unitCost, currency: true, align: "right" },
                        { value: g.totalCost, currency: true, align: "right" },
                        { value: g.totalSell, currency: true, align: "right" },
                        { value: g.marginPct, percent: true, align: "center" },
                        { value: marginDollar, currency: true, align: "right" },
                    ],
                });
            }
        }

        // Total row
        const totalHwCost = calcs.reduce((s, c) => s + c.hardwareCost, 0);
        const totalHwSell = calcs.reduce((s, c) => s + c.hardwareCost / (1 - c.marginPct), 0);
        const totalMarginDollar = totalHwSell - totalHwCost;
        const totalMarginPct = totalHwCost > 0 ? 1 - (totalHwCost / totalHwSell) : 0;
        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({
            cells: [
                { value: "TOTAL", bold: true }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" },
                { value: totalHwCost, currency: true, align: "right", bold: true },
                { value: totalHwSell, currency: true, align: "right", bold: true },
                { value: totalMarginPct, percent: true, align: "center", bold: true },
                { value: totalMarginDollar, currency: true, align: "right", bold: true },
            ],
            isTotal: true,
        });
    }

    return {
        name: "Display Details",
        color: "#FFC107",
        columns: ["DISPLAY", "TYPE", "W (ft)", "H (ft)", "SQ FT", "PITCH", "PIXELS", "$/SQFT", "LED COST", "SELL PRICE", "MARGIN %", "MARGIN $"],
        rows,
    };
}

// --- Labor Worksheet ---
function buildLaborWorksheet(answers: EstimatorAnswers, calcs: ScreenCalc[]): SheetTab {
    const rows: SheetRow[] = [];
    const COLS = 11;

    const svcMarginPct = (answers.servicesMargin !== undefined && answers.servicesMargin !== null
        ? answers.servicesMargin : (answers.defaultMargin || 30)) / 100;

    rows.push({
        cells: [{ value: "INSTALLATION & LABOR COSTS", bold: true, header: true, span: COLS, align: "center" }],
        isHeader: true,
    });
    rows.push({ cells: [{ value: "" }], isSeparator: true });
    rows.push({
        cells: [
            { value: "DISPLAY", bold: true, header: true },
            { value: "STRUCTURAL", bold: true, header: true, align: "right" },
            { value: "INSTALL", bold: true, header: true, align: "right" },
            { value: "ELECTRICAL", bold: true, header: true, align: "right" },
            { value: "EQUIP/DATA", bold: true, header: true, align: "right" },
            { value: "PM / ENG", bold: true, header: true, align: "right" },
            { value: "SHIPPING", bold: true, header: true, align: "right" },
            { value: "TOTAL COST", bold: true, header: true, align: "right" },
            { value: "SALE PRICE", bold: true, header: true, align: "right" },
            { value: "MARGIN %", bold: true, header: true, align: "center" },
            { value: "MARGIN $", bold: true, header: true, align: "right" },
        ],
        isHeader: true,
    });

    if (calcs.length === 0) {
        rows.push({ cells: [{ value: "No displays configured yet", span: COLS, align: "center" }] });
    } else {
        let totalStruct = 0, totalInstall = 0, totalElec = 0, totalEquip = 0, totalPm = 0, totalShip = 0, totalAll = 0;

        for (const c of calcs) {
            const equipData = c.equipmentCost + c.dataCablingCost;
            const lineTotal = c.structureCost + c.installCost + c.electricalCost + equipData + c.pmCost + c.engineeringCost + c.shippingCost + c.demolitionCost;
            totalStruct += c.structureCost;
            totalInstall += c.installCost;
            totalElec += c.electricalCost;
            totalEquip += equipData;
            totalPm += c.pmCost + c.engineeringCost;
            totalShip += c.shippingCost;
            totalAll += lineTotal;

            const lineSell = svcMarginPct < 1 ? lineTotal / (1 - svcMarginPct) : lineTotal;
            const lineMargin = lineSell - lineTotal;

            rows.push({
                cells: [
                    { value: c.name },
                    { value: c.structureCost, currency: true, align: "right" },
                    { value: c.installCost, currency: true, align: "right" },
                    { value: c.electricalCost, currency: true, align: "right" },
                    { value: equipData, currency: true, align: "right" },
                    { value: c.pmCost + c.engineeringCost, currency: true, align: "right" },
                    { value: c.shippingCost, currency: true, align: "right" },
                    { value: lineTotal, currency: true, align: "right", bold: true },
                    { value: lineSell, currency: true, align: "right" },
                    { value: svcMarginPct, percent: true, align: "center" },
                    { value: lineMargin, currency: true, align: "right" },
                ],
            });
        }

        const totalSellPrice = svcMarginPct < 1 ? totalAll / (1 - svcMarginPct) : totalAll;
        const totalMarginDollars = totalSellPrice - totalAll;

        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({
            cells: [
                { value: "TOTAL", bold: true },
                { value: totalStruct, currency: true, align: "right", bold: true },
                { value: totalInstall, currency: true, align: "right", bold: true },
                { value: totalElec, currency: true, align: "right", bold: true },
                { value: totalEquip, currency: true, align: "right", bold: true },
                { value: totalPm, currency: true, align: "right", bold: true },
                { value: totalShip, currency: true, align: "right", bold: true },
                { value: totalAll, currency: true, align: "right", bold: true },
                { value: totalSellPrice, currency: true, align: "right", bold: true },
                { value: svcMarginPct, percent: true, align: "center", bold: true },
                { value: totalMarginDollars, currency: true, align: "right", bold: true },
            ],
            isTotal: true,
        });

        // ── Rate Basis Detail ──
        const unionLabel = answers.isUnion ? " (union +15%)" : "";
        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({
            cells: [{ value: "RATE BASIS", bold: true, header: true, span: COLS, align: "center" }],
            isHeader: true,
        });
        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({ cells: [
            { value: "Structural", bold: true, span: 5 },
            { value: `% of hardware cost${unionLabel}`, span: 6 },
        ]});
        rows.push({ cells: [
            { value: "LED Install", bold: true, span: 5 },
            { value: `Steel fab rate + panel install rate per sqft${unionLabel}`, span: 6 },
        ]});
        rows.push({ cells: [
            { value: "Electrical", bold: true, span: 5 },
            { value: `Materials per sqft × power distance multiplier${unionLabel}`, span: 6 },
        ]});
        rows.push({ cells: [
            { value: "PM / Engineering", bold: true, span: 5 },
            { value: `Base fee × complexity multiplier (${answers.pmComplexity || "standard"})`, span: 6 },
        ]});
        rows.push({ cells: [
            { value: "Shipping", bold: true, span: 5 },
            { value: "Estimated weight × $0.50/lb", span: 6 },
        ]});
    }

    return {
        name: "Labor Worksheet",
        color: "#28A745",
        columns: ["DISPLAY", "STRUCTURAL", "INSTALL", "ELECTRICAL", "EQUIP/DATA", "PM / ENG", "SHIPPING", "TOTAL COST", "SALE PRICE", "MARGIN %", "MARGIN $"],
        rows,
    };
}

// --- Cabinet Layout (Tetris) ---
function buildCabinetLayout(answers: EstimatorAnswers, calcs: ScreenCalc[]): SheetTab {
    const rows: SheetRow[] = [];

    rows.push({
        cells: [{ value: "CABINET LAYOUT — MODULE TETRIS", bold: true, header: true, span: 8, align: "center" }],
        isHeader: true,
    });
    rows.push({ cells: [{ value: "" }], isSeparator: true });

    for (let i = 0; i < calcs.length; i++) {
        const c = calcs[i];
        const cab = c.cabinetLayout;
        if (!cab) continue;

        // Section header
        rows.push({
            cells: [{ value: `${c.name}  (${cab.productName || "Product"})`, bold: true, header: true, span: 8 }],
            isHeader: true,
        });

        // Requested vs Actual
        rows.push({
            cells: [
                { value: "", bold: true, header: true },
                { value: "REQUESTED", bold: true, header: true, align: "center" },
                { value: "ACTUAL", bold: true, header: true, align: "center" },
                { value: "DELTA", bold: true, header: true, align: "center" },
                { value: "", span: 4 },
            ],
            isHeader: true,
        });
        const wDeltaStr = cab.deltaWidthInches >= 0 ? `+${cab.deltaWidthInches}"` : `${cab.deltaWidthInches}"`;
        const hDeltaStr = cab.deltaHeightInches >= 0 ? `+${cab.deltaHeightInches}"` : `${cab.deltaHeightInches}"`;
        rows.push({
            cells: [
                { value: "Width", bold: true },
                { value: `${c.widthFt.toFixed(2)} ft`, align: "center" },
                { value: `${cab.actualWidthFt.toFixed(4)} ft`, align: "center" },
                { value: wDeltaStr, align: "center", highlight: Math.abs(cab.deltaWidthInches) > 2 },
                { value: "" }, { value: "" }, { value: "" }, { value: "" },
            ],
        });
        rows.push({
            cells: [
                { value: "Height", bold: true },
                { value: `${c.heightFt.toFixed(2)} ft`, align: "center" },
                { value: `${cab.actualHeightFt.toFixed(4)} ft`, align: "center" },
                { value: hDeltaStr, align: "center", highlight: Math.abs(cab.deltaHeightInches) > 2 },
                { value: "" }, { value: "" }, { value: "" }, { value: "" },
            ],
        });
        rows.push({
            cells: [
                { value: "Area", bold: true },
                { value: `${c.areaSqFt.toFixed(1)} sqft`, align: "center" },
                { value: `${cab.actualAreaSqFt.toFixed(1)} sqft`, align: "center" },
                { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" },
            ],
        });

        rows.push({ cells: [{ value: "" }], isSeparator: true });

        // Cabinet grid
        rows.push({
            cells: [
                { value: "CABINET GRID", bold: true, header: true, span: 4 },
                { value: "SPECS", bold: true, header: true, span: 4 },
            ],
            isHeader: true,
        });
        rows.push({
            cells: [
                { value: "Cabinet Size", bold: true },
                { value: `${cab.cabinetWidthMm} × ${cab.cabinetHeightMm} mm` },
                { value: "" }, { value: "" },
                { value: "Resolution", bold: true },
                { value: `${cab.actualResolutionW} × ${cab.actualResolutionH}` },
                { value: "" }, { value: "" },
            ],
        });
        rows.push({
            cells: [
                { value: "Layout", bold: true },
                { value: `${cab.columnsCount} cols × ${cab.rowsCount} rows` },
                { value: "" }, { value: "" },
                { value: "Weight", bold: true },
                { value: `${cab.totalWeightLbs.toLocaleString()} lbs (${cab.totalWeightKg.toLocaleString()} kg)` },
                { value: "" }, { value: "" },
            ],
        });
        rows.push({
            cells: [
                { value: "Total Cabinets", bold: true },
                { value: cab.totalCabinets, bold: true, highlight: true },
                { value: "" }, { value: "" },
                { value: "Max Power", bold: true },
                { value: `${cab.totalMaxPowerW.toLocaleString()} W` },
                { value: "" }, { value: "" },
            ],
        });
        rows.push({
            cells: [
                { value: "" }, { value: "" }, { value: "" }, { value: "" },
                { value: "Typical Power", bold: true },
                { value: `${cab.totalTypicalPowerW.toLocaleString()} W` },
                { value: "" }, { value: "" },
            ],
        });
        rows.push({
            cells: [
                { value: "" }, { value: "" }, { value: "" }, { value: "" },
                { value: "Heat Load", bold: true },
                { value: `${cab.heatLoadBtu.toLocaleString()} BTU/hr` },
                { value: "" }, { value: "" },
            ],
        });

        // Delta warning
        if (Math.abs(cab.deltaWidthInches) > 2 || Math.abs(cab.deltaHeightInches) > 2) {
            rows.push({ cells: [{ value: "" }], isSeparator: true });
            rows.push({
                cells: [{
                    value: `⚠ Note: Actual screen is ${wDeltaStr} W × ${hDeltaStr} H vs architectural drawings due to module dimensions.`,
                    bold: true,
                    highlight: true,
                    span: 8,
                }],
            });
        }

        if (i < calcs.length - 1) {
            rows.push({ cells: [{ value: "" }], isSeparator: true });
            rows.push({ cells: [{ value: "" }], isSeparator: true });
        }
    }

    return {
        name: "Cabinet Layout",
        color: "#8B5CF6",
        columns: ["", "A", "B", "C", "", "D", "E", "F"],
        rows,
    };
}

// --- Bundle Accessories (Smart Assembly Bundler) ---
function buildBundleSheet(answers: EstimatorAnswers, calcs: ScreenCalc[]): SheetTab {
    const rows: SheetRow[] = [];

    rows.push({
        cells: [{ value: "SMART ASSEMBLY BUNDLE — AUTO-SUGGESTED ACCESSORIES", bold: true, header: true, span: 6, align: "center" }],
        isHeader: true,
    });
    rows.push({ cells: [{ value: "" }], isSeparator: true });

    let projectBundleTotal = 0;

    for (let i = 0; i < calcs.length; i++) {
        const c = calcs[i];
        const d = answers.displays[i];
        if (!c.bundleItems.length) continue;

        // Display header
        rows.push({
            cells: [{ value: `${c.name}`, bold: true, header: true, span: 6 }],
            isHeader: true,
        });
        rows.push({
            cells: [
                { value: "ITEM", bold: true, header: true },
                { value: "CATEGORY", bold: true, header: true },
                { value: "QTY", bold: true, header: true, align: "center" },
                { value: "UNIT COST", bold: true, header: true, align: "right" },
                { value: "TOTAL", bold: true, header: true, align: "right" },
                { value: "TRIGGER", bold: true, header: true },
            ],
            isHeader: true,
        });

        const excludedIds = d?.excludedBundleItems || [];
        let displayTotal = 0;

        for (const item of c.bundleItems) {
            const isExcluded = excludedIds.includes(item.id);
            if (!isExcluded) displayTotal += item.totalCost;

            rows.push({
                cells: [
                    { value: isExcluded ? `✗ ${item.name}` : item.name },
                    { value: CATEGORY_LABELS[item.category] || item.category },
                    { value: item.quantity, align: "center" },
                    { value: item.unitCost, currency: true, align: "right" },
                    { value: isExcluded ? 0 : item.totalCost, currency: true, align: "right", bold: !isExcluded },
                    { value: item.trigger },
                ],
            });
        }

        projectBundleTotal += displayTotal;

        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({
            cells: [
                { value: `${c.name} Bundle Total`, bold: true },
                { value: "" }, { value: "" }, { value: "" },
                { value: displayTotal, currency: true, align: "right", bold: true, highlight: true },
                { value: "" },
            ],
            isTotal: true,
        });

        if (i < calcs.length - 1) {
            rows.push({ cells: [{ value: "" }], isSeparator: true });
        }
    }

    // Project total
    rows.push({ cells: [{ value: "" }], isSeparator: true });
    rows.push({
        cells: [
            { value: "PROJECT BUNDLE TOTAL", bold: true },
            { value: "" }, { value: "" }, { value: "" },
            { value: projectBundleTotal, currency: true, align: "right", bold: true, highlight: true },
            { value: "" },
        ],
        isTotal: true,
    });

    return {
        name: "Bundle Accessories",
        color: "#F97316",
        columns: ["ITEM", "CATEGORY", "QTY", "UNIT COST", "TOTAL", "TRIGGER"],
        rows,
    };
}

// --- Cost Category Breakdown (3A-3G) — Detailed Mode Only ---
function buildCostCategoryBreakdown(answers: EstimatorAnswers, calcs: ScreenCalc[], rates?: RateCard): SheetTab {
    const rows: SheetRow[] = [];
    const cols = ["CATEGORY", "LINE ITEM", "QUANTITY", "RATE", "COST", "NOTES"];

    rows.push({
        cells: [{ value: "COST CATEGORY BREAKDOWN (3A–3G)", bold: true, header: true, span: 6, align: "center" }],
        isHeader: true,
    });
    rows.push({ cells: [{ value: "" }], isSeparator: true });

    if (calcs.length === 0) {
        rows.push({ cells: [{ value: "No displays configured yet", span: 6, align: "center" }] });
    } else {
        for (let i = 0; i < calcs.length; i++) {
            const c = calcs[i];
            const d = answers.displays[i];
            if (!d) continue;

            const area = c.areaSqFt;
            const pitch = c.pixelPitch;
            const estimatedWeightLbs = area * 0.0929 * 45;
            const unionLabel = answers.isUnion ? " (union +15%)" : "";

            // Display header
            rows.push({
                cells: [{ value: `▸ ${c.name} — ${c.widthFt}′ × ${c.heightFt}′ (${area.toFixed(1)} sqft) @ ${pitch}mm`, bold: true, header: true, span: 6 }],
                isHeader: true,
            });
            rows.push({ cells: [{ value: "" }], isSeparator: true });

            // ----- 3A: Structural Materials -----
            const steelScope = d.steelScope || "full";
            const structPctLabel = d.useExistingStructure ? "existing (5%)"
                : steelScope === "existing" ? "existing (5%)"
                : steelScope === "secondary" ? "secondary only (12%)"
                : `full build (${d.serviceType === "Top" ? "10" : "20"}%)`;

            rows.push({ cells: [{ value: "3A — STRUCTURAL MATERIALS", bold: true, header: true, span: 6 }], isHeader: true });
            rows.push({
                cells: cols.map(c => ({ value: c, bold: true, header: true, align: c === "COST" || c === "RATE" ? "right" as const : undefined })),
                isHeader: true,
            });
            rows.push({
                cells: [
                    { value: "Structural" }, { value: `Steel scope: ${structPctLabel}` },
                    { value: `${area.toFixed(0)} sqft` }, { value: "% of HW" },
                    { value: c.structureCost, currency: true, align: "right" },
                    { value: `Based on ${steelScope} scope${unionLabel}` },
                ],
            });
            rows.push({
                cells: [
                    { value: "" }, { value: "3A SUBTOTAL", bold: true },
                    { value: "" }, { value: "" },
                    { value: c.structureCost, currency: true, align: "right", bold: true, highlight: true },
                    { value: "" },
                ],
                isTotal: true,
            });
            rows.push({ cells: [{ value: "" }], isSeparator: true });

            // ----- 3B: Labor & LED Install -----
            const steelRate = rc(rates, `install.steel_fab.${d.installComplexity}`, STEEL_RATES[d.installComplexity] || 35);
            const ledRate = rc(rates, `install.led_panel.${d.installComplexity}`, LED_INSTALL_RATES[d.installComplexity] || 105);
            const steelLabor = estimatedWeightLbs * steelRate;
            const ledLabor = area * ledRate;

            rows.push({ cells: [{ value: "3B — LABOR & LED INSTALL", bold: true, header: true, span: 6 }], isHeader: true });
            rows.push({
                cells: cols.map(c => ({ value: c, bold: true, header: true, align: c === "COST" || c === "RATE" ? "right" as const : undefined })),
                isHeader: true,
            });
            rows.push({
                cells: [
                    { value: "Steel Erection" }, { value: `${d.installComplexity} complexity` },
                    { value: `${Math.round(estimatedWeightLbs)} lbs` }, { value: `$${steelRate}/lb`, align: "right" },
                    { value: steelLabor * (answers.isUnion ? 1.15 : 1), currency: true, align: "right" },
                    { value: `Weight-based${unionLabel}` },
                ],
            });
            rows.push({
                cells: [
                    { value: "LED Panel Mount" }, { value: `${d.installComplexity} complexity` },
                    { value: `${area.toFixed(0)} sqft` }, { value: `$${ledRate}/sqft`, align: "right" },
                    { value: ledLabor * (answers.isUnion ? 1.15 : 1), currency: true, align: "right" },
                    { value: `Area-based${unionLabel}` },
                ],
            });
            if (d.isReplacement) {
                rows.push({
                    cells: [
                        { value: "Demolition" }, { value: "Remove existing display" },
                        { value: "1" }, { value: "$5,000", align: "right" },
                        { value: c.demolitionCost, currency: true, align: "right" },
                        { value: "Flat rate" },
                    ],
                });
            }
            const installTotal = c.installCost + c.demolitionCost;
            rows.push({
                cells: [
                    { value: "" }, { value: "3B SUBTOTAL", bold: true },
                    { value: "" }, { value: "" },
                    { value: installTotal, currency: true, align: "right", bold: true, highlight: true },
                    { value: "" },
                ],
                isTotal: true,
            });
            rows.push({ cells: [{ value: "" }], isSeparator: true });

            // ----- 3C: Electrical & Data -----
            const elecMatRate = rc(rates, "electrical.materials_per_sqft", 125);
            const powerMult = (d.powerDistance || "near") === "near" ? 1.0 : d.powerDistance === "medium" ? 1.3 : 1.8;
            const powerLabel = (d.powerDistance || "near") === "near" ? "< 10 ft" : d.powerDistance === "medium" ? "10-50 ft" : "> 50 ft";

            rows.push({ cells: [{ value: "3C — ELECTRICAL & DATA", bold: true, header: true, span: 6 }], isHeader: true });
            rows.push({
                cells: cols.map(c => ({ value: c, bold: true, header: true, align: c === "COST" || c === "RATE" ? "right" as const : undefined })),
                isHeader: true,
            });
            rows.push({
                cells: [
                    { value: "Electrical" }, { value: `Materials + labor (${powerLabel} run)` },
                    { value: `${area.toFixed(0)} sqft` }, { value: `$${elecMatRate} × ${powerMult}×`, align: "right" },
                    { value: c.electricalCost, currency: true, align: "right" },
                    { value: `Distance multiplier: ${powerMult}×${unionLabel}` },
                ],
            });
            if (c.dataCablingCost > 0) {
                rows.push({
                    cells: [
                        { value: "Data Cabling" }, { value: "Fiber optic conversion" },
                        { value: "1" }, { value: fmt(c.dataCablingCost), align: "right" },
                        { value: c.dataCablingCost, currency: true, align: "right" },
                        { value: "> 300 ft run requires fiber" },
                    ],
                });
            } else {
                rows.push({
                    cells: [
                        { value: "Data Cabling" }, { value: "Standard copper (Cat6)" },
                        { value: "—" }, { value: "$0", align: "right" },
                        { value: 0, currency: true, align: "right" },
                        { value: "< 300 ft, no conversion needed" },
                    ],
                });
            }
            rows.push({
                cells: [
                    { value: "" }, { value: "3C SUBTOTAL", bold: true },
                    { value: "" }, { value: "" },
                    { value: c.electricalCost + c.dataCablingCost, currency: true, align: "right", bold: true, highlight: true },
                    { value: "" },
                ],
                isTotal: true,
            });
            rows.push({ cells: [{ value: "" }], isSeparator: true });

            // ----- 3D: Lighting Cove (conditional) -----
            rows.push({ cells: [{ value: "3D — LIGHTING COVE", bold: true, header: true, span: 6 }], isHeader: true });
            rows.push({
                cells: [
                    { value: "" }, { value: "Not included in this estimate" },
                    { value: "" }, { value: "" },
                    { value: 0, currency: true, align: "right" },
                    { value: "Add via financial overrides if needed" },
                ],
            });
            rows.push({
                cells: [
                    { value: "" }, { value: "3D SUBTOTAL", bold: true },
                    { value: "" }, { value: "" },
                    { value: 0, currency: true, align: "right", bold: true },
                    { value: "" },
                ],
                isTotal: true,
            });
            rows.push({ cells: [{ value: "" }], isSeparator: true });

            // ----- 3E: PM, GC, Travel -----
            const pmComplexity = answers.pmComplexity || "standard";
            const pmMult = pmComplexity === "standard" ? 1 : pmComplexity === "complex" ? 2 : 3;
            const pmBase = rc(rates, "other.pm_base_fee", 5882.35);

            rows.push({ cells: [{ value: "3E — PM, GC & TRAVEL", bold: true, header: true, span: 6 }], isHeader: true });
            rows.push({
                cells: cols.map(c => ({ value: c, bold: true, header: true, align: c === "COST" || c === "RATE" ? "right" as const : undefined })),
                isHeader: true,
            });
            rows.push({
                cells: [
                    { value: "Project Management" }, { value: `${pmComplexity} complexity (${pmMult}× base)` },
                    { value: pmMult }, { value: fmt(pmBase), align: "right" },
                    { value: c.pmCost, currency: true, align: "right" },
                    { value: `Base fee × ${pmMult}` },
                ],
            });
            rows.push({
                cells: [
                    { value: "" }, { value: "3E SUBTOTAL", bold: true },
                    { value: "" }, { value: "" },
                    { value: c.pmCost, currency: true, align: "right", bold: true, highlight: true },
                    { value: "" },
                ],
                isTotal: true,
            });
            rows.push({ cells: [{ value: "" }], isSeparator: true });

            // ----- 3F: Engineering & Permits -----
            const engBase = rc(rates, "other.eng_base_fee", 4705.88);

            rows.push({ cells: [{ value: "3F — ENGINEERING & PERMITS", bold: true, header: true, span: 6 }], isHeader: true });
            rows.push({
                cells: cols.map(c => ({ value: c, bold: true, header: true, align: c === "COST" || c === "RATE" ? "right" as const : undefined })),
                isHeader: true,
            });
            rows.push({
                cells: [
                    { value: "Engineering" }, { value: `Submittals & structural engineering (${pmComplexity})` },
                    { value: pmMult }, { value: fmt(engBase), align: "right" },
                    { value: c.engineeringCost, currency: true, align: "right" },
                    { value: `Base fee × ${pmMult}` },
                ],
            });
            rows.push({
                cells: [
                    { value: "" }, { value: "3F SUBTOTAL", bold: true },
                    { value: "" }, { value: "" },
                    { value: c.engineeringCost, currency: true, align: "right", bold: true, highlight: true },
                    { value: "" },
                ],
                isTotal: true,
            });
            rows.push({ cells: [{ value: "" }], isSeparator: true });

            // ----- 3G: Equipment & Logistics -----
            const liftLabel = (d.liftType || "scissor") === "none" ? "No equipment" : d.liftType === "scissor" ? "Scissor lift" : d.liftType === "boom" ? "Boom lift" : "Crane";

            rows.push({ cells: [{ value: "3G — EQUIPMENT & LOGISTICS", bold: true, header: true, span: 6 }], isHeader: true });
            rows.push({
                cells: cols.map(c => ({ value: c, bold: true, header: true, align: c === "COST" || c === "RATE" ? "right" as const : undefined })),
                isHeader: true,
            });
            if (c.equipmentCost > 0) {
                rows.push({
                    cells: [
                        { value: "Equipment Rental" }, { value: liftLabel },
                        { value: "1" }, { value: fmt(c.equipmentCost), align: "right" },
                        { value: c.equipmentCost, currency: true, align: "right" },
                        { value: `${liftLabel} rental` },
                    ],
                });
            }
            rows.push({
                cells: [
                    { value: "Shipping & Freight" }, { value: "Estimated from weight" },
                    { value: `${Math.round(estimatedWeightLbs)} lbs` }, { value: "$0.50/lb", align: "right" },
                    { value: c.shippingCost, currency: true, align: "right" },
                    { value: "" },
                ],
            });
            if (c.spareParts > 0) {
                rows.push({
                    cells: [
                        { value: "Spare Parts" }, { value: "5% of LED hardware" },
                        { value: "1" }, { value: "5%", align: "right" },
                        { value: c.spareParts, currency: true, align: "right" },
                        { value: "LED modules + power supplies" },
                    ],
                });
            }
            const cat3gTotal = c.equipmentCost + c.shippingCost + c.spareParts;
            rows.push({
                cells: [
                    { value: "" }, { value: "3G SUBTOTAL", bold: true },
                    { value: "" }, { value: "" },
                    { value: cat3gTotal, currency: true, align: "right", bold: true, highlight: true },
                    { value: "" },
                ],
                isTotal: true,
            });

            // ----- Display Grand Total -----
            rows.push({ cells: [{ value: "" }], isSeparator: true });
            const displayGrandCost = c.structureCost + installTotal + c.electricalCost + c.dataCablingCost
                + c.pmCost + c.engineeringCost + cat3gTotal;
            rows.push({
                cells: [
                    { value: `${c.name} — TOTAL SERVICES COST`, bold: true, header: true }, { value: "" },
                    { value: "" }, { value: "" },
                    { value: displayGrandCost, currency: true, align: "right", bold: true, highlight: true },
                    { value: `Excludes LED hardware (${fmt(c.hardwareCost - c.spareParts)})` },
                ],
                isTotal: true,
            });

            // Separator between displays
            if (i < calcs.length - 1) {
                rows.push({ cells: [{ value: "" }], isSeparator: true });
                rows.push({ cells: [{ value: "" }], isSeparator: true });
            }
        }

        // Project totals across all displays
        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({
            cells: [{ value: "PROJECT CATEGORY TOTALS", bold: true, header: true, span: 6, align: "center" }],
            isHeader: true,
        });
        rows.push({
            cells: [
                { value: "CATEGORY", bold: true, header: true },
                { value: "", bold: true, header: true },
                { value: "", bold: true, header: true },
                { value: "", bold: true, header: true },
                { value: "TOTAL", bold: true, header: true, align: "right" },
                { value: "% OF SERVICES", bold: true, header: true, align: "right" },
            ],
            isHeader: true,
        });

        const totals = {
            structural: calcs.reduce((s, c) => s + c.structureCost, 0),
            labor: calcs.reduce((s, c) => s + c.installCost + c.demolitionCost, 0),
            electrical: calcs.reduce((s, c) => s + c.electricalCost + c.dataCablingCost, 0),
            pm: calcs.reduce((s, c) => s + c.pmCost, 0),
            engineering: calcs.reduce((s, c) => s + c.engineeringCost, 0),
            equipment: calcs.reduce((s, c) => s + c.equipmentCost + c.shippingCost + c.spareParts, 0),
        };
        const servicesGrand = Object.values(totals).reduce((a, b) => a + b, 0);

        const pctOf = (v: number) => servicesGrand > 0 ? `${((v / servicesGrand) * 100).toFixed(1)}%` : "—";

        const catRows: [string, number][] = [
            ["3A — Structural Materials", totals.structural],
            ["3B — Labor & LED Install", totals.labor],
            ["3C — Electrical & Data", totals.electrical],
            ["3D — Lighting Cove", 0],
            ["3E — PM, GC & Travel", totals.pm],
            ["3F — Engineering & Permits", totals.engineering],
            ["3G — Equipment & Logistics", totals.equipment],
        ];
        for (const [label, val] of catRows) {
            rows.push({
                cells: [
                    { value: label, bold: true }, { value: "" }, { value: "" }, { value: "" },
                    { value: val, currency: true, align: "right" },
                    { value: pctOf(val), align: "right" },
                ],
            });
        }
        rows.push({ cells: [{ value: "" }], isSeparator: true });
        rows.push({
            cells: [
                { value: "TOTAL SERVICES", bold: true }, { value: "" }, { value: "" }, { value: "" },
                { value: servicesGrand, currency: true, align: "right", bold: true, highlight: true },
                { value: "100%", align: "right", bold: true },
            ],
            isTotal: true,
        });
    }

    return {
        name: "Cost Categories",
        color: "#DC2626",
        columns: cols,
        rows,
    };
}


