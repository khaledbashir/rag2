/**
 * Product Engine - Eric Gruner's "Module-by-Module" Calculation
 *
 * P0 REQUIREMENT: "Slightly Smaller" Rule
 * The calculated screen size must be LESS THAN OR EQUAL TO (<=) the Target RFP size.
 * We cannot build a screen larger than the steel opening.
 *
 * Formula: ModulesHigh = Math.floor(TargetHeight / ModuleHeight)
 * Formula: ActualHeight = ModulesHigh * ModuleHeight
 *
 * Usage:
 * 1. Find the best LED module for given specs (pitch, environment)
 * 2. Calculate exact screen dimensions that fit within structural opening
 * 3. Return actual dimensions, module counts, resolution, weight, power
 * 4. Feed actual dimensions into Natalia Math for accurate cost basis
 *
 * Phase 2: Also supports ManufacturerProduct from database via adapter.
 */

import { LED_MODULES, LedModule } from "@/data/catalogs/led-products";
import type { ManufacturerProduct } from "@prisma/client";

// ============================================================================
// CONSTANTS
// ============================================================================

const LB_PER_KG = 2.20462;
const MM_PER_INCH = 25.4;

// ============================================================================
// TYPES
// ============================================================================

export interface TargetSpec {
    targetWidthFt: number;   // From RFP (e.g., 20)
    targetHeightFt: number;  // From RFP (e.g., 10)
    pixelPitch?: number;      // Desired pitch in mm (e.g., 10)
    isOutdoor?: boolean;     // Environment context
    manufacturer?: string;   // Optional preference ("LG", "Yaham", "Absen")
}

export interface BestFitResult {
    module: LedModule;
    actualWidthFt: number;   // Slightly smaller or equal to target
    actualHeightFt: number;  // Slightly smaller or equal to target
    actualWidthMm: number;   // Exact physical width
    actualHeightMm: number;  // Exact physical height
    actualWidthInches: number;
    actualHeightInches: number;
    modulesWide: number;     // Number of modules across (calculated via Math.floor)
    modulesHigh: number;     // Number of modules tall (calculated via Math.floor)
    totalModules: number;    // Total modules = modulesWide * modulesHigh
    resolutionX: number;     // Horizontal pixel resolution
    resolutionY: number;     // Vertical pixel resolution
    totalWeightLbs: number;  // Total weight
    maxPowerWatts: number;   // Max power consumption
    fitPercentage: number;   // How much of target space is utilized (0-100)
}

// ============================================================================
// ADAPTER: ManufacturerProduct → LedModule
// ============================================================================

/**
 * Convert a database ManufacturerProduct to the LedModule interface
 * used by the existing ProductEngine. Backwards-compatible adapter.
 */
export function manufacturerProductToLedModule(product: ManufacturerProduct): LedModule {
    return {
        id: product.modelNumber,
        manufacturer: product.manufacturer,
        name: product.displayName,
        widthMm: product.cabinetWidthMm,
        heightMm: product.cabinetHeightMm,
        widthInches: product.cabinetWidthMm / MM_PER_INCH,
        heightInches: product.cabinetHeightMm / MM_PER_INCH,
        pitch: product.pixelPitch,
        nits: product.maxNits,
        weightLbs: product.weightKgPerCabinet * LB_PER_KG,
        maxPowerWatts: product.maxPowerWattsPerCab,
        supportsHalfModule: product.supportsHalfModule,
    };
}

// ============================================================================
// PRODUCT CATALOG FILTERING
// ============================================================================

class ProductCatalog {
    /**
     * Get all available LED modules from catalog
     */
    static getAllModules(): LedModule[] {
        return Object.values(LED_MODULES).filter(m => m.id !== "default-1");
    }

    /**
     * Filter modules by environment (Indoor vs Outdoor)
     */
    static filterByEnvironment(modules: LedModule[], isOutdoor: boolean): LedModule[] {
        return modules.filter(module => {
            const isOutdoorModule = 
                module.name.toLowerCase().includes("outdoor") || 
                module.nits >= 5000; // High nits usually means outdoor
            
            return isOutdoor ? isOutdoorModule : !isOutdoorModule;
        });
    }

    /**
     * Find closest match for pixel pitch
     */
    static findByPitch(modules: LedModule[], targetPitch: number): LedModule {
        if (modules.length === 0) return LED_MODULES["DEFAULT"];

        // Sort by pitch closeness
        modules.sort((a, b) => Math.abs(a.pitch - targetPitch) - Math.abs(b.pitch - targetPitch));
        return modules[0];
    }

    /**
     * Find manufacturer-specific modules
     */
    static findByManufacturer(modules: LedModule[], manufacturer: string): LedModule[] {
        return modules.filter(m => m.manufacturer.toLowerCase() === manufacturer.toLowerCase());
    }
}

// ============================================================================
// "SLIGHTLY SMALLER" ENGINE (Core Logic)
// ============================================================================

/**
 * Main "Slightly Smaller" Calculation
 * 
 * P0 MANDATE: Display must fit INSIDE structural opening.
 * Uses Math.floor() to ensure we never exceed the target dimensions.
 */
export class ProductEngine {

    /**
     * Find best fit module and calculate exact screen dimensions
     * 
     * @param spec - Target specifications from RFP
     * @returns BestFitResult with all calculated metrics
     */
    static findBestFit(spec: TargetSpec): BestFitResult {
        // 1. Get available modules
        let modules = ProductCatalog.getAllModules();

        // 2. Filter by environment (if specified)
        const isOutdoor = spec.isOutdoor !== undefined ? spec.isOutdoor : false;
        modules = ProductCatalog.filterByEnvironment(modules, isOutdoor);

        // Fallback: If no environment match, use all candidates
        if (modules.length === 0) {
            modules = ProductCatalog.getAllModules();
        }

        // 3. Filter by manufacturer (if specified)
        if (spec.manufacturer) {
            const manufacturerModules = ProductCatalog.findByManufacturer(modules, spec.manufacturer);
            if (manufacturerModules.length > 0) {
                modules = manufacturerModules;
            }
        }

        // 4. Determine target pitch
        // Default: 10mm for outdoor, 3.9mm for indoor
        const targetPitch = spec.pixelPitch || (isOutdoor ? 10 : 3.9);

        // 5. Find best module by pitch
        const bestModule = ProductCatalog.findByPitch(modules, targetPitch);

        // 6. Snap to nearest cabinet/module grid (closest to target, slightly over preferred)
        const targetWidthMm = spec.targetWidthFt * 304.8;
        const targetHeightMm = spec.targetHeightFt * 304.8;

        // Round to nearest cabinet count, prefer ceil for slight overshoot
        const exactW = targetWidthMm / bestModule.widthMm;
        const exactH = targetHeightMm / bestModule.heightMm;
        const effectiveModulesWide = Math.max(1, Math.round(exactW) || Math.ceil(exactW));
        const effectiveModulesHigh = Math.max(1, Math.round(exactH) || Math.ceil(exactH));

        // Calculate actual dimensions
        const actualWidthMm = effectiveModulesWide * bestModule.widthMm;
        const actualHeightMm = effectiveModulesHigh * bestModule.heightMm;
        const actualWidthFt = actualWidthMm / 304.8;
        const actualHeightFt = actualHeightMm / 304.8;
        const actualWidthInches = actualWidthMm / 25.4;
        const actualHeightInches = actualHeightMm / 25.4;

        // Calculate resolution (pixels)
        const resolutionX = Math.round(actualWidthMm / bestModule.pitch);
        const resolutionY = Math.round(actualHeightMm / bestModule.pitch);

        // Calculate total metrics
        const totalModules = effectiveModulesWide * effectiveModulesHigh;
        const totalWeightLbs = totalModules * bestModule.weightLbs;
        const maxPowerWatts = totalModules * bestModule.maxPowerWatts;

        // Calculate fit percentage (how much of target space is utilized)
        const fitPercentage = Math.min(
            100,
            (actualWidthFt * actualHeightFt) / (spec.targetWidthFt * spec.targetHeightFt) * 100
        );

        return {
            module: bestModule,
            actualWidthFt,
            actualHeightFt,
            actualWidthMm,
            actualHeightMm,
            actualWidthInches,
            actualHeightInches,
            modulesWide: effectiveModulesWide,
            modulesHigh: effectiveModulesHigh,
            totalModules,
            resolutionX,
            resolutionY,
            totalWeightLbs,
            maxPowerWatts,
            fitPercentage,
        };
    }

    /**
     * Find best fit from a pre-filtered list of ManufacturerProducts (from database).
     * Uses the same "Slightly Smaller" logic as findBestFit, but with DB-backed products.
     */
    static findBestFitFromProducts(
        spec: TargetSpec,
        products: ManufacturerProduct[]
    ): BestFitResult {
        // Convert DB products to LedModule interface
        const modules = products.map(manufacturerProductToLedModule);

        if (modules.length === 0) {
            // Fallback to hardcoded catalog
            return this.findBestFit(spec);
        }

        // Find closest pitch match
        const targetPitch = spec.pixelPitch || (spec.isOutdoor ? 10 : 3.9);
        modules.sort((a, b) => Math.abs(a.pitch - targetPitch) - Math.abs(b.pitch - targetPitch));
        const bestModule = modules[0];

        // Snap to nearest cabinet grid (closest to target, slightly over preferred)
        const targetWidthMm = spec.targetWidthFt * 304.8;
        const targetHeightMm = spec.targetHeightFt * 304.8;

        const exactW = targetWidthMm / bestModule.widthMm;
        const exactH = targetHeightMm / bestModule.heightMm;
        const modulesWide = Math.max(1, Math.round(exactW) || Math.ceil(exactW));
        const modulesHigh = Math.max(1, Math.round(exactH) || Math.ceil(exactH));

        const actualWidthMm = modulesWide * bestModule.widthMm;
        const actualHeightMm = modulesHigh * bestModule.heightMm;
        const actualWidthFt = actualWidthMm / 304.8;
        const actualHeightFt = actualHeightMm / 304.8;

        const totalModules = modulesWide * modulesHigh;

        return {
            module: bestModule,
            actualWidthFt,
            actualHeightFt,
            actualWidthMm,
            actualHeightMm,
            actualWidthInches: actualWidthMm / 25.4,
            actualHeightInches: actualHeightMm / 25.4,
            modulesWide,
            modulesHigh,
            totalModules,
            resolutionX: Math.round(actualWidthMm / bestModule.pitch),
            resolutionY: Math.round(actualHeightMm / bestModule.pitch),
            totalWeightLbs: totalModules * bestModule.weightLbs,
            maxPowerWatts: totalModules * bestModule.maxPowerWatts,
            fitPercentage: Math.min(
                100,
                (actualWidthFt * actualHeightFt) / (spec.targetWidthFt * spec.targetHeightFt) * 100
            ),
        };
    }

    /**
     * Batch calculate best fit for multiple screens
     */
    static findBestFitBatch(specs: TargetSpec[]): BestFitResult[] {
        return specs.map(spec => this.findBestFit(spec));
    }

    /**
     * Validate that a screen fits within structural constraints
     *
     * @result True if screen is smaller than or equal to target
     */
    static validateFit(result: BestFitResult, targetWidthFt: number, targetHeightFt: number): boolean {
        return result.actualWidthFt <= targetWidthFt && result.actualHeightFt <= targetHeightFt;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ProductCatalog, LED_MODULES };