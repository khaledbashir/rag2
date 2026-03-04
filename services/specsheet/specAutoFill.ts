/**
 * Spec Sheet Auto-Fill Service
 *
 * Matches displays from the FORM sheet parser (manufacturer + model + pitch)
 * against the product catalog, then returns pre-filled values for the 9
 * manual-only spec fields.
 *
 * Matching strategy (in priority order):
 *   1. Exact manufacturer + pitch + environment
 *   2. Exact manufacturer + nearest pitch
 *   3. Any manufacturer + exact pitch + environment
 *   4. Fallback defaults by environment (Indoor vs Outdoor)
 *
 * Every returned value includes a `source` tag so the UI can show
 * "Auto-filled from catalog" vs "Default" vs user-entered.
 */

import { getAllProducts, type ProductType } from "@/services/rfp/productCatalog";
import type { DisplaySpec } from "@/services/specsheet/formSheetParser";
import { MANUAL_ONLY_FIELDS, getModelKey } from "@/services/specsheet/formSheetParser";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AutoFillSource = "memory" | "catalog" | "default" | "none";

/** DB memory records keyed by modelKey → { fieldKey: fieldValue } */
export type MemoryBank = Record<string, Record<string, string>>;

export interface AutoFilledField {
    value: string;
    source: AutoFillSource;
    productName?: string;
}

export type AutoFillResult = Partial<Record<keyof DisplaySpec, AutoFilledField>>;

export interface GroupAutoFill {
    modelKey: string;
    matchedProduct: string | null;
    matchConfidence: "exact" | "pitch" | "fallback" | "none";
    fields: AutoFillResult;
    filledCount: number;
    totalManualFields: number;
}

// ─── Environment defaults ───────────────────────────────────────────────────

const INDOOR_DEFAULTS: Partial<Record<keyof DisplaySpec, string>> = {
    colorTemperatureK: "6500",
    colorTempAdjustability: "3,200K–9,300K",
    brightnessAdjustment: "0–100%",
    gradationMethod: "16-bit",
    tonalGradation: "281 trillion colors",
    voltageService: "AC 100–240V / 50–60Hz / Single Phase",
    ventilationRequirements: "Fanless convection cooling",
};

const OUTDOOR_DEFAULTS: Partial<Record<keyof DisplaySpec, string>> = {
    colorTemperatureK: "6500",
    colorTempAdjustability: "3,200K–9,300K",
    brightnessAdjustment: "0–100%",
    gradationMethod: "16-bit",
    tonalGradation: "281 trillion colors",
    voltageService: "AC 100–240V / 50–60Hz / Single Phase",
    ventilationRequirements: "Forced air cooling (IP66 rated)",
};

// ─── Matching ───────────────────────────────────────────────────────────────

function normalizeManufacturer(s: string): string {
    return (s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchProduct(
    display: DisplaySpec,
): { product: ProductType; confidence: "exact" | "pitch" | "fallback" } | null {
    const allProducts = getAllProducts();
    if (allProducts.length === 0) return null;

    const mfr = normalizeManufacturer(display.manufacturer);
    const pitch = display.pixelPitch;
    const env = (display.indoorOutdoor || "").toLowerCase().includes("outdoor")
        ? "Outdoor"
        : "Indoor";

    // Pass 1: Exact manufacturer + pitch within 0.5mm + matching environment
    if (pitch != null) {
        const exact = allProducts.find(
            (p) =>
                normalizeManufacturer(p.manufacturer) === mfr &&
                Math.abs(p.pitchMm - pitch) < 0.5 &&
                (p.environment === env || p.environment === "Both"),
        );
        if (exact) return { product: exact, confidence: "exact" };
    }

    // Pass 2: Exact manufacturer + nearest pitch (any environment)
    if (pitch != null) {
        const sameManufacturer = allProducts.filter(
            (p) => normalizeManufacturer(p.manufacturer) === mfr,
        );
        if (sameManufacturer.length > 0) {
            const nearest = sameManufacturer.reduce((best, p) =>
                Math.abs(p.pitchMm - pitch) < Math.abs(best.pitchMm - pitch) ? p : best,
            );
            if (Math.abs(nearest.pitchMm - pitch) <= 2) {
                return { product: nearest, confidence: "pitch" };
            }
        }
    }

    // Pass 3: Any manufacturer + exact pitch + environment
    if (pitch != null) {
        const pitchMatch = allProducts.find(
            (p) =>
                Math.abs(p.pitchMm - pitch) < 0.5 &&
                (p.environment === env || p.environment === "Both"),
        );
        if (pitchMatch) return { product: pitchMatch, confidence: "pitch" };
    }

    return null;
}

// ─── Field mapping: ProductType → DisplaySpec manual fields ─────────────────

function mapProductToSpecFields(
    product: ProductType,
    env: "Indoor" | "Outdoor",
): Partial<Record<keyof DisplaySpec, string>> {
    const colorRange =
        product.colorTempK.min && product.colorTempK.max
            ? `${product.colorTempK.min.toLocaleString()}K–${product.colorTempK.max.toLocaleString()}K`
            : "3,200K–9,300K";

    const isOutdoor = env === "Outdoor";

    return {
        colorTemperatureK: String(product.colorTempK.nominal),
        colorTempAdjustability: colorRange,
        brightnessAdjustment: "0–100%",
        gradationMethod: "16-bit",
        tonalGradation: "281 trillion colors",
        voltageService: "AC 100–240V / 50–60Hz / Single Phase",
        ventilationRequirements: isOutdoor
            ? "Forced air cooling (IP66 rated)"
            : "Fanless convection cooling",
        ledLampModel: product.diode,
        smdLedModel: product.diode,
    };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Auto-fill spec fields for a single display group.
 *
 * Priority: DB memory → catalog match → environment defaults.
 * DB memory always wins because it contains user-verified values.
 */
export function autoFillForDisplay(
    display: DisplaySpec,
    memoryBank?: MemoryBank,
): GroupAutoFill {
    const modelKey = getModelKey(display);
    const totalManualFields = MANUAL_ONLY_FIELDS.length;
    const memory = memoryBank?.[modelKey];

    const env = (display.indoorOutdoor || "").toLowerCase().includes("outdoor")
        ? "Outdoor" as const
        : "Indoor" as const;

    const match = matchProduct(display);
    const catalogMapped = match
        ? mapProductToSpecFields(match.product, env)
        : null;
    const defaults = env === "Outdoor" ? OUTDOOR_DEFAULTS : INDOOR_DEFAULTS;

    const fields: AutoFillResult = {};
    let filledCount = 0;

    for (const fieldKey of MANUAL_ONLY_FIELDS) {
        const existing = (display as any)[fieldKey];
        if (existing && String(existing).trim()) continue;

        // Priority 1: DB memory (user-verified from previous project)
        const memVal = memory?.[fieldKey];
        if (memVal) {
            fields[fieldKey] = { value: memVal, source: "memory" };
            filledCount++;
            continue;
        }

        // Priority 2: Catalog match
        const catVal = catalogMapped?.[fieldKey];
        if (catVal) {
            fields[fieldKey] = {
                value: catVal,
                source: "catalog",
                productName: match!.product.name,
            };
            filledCount++;
            continue;
        }

        // Priority 3: Environment defaults
        const defVal = defaults[fieldKey];
        if (defVal) {
            fields[fieldKey] = { value: defVal, source: "default" };
            filledCount++;
        }
    }

    const matchConfidence = match?.confidence ?? (filledCount > 0 ? "fallback" : "none");

    return {
        modelKey,
        matchedProduct: match?.product.name ?? null,
        matchConfidence,
        fields,
        filledCount,
        totalManualFields,
    };
}

/**
 * Auto-fill for ALL model groups in a set of displays.
 * Returns a map of modelKey → GroupAutoFill.
 *
 * If memoryBank is provided, DB memory values take priority over catalog.
 */
export function autoFillAllGroups(
    displays: DisplaySpec[],
    memoryBank?: MemoryBank,
): Record<string, GroupAutoFill> {
    const result: Record<string, GroupAutoFill> = {};
    const seen = new Set<string>();

    for (const d of displays) {
        const key = getModelKey(d);
        if (seen.has(key)) continue;
        seen.add(key);
        result[key] = autoFillForDisplay(d, memoryBank);
    }

    return result;
}

/**
 * Convert auto-fill results into the groupOverrides format
 * expected by the SpecSheetButton component.
 */
export function autoFillToOverrides(
    autoFills: Record<string, GroupAutoFill>,
): Record<string, Partial<Record<keyof DisplaySpec, string>>> {
    const overrides: Record<string, Partial<Record<keyof DisplaySpec, string>>> = {};

    for (const [modelKey, group] of Object.entries(autoFills)) {
        const fieldOverrides: Partial<Record<keyof DisplaySpec, string>> = {};
        for (const [field, info] of Object.entries(group.fields)) {
            if (info && info.value) {
                fieldOverrides[field as keyof DisplaySpec] = info.value;
            }
        }
        if (Object.keys(fieldOverrides).length > 0) {
            overrides[modelKey] = fieldOverrides;
        }
    }

    return overrides;
}
