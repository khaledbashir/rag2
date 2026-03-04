/**
 * Rate Card Loader — DB-first rate resolution with hardcoded fallback.
 *
 * How it works:
 * 1. Loads all active RateCardEntry rows from Postgres (cached per-request).
 * 2. `getRate(key)` returns the DB value if it exists.
 * 3. Falls back to hardcoded defaults from productCatalog.ts if DB is empty or unreachable.
 *
 * This means:
 * - Editing a rate in /admin/rate-card takes effect immediately.
 * - If DB is down or table is empty, the system still works with extracted defaults.
 * - No code change needed when Matt delivers official rates — just edit in the UI.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import {
    MARGIN_PRESETS,
    BOND_RATE,
    NYC_TAX_RATE,
    STEEL_FABRICATION_PER_LB,
    LED_INSTALL_PER_SQFT,
    HEAVY_EQUIPMENT_PER_LB,
    PM_GC_TRAVEL_PER_LB,
    ELECTRICAL_MATERIALS_PER_SQFT,
    SPARE_PARTS_PCT_LCD,
    SPARE_PARTS_PCT_LED,
    LED_COST_PER_SQFT_BY_PITCH,
    WARRANTY_ANNUAL_ESCALATION,
    PM_BASE_FEE,
    ENG_BASE_FEE,
    COMPLEX_MODIFIER,
    type InstallComplexity,
} from "./productCatalog";

// ============================================================================
// HARDCODED FALLBACK MAP — mirrors seed-rate-card.mjs keys exactly
// ============================================================================

const HARDCODED_DEFAULTS: Record<string, number> = {
    // Margins
    "margin.led_hardware": MARGIN_PRESETS.ledHardware,
    "margin.services_default": MARGIN_PRESETS.servicesDefault,
    "margin.services_small": MARGIN_PRESETS.servicesSmall,
    "margin.livesync": MARGIN_PRESETS.livesync,

    // Bond & Tax
    "bond_tax.bond_rate": BOND_RATE,
    "bond_tax.nyc_tax": NYC_TAX_RATE,
    "bond_tax.default_sales_tax": 0.095,

    // Steel Fabrication
    "install.steel_fab.simple": STEEL_FABRICATION_PER_LB.simple,
    "install.steel_fab.standard": STEEL_FABRICATION_PER_LB.standard,
    "install.steel_fab.complex": STEEL_FABRICATION_PER_LB.complex,
    "install.steel_fab.heavy": STEEL_FABRICATION_PER_LB.heavy,

    // LED Panel Install
    "install.led_panel.simple": LED_INSTALL_PER_SQFT.simple,
    "install.led_panel.standard": LED_INSTALL_PER_SQFT.standard,
    "install.led_panel.complex": LED_INSTALL_PER_SQFT.complex,

    // Other Install
    "install.heavy_equipment": HEAVY_EQUIPMENT_PER_LB,
    "install.pm_gc_travel": PM_GC_TRAVEL_PER_LB,

    // Electrical
    "electrical.materials_per_sqft": ELECTRICAL_MATERIALS_PER_SQFT,

    // Spare Parts
    "spare_parts.lcd_pct": SPARE_PARTS_PCT_LCD,
    "spare_parts.led_pct": SPARE_PARTS_PCT_LED,

    // LED Cost
    "led_cost.1_2mm": LED_COST_PER_SQFT_BY_PITCH["1.2"],
    "led_cost.2_5mm": LED_COST_PER_SQFT_BY_PITCH["2.5"],

    // Warranty
    "warranty.annual_escalation": WARRANTY_ANNUAL_ESCALATION,

    // Other
    "other.pm_base_fee": PM_BASE_FEE,
    "other.eng_base_fee": ENG_BASE_FEE,
    "other.complex_modifier": COMPLEX_MODIFIER,

    // ─── Spec Defaults (Natalia/Jeremy rules) ────────────────────────────

    // Viewing Angles (degrees)
    "spec.viewing_angle.indoor_h": 160,
    "spec.viewing_angle.indoor_v": 160,
    "spec.viewing_angle.outdoor_h": 140,
    "spec.viewing_angle.outdoor_v_up": 70,
    "spec.viewing_angle.outdoor_v_down": 70,

    // Color Space (pct)
    "spec.color_space.rec709": 90,
    "spec.color_space.dci_p3": 90,
    "spec.color_space.rec2020": 77,
    "spec.color_space.tolerance": 9,

    // Color Temperature (kelvin)
    "spec.color_temp.min": 3200,
    "spec.color_temp.max": 9300,
    "spec.color_temp.nominal": 6500,

    // Weight (multiplier)
    "spec.weight_multiplier": 1.25,

    // Pixel Fill Factor (pct)
    "spec.pixel_fill_factor": 90,

    // Power Ratios (multiplier)
    "spec.power_idle_ratio": 0.15,
    "spec.power_avg_ratio": 0.33,

    // Cabinet Defaults — fallback when no DB product match (mm / watts / kg)
    "spec.cabinet.indoor_width_mm": 500,
    "spec.cabinet.indoor_height_mm": 500,
    "spec.cabinet.outdoor_width_mm": 960,
    "spec.cabinet.outdoor_height_mm": 960,
    "spec.cabinet.indoor_max_power_w": 200,
    "spec.cabinet.outdoor_max_power_w": 650,
    "spec.cabinet.indoor_weight_kg": 10,
    "spec.cabinet.outdoor_weight_kg": 30,
};

// ============================================================================
// LOADER
// ============================================================================

interface RateEntry {
    key: string;
    value: number;
    confidence: string;
}

let _cache: Map<string, RateEntry> | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Load all active rate card entries from DB into a map.
 * Cached for 30s to avoid hammering the DB on every calculation.
 */
async function loadFromDB(): Promise<Map<string, RateEntry>> {
    const now = Date.now();
    if (_cache && now - _cacheTime < CACHE_TTL_MS) {
        return _cache;
    }

    try {
        const rows = await prisma.rateCardEntry.findMany({
            where: { isActive: true },
            select: { key: true, value: true, confidence: true },
        });

        const map = new Map<string, RateEntry>();
        for (const row of rows) {
            map.set(row.key, {
                key: row.key,
                value: row.value instanceof Decimal ? row.value.toNumber() : Number(row.value),
                confidence: row.confidence,
            });
        }

        _cache = map;
        _cacheTime = now;
        return map;
    } catch {
        // DB unreachable — return empty map, fallback kicks in
        return new Map();
    }
}

/**
 * Get a single rate value by key. DB first, hardcoded fallback.
 */
export async function getRate(key: string): Promise<number> {
    const db = await loadFromDB();
    const entry = db.get(key);
    if (entry != null) return entry.value;

    const fallback = HARDCODED_DEFAULTS[key];
    if (fallback != null) return fallback;

    throw new Error(`Rate card key "${key}" not found in DB or hardcoded defaults`);
}

/**
 * Get a rate synchronously from cache only.
 * Returns hardcoded fallback if cache miss. Use after initial loadFromDB().
 */
export function getRateSync(key: string): number {
    if (_cache) {
        const entry = _cache.get(key);
        if (entry != null) return entry.value;
    }
    const fallback = HARDCODED_DEFAULTS[key];
    if (fallback != null) return fallback;
    throw new Error(`Rate card key "${key}" not found in cache or hardcoded defaults`);
}

/**
 * Pre-warm the cache. Call once at the start of a calculation batch.
 */
export async function preloadRateCard(): Promise<void> {
    await loadFromDB();
}

/**
 * Force-clear the cache (e.g., after admin edits).
 */
export function invalidateRateCardCache(): void {
    _cache = null;
    _cacheTime = 0;
}

// ============================================================================
// CONVENIENCE ACCESSORS — typed helpers for common rate lookups
// ============================================================================

export async function getMargin(category: "led_hardware" | "services_default" | "services_small" | "livesync"): Promise<number> {
    return getRate(`margin.${category}`);
}

export async function getServiceMarginForSize(totalSqFt: number): Promise<number> {
    return totalSqFt < 100
        ? getRate("margin.services_small")
        : getRate("margin.services_default");
}

export async function getSteelFabRate(complexity: InstallComplexity): Promise<number> {
    return getRate(`install.steel_fab.${complexity}`);
}

export async function getLedInstallRate(complexity: InstallComplexity): Promise<number> {
    const key = `install.led_panel.${complexity}`;
    // Heavy falls back to complex (no separate tier observed)
    if (complexity === "heavy") {
        return getRate("install.led_panel.complex");
    }
    return getRate(key);
}

export async function getBondRate(): Promise<number> {
    return getRate("bond_tax.bond_rate");
}

/**
 * Load the full rate card as a flat Record<key, number>.
 * Merges DB values over hardcoded defaults.
 */
export async function getFullRateCard(): Promise<Record<string, number>> {
    const db = await loadFromDB();
    const merged = { ...HARDCODED_DEFAULTS };
    for (const [key, entry] of db) {
        merged[key] = entry.value;
    }
    return merged;
}
