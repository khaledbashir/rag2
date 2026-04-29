import { prisma } from "@/lib/prisma";

export interface ScreenSpec {
    widthFt: number;
    heightFt: number;
    pixelPitch?: number; // Desired pitch from RFP
    brightnessNits?: number; // Desired brightness from RFP
    isOutdoor?: boolean; // Inferred from context or explicit
    manufacturer?: string; // Optional preference
}

export interface MatchedProduct {
    id: string;
    manufacturer: string;
    name: string;
    modelNumber: string;
    widthMm: number;  // Cabinet width
    heightMm: number; // Cabinet height
    moduleWidthMm?: number;  // Individual module width within cabinet
    moduleHeightMm?: number; // Individual module height within cabinet
    pitch: number;
    nits: number;
    weightKg: number;
    maxPowerWatts: number;
    supportsHalfModule: boolean;
    environment: string;
}

export type MatchConfidence = "high" | "low" | "none";

export interface MatchedSolution {
    module: MatchedProduct;
    cols: number;
    rows: number;
    activeWidthMm: number;
    activeHeightMm: number;
    activeWidthFt: number;
    activeHeightFt: number;
    resolutionX: number;
    resolutionY: number;
    totalModules: number;
    fitScore: number; // 0-100 (100 = perfect match)
    pitchDelta: number; // absolute mm difference between requested and matched pitch
    confidence: MatchConfidence;
}

/**
 * Snap a dimension (mm) to the nearest combination of cabinets + modules.
 * Always rounds up to the smallest valid cabinet/module grid that meets or exceeds
 * the requested size. Natalia's requirement is "meet or exceed" the RFP size,
 * never snap under it just because the undersized option is numerically closer.
 */
export function snapDimension(
    targetMm: number,
    cabinetMm: number,
    moduleMm?: number,
): { cabinets: number; modules: number; units: number; totalMm: number } {
    if (targetMm <= 0 || cabinetMm <= 0) {
        return { cabinets: 1, modules: 0, units: 1, totalMm: cabinetMm };
    }

    // Derive effective module size:
    // 1. Explicit moduleWidthMm/moduleHeightMm from DB
    // 2. Otherwise assume module = cabinet (no sub-cabinet granularity)
    const effModuleMm = moduleMm && moduleMm > 0 && moduleMm < cabinetMm
        ? moduleMm
        : null;

    if (!effModuleMm) {
        // No module data — use the smallest whole-cabinet count that meets/exceeds target.
        const cabs = Math.max(1, Math.ceil(targetMm / cabinetMm));
        return { cabinets: cabs, modules: 0, units: cabs, totalMm: cabs * cabinetMm };
    }

    // How many modules fit in one cabinet
    const modulesPerCab = Math.round(cabinetMm / effModuleMm);
    // Use the smallest whole-module count that meets/exceeds target, then reduce it
    // back into full cabinets + remainder modules for downstream reporting.
    const totalModulesInUnits = Math.max(1, Math.ceil(targetMm / effModuleMm));
    const finalCabs = Math.floor(totalModulesInUnits / modulesPerCab);
    const finalMods = totalModulesInUnits % modulesPerCab;
    const totalMm = totalModulesInUnits * effModuleMm;

    // Ensure at least 1 unit
    if (finalCabs === 0 && finalMods === 0) {
        return { cabinets: 0, modules: 1, units: 1, totalMm: effModuleMm };
    }

    return {
        cabinets: finalCabs,
        modules: finalMods,
        units: totalModulesInUnits,
        totalMm,
    };
}

/**
 * Product Matcher Service
 *
 * All products live in the ManufacturerProduct DB table.
 * No hardcoded fallback — if the DB is down, the app is down.
 */
export class ProductMatcher {

    /**
     * Find the best matching LED product for a given screen specification.
     */
    static async matchProduct(spec: ScreenSpec): Promise<MatchedSolution> {
        const isOutdoorRequest = spec.isOutdoor === true;
        const targetPitch = spec.pixelPitch || (isOutdoorRequest ? 10 : 3.9);
        const targetEnv = isOutdoorRequest ? "outdoor" : "indoor";

        // Priority 1: Query Prisma for active products
        try {
            const dbProducts = await prisma.manufacturerProduct.findMany({
                where: {
                    isActive: true,
                    productType: "led",
                    ...(spec.manufacturer ? { manufacturer: { equals: spec.manufacturer, mode: "insensitive" as const } } : {}),
                },
                orderBy: { pixelPitch: "asc" },
            });

            if (dbProducts.length > 0) {
                let suitable = dbProducts.filter((p) => {
                    if (targetEnv === "outdoor") return p.environment === "outdoor" || p.environment === "indoor_outdoor";
                    return p.environment === "indoor" || p.environment === "indoor_outdoor";
                });
                if (suitable.length === 0) suitable = dbProducts;

                // Score by spec compliance first, manufacturer preference is tiebreaker only.
                // Priority order:
                //   1. Disqualify specialty/mesh products (huge penalty)
                //   2. Nits compliance (meets spec or not — binary gate, then deficit %)
                //   3. Pitch closeness (normalized to 0-100 scale)
                //   4. Manufacturer preference (tiny tiebreaker: 0-1 range)
                const SPECIALTY_PATTERNS = /courtside|stanchion|clock|table|counter|desk/i;
                const MESH_PATTERNS = /mesh|transparent|see.?through/i;
                const targetNits = spec.brightnessNits || 0;

                suitable.sort((a, b) => {
                    // --- Layer 0: Hard disqualifiers (specialty, mesh) ---
                    const isSpecialtyA = SPECIALTY_PATTERNS.test(a.displayName) ? 10000 : 0;
                    const isSpecialtyB = SPECIALTY_PATTERNS.test(b.displayName) ? 10000 : 0;
                    const isMeshA = (MESH_PATTERNS.test(a.displayName) || MESH_PATTERNS.test(a.modelNumber)) ? 5000 : 0;
                    const isMeshB = (MESH_PATTERNS.test(b.displayName) || MESH_PATTERNS.test(b.modelNumber)) ? 5000 : 0;

                    // --- Layer 1: Nits compliance (most important spec criterion) ---
                    // Products that MEET the nits requirement get 0 penalty.
                    // Products that DON'T meet it get 1000 + deficit percentage (1000-1100).
                    // This ensures ANY product that meets nits always beats one that doesn't,
                    // regardless of manufacturer or pitch.
                    let nitsPenaltyA = 0;
                    let nitsPenaltyB = 0;
                    if (targetNits > 0) {
                        if (a.maxNits < targetNits) {
                            const deficit = Math.round(((targetNits - a.maxNits) / targetNits) * 100);
                            nitsPenaltyA = 1000 + deficit; // 1000 = "does not meet spec" gate
                        }
                        if (b.maxNits < targetNits) {
                            const deficit = Math.round(((targetNits - b.maxNits) / targetNits) * 100);
                            nitsPenaltyB = 1000 + deficit;
                        }
                    }

                    // --- Layer 2: Pitch closeness (0-100 scale) ---
                    // Normalize pitch delta: 0mm diff = 0, 10mm diff = 100
                    const pitchA = Math.min(Math.abs(a.pixelPitch - targetPitch) * 10, 100);
                    const pitchB = Math.min(Math.abs(b.pixelPitch - targetPitch) * 10, 100);

                    // --- Layer 3: Service type — prefer RS (rear) over FM (front) by default. ---
                    // Natalia 2026-04-29: "RS should be our default on all products even if brightness
                    // in the spec is lower than the threshold. Estimators should have to force the AI
                    // to pick FM so we don't choose on mistake. Very few FM orders, only small market
                    // minor league." Tiebreaker only — pitch + nits dominate. Manual SKU selection
                    // bypasses this entirely (matcher isn't called).
                    const svcPriority = (st: string | null) => st === "rear" || st === "front_rear" ? 0 : st === "front" ? 0.3 : 0.5;
                    const svcA = svcPriority(a.serviceType);
                    const svcB = svcPriority(b.serviceType);

                    // --- Layer 4: Manufacturer preference (tiebreaker only, 0-1 range) ---
                    // Only matters when two products have identical spec compliance.
                    const mfgPriority = (m: string) => /yaham/i.test(m) ? 0 : /\blg\b/i.test(m) ? 0.5 : 1;
                    const mfgA = mfgPriority(a.manufacturer);
                    const mfgB = mfgPriority(b.manufacturer);

                    const scoreA = isSpecialtyA + isMeshA + nitsPenaltyA + pitchA + svcA + mfgA;
                    const scoreB = isSpecialtyB + isMeshB + nitsPenaltyB + pitchB + svcB + mfgB;
                    return scoreA - scoreB;
                });

                const best = suitable[0];
                const matched: MatchedProduct = {
                    id: best.id,
                    manufacturer: best.manufacturer,
                    name: best.displayName,
                    modelNumber: best.modelNumber,
                    widthMm: best.cabinetWidthMm,
                    heightMm: best.cabinetHeightMm,
                    moduleWidthMm: best.moduleWidthMm ?? undefined,
                    moduleHeightMm: best.moduleHeightMm ?? undefined,
                    pitch: best.pixelPitch,
                    nits: best.maxNits,
                    weightKg: best.weightKgPerCabinet,
                    maxPowerWatts: best.maxPowerWattsPerCab,
                    supportsHalfModule: best.supportsHalfModule,
                    environment: best.environment,
                };

                return ProductMatcher.calculateSolution(spec, matched);
            }
        } catch (err) {
            console.error("[ProductMatcher] DB query failed:", err);
            throw new Error(`Product matching failed — database unreachable: ${err}`);
        }

        throw new Error("No products found in database. Run the seed script: npx tsx prisma/seed-products.ts");
    }

    /**
     * Calculate the matrix solution for a given module and spec.
     * Uses cabinet + module snapping to get as close as possible to target.
     */
    private static calculateSolution(spec: ScreenSpec, module: MatchedProduct): MatchedSolution {
        const targetWidthMm = spec.widthFt * 304.8;
        const targetHeightMm = spec.heightFt * 304.8;

        const snapW = snapDimension(targetWidthMm, module.widthMm, module.moduleWidthMm);
        const snapH = snapDimension(targetHeightMm, module.heightMm, module.moduleHeightMm);
        const cols = snapW.units;
        const rows = snapH.units;

        const activeWidthMm = snapW.totalMm;
        const activeHeightMm = snapH.totalMm;

        const widthRatio = Math.min(activeWidthMm, targetWidthMm) / Math.max(activeWidthMm, targetWidthMm);
        const heightRatio = Math.min(activeHeightMm, targetHeightMm) / Math.max(activeHeightMm, targetHeightMm);
        const fitScore = Math.round((widthRatio * heightRatio) * 100);

        const targetPitch = spec.pixelPitch || (spec.isOutdoor ? 10 : 3.9);
        const pitchDelta = Math.abs(module.pitch - targetPitch);

        const PITCH_HIGH_TOLERANCE = 1.0;
        const PITCH_LOW_TOLERANCE = 3.0;
        let confidence: MatchConfidence = "none";
        if (pitchDelta <= PITCH_HIGH_TOLERANCE) confidence = "high";
        else if (pitchDelta <= PITCH_LOW_TOLERANCE) confidence = "low";

        return {
            module,
            cols,
            rows,
            activeWidthMm,
            activeHeightMm,
            activeWidthFt: activeWidthMm / 304.8,
            activeHeightFt: activeHeightMm / 304.8,
            resolutionX: Math.round(activeWidthMm / module.pitch),
            resolutionY: Math.round(activeHeightMm / module.pitch),
            totalModules: cols * rows,
            fitScore,
            pitchDelta,
            confidence,
        };
    }

    /**
     * List all available products for a dropdown selector.
     * Returns DB products if available, otherwise productCatalog.ts products.
     */
    static async listProducts(environment?: "indoor" | "outdoor"): Promise<MatchedProduct[]> {
        try {
            // Include LED + courtside + stanchion so the Estimator's LED Cost
            // Sheet product dropdown can offer all Estimator-facing product
            // types in one list. Without courtside/stanchion here, Natalia's
            // courtside table rows couldn't select a product in Excel —
            // only LED (and OES clocks which are stored under productType=led)
            // were showing up.
            const dbProducts = await prisma.manufacturerProduct.findMany({
                where: {
                    isActive: true,
                    productType: { in: ["led", "courtside", "stanchion"] },
                },
                orderBy: { pixelPitch: "asc" },
            });

            if (dbProducts.length > 0) {
                let suitable = dbProducts;
                if (environment) {
                    suitable = dbProducts.filter((p) => {
                        if (environment === "outdoor") return p.environment === "outdoor" || p.environment === "indoor_outdoor";
                        return p.environment === "indoor" || p.environment === "indoor_outdoor";
                    });
                    if (suitable.length === 0) suitable = dbProducts;
                }
                return suitable.map((p) => ({
                    id: p.id,
                    manufacturer: p.manufacturer,
                    name: p.displayName,
                    modelNumber: p.modelNumber,
                    widthMm: p.cabinetWidthMm,
                    heightMm: p.cabinetHeightMm,
                    moduleWidthMm: p.moduleWidthMm ?? undefined,
                    moduleHeightMm: p.moduleHeightMm ?? undefined,
                    pitch: p.pixelPitch,
                    nits: p.maxNits,
                    weightKg: p.weightKgPerCabinet,
                    maxPowerWatts: p.maxPowerWattsPerCab,
                    supportsHalfModule: p.supportsHalfModule,
                    environment: p.environment,
                }));
            }
        } catch (err) {
            console.error("[ProductMatcher] DB query failed:", err);
            throw new Error(`Product listing failed — database unreachable: ${err}`);
        }

        return [];
    }

}
