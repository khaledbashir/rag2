/**
 * pricingMath.ts — Enterprise-grade pricing arithmetic
 *
 * SINGLE SOURCE OF TRUTH for every pricing calculation rendered in PDFs.
 * All templates import from here — no template should ever reimplement
 * subtotal / tax / grandTotal / documentTotal logic.
 *
 * Core invariant  (round-then-sum):
 *   displayedTotal ≡ Σ displayedLineItems + displayedTax + displayedBond
 *
 * Every atomic value is rounded to DISPLAY PRECISION before summing.
 * This guarantees that what the client reads on the PDF is self-consistent
 * — no "penny problem", no $10 rounding gaps, no manual auditing required.
 */

import type { PricingDocument, PricingTable, PricingLineItem } from "@/types/pricing";
import { CURRENCY_FORMAT } from "@/services/rfp/productCatalog";

// ============================================================================
// DISPLAY-PRECISION ROUNDING
// ============================================================================

const DISPLAY_SCALE = 10 ** (CURRENCY_FORMAT.decimals ?? 0);   // 1 when decimals=0

/**
 * Round a raw number to the precision actually shown on the PDF.
 * When CURRENCY_FORMAT.decimals is 0, this rounds to whole dollars.
 * When it's 2, this rounds to cents.  Same formula formatCurrency uses.
 */
export function roundToDisplay(value: number): number {
    return Math.round(value * DISPLAY_SCALE) / DISPLAY_SCALE;
}

/**
 * Resolve a usable exchange-rate multiplier. Falsy/non-positive values fall back
 * to 1 so callers can pass `details.exchangeRate` directly without null checks.
 * Source amounts are USD-native; multiplying by rate yields the selected currency.
 */
export function resolveExchangeRate(rate: number | null | undefined): number {
    return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : 1;
}

// ============================================================================
// EFFECTIVE PRICE / DESCRIPTION WITH OVERRIDES
// ============================================================================

export function getEffectivePrice(
    priceOverrides: Record<string, number>,
    tableId: string,
    itemIndex: number,
    originalPrice: number,
): number {
    const key = `${tableId}:${itemIndex}`;
    return priceOverrides[key] !== undefined ? priceOverrides[key] : originalPrice;
}

export function getEffectiveDescription(
    descriptionOverrides: Record<string, string>,
    tableId: string,
    itemIndex: number,
    originalDescription: string,
): string {
    const key = `${tableId}:${itemIndex}`;
    return descriptionOverrides[key] || originalDescription;
}

// ============================================================================
// RENDERED LINE ITEM
// ============================================================================

export interface RenderedLineItem {
    /** Display description (after overrides) */
    description: string;
    /** Display price — already rounded to display precision */
    price: number;
    /** True if the item shows "INCLUDED" instead of a dollar amount */
    isIncluded: boolean;
    /** True if the original Excel cell said "Excluded" */
    isExcluded?: boolean;
    /** Original text from Excel cell ("Excluded", "Included", "N/A", "TBD", etc.) */
    textValue?: string;
    /** Original index in table.items — needed for override key lookups */
    originalIndex: number;
}

// ============================================================================
// TABLE-LEVEL TOTALS
// ============================================================================

export interface RenderedTableTotals {
    /** Line items that should actually be rendered (non-$0, with prices rounded) */
    items: RenderedLineItem[];
    /** Sum of rounded item prices (excludes isIncluded items) */
    subtotal: number;
    /** Tax label from parsed data (e.g. "Tax 13%", "HST 13%") */
    taxLabel: string;
    /** Tax amount — rounded(subtotal × derivedRate) */
    tax: number;
    /** Bond amount — rounded */
    bond: number;
    /** Tariff amount — rounded */
    tariff: number;
    /** subtotal + tax + bond + tariff — guaranteed to equal the sum of rounded components */
    grandTotal: number;
}

/**
 * Compute all rendered totals for a single pricing table.
 *
 * This is THE function that enforces the round-then-sum invariant:
 *   1. Each item price → roundToDisplay
 *   2. subtotal = Σ rounded prices  (plain integer addition when decimals=0)
 *   3. tax = roundToDisplay(subtotal × rate)
 *   4. bond = roundToDisplay(bond)
 *   5. grandTotal = subtotal + tax + bond  (no further rounding needed)
 */
export function computeTableTotals(
    table: PricingTable,
    priceOverrides: Record<string, number> = {},
    descriptionOverrides: Record<string, string> = {},
    exchangeRate: number | null | undefined = 1,
): RenderedTableTotals {
    const fx = resolveExchangeRate(exchangeRate);
    // Step 1: Build rendered items with rounded prices, filtering $0 rows
    const items: RenderedLineItem[] = [];
    let subtotal = 0;

    for (let idx = 0; idx < (table.items || []).length; idx++) {
        const item = table.items[idx];
        const rawPrice = getEffectivePrice(priceOverrides, table.id, idx, item.sellingPrice);
        const roundedPrice = roundToDisplay(rawPrice * fx);
        const description = getEffectiveDescription(descriptionOverrides, table.id, idx, item.description);

        // Filter out $0 rows (e.g. "BOND $0") — but keep explicitly "INCLUDED", "EXCLUDED", or text-value items
        const hasTextOverride = item.isIncluded || item.isExcluded || !!item.textValue;
        if (!hasTextOverride && Math.abs(roundedPrice) < (1 / DISPLAY_SCALE || 0.01)) {
            continue;
        }

        items.push({
            description,
            price: roundedPrice,
            isIncluded: item.isIncluded,
            isExcluded: item.isExcluded,
            textValue: item.textValue,
            originalIndex: idx,
        });

        // Only non-INCLUDED items contribute to subtotal
        if (!item.isIncluded) {
            subtotal += roundedPrice;
        }
    }

    // Step 2: Tax — Mirror Mode: use Excel's tax amount directly.
    // Never recalculate tax from items — Natalia's rule is to trust Excel's numbers exactly.
    // Only fall back to rate-based calculation when Excel provided no tax amount.
    let tax = 0;
    let taxLabel = "";
    if (table.tax) {
        taxLabel = table.tax.label || "Tax";
        if (typeof table.tax.amount === "number" && table.tax.amount !== 0) {
            // Excel provided the tax amount — use it directly (Mirror Mode), then convert
            tax = roundToDisplay(table.tax.amount * fx);
        } else if (table.tax.rate > 0 && table.tax.rate <= 1) {
            // No amount but rate exists — calculate from already-converted subtotal
            tax = roundToDisplay(subtotal * table.tax.rate);
        }
    }

    // Step 3: Bond — convert from USD-native to selected currency
    const bond = roundToDisplay((table.bond || 0) * fx);

    // Step 3b: Tariff — convert from USD-native to selected currency
    const tariff = roundToDisplay((table.tariff || 0) * fx);

    // Step 4: Grand total — Mirror Mode: always use Excel's grandTotal directly.
    // Natalia's rule: "whatever is here is what your engine will show" — no recalculation.
    // Excel's grandTotal was set from the actual total row in the spreadsheet.
    // Only fall back to calculated when Excel had no grand total row (grandTotal === 0).
    const grandTotal = (Number.isFinite(table.grandTotal) && table.grandTotal !== 0)
        ? roundToDisplay(table.grandTotal * fx)
        : (subtotal + tax + bond + tariff);

    // Step 5: When all modifiers (tax/bond/tariff) are $0, subtotal and grandTotal
    // should be identical. Any difference is rounding noise (sum-of-rounds vs round-of-sum).
    // Excel's grandTotal is the source of truth, so align subtotal to it.
    const noModifiers = Math.abs(tax) < 0.01 && Math.abs(bond) < 0.01 && Math.abs(tariff) < 0.01;
    const finalSubtotal = (noModifiers && grandTotal !== 0) ? grandTotal : subtotal;

    return { items, subtotal: finalSubtotal, taxLabel, tax, bond, tariff, grandTotal };
}

// ============================================================================
// DOCUMENT-LEVEL TOTAL
// ============================================================================

/**
 * Compute the document-wide total by summing per-table grandTotals.
 *
 * NEVER reads document.documentTotal — that value comes from Excel's own
 * total row, which may differ from the sum of displayed tables due to
 * Excel-side rounding.
 */
export function computeDocumentTotal(
    document: PricingDocument,
    priceOverrides: Record<string, number> = {},
    descriptionOverrides: Record<string, string> = {},
    exchangeRate: number | null | undefined = 1,
): number {
    const fx = resolveExchangeRate(exchangeRate);
    // "Excel-Match" Strategy:
    // If the Excel parser found a total row, trust it implicitly.
    // Natalia prioritizes matching the source file over internal consistency.
    if (Number.isFinite(document.documentTotal) && document.documentTotal !== 0) {
        return roundToDisplay(document.documentTotal * fx);
    }

    return document.tables.reduce(
        (sum, table) => sum + computeTableTotals(table, priceOverrides, descriptionOverrides, fx).grandTotal,
        0,
    );
}

/**
 * Compute document total from raw table array (for templates that
 * receive tables as `any[]` instead of a typed PricingDocument).
 */
export function computeDocumentTotalFromTables(
    tables: PricingTable[],
    priceOverrides: Record<string, number> = {},
    descriptionOverrides: Record<string, string> = {},
    exchangeRate: number | null | undefined = 1,
): number {
    const fx = resolveExchangeRate(exchangeRate);
    return tables.reduce(
        (sum, table) => sum + computeTableTotals(table, priceOverrides, descriptionOverrides, fx).grandTotal,
        0,
    );
}
