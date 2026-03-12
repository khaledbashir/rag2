/**
 * Product Catalog — Phase 2 Intelligence Mode
 *
 * LED display product types with validated density constants.
 * All constants reverse-engineered from Westfield WTC RFP Exhibit G forms.
 *
 * Core principle: Power and weight are calculated from TOTAL ACTIVE AREA × DENSITY.
 * Cabinet topology (uniform vs mixed) is irrelevant for these calculations.
 *
 * See: /docs/phase2-rfp-intelligence-spec.md for full validation data.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ProductType {
    id: string;
    name: string;
    manufacturer: string;
    pitchMm: number;
    /** Watts per square meter of active display area */
    powerDensityWm2: number;
    /** Pounds per square meter of active display area (includes internal structure) */
    weightDensityLbm2: number;
    /** Average power as fraction of max power */
    avgMaxRatio: number;
    /** Brightness in nits */
    brightnessNits: number;
    /** Pixels per square foot */
    pixelDensityPPF: number;
    /** Color temperature range */
    colorTempK: { nominal: number; min: number; max: number };
    /** LED diode type */
    diode: string;
    /** Processing hardware */
    processing: string;
    /** Hardware module name */
    hardware: string;
    /** Expected lifespan in hours */
    lifespanHours: number;
    /** Default cabinet dimensions (mm). Null if product uses custom sizes. */
    defaultCabinet: CabinetSize | null;
    /** For products with two cabinet variants (e.g., 2.5mm standard + small) */
    smallCabinet: CabinetSize | null;
    /** Environment suitability */
    environment: "Indoor" | "Outdoor" | "Both";
}

export interface CabinetSize {
    widthMm: number;
    heightMm: number;
    depthMm: number;
    weightKg: number;
    maxPowerW: number;
}

export type ZoneClass = "standard" | "medium" | "large" | "complex";

export interface LocationSpec {
    name: string;
    productId: string;
    /** Total pixel resolution from Exhibit G form or drawings */
    resolutionW: number;
    resolutionH: number;
    /** Panel grid from drawings (optional — used for cabinet solver) */
    panelsWide?: number;
    panelsHigh?: number;
    /** Zone classification for pricing */
    zoneClass: ZoneClass;
}

export interface ExhibitGOutput {
    /** Physical dimensions */
    displayWidthFt: number;
    displayHeightFt: number;
    displayWidthMm: number;
    displayHeightMm: number;
    /** Pixel resolution */
    resolutionW: number;
    resolutionH: number;
    /** Active area */
    activeAreaM2: number;
    activeAreaSqFt: number;
    /** Power */
    maxPowerW: number;
    avgPowerW: number;
    /** Weight (includes internal structure) */
    totalWeightLbs: number;
    /** Product constants (auto-filled) */
    brightnessNits: number;
    pixelDensityPPF: number;
    colorTempK: { nominal: number; min: number; max: number };
    diode: string;
    processing: string;
    hardware: string;
    pitchMm: number;
    lifespanHours: number;
    environment: "Indoor" | "Outdoor";
}

export interface PricingEstimate {
    installCost: number;
    pmCost: number;
    engCost: number;
    /** Hardware cost placeholder — requires product pricing data */
    hardwareCost: number | null;
    totalEstimate: number | null;
    alt1UpgradeCost: number | null;
    zoneClass: ZoneClass;
    zoneMultiplier: number;
    complexityModifier: number;
}

export interface CabinetTopology {
    type: "uniform" | "mixed" | "unknown";
    /** For uniform: all panels are this size */
    standardMm?: { width: number; height: number };
    standardCount?: number;
    /** For mixed: remainder panels */
    remainderMm?: { width: number; height: number };
    remainderCount?: number;
    /** Total display dimensions regardless of topology */
    totalWidthMm: number;
    totalHeightMm: number;
}

// ============================================================================
// PRODUCT CATALOG
// ============================================================================

const PRODUCTS: Record<string, ProductType> = {
    "4mm-nitxeon": {
        id: "4mm-nitxeon",
        name: "4mm Indoor (Nitxeon)",
        manufacturer: "Nitxeon",
        pitchMm: 4,
        powerDensityWm2: 488.3,
        weightDensityLbm2: 45.4,
        avgMaxRatio: 0.40,
        brightnessNits: 2000,
        pixelDensityPPF: 5806,
        colorTempK: { nominal: 6600, min: 3200, max: 9300 },
        diode: "Nationstar RS2020",
        processing: "Novastar",
        hardware: "Nitxeon LED Module",
        lifespanHours: 100_000,
        defaultCabinet: {
            widthMm: 960, heightMm: 960, depthMm: 100,
            weightKg: 19, maxPowerW: 450,
        },
        smallCabinet: null,
        environment: "Indoor",
    },

    "10mm-mesh": {
        id: "10mm-mesh",
        name: "10mm Mesh P10 (Nitxeon)",
        manufacturer: "Nitxeon",
        pitchMm: 10,
        powerDensityWm2: 298.0,
        weightDensityLbm2: 19.6,
        avgMaxRatio: 0.40,
        brightnessNits: 1500,
        pixelDensityPPF: 929, // (1000/10)^2 / 10.764
        colorTempK: { nominal: 6600, min: 3200, max: 9300 },
        diode: "SMD Nationstar",
        processing: "Novastar",
        hardware: "Nitxeon LED Module (Mesh)",
        lifespanHours: 100_000,
        defaultCabinet: {
            widthMm: 1680, heightMm: 1000, depthMm: 100,
            weightKg: 15, maxPowerW: 500,
        },
        smallCabinet: null,
        environment: "Indoor",
    },

    "2.5mm-mip": {
        id: "2.5mm-mip",
        name: "2.5mm Indoor (Nationstar MIP)",
        manufacturer: "Nationstar",
        pitchMm: 2.5,
        powerDensityWm2: 390.6,
        weightDensityLbm2: 52.6,
        avgMaxRatio: 0.33,
        brightnessNits: 2000,
        pixelDensityPPF: 14863,
        colorTempK: { nominal: 6700, min: 3200, max: 9300 },
        diode: "Nationstar MIP A1010WN",
        processing: "Novastar",
        hardware: "Nationstar MIP Module",
        lifespanHours: 100_000,
        defaultCabinet: {
            widthMm: 480, heightMm: 960, depthMm: 91,
            weightKg: 11, maxPowerW: 180,
        },
        smallCabinet: {
            widthMm: 480, heightMm: 720, depthMm: 91,
            weightKg: 8.5, maxPowerW: 135,
        },
        environment: "Indoor",
    },

    // =========================================================================
    // YAHAM NX PRODUCTS — Source: NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx
    // Pricing date: 2026/02/04. All specs from manufacturer datasheet.
    // Two LED package variants exist per pitch (White=high brightness, Black=high contrast).
    // Catalog uses White (higher brightness) variant as primary.
    // =========================================================================

    // --- INDOOR (Corona Series + Halo Fascia) ---

    "yaham-c2.5-mip": {
        id: "yaham-c2.5-mip",
        name: "Yaham Corona C2.5-MIP Indoor",
        manufacturer: "Yaham",
        pitchMm: 2.5,
        powerDensityWm2: 401.5,
        weightDensityLbm2: 50.2,
        avgMaxRatio: 0.40,
        brightnessNits: 2000,
        pixelDensityPPF: 14863,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar MIP-A1010WN",
        processing: "ICN Driver IC",
        hardware: "Yaham Corona MIP Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 960, heightMm: 960, depthMm: 97, weightKg: 21, maxPowerW: 370 },
        smallCabinet: null,
        environment: "Indoor",
    },

    "yaham-c4": {
        id: "yaham-c4",
        name: "Yaham Corona C4 Indoor",
        manufacturer: "Yaham",
        pitchMm: 4,
        powerDensityWm2: 401.5,
        weightDensityLbm2: 46.6,
        avgMaxRatio: 0.40,
        brightnessNits: 2000,
        pixelDensityPPF: 5806,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2020MBAR",
        processing: "ICN Driver IC",
        hardware: "Yaham Corona Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 960, heightMm: 960, depthMm: 97, weightKg: 19.5, maxPowerW: 370 },
        smallCabinet: null,
        environment: "Indoor",
    },

    "yaham-c6": {
        id: "yaham-c6",
        name: "Yaham Corona C6 Indoor",
        manufacturer: "Yaham",
        pitchMm: 6,
        powerDensityWm2: 401.5,
        weightDensityLbm2: 46.6,
        avgMaxRatio: 0.40,
        brightnessNits: 2000,
        pixelDensityPPF: 2580,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2020MBAR",
        processing: "ICN Driver IC",
        hardware: "Yaham Corona Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 960, heightMm: 960, depthMm: 97, weightKg: 19.5, maxPowerW: 370 },
        smallCabinet: null,
        environment: "Indoor",
    },

    "yaham-c10": {
        id: "yaham-c10",
        name: "Yaham Corona C10 Indoor",
        manufacturer: "Yaham",
        pitchMm: 10,
        powerDensityWm2: 401.5,
        weightDensityLbm2: 46.6,
        avgMaxRatio: 0.40,
        brightnessNits: 2000,
        pixelDensityPPF: 929,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2020MBAR",
        processing: "ICN Driver IC",
        hardware: "Yaham Corona Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 960, heightMm: 960, depthMm: 97, weightKg: 19.5, maxPowerW: 370 },
        smallCabinet: null,
        environment: "Indoor",
    },

    "yaham-h10t-indoor": {
        id: "yaham-h10t-indoor",
        name: "Yaham Halo H10T Fascia Indoor",
        manufacturer: "Yaham",
        pitchMm: 10,
        powerDensityWm2: 401.5,
        weightDensityLbm2: 62.2,
        avgMaxRatio: 0.40,
        brightnessNits: 2000,
        pixelDensityPPF: 929,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2020MBAR",
        processing: "ICN Driver IC",
        hardware: "Yaham Halo Fascia Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 960, heightMm: 960, depthMm: 150.8, weightKg: 26, maxPowerW: 370 },
        smallCabinet: null,
        environment: "Indoor",
    },

    // --- OUTDOOR (Radiance Series + Aura Perimeter + Halo Fascia) ---

    "yaham-r2.5": {
        id: "yaham-r2.5",
        name: "Yaham Radiance R2.5-MIP Outdoor",
        manufacturer: "Yaham",
        pitchMm: 2.5,
        powerDensityWm2: 578.7,
        weightDensityLbm2: 80.8,
        avgMaxRatio: 0.40,
        brightnessNits: 3000,
        pixelDensityPPF: 14863,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar MIP-A1010WN",
        processing: "ICN Driver IC",
        hardware: "Yaham Radiance MIP Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 480, heightMm: 540, depthMm: 120, weightKg: 9.5, maxPowerW: 150 },
        smallCabinet: null,
        environment: "Outdoor",
    },

    "yaham-r4": {
        id: "yaham-r4",
        name: "Yaham Radiance R4 Outdoor",
        manufacturer: "Yaham",
        pitchMm: 3.91,
        powerDensityWm2: 650,
        weightDensityLbm2: 68.3,
        avgMaxRatio: 0.40,
        brightnessNits: 7000,
        pixelDensityPPF: 6087,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar FM-Z1921",
        processing: "ICN Driver IC",
        hardware: "Yaham Radiance Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 1000, heightMm: 1000, depthMm: 120, weightKg: 31, maxPowerW: 650 },
        smallCabinet: null,
        environment: "Outdoor",
    },

    "yaham-r6": {
        id: "yaham-r6",
        name: "Yaham Radiance R6 Outdoor",
        manufacturer: "Yaham",
        pitchMm: 5.95,
        powerDensityWm2: 650,
        weightDensityLbm2: 65.0,
        avgMaxRatio: 0.40,
        brightnessNits: 10000,
        pixelDensityPPF: 2624,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2727MWAS",
        processing: "ICN Driver IC",
        hardware: "Yaham Radiance Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 1000, heightMm: 1000, depthMm: 120, weightKg: 29.5, maxPowerW: 650 },
        smallCabinet: null,
        environment: "Outdoor",
    },

    "yaham-r8": {
        id: "yaham-r8",
        name: "Yaham Radiance R8 Outdoor",
        manufacturer: "Yaham",
        pitchMm: 8.33,
        powerDensityWm2: 650,
        weightDensityLbm2: 65.0,
        avgMaxRatio: 0.40,
        brightnessNits: 10000,
        pixelDensityPPF: 1339,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2727MWAS",
        processing: "ICN Driver IC",
        hardware: "Yaham Radiance Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 1000, heightMm: 1000, depthMm: 120, weightKg: 29.5, maxPowerW: 650 },
        smallCabinet: null,
        environment: "Outdoor",
    },

    "yaham-r10": {
        id: "yaham-r10",
        name: "Yaham Radiance R10 Outdoor",
        manufacturer: "Yaham",
        pitchMm: 10.417,
        powerDensityWm2: 650,
        weightDensityLbm2: 65.0,
        avgMaxRatio: 0.40,
        brightnessNits: 10000,
        pixelDensityPPF: 929,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2727MWAS",
        processing: "ICN Driver IC",
        hardware: "Yaham Radiance Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 1000, heightMm: 1000, depthMm: 120, weightKg: 29.5, maxPowerW: 650 },
        smallCabinet: null,
        environment: "Outdoor",
    },

    "yaham-a10": {
        id: "yaham-a10",
        name: "Yaham Aura A10 Perimeter",
        manufacturer: "Yaham",
        pitchMm: 10,
        powerDensityWm2: 472.2,
        weightDensityLbm2: 84.2,
        avgMaxRatio: 0.40,
        brightnessNits: 7500,
        pixelDensityPPF: 929,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2727MWAS",
        processing: "ICN Driver IC",
        hardware: "Yaham Aura Perimeter Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 1600, heightMm: 900, depthMm: 114, weightKg: 55, maxPowerW: 680 },
        smallCabinet: null,
        environment: "Outdoor",
    },

    "yaham-ho10t": {
        id: "yaham-ho10t",
        name: "Yaham Halo HO10T Fascia Outdoor",
        manufacturer: "Yaham",
        pitchMm: 10,
        powerDensityWm2: 638.9,
        weightDensityLbm2: 101.0,
        avgMaxRatio: 0.40,
        brightnessNits: 10000,
        pixelDensityPPF: 929,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2727MWAS",
        processing: "ICN Driver IC",
        hardware: "Yaham Halo Outdoor Fascia Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 800, heightMm: 900, depthMm: 130, weightKg: 33, maxPowerW: 460 },
        smallCabinet: null,
        environment: "Outdoor",
    },

    // --- LG/YAHAM MIP ALTERNATES (Capital One March 2026) ---
    // Higher brightness (2,000 NITS) alternatives with Nationstar MIP-A1010WN
    // 5G Fiber Novastar Receiver Cards, COEX Series Controller

    "lg-c12-mip": {
        id: "lg-c12-mip",
        name: "C1.2-MIP 1.2mm Indoor (Alt)",
        manufacturer: "LG/Yaham",
        pitchMm: 1.2,
        powerDensityWm2: 590,
        weightDensityLbm2: 55.0,
        avgMaxRatio: 0.33,
        brightnessNits: 2000,
        pixelDensityPPF: 64516,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "Nationstar MIP-A1010WN",
        processing: "Novastar 5G Fiber",
        hardware: "COEX Series Controller",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 600, heightMm: 337.5, depthMm: 50, weightKg: 5, maxPowerW: 120 },
        smallCabinet: null,
        environment: "Indoor",
    },

    "lg-c18-mip": {
        id: "lg-c18-mip",
        name: "C1.8-MIP 1.8mm Indoor/VisiBowl (Alt)",
        manufacturer: "LG/Yaham",
        pitchMm: 1.8,
        powerDensityWm2: 540,
        weightDensityLbm2: 55.0,
        avgMaxRatio: 0.33,
        brightnessNits: 2000,
        pixelDensityPPF: 28700,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "Nationstar MIP-A1010WN",
        processing: "Novastar 5G Fiber",
        hardware: "COEX Series Controller",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 600, heightMm: 337.5, depthMm: 50, weightKg: 5, maxPowerW: 110 },
        smallCabinet: null,
        environment: "Indoor",
    },

    // --- MESH PRODUCTS (Capital One March 2026) ---

    "mesh-p10-039": {
        id: "mesh-p10-039",
        name: "Mesh P10 FM1921 3.9mm Indoor",
        manufacturer: "LG/Yaham",
        pitchMm: 3.9,
        powerDensityWm2: 600,
        weightDensityLbm2: 33.07, // 15 kg/m² = 33.07 lbs/m²
        avgMaxRatio: 0.33,
        brightnessNits: 6000,
        pixelDensityPPF: 6107,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar FM1921",
        processing: "Novastar",
        hardware: "Mesh P10 LED Panel",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 1000, heightMm: 500, depthMm: 91, weightKg: 7.5, maxPowerW: 300 },
        smallCabinet: null,
        environment: "Indoor",
    },

    "yaham-ho6t": {
        id: "yaham-ho6t",
        name: "Yaham Halo HO6T Fascia Outdoor",
        manufacturer: "Yaham",
        pitchMm: 6,
        powerDensityWm2: 638.9,
        weightDensityLbm2: 101.0,
        avgMaxRatio: 0.40,
        brightnessNits: 10000,
        pixelDensityPPF: 2378,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "NationStar RS-2727MWAS",
        processing: "ICN Driver IC",
        hardware: "Yaham Halo Outdoor Fascia Module",
        lifespanHours: 100_000,
        defaultCabinet: { widthMm: 800, heightMm: 900, depthMm: 130, weightKg: 33, maxPowerW: 460 },
        smallCabinet: null,
        environment: "Outdoor",
    },

    // =========================================================================
    // LG PRODUCTS — Source: SBA PH4 Cost Analysis 03/09/2026 (Matt's validated pricing)
    // LG is ANC's primary partner. These are actual contracted rates.
    // =========================================================================

    "lg-lsca039": {
        id: "lg-lsca039",
        name: "LG LSCA039 3.91mm Indoor Ceiling",
        manufacturer: "LG",
        pitchMm: 3.91,
        powerDensityWm2: 400,       // estimated — LG datasheet pending
        weightDensityLbm2: 48,      // estimated
        avgMaxRatio: 0.40,
        brightnessNits: 1000,
        pixelDensityPPF: 6084,      // (1000/3.91)^2 / 10.764
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "LG Proprietary",
        processing: "LG Embedded",
        hardware: "LG LSCA Series",
        lifespanHours: 100_000,
        defaultCabinet: null,       // custom sizes per project
        smallCabinet: null,
        environment: "Indoor",
    },

    "lg-lscb025": {
        id: "lg-lscb025",
        name: "LG LSCB025 2.5mm Indoor Wall",
        manufacturer: "LG",
        pitchMm: 2.5,
        powerDensityWm2: 390,
        weightDensityLbm2: 50,
        avgMaxRatio: 0.35,
        brightnessNits: 1000,
        pixelDensityPPF: 14863,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "LG Proprietary",
        processing: "LG Embedded",
        hardware: "LG LSCB Series",
        lifespanHours: 100_000,
        defaultCabinet: null,
        smallCabinet: null,
        environment: "Indoor",
    },

    "lg-lsga039": {
        id: "lg-lsga039",
        name: "LG LSGA039 3.9mm Indoor Wall",
        manufacturer: "LG",
        pitchMm: 3.91,
        powerDensityWm2: 400,
        weightDensityLbm2: 45,
        avgMaxRatio: 0.40,
        brightnessNits: 1000,
        pixelDensityPPF: 6084,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "LG Proprietary",
        processing: "LG Embedded",
        hardware: "LG LSGA Series",
        lifespanHours: 100_000,
        defaultCabinet: null,
        smallCabinet: null,
        environment: "Indoor",
    },

    "lg-lsca015": {
        id: "lg-lsca015",
        name: "LG LSCA015 1.5mm Indoor Fine Pitch",
        manufacturer: "LG",
        pitchMm: 1.5,
        powerDensityWm2: 350,
        weightDensityLbm2: 55,
        avgMaxRatio: 0.33,
        brightnessNits: 1000,
        pixelDensityPPF: 41217,
        colorTempK: { nominal: 6500, min: 3200, max: 9300 },
        diode: "LG Proprietary",
        processing: "LG Embedded",
        hardware: "LG LSCA Series",
        lifespanHours: 100_000,
        defaultCabinet: null,
        smallCabinet: null,
        environment: "Indoor",
    },
};

// ============================================================================
// CATALOG API
// ============================================================================

export function getProduct(id: string): ProductType | undefined {
    return PRODUCTS[id];
}

export function getAllProducts(): ProductType[] {
    return Object.values(PRODUCTS);
}

export function getProductByPitch(
    pitchMm: number,
    environment?: "Indoor" | "Outdoor" | "Both",
): ProductType | undefined {
    return Object.values(PRODUCTS).find(p =>
        p.pitchMm === pitchMm && (!environment || p.environment === environment),
    );
}

export function getProductsByManufacturer(manufacturer: string): ProductType[] {
    return Object.values(PRODUCTS).filter(
        p => p.manufacturer.toLowerCase() === manufacturer.toLowerCase(),
    );
}

// ============================================================================
// EXHIBIT G CALCULATION ENGINE
// ============================================================================

/**
 * Calculate all Exhibit G form values from pixel resolution + product type.
 * Uses validated density constants (area × density).
 */
export function calculateExhibitG(
    product: ProductType,
    resolutionW: number,
    resolutionH: number,
): ExhibitGOutput {
    const displayWidthMm = resolutionW * product.pitchMm;
    const displayHeightMm = resolutionH * product.pitchMm;
    const displayWidthFt = displayWidthMm / 304.8;
    const displayHeightFt = displayHeightMm / 304.8;

    const activeAreaM2 = (displayWidthMm / 1000) * (displayHeightMm / 1000);
    const activeAreaSqFt = activeAreaM2 * 10.7639;

    const maxPowerW = Math.round(activeAreaM2 * product.powerDensityWm2);
    const avgPowerW = Math.round(maxPowerW * product.avgMaxRatio);
    const totalWeightLbs = Math.round(activeAreaM2 * product.weightDensityLbm2);

    return {
        displayWidthFt: round2(displayWidthFt),
        displayHeightFt: round2(displayHeightFt),
        displayWidthMm: Math.round(displayWidthMm),
        displayHeightMm: Math.round(displayHeightMm),
        resolutionW,
        resolutionH,
        activeAreaM2: round2(activeAreaM2),
        activeAreaSqFt: round2(activeAreaSqFt),
        maxPowerW,
        avgPowerW,
        totalWeightLbs,
        brightnessNits: product.brightnessNits,
        pixelDensityPPF: product.pixelDensityPPF,
        colorTempK: product.colorTempK,
        diode: product.diode,
        processing: product.processing,
        hardware: product.hardware,
        pitchMm: product.pitchMm,
        lifespanHours: product.lifespanHours,
        environment: product.environment === "Both" ? "Indoor" : product.environment,
    };
}

// ============================================================================
// VALIDATED RATE CARD — Reverse-Engineered from ANC Excel Specimens
//
// Provenance: scripts/extract-excel-intel.mjs run against 5 workbooks:
//   NBCU 2025 9C (Proposal), Indiana Fever (Proposal), USC Williams-Brice (Budget),
//   Atlanta Pigeons (LOI), NBTEST Audit
//
// SWAP-READY: Every constant has a provenance comment. When Matt delivers
// official rates, update the value and change the provenance comment.
// All rates are overridable per-project via estimatePricing() options.
// ============================================================================

// --- MARGIN MODEL (Natalia Divisor Model: Sell = Cost / (1 - margin)) ---
// NOT doc-type driven. Margin varies by COST CATEGORY and DISPLAY SCALE.

export const MARGIN_PRESETS = {
    ledHardware:      0.15,  // LED hardware default — 15% per Natalia (March 11 decision)
    servicesDefault:  0.20,  // Install/structural/electrical/PM/eng — 20%
    servicesSmall:    0.30,  // Small displays <100 sqft get higher services margin
    livesync:         0.35,  // CMS/Software
} as const;

export type MarginCategory = keyof typeof MARGIN_PRESETS;

export function getServiceMargin(totalSqFt: number): number {
    return totalSqFt < 100 ? MARGIN_PRESETS.servicesSmall : MARGIN_PRESETS.servicesDefault;
}

// --- BOND & TAX ---

export const BOND_RATE = 0.015;     // =W*0.015 — 21 formula hits across ALL 3 costed files. Universal.
export const NYC_TAX_RATE = 0.08875; // NBCU Margin Analysis. Location-specific, not universal.

// --- INSTALL RATES ---
// Two models coexist: $/lb for structural steel, $/sqft for LED panel labor.
// Rates vary by complexity tier. D19 in Install sheets = total display weight (lbs).

export type InstallComplexity = 'simple' | 'standard' | 'complex' | 'heavy';

export const STEEL_FABRICATION_PER_LB: Record<InstallComplexity, number> = {
    simple:   25,   // USC Install(Base): =D19*25 (fab + install)
    standard: 35,   // Indiana Fever Locker/Gym: =D19*35
    complex:  55,   // Indiana Fever HOE: =D19*55
    heavy:    75,   // Indiana Fever Round: =D19*75
};

export const LED_INSTALL_PER_SQFT: Record<InstallComplexity, number> = {
    simple:   75,   // USC Install(Base): =D19*75
    standard: 105,  // Indiana Fever Locker/TS: =C19*105, =D19*105
    complex:  145,  // Indiana Fever Round: =D19*145
    heavy:    145,  // Same as complex (no higher tier observed)
};

export const HEAVY_EQUIPMENT_PER_LB = 30;  // USC Install(Base): =D19*30
export const PM_GC_TRAVEL_PER_LB = 5;      // USC Install(Base): =D19*5

// Legacy aliases (used by estimator.ts imports)
export const INSTALL_COST_PER_LB = STEEL_FABRICATION_PER_LB.standard;  // $35 default
export const PM_BASE_FEE = 5882.35;   // estlogic.md + productCatalog.ts match. Zone-multiplied.
export const ENG_BASE_FEE = 4705.88;  // estlogic.md + productCatalog.ts match. Zone-multiplied.

// --- ELECTRICAL ---
// No universal formula found. NBCU Budget Control shows $0 budget / $35K PO (vendor quote).
// USC has =D19*125 for electrical materials — only Budget-stage rate found.

export const ELECTRICAL_MATERIALS_PER_SQFT = 125; // USC Install(Base): =D19*125. Budget-stage only.

// --- SPARE PARTS ---

export const SPARE_PARTS_PCT_LCD = 0.05;  // Indiana Fever: =D*0.05 on LCD displays
export const SPARE_PARTS_PCT_LED = 0.05;  // Default. No LED-specific rate found in formulas.

// --- YAHAM NX PRICING WATERFALL ---
// Documents the real cost structure from factory to ANC's buy price.
// Source: NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx (2026/02/04)
//
// Layer 1: Ex-work (factory gate, FOB China)
// Layer 2: +10% Tariff (US import duty)
// Layer 3: +5% Shipping (ocean freight to US port)
// Layer 4: +28% LGEUS Markup (LG distribution margin) ← ANC's buy price
// Layer 5: +10% Custom Cabinet (non-standard sizing premium, optional)

export const YAHAM_PRICING_LAYERS = {
    tariffPct: 0.10,
    shippingPct: 0.05,
    lgeusMarkupPct: 0.28,
    customCabinetPct: 0.10,
} as const;

// --- LED COST PER SQFT (by pitch) ---
// Yaham rates = LGEUS 28% markup (ANC's actual buy price), landed in US.
// Legacy rates from Excel formula extraction retained where no Yaham equivalent.

export const LED_COST_PER_SQFT_BY_PITCH: Record<string, number> = {
    '1.2':   430,    // Indiana Fever: =M*430 (Locker Room Ribbon)
    '1.5':   929.05, // LG LSCA015 indoor. SBA PH4 Cost Analysis 03/09/2026.
    '1.875': 0,      // No formula found — vendor quote.
    '2.5':   277.56, // LG LSCB025 indoor. SBA PH4 Cost Analysis 03/09/2026. (prev Yaham C2.5 $251.57)
    '3.91':  232.53, // Yaham R4 Outdoor LGEUS 28% landed. Rate card 02/04/2026.
    '4':     178.09, // Yaham C4 Indoor LGEUS 28% landed. Rate card 02/04/2026.
    '5.95':  260.14, // Yaham R6 Outdoor LGEUS 28% landed. Rate card 02/04/2026.
    '6':     136.51, // Yaham C6 Indoor LGEUS 28% landed. Rate card 02/04/2026.
    '6.25':  293.20, // Yaham HO6T Outdoor Fascia LGEUS 28%. Rate card 02/04/2026.
    '8':     148.00, // 8mm Indoor. Interpolated from Yaham C6/C10 curve.
    '8.33':  194.07, // Yaham R8 Outdoor LGEUS 28% landed. Rate card 02/04/2026.
    '10':    112.22, // Yaham C10 Indoor LGEUS 28% landed. Rate card 02/04/2026.
    '10.417': 154.79, // Yaham R10 Outdoor LGEUS 28% landed. Rate card 02/04/2026.
    '16':    95.00,  // 16mm Outdoor. Estimated from R-series price curve. Verify with vendor quote.
};

// --- WARRANTY ---

export const WARRANTY_ANNUAL_ESCALATION = 0.10; // Indiana Fever: =C*1.1 chain (years 4-10)

// --- ALTERNATE UPGRADE ---

export const ALT1_UPGRADE_RATIO = 0.07;
export const COMPLEX_MODIFIER = 1.2;

/**
 * Hardware cost per square meter by product type.
 * Derived from Westfield Concourse: $948,722 hardware for ~246 m² = $3,856/m².
 * Rounded up to $4,200 to include connector/accessory overhead.
 */
export const HARDWARE_COST_PER_SQM: Record<string, number> = {
    // Legacy Nitxeon (Westfield WTC validated)
    '4mm-nitxeon': 4200,
    '10mm-mesh': 2800,
    '2.5mm-mip': 5400,
    // Yaham NX — LGEUS 28% markup, converted $/sqft → $/m² (×10.7639)
    // Source: NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx
    'yaham-c2.5-mip':    2708,  // $251.57/sqft × 10.7639
    'yaham-c4':          1917,  // $178.09/sqft × 10.7639
    'yaham-c6':          1470,  // $136.51/sqft × 10.7639
    'yaham-c10':         1208,  // $112.22/sqft × 10.7639
    'yaham-h10t-indoor': 1251,  // $116.25/sqft × 10.7639
    'yaham-r2.5':        5773,  // $536.25/sqft × 10.7639
    'yaham-r4':          2503,  // $232.53/sqft × 10.7639
    'yaham-r6':          2800,  // $260.14/sqft × 10.7639
    'yaham-r8':          2089,  // $194.07/sqft × 10.7639
    'yaham-r10':         1666,  // $154.79/sqft × 10.7639
    'yaham-a10':         2224,  // $206.59/sqft × 10.7639
    'yaham-ho10t':       1900,  // $176.45/sqft × 10.7639
    'yaham-ho6t':        3157,  // $293.20/sqft × 10.7639
    // LG — from SBA PH4 Cost Analysis 03/09/2026 (Matt's validated pricing)
    'lg-lsca039':        1220,  // LG LSCA039 3.91mm indoor. $113.34/sqft × 10.7639
    'lg-lscb025':        2988,  // LG LSCB025 2.5mm indoor.  $277.56/sqft × 10.7639
    'lg-lsga039':        1202,  // LG LSGA039 3.9mm indoor.  $111.67/sqft × 10.7639
    'lg-lsca015':       10000,  // LG LSCA015 1.5mm indoor.  $929.05/sqft × 10.7639
    'lg-lapa163':        5466,  // LG LAPA163 1.88mm AIO.    $507.80/sqft × 10.7639
    'lg-lapa136':        5505,  // LG LAPA136 1.56mm AIO.    $511.46/sqft × 10.7639
    'lg-lsga018':        2348,  // LG LSGA018 1.85mm rear.   $218.14/sqft × 10.7639
};

/** Calculate hardware cost from active area and product ID. */
export function calculateHardwareCost(activeAreaM2: number, productId: string): number | undefined {
    const costPerSqm = HARDWARE_COST_PER_SQM[productId];
    if (costPerSqm == null || !Number.isFinite(activeAreaM2) || activeAreaM2 <= 0) return undefined;
    return round2(activeAreaM2 * costPerSqm);
}

const ZONE_MULTIPLIERS: Record<ZoneClass, number> = {
    standard: 1,
    medium: 2,
    large: 3,
    complex: 1,
};

/**
 * Estimate pricing from Exhibit G output + zone classification.
 * Uses validated rates from Excel extraction.
 */
export function estimatePricing(
    exhibitG: ExhibitGOutput,
    zoneClass: ZoneClass,
    hardwareCost?: number,
    overrides?: {
        installComplexity?: InstallComplexity;
        ledMarginPct?: number;
        servicesMarginPct?: number;
    },
): PricingEstimate {
    const complexity = overrides?.installComplexity ?? 'standard';
    const isComplex = zoneClass === "complex";
    const complexityModifier = isComplex ? COMPLEX_MODIFIER : 1.0;
    const zoneMultiplier = ZONE_MULTIPLIERS[zoneClass];

    const steelRate = STEEL_FABRICATION_PER_LB[complexity];
    const installCost = round2(exhibitG.totalWeightLbs * steelRate * complexityModifier);
    const pmCost = round2(PM_BASE_FEE * zoneMultiplier);
    const engCost = round2(ENG_BASE_FEE * zoneMultiplier);

    const hw = hardwareCost ?? null;
    const totalEstimate = hw !== null ? round2(hw + installCost + pmCost + engCost) : null;
    const alt1UpgradeCost = hw !== null ? round2(hw * ALT1_UPGRADE_RATIO) : null;

    return {
        installCost,
        pmCost,
        engCost,
        hardwareCost: hw,
        totalEstimate,
        alt1UpgradeCost,
        zoneClass,
        zoneMultiplier,
        complexityModifier,
    };
}

// ============================================================================
// CABINET TOPOLOGY SOLVER
// ============================================================================

const STANDARD_PIXEL_CANDIDATES = [240, 220, 200, 192, 180, 168, 100];

/**
 * Solve cabinet topology from total pixel resolution and panel count.
 * Returns uniform topology if pixels divide evenly, otherwise attempts
 * remainder solving for mixed-cabinet configurations.
 */
export function solveCabinetTopology(
    totalPixels: number,
    panelCount: number,
    pitchMm: number,
): CabinetTopology {
    const totalMm = totalPixels * pitchMm;

    // Step 1: Try uniform division
    const pxPerPanel = totalPixels / panelCount;
    if (Number.isInteger(pxPerPanel)) {
        const cabinetMm = pxPerPanel * pitchMm;
        return {
            type: "uniform",
            standardMm: { width: cabinetMm, height: cabinetMm },
            standardCount: panelCount,
            totalWidthMm: totalMm,
            totalHeightMm: totalMm,
        };
    }

    // Step 2: Single remainder — (N-1) standard + 1 remainder
    for (const stdPx of STANDARD_PIXEL_CANDIDATES) {
        const remainderPx = totalPixels - (panelCount - 1) * stdPx;
        if (remainderPx > 0 && remainderPx < stdPx && Number.isInteger(remainderPx)) {
            return {
                type: "mixed",
                standardMm: { width: stdPx * pitchMm, height: stdPx * pitchMm },
                standardCount: panelCount - 1,
                remainderMm: { width: remainderPx * pitchMm, height: remainderPx * pitchMm },
                remainderCount: 1,
                totalWidthMm: totalMm,
                totalHeightMm: totalMm,
            };
        }
    }

    // Step 3: Multi-remainder — N standard + M remainder
    for (const stdPx of STANDARD_PIXEL_CANDIDATES) {
        for (let nStd = 1; nStd < panelCount; nStd++) {
            const nRemainder = panelCount - nStd;
            const remainderPx = (totalPixels - nStd * stdPx) / nRemainder;
            if (remainderPx > 0 && Number.isInteger(remainderPx) && remainderPx !== stdPx) {
                return {
                    type: "mixed",
                    standardMm: { width: stdPx * pitchMm, height: stdPx * pitchMm },
                    standardCount: nStd,
                    remainderMm: { width: remainderPx * pitchMm, height: remainderPx * pitchMm },
                    remainderCount: nRemainder,
                    totalWidthMm: totalMm,
                    totalHeightMm: totalMm,
                };
            }
        }
    }

    // Step 4: Fallback — topology unknown, but area calc still works
    return {
        type: "unknown",
        totalWidthMm: totalMm,
        totalHeightMm: totalMm,
    };
}

/**
 * Solve cabinet topology for both axes of a display.
 */
export function solveDisplayTopology(
    resW: number,
    resH: number,
    panelsWide: number,
    panelsHigh: number,
    pitchMm: number,
): { width: CabinetTopology; height: CabinetTopology } {
    return {
        width: solveCabinetTopology(resW, panelsWide, pitchMm),
        height: solveCabinetTopology(resH, panelsHigh, pitchMm),
    };
}

// ============================================================================
// BUSINESS DAY CALCULATOR
// ============================================================================

/**
 * Add business days (Mon-Fri) to a date.
 * Validated against Westfield schedule — all 15 tasks match exactly.
 */
export function addBusinessDays(start: Date, days: number): Date {
    const result = new Date(start);
    let remaining = days;

    // If starting on a weekend, advance to Monday first
    const startDay = result.getDay();
    if (startDay === 0) { result.setDate(result.getDate() + 1); remaining--; }
    else if (startDay === 6) { result.setDate(result.getDate() + 2); remaining--; }

    // First day counts as day 1
    remaining--;

    while (remaining > 0) {
        result.setDate(result.getDate() + 1);
        const day = result.getDay();
        if (day !== 0 && day !== 6) {
            remaining--;
        }
    }

    return result;
}

/**
 * Get the next business day after a given date.
 */
export function nextBusinessDay(date: Date): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day === 6) result.setDate(result.getDate() + 2);
    else if (day === 0) result.setDate(result.getDate() + 1);
    return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// ============================================================================
// SCHEDULE TEMPLATES
// ============================================================================

export const PRE_INSTALL_PHASES = [
    { name: 'Notice to Proceed', days: 1 },
    { name: 'Design & Engineering', days: 38, dependsOn: 'Notice to Proceed' },
    { name: 'Secondary Structural Design', days: 30, dependsOn: 'Notice to Proceed', parallel: true },
    { name: 'Electrical Design', days: 30, dependsOn: 'Notice to Proceed', parallel: true },
    { name: 'Control Room Design', days: 30, dependsOn: 'Notice to Proceed', parallel: true },
    { name: 'Prep Submittals', days: 3, dependsOn: 'Design & Engineering' },
    { name: 'Owner Review & Approval', days: 5, dependsOn: 'Prep Submittals' },
    { name: 'LED Manufacturing', days: 45, dependsOn: 'Notice to Proceed', parallel: true },
    { name: 'Ocean Freight Shipping', days: 23, dependsOn: 'LED Manufacturing' },
    { name: 'Ground Shipping to Site', days: 4, dependsOn: 'Ocean Freight Shipping' },
    { name: 'Integration & Testing', days: 18, dependsOn: 'Ocean Freight Shipping', parallel: true },
    { name: 'Control System Programming', days: 10, dependsOn: 'Ocean Freight Shipping', parallel: true },
] as const;

export type InstallationType = 'standard_wall' | 'complex_hanging' | 'phased_large';

export const INSTALL_TASK_TEMPLATES = [
    { name: 'Mobilization', duration: { small: 1, medium: 1, large: 2 } },
    { name: 'Demolition', duration: { small: 1, medium: 2, large: 4 } },
    { name: 'Secondary Steel', duration: { small: 3, medium: 3, large: 3 }, onlyFor: ['complex_hanging'] as InstallationType[] },
    { name: 'LED Panel Install', duration: { small: 2, medium: 5, large: 17 } },
    { name: 'Infrastructure Install', duration: { small: 3, medium: 5, large: 9 }, parallelOffset: 2 },
    { name: 'Low Voltage Connectivity', duration: { small: 3, medium: 5, large: 9 }, parallelOffset: 2 },
    { name: 'Finishes & Trim', duration: { small: 1, medium: 1, large: 2 } },
] as const;

export const SIZE_THRESHOLDS = { small: 10, medium: 50 } as const;

export function getInstallSizeCategory(panelCount: number): 'small' | 'medium' | 'large' {
    if (panelCount < SIZE_THRESHOLDS.small) return 'small';
    if (panelCount < SIZE_THRESHOLDS.medium) return 'medium';
    return 'large';
}

// ============================================================================
// DOCUMENT MODES
// ============================================================================

export type DocumentMode = 'budget' | 'proposal' | 'loi' | 'contract';

export const DOCUMENT_MODES: Record<DocumentMode, {
    headerText: string;
    includeSignatures: boolean;
    includePaymentTerms: boolean;
    includeLegalIntro: boolean;
    includeProjectSummaryFirst: boolean;
    includeResponsibilityMatrix: boolean;
}> = {
    budget: {
        headerText: 'BUDGET ESTIMATE',
        includeSignatures: false,
        includePaymentTerms: false,
        includeLegalIntro: false,
        includeProjectSummaryFirst: false,
        includeResponsibilityMatrix: false,
    },
    proposal: {
        headerText: 'PROPOSAL',
        includeSignatures: false,
        includePaymentTerms: false,
        includeLegalIntro: false,
        includeProjectSummaryFirst: false,
        includeResponsibilityMatrix: false,
    },
    loi: {
        headerText: 'LETTER OF INTENT',
        includeSignatures: true,
        includePaymentTerms: true,
        includeLegalIntro: true,
        includeProjectSummaryFirst: true,
        includeResponsibilityMatrix: true,
    },
    contract: {
        headerText: 'CONTRACT',
        includeSignatures: true,
        includePaymentTerms: true,
        includeLegalIntro: true,
        includeProjectSummaryFirst: true,
        includeResponsibilityMatrix: true,
    },
};

export const CURRENCY_FORMAT = {
    decimals: 0,
    hideZeroLineItems: true,
    removeTypeColumn: true,
} as const;

// ============================================================================
// CABINET TOPOLOGY HELPERS
// ============================================================================

export const KNOWN_4MM_PANEL_WIDTHS_PX = [120, 180, 192, 200, 220, 228, 240];
export const KNOWN_4MM_PANEL_HEIGHTS_PX = [180, 200, 240];
export const STANDARD_PIXELS_PER_PANEL = { '4mm': 240, '10mm': 100, '2.5mm': 384 };
export const STRUCTURAL_WEIGHT_BUFFER = 0.10;

// ============================================================================
// EXHIBIT G FIELD CLASSIFICATION
// ============================================================================

export const EXHIBIT_G_CONSTANT_FIELDS = [
    'moduleMfg', 'processorMfg', 'ledDiode', 'pixelPitch',
    'brightness', 'colorTemp', 'pixelDensity', 'lifespan',
] as const;

export const EXHIBIT_G_CALCULATED_FIELDS = [
    'screenWidthFt', 'screenHeightFt', 'screenWidthPx', 'screenHeightPx',
    'panelGrid', 'totalPanels', 'totalMaxPower', 'totalAvgPower', 'totalWeight',
] as const;
