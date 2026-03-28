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
    widthMm: number;
    heightMm: number;
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

                // Score by pitch closeness + type + nits + mesh penalty
                const SPECIALTY_PATTERNS = /courtside|stanchion|clock|table|counter|desk/i;
                const MESH_PATTERNS = /mesh|transparent|see.?through/i;
                const targetNits = spec.brightnessNits || 0;

                suitable.sort((a, b) => {
                    const pitchA = Math.abs(a.pixelPitch - targetPitch);
                    const pitchB = Math.abs(b.pixelPitch - targetPitch);

                    // Specialty products (courtside tables, stanchions) NEVER match regular displays
                    const isSpecialtyA = SPECIALTY_PATTERNS.test(a.displayName);
                    const isSpecialtyB = SPECIALTY_PATTERNS.test(b.displayName);
                    const penaltyA = isSpecialtyA ? 200 : 0;
                    const penaltyB = isSpecialtyB ? 200 : 0;

                    // Mesh products should not match solid-panel applications
                    const isMeshA = MESH_PATTERNS.test(a.displayName) || MESH_PATTERNS.test(a.modelNumber);
                    const isMeshB = MESH_PATTERNS.test(b.displayName) || MESH_PATTERNS.test(b.modelNumber);
                    const meshPenaltyA = isMeshA ? 50 : 0;
                    const meshPenaltyB = isMeshB ? 50 : 0;

                    // Nits penalty scales with how far under spec the product is
                    // 1500 nits vs 8000 required = 81% deficit = penalty of 81
                    let nitsPenaltyA = 0;
                    let nitsPenaltyB = 0;
                    if (targetNits > 0) {
                        if (a.maxNits < targetNits) nitsPenaltyA = Math.round(((targetNits - a.maxNits) / targetNits) * 100);
                        if (b.maxNits < targetNits) nitsPenaltyB = Math.round(((targetNits - b.maxNits) / targetNits) * 100);
                    }

                    return (pitchA + penaltyA + meshPenaltyA + nitsPenaltyA) - (pitchB + penaltyB + meshPenaltyB + nitsPenaltyB);
                });

                const best = suitable[0];
                const matched: MatchedProduct = {
                    id: best.id,
                    manufacturer: best.manufacturer,
                    name: best.displayName,
                    modelNumber: best.modelNumber,
                    widthMm: best.cabinetWidthMm,
                    heightMm: best.cabinetHeightMm,
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
     */
    private static calculateSolution(spec: ScreenSpec, module: MatchedProduct): MatchedSolution {
        const targetWidthMm = spec.widthFt * 304.8;
        const targetHeightMm = spec.heightFt * 304.8;

        const cols = Math.max(1, Math.round(targetWidthMm / module.widthMm));
        const rows = Math.max(1, Math.round(targetHeightMm / module.heightMm));

        const activeWidthMm = cols * module.widthMm;
        const activeHeightMm = rows * module.heightMm;

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
            const dbProducts = await prisma.manufacturerProduct.findMany({
                where: { isActive: true },
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
