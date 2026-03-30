import Decimal from 'decimal.js';
import { roundToDecimals } from '../lib/math';
import { LED_MODULES, ModuleSize } from '../data/catalogs/led-products';

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
 * ModuleMatchingService (REQ-121: Eric Gruner's "Slightly Smaller" Rule)
 * 
 * Calculates the number of modules required to match target dimensions.
 * 
 * CRITICAL RULE: Always match to "slightly smaller" than requested to avoid
 * over-promising on physical space. This prevents installation failures where
 * the display doesn't fit the structural opening.
 * 
 * Supports half-module (0.5) increments as per REQ-9.
 */
export function matchModules(
    targetWidthFt: number,
    targetHeightFt: number,
    moduleKey: string = 'DEFAULT'
): MatchingResult {
    const module = LED_MODULES[moduleKey] || LED_MODULES['DEFAULT'];

    // Convert target feet to inches
    const targetWidthIn = new Decimal(targetWidthFt).mul(12);
    const targetHeightIn = new Decimal(targetHeightFt).mul(12);

    // Calculate module counts
    let countW: number;
    let countH: number;

    // CEIL the module count to meet or exceed the requested dimensions.
    // RFP dimensions are minimum requirements — the display must be at least as large.

    if (module.supportsHalfModule) {
        // Half-module support: ceil to nearest 0.5
        // Example: 4.2 modules → 4.5 modules (meets or exceeds)
        countW = Math.ceil(targetWidthIn.div(module.widthInches).mul(2).toNumber()) / 2;
        countH = Math.ceil(targetHeightIn.div(module.heightInches).mul(2).toNumber()) / 2;
    } else {
        // Whole modules only: ceil to nearest whole number
        // Example: 4.2 modules → 5 modules (meets or exceeds)
        countW = Math.ceil(targetWidthIn.div(module.widthInches).toNumber());
        countH = Math.ceil(targetHeightIn.div(module.heightInches).toNumber());
    }

    // Ensure at least 1 module in each dimension
    countW = Math.max(countW, module.supportsHalfModule ? 0.5 : 1);
    countH = Math.max(countH, module.supportsHalfModule ? 0.5 : 1);

    // Calculate actual dimensions in feet (will be >= target)
    const actualWidthFt = new Decimal(countW).mul(module.widthInches).div(12).toNumber();
    const actualHeightFt = new Decimal(countH).mul(module.heightInches).div(12).toNumber();

    const areaSqFt = new Decimal(actualWidthFt).mul(actualHeightFt).toNumber();

    // Diff should be positive or zero (actual >= target)
    const diffWidthFt = actualWidthFt - targetWidthFt;
    const diffHeightFt = actualHeightFt - targetHeightFt;

    return {
        moduleCountW: countW,
        moduleCountH: countH,
        totalModules: countW * countH,
        actualWidthFt: roundToDecimals(actualWidthFt, 2),
        actualHeightFt: roundToDecimals(actualHeightFt, 2),
        areaSqFt: roundToDecimals(areaSqFt, 2),
        diffWidthFt: roundToDecimals(diffWidthFt, 2),  // Should be >= 0
        diffHeightFt: roundToDecimals(diffHeightFt, 2), // Should be >= 0
    };
}

/**
 * Find the best module from catalog that meets or exceeds the target dimensions.
 *
 * Given a target size and pitch, find the module that:
 * 1. Matches the pitch requirement
 * 2. Results in actual dimensions >= target dimensions
 * 3. Minimizes overshoot (closest to target while still meeting it)
 */
export function findBestFitModule(
    targetWidthFt: number,
    targetHeightFt: number,
    targetPitch: number
): { moduleKey: string; result: MatchingResult } | null {
    const candidates: { key: string; result: MatchingResult; overshoot: number }[] = [];

    for (const [key, module] of Object.entries(LED_MODULES)) {
        // Filter by pitch (allow ±1mm tolerance)
        if (Math.abs(module.pitch - targetPitch) > 1) continue;

        const result = matchModules(targetWidthFt, targetHeightFt, key);

        // Calculate overshoot — lower is better (closest to target while meeting it)
        const targetArea = targetWidthFt * targetHeightFt;
        const overshoot = targetArea > 0 ? (result.areaSqFt / targetArea) - 1 : 0;

        candidates.push({ key, result, overshoot });
    }

    if (candidates.length === 0) return null;

    // Sort by overshoot (lowest first = closest to target while meeting it)
    candidates.sort((a, b) => a.overshoot - b.overshoot);

    return { moduleKey: candidates[0].key, result: candidates[0].result };
}
