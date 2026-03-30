import Decimal from 'decimal.js';
import { roundToDecimals } from '../lib/math';
import { LED_MODULES } from '../data/catalogs/led-products';
import { snapDimension } from './catalog/productMatcher';

export interface MatchingResult {
    moduleCountW: number;
    moduleCountH: number;
    totalModules: number;
    actualWidthFt: number;
    actualHeightFt: number;
    areaSqFt: number;
    diffWidthFt: number;
    diffHeightFt: number;
}

/**
 * ModuleMatchingService
 *
 * Calculates the number of cabinets + modules required to match target dimensions.
 * Uses cabinet-first snapping with module fill for the remainder.
 * Supports half-module (0.5) increments as per REQ-9.
 */
export function matchModules(
    targetWidthFt: number,
    targetHeightFt: number,
    moduleKey: string = 'DEFAULT'
): MatchingResult {
    const mod = LED_MODULES[moduleKey] || LED_MODULES['DEFAULT'];

    const targetWidthMm = targetWidthFt * 304.8;
    const targetHeightMm = targetHeightFt * 304.8;

    // Derive module size: if supportsHalfModule, module = cabinet/2
    const moduleWidthMm = mod.supportsHalfModule ? mod.widthMm / 2 : undefined;
    const moduleHeightMm = mod.supportsHalfModule ? mod.heightMm / 2 : undefined;

    const snapW = snapDimension(targetWidthMm, mod.widthMm, moduleWidthMm);
    const snapH = snapDimension(targetHeightMm, mod.heightMm, moduleHeightMm);

    const actualWidthFt = snapW.totalMm / 304.8;
    const actualHeightFt = snapH.totalMm / 304.8;
    const areaSqFt = actualWidthFt * actualHeightFt;

    const diffWidthFt = actualWidthFt - targetWidthFt;
    const diffHeightFt = actualHeightFt - targetHeightFt;

    return {
        moduleCountW: snapW.units,
        moduleCountH: snapH.units,
        totalModules: snapW.units * snapH.units,
        actualWidthFt: roundToDecimals(actualWidthFt, 2),
        actualHeightFt: roundToDecimals(actualHeightFt, 2),
        areaSqFt: roundToDecimals(areaSqFt, 2),
        diffWidthFt: roundToDecimals(diffWidthFt, 2),
        diffHeightFt: roundToDecimals(diffHeightFt, 2),
    };
}

/**
 * Find the best module from catalog that gets closest to target dimensions.
 * Slightly over is preferred over significantly under.
 */
export function findBestFitModule(
    targetWidthFt: number,
    targetHeightFt: number,
    targetPitch: number
): { moduleKey: string; result: MatchingResult } | null {
    const candidates: { key: string; result: MatchingResult; gap: number }[] = [];

    for (const [key, module] of Object.entries(LED_MODULES)) {
        // Filter by pitch (allow ±1mm tolerance)
        if (Math.abs(module.pitch - targetPitch) > 1) continue;

        const result = matchModules(targetWidthFt, targetHeightFt, key);

        // Absolute gap from target area — lower is better
        const targetArea = targetWidthFt * targetHeightFt;
        const gap = targetArea > 0 ? Math.abs(result.areaSqFt - targetArea) / targetArea : 0;

        candidates.push({ key, result, gap });
    }

    if (candidates.length === 0) return null;

    // Sort by gap (lowest first = closest to target)
    candidates.sort((a, b) => a.gap - b.gap);

    return { moduleKey: candidates[0].key, result: candidates[0].result };
}
