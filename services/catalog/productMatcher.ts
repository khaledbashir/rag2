import { LED_MODULES, LedModule, Catalog } from "@/data/catalogs/led-products";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface ScreenSpec {
    widthFt: number;
    heightFt: number;
    pixelPitch?: number; // Desired pitch from RFP
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
 * Queries the Prisma ManufacturerProduct table to find the best LED product
 * for a given loose specification. Falls back to hardcoded LED_MODULES if DB is empty.
 */
export class ProductMatcher {

    /**
     * Find the best matching LED product for a given screen specification.
     * Queries the database first; falls back to hardcoded catalog if empty.
     */
    static async matchProduct(spec: ScreenSpec): Promise<MatchedSolution> {
        const isOutdoorRequest = spec.isOutdoor === true;
        const targetPitch = spec.pixelPitch || (isOutdoorRequest ? 10 : 3.9);
        const targetEnv = isOutdoorRequest ? "outdoor" : "indoor";

        // Query Prisma for active products
        let dbProducts = await prisma.manufacturerProduct.findMany({
            where: {
                isActive: true,
                ...(spec.manufacturer ? { manufacturer: { equals: spec.manufacturer, mode: "insensitive" as const } } : {}),
            },
            orderBy: { pixelPitch: "asc" },
        });

        // If DB has products, use them
        if (dbProducts.length > 0) {
            // Filter by environment
            let suitable = dbProducts.filter((p) => {
                if (targetEnv === "outdoor") return p.environment === "outdoor" || p.environment === "indoor_outdoor";
                return p.environment === "indoor" || p.environment === "indoor_outdoor";
            });
            if (suitable.length === 0) suitable = dbProducts;

            // Sort by closeness to target pitch
            suitable.sort((a, b) => Math.abs(a.pixelPitch - targetPitch) - Math.abs(b.pixelPitch - targetPitch));

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

        // Fallback: use hardcoded LED_MODULES
        return ProductMatcher.matchFromHardcoded(spec);
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

        // Confidence: high if pitch within 1mm, low if within 3mm, none beyond that
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
     * Fallback: match from hardcoded LED_MODULES when DB is empty.
     */
    private static matchFromHardcoded(spec: ScreenSpec): MatchedSolution {
        const candidates = Object.values(LED_MODULES).filter(m => m.id !== "default-1");
        const isOutdoorRequest = spec.isOutdoor === true;

        let suitable = candidates.filter(m => {
            const isOutdoorModule = m.name.toLowerCase().includes("outdoor") || m.nits >= 5000;
            return isOutdoorRequest ? isOutdoorModule : !isOutdoorModule;
        });
        if (suitable.length === 0) suitable = candidates;

        const targetPitch = spec.pixelPitch || (isOutdoorRequest ? 10 : 3.9);
        suitable.sort((a, b) => Math.abs(a.pitch - targetPitch) - Math.abs(b.pitch - targetPitch));

        const best = suitable[0] || LED_MODULES["DEFAULT"];
        const matched: MatchedProduct = {
            id: best.id,
            manufacturer: best.manufacturer,
            name: best.name,
            modelNumber: best.id,
            widthMm: best.widthMm,
            heightMm: best.heightMm,
            pitch: best.pitch,
            nits: best.nits,
            weightKg: best.weightLbs * 0.4536,
            maxPowerWatts: best.maxPowerWatts,
            supportsHalfModule: best.supportsHalfModule,
            environment: best.nits >= 5000 ? "outdoor" : "indoor",
        };

        return ProductMatcher.calculateSolution(spec, matched);
    }
}
