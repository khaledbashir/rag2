/**
 * Intelligence Mode Math Engine — P56
 *
 * Pure-function service wrapper around the core estimator.
 * Provides a clean API for Intelligence Mode pricing calculations.
 *
 * Core formula: Natalia Divisor Model
 *   Sell Price = Cost / (1 - Margin%)
 *   Bond = Sell Price × 1.5%
 *   Final = Sell Price + Bond + B&O Tax + Sales Tax
 */

import {
    calculatePerScreenAudit,
    calculateProposalAudit,
    calculateTotalWithBond,
    ScreenInput,
    ScreenAudit,
    InternalAudit,
    ClientSummary,
    BOND_PCT,
    DEFAULT_MARGIN,
    DEFAULT_SALES_TAX,
    DEFAULT_COST_PER_SQFT,
} from "@/lib/estimator";

// ============================================================================
// TYPES
// ============================================================================

export interface PricingPreset {
    name: string;
    margin: number;
    description: string;
}

export interface CategoryMargins {
    led?: number;       // Hardware margin (default 0.30)
    services?: number;  // Services margin (default 0.20)
    cms?: number;       // CMS/Software margin (default 0.35)
}

export interface IntelligencePricingInput {
    screens: ScreenInput[];
    globalMargin?: number;       // Override per-screen margins (0.0-0.99) — legacy single-margin mode
    categoryMargins?: CategoryMargins; // Per-category margins (overrides globalMargin when set)
    bondRate?: number;           // Override default 1.5%
    taxRate?: number;            // Override default 9.5%
    projectAddress?: string;     // For B&O tax detection
    venue?: string;              // For B&O tax detection
    structuralTonnage?: number;  // Steel tonnage
    reinforcingTonnage?: number; // Reinforcing tonnage
}

export interface IntelligencePricingResult {
    clientSummary: ClientSummary;
    internalAudit: InternalAudit;
    metadata: {
        screenCount: number;
        totalAreaSqFt: number;
        effectiveMargin: number;
        bondRate: number;
        taxRate: number;
        formulaUsed: "divisor";
    };
}

// ============================================================================
// PRESETS
// ============================================================================

export const MARGIN_PRESETS: PricingPreset[] = [
    { name: "Services",    margin: 0.20, description: "20% — Standard services margin (install, electrical, PM, engineering)" },
    { name: "LED Hardware", margin: 0.30, description: "30% — Validated LED hardware margin (NBCU all displays)" },
    { name: "CMS/Software", margin: 0.35, description: "35% — LiveSync/CMS margin (NBCU Margin Analysis)" },
];

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Calculate full Intelligence Mode pricing for a proposal.
 * Pure function — no side effects, no database calls.
 */
export function calculateIntelligencePricing(input: IntelligencePricingInput): IntelligencePricingResult {
    const {
        screens,
        globalMargin,
        categoryMargins,
        bondRate = BOND_PCT,
        taxRate = DEFAULT_SALES_TAX,
        projectAddress,
        venue,
        structuralTonnage,
        reinforcingTonnage,
    } = input;

    // Apply margin overrides: category margins take priority over global margin
    const effectiveScreens: ScreenInput[] = categoryMargins
        ? screens.map((s) => ({ ...s, categoryMargins }))
        : globalMargin !== undefined
            ? screens.map((s) => ({ ...s, desiredMargin: globalMargin }))
            : screens;

    const { clientSummary, internalAudit } = calculateProposalAudit(effectiveScreens, {
        bondPct: bondRate,
        taxRate,
        projectAddress,
        venue,
        structuralTonnage,
        reinforcingTonnage,
    });

    // Calculate effective margin from audit
    const totalCost = internalAudit.totals.totalCost;
    const sellPrice = internalAudit.totals.sellPrice;
    const effectiveMargin = sellPrice > 0 ? 1 - (totalCost / sellPrice) : globalMargin ?? DEFAULT_MARGIN;

    // Total area
    const totalAreaSqFt = internalAudit.perScreen.reduce((sum, s) => sum + s.areaSqFt, 0);

    return {
        clientSummary,
        internalAudit,
        metadata: {
            screenCount: screens.length,
            totalAreaSqFt,
            effectiveMargin,
            bondRate,
            taxRate,
            formulaUsed: "divisor",
        },
    };
}

/**
 * Quick single-screen calculation for real-time UI feedback.
 */
export function calculateSingleScreen(screen: ScreenInput, options?: {
    bondPct?: number;
    taxRate?: number;
    projectAddress?: string;
    venue?: string;
}): ScreenAudit {
    return calculatePerScreenAudit(screen, options);
}

/**
 * Quick sell price calculation (for tooltips, previews).
 */
export function quickSellPrice(cost: number, margin: number): { sellPrice: number; bond: number; total: number } {
    return calculateTotalWithBond(cost, margin * 100);
}

/**
 * Validate margin input.
 */
export function validateMargin(margin: number): { valid: boolean; message?: string } {
    if (margin < 0) return { valid: false, message: "Margin cannot be negative" };
    if (margin >= 1) return { valid: false, message: "Margin must be less than 100% (divisor model)" };
    if (margin < 0.05) return { valid: false, message: "Warning: margin below 5% is unusually low" };
    if (margin > 0.60) return { valid: false, message: "Warning: margin above 60% may not be competitive" };
    return { valid: true };
}
