/**
 * Seed ManufacturerProduct table from existing hardcoded LED_MODULES catalog.
 *
 * Run: npx tsx prisma/seed-products.ts
 *
 * This migrates the 14 hardcoded modules in data/catalogs/led-products.ts
 * into the new ManufacturerProduct database table, adding environment and
 * service type classifications that were previously inferred from naming.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mapped from data/catalogs/led-products.ts with added Phase 2 fields
const SEED_PRODUCTS = [
    // ===================== LG PRODUCTS =====================
    {
        manufacturer: "LG",
        productFamily: "GSQA",
        modelNumber: "LG-GSQA-039",
        displayName: "LG GSQA 3.9mm Indoor",
        pixelPitch: 3.9,
        cabinetWidthMm: 250,
        cabinetHeightMm: 250,
        weightKgPerCabinet: 2.04, // 4.5 lbs
        maxNits: 7500,
        maxPowerWattsPerCab: 85,
        environment: "indoor",
        serviceType: "front_rear",
        supportsHalfModule: true,
    },
    {
        manufacturer: "LG",
        productFamily: "GSQA",
        modelNumber: "LG-GSQA-027",
        displayName: "LG GSQA 2.7mm Fine Pitch",
        pixelPitch: 2.7,
        cabinetWidthMm: 250,
        cabinetHeightMm: 250,
        weightKgPerCabinet: 1.91, // 4.2 lbs
        maxNits: 1200,
        maxPowerWattsPerCab: 75,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: true,
    },
    {
        manufacturer: "LG",
        productFamily: "GSQA",
        modelNumber: "LG-GSQA-019",
        displayName: "LG GSQA 1.9mm Ultra Fine",
        pixelPitch: 1.9,
        cabinetWidthMm: 250,
        cabinetHeightMm: 250,
        weightKgPerCabinet: 1.81, // 4.0 lbs
        maxNits: 800,
        maxPowerWattsPerCab: 65,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: true,
    },
    {
        manufacturer: "LG",
        productFamily: "LAA",
        modelNumber: "LG-LAA-100",
        displayName: "LG LAA 10mm Outdoor",
        pixelPitch: 10,
        cabinetWidthMm: 500,
        cabinetHeightMm: 500,
        weightKgPerCabinet: 9.98, // 22 lbs
        maxNits: 8000,
        maxPowerWattsPerCab: 280,
        environment: "outdoor",
        serviceType: "rear",
        supportsHalfModule: false,
    },
    {
        manufacturer: "LG",
        productFamily: "LAA",
        modelNumber: "LG-LAA-060",
        displayName: "LG LAA 6mm Outdoor",
        pixelPitch: 6,
        cabinetWidthMm: 500,
        cabinetHeightMm: 500,
        weightKgPerCabinet: 9.07, // 20 lbs
        maxNits: 7000,
        maxPowerWattsPerCab: 250,
        environment: "outdoor",
        serviceType: "rear",
        supportsHalfModule: false,
    },

    // ===================== YAHAM PRODUCTS =====================
    {
        manufacturer: "Yaham",
        productFamily: "S3",
        modelNumber: "YAHAM-S3-100",
        displayName: "Yaham S3 10mm Standard",
        pixelPitch: 10,
        cabinetWidthMm: 320,
        cabinetHeightMm: 320,
        weightKgPerCabinet: 5.44, // 12 lbs
        maxNits: 5000,
        maxPowerWattsPerCab: 200,
        environment: "indoor_outdoor",
        serviceType: "front_rear",
        supportsHalfModule: true,
    },
    {
        manufacturer: "Yaham",
        productFamily: "S3",
        modelNumber: "YAHAM-S3-060",
        displayName: "Yaham S3 6mm Indoor",
        pixelPitch: 6,
        cabinetWidthMm: 320,
        cabinetHeightMm: 320,
        weightKgPerCabinet: 4.99, // 11 lbs
        maxNits: 3000,
        maxPowerWattsPerCab: 180,
        environment: "indoor",
        serviceType: "front_rear",
        supportsHalfModule: true,
    },
    {
        manufacturer: "Yaham",
        productFamily: "S3",
        modelNumber: "YAHAM-S3-039",
        displayName: "Yaham S3 3.9mm Fine Pitch",
        pixelPitch: 3.9,
        cabinetWidthMm: 320,
        cabinetHeightMm: 320,
        weightKgPerCabinet: 4.54, // 10 lbs
        maxNits: 1500,
        maxPowerWattsPerCab: 160,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: true,
    },
    {
        manufacturer: "Yaham",
        productFamily: "Outdoor",
        modelNumber: "YAHAM-OUT-160",
        displayName: "Yaham Outdoor 16mm Stadium",
        pixelPitch: 16,
        cabinetWidthMm: 500,
        cabinetHeightMm: 500,
        weightKgPerCabinet: 11.34, // 25 lbs
        maxNits: 10000,
        maxPowerWattsPerCab: 350,
        environment: "outdoor",
        serviceType: "rear",
        supportsHalfModule: false,
    },
    {
        manufacturer: "Yaham",
        productFamily: "Outdoor",
        modelNumber: "YAHAM-OUT-100",
        displayName: "Yaham Outdoor 10mm Stadium",
        pixelPitch: 10,
        cabinetWidthMm: 500,
        cabinetHeightMm: 500,
        weightKgPerCabinet: 10.43, // 23 lbs
        maxNits: 8000,
        maxPowerWattsPerCab: 300,
        environment: "outdoor",
        serviceType: "rear",
        supportsHalfModule: false,
    },

    // ===================== ABSEN PRODUCTS =====================
    {
        manufacturer: "Absen",
        productFamily: "A Series",
        modelNumber: "ABSEN-A27",
        displayName: "Absen A Series 2.7mm",
        pixelPitch: 2.7,
        cabinetWidthMm: 300,
        cabinetHeightMm: 300,
        weightKgPerCabinet: 2.72, // 6 lbs
        maxNits: 1000,
        maxPowerWattsPerCab: 90,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: true,
    },
    {
        manufacturer: "Absen",
        productFamily: "A Series",
        modelNumber: "ABSEN-A39",
        displayName: "Absen A Series 3.9mm",
        pixelPitch: 3.9,
        cabinetWidthMm: 300,
        cabinetHeightMm: 300,
        weightKgPerCabinet: 2.95, // 6.5 lbs
        maxNits: 1500,
        maxPowerWattsPerCab: 100,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: true,
    },

    // ===================== UNILUMIN PRODUCTS =====================
    {
        manufacturer: "Unilumin",
        productFamily: "UTV",
        modelNumber: "UNILUMIN-UTV-P19",
        displayName: "Unilumin UTV 1.9mm Broadcast",
        pixelPitch: 1.9,
        cabinetWidthMm: 250,
        cabinetHeightMm: 250,
        weightKgPerCabinet: 1.81, // 4 lbs
        maxNits: 600,
        maxPowerWattsPerCab: 60,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: true,
    },
    {
        manufacturer: "Unilumin",
        productFamily: "UTV",
        modelNumber: "UNILUMIN-UTV-P27",
        displayName: "Unilumin UTV 2.7mm Indoor",
        pixelPitch: 2.7,
        cabinetWidthMm: 250,
        cabinetHeightMm: 250,
        weightKgPerCabinet: 1.91, // 4.2 lbs
        maxNits: 1000,
        maxPowerWattsPerCab: 70,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: true,
    },

    // ===================== LG/YAHAM CAPITAL ONE PRODUCTS (March 2026) =====================
    {
        manufacturer: "LG/Yaham",
        productFamily: "Mesh P10",
        modelNumber: "LG-MESH-P10-039",
        displayName: "LG Mesh P10 FM1921 3.9mm",
        pixelPitch: 3.9,
        cabinetWidthMm: 1000,
        cabinetHeightMm: 500,
        cabinetDepthMm: 91,
        weightKgPerCabinet: 7.5, // 16.5 lbs
        maxNits: 6000,
        maxPowerWattsPerCab: 300, // 600 W/sqm × 0.5 sqm
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "NationStar FM1921",
            receiverCard: "1G Novastar",
            controller: "COEX Series",
            transparency: 65,
        },
    },
    {
        manufacturer: "LG",
        productFamily: "GSQA",
        modelNumber: "LG-GSQA-083",
        displayName: "LG GSQA 8mm Outdoor",
        pixelPitch: 8,
        cabinetWidthMm: 500,
        cabinetHeightMm: 500,
        weightKgPerCabinet: 20.7, // 45.7 lbs
        maxNits: 10000,
        maxPowerWattsPerCab: 425,
        environment: "outdoor",
        serviceType: "rear",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "Nationstar RS2727",
            receiverCard: "1G Novastar",
            controller: "COEX Series",
        },
    },
    {
        manufacturer: "LG",
        productFamily: "GSCF",
        modelNumber: "LG-GSCF-026",
        displayName: "LG GSCF 2.6mm Outdoor",
        pixelPitch: 2.6,
        cabinetWidthMm: 500,
        cabinetHeightMm: 500,
        weightKgPerCabinet: 10, // ~22 lbs
        maxNits: 5500,
        maxPowerWattsPerCab: 200,
        environment: "outdoor",
        serviceType: "rear",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "Nationstar RS1921",
            receiverCard: "1G Novastar",
            controller: "COEX Series",
        },
    },
    {
        manufacturer: "LG",
        productFamily: "LSCC",
        modelNumber: "LG-LSCC-012",
        displayName: "LG LSCC 1.2mm Indoor",
        pixelPitch: 1.2,
        cabinetWidthMm: 600,
        cabinetHeightMm: 337.5,
        weightKgPerCabinet: 5, // 11 lbs
        maxNits: 900,
        maxPowerWattsPerCab: 112,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "Kinglight 1010",
            receiverCard: "5G Fiber Novastar",
            controller: "COEX Series",
        },
    },
    {
        manufacturer: "LG",
        productFamily: "LSCC",
        modelNumber: "LG-LSCC-018",
        displayName: "LG LSCC 1.875mm Indoor",
        pixelPitch: 1.875,
        cabinetWidthMm: 600,
        cabinetHeightMm: 337.5,
        weightKgPerCabinet: 5, // 11 lbs
        maxNits: 900,
        maxPowerWattsPerCab: 96,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "Kinglight 1212",
            receiverCard: "5G Fiber Novastar",
            controller: "COEX Series",
        },
    },
    {
        manufacturer: "LG",
        productFamily: "LSCC",
        modelNumber: "LG-LSCC-025",
        displayName: "LG LSCC 2.5mm Indoor",
        pixelPitch: 2.5,
        cabinetWidthMm: 600,
        cabinetHeightMm: 337.5,
        weightKgPerCabinet: 5, // 11 lbs
        maxNits: 900,
        maxPowerWattsPerCab: 84,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "Kinglight 1515",
            receiverCard: "5G Fiber Novastar",
            controller: "COEX Series",
        },
    },

    {
        manufacturer: "LG/Yaham",
        productFamily: "Mesh",
        modelNumber: "LG-MESH-P4-RS1921",
        displayName: "LG 4mm Mesh Outdoor",
        pixelPitch: 4,
        cabinetWidthMm: 1000,
        cabinetHeightMm: 500,
        cabinetDepthMm: 91,
        weightKgPerCabinet: 7.5,
        maxNits: 6000,
        maxPowerWattsPerCab: 300,
        environment: "outdoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "Nationstar RS1921",
            receiverCard: "1G Novastar",
            controller: "COEX Series",
            transparency: 65,
        },
    },

    // ===================== LG/YAHAM MIP ALTERNATES (Capital One 2026) =====================
    // Higher brightness (2,000 NITS) alternatives with Nationstar MIP-A1010WN diode
    // 5G Fiber Novastar Receiver Cards, COEX Series Controller
    {
        manufacturer: "LG/Yaham",
        productFamily: "C-MIP",
        modelNumber: "LG-C12-MIP",
        displayName: "C1.2-MIP 1.2mm Indoor (Alt)",
        pixelPitch: 1.2,
        cabinetWidthMm: 600,
        cabinetHeightMm: 337.5,
        weightKgPerCabinet: 5,
        maxNits: 2000,
        maxPowerWattsPerCab: 120,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "Nationstar MIP-A1010WN",
            receiverCard: "5G Fiber Novastar",
            controller: "COEX Series",
            isAlternate: true,
        },
    },
    {
        manufacturer: "LG/Yaham",
        productFamily: "C-MIP",
        modelNumber: "LG-C18-MIP",
        displayName: "C1.8-MIP 1.8mm Indoor/VisiBowl (Alt)",
        pixelPitch: 1.8,
        cabinetWidthMm: 600,
        cabinetHeightMm: 337.5,
        weightKgPerCabinet: 5,
        maxNits: 2000,
        maxPowerWattsPerCab: 110,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "Nationstar MIP-A1010WN",
            receiverCard: "5G Fiber Novastar",
            controller: "COEX Series",
            isAlternate: true,
            visiBowl: true,
        },
    },
    {
        manufacturer: "LG/Yaham",
        productFamily: "C-MIP",
        modelNumber: "LG-C25-MIP",
        displayName: "C2.5-MIP 2.5mm Indoor (Alt)",
        pixelPitch: 2.5,
        cabinetWidthMm: 600,
        cabinetHeightMm: 337.5,
        weightKgPerCabinet: 5,
        maxNits: 2000,
        maxPowerWattsPerCab: 100,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            diode: "Nationstar MIP-A1010WN",
            receiverCard: "5G Fiber Novastar",
            controller: "COEX Series",
            isAlternate: true,
        },
    },

    // ===================== COURTSIDE TABLES =====================
    // ANC add-on product — whole-unit pricing (not per-sqft)
    // Source: ANC_Courtside & Stanchion Standardized Sheet.xlsx (March 2026)
    // Cost model: Screen (unit price) + Install only
    {
        manufacturer: "ANC",
        productFamily: "Courtside Table",
        modelNumber: "ANC-CT-39-10",
        displayName: "Courtside Table 3.9mm 10'",
        productType: "courtside",
        pixelPitch: 3.9,
        cabinetWidthMm: 2996,  // 9.83 ft
        cabinetHeightMm: 750,  // 2.46 ft
        weightKgPerCabinet: 45, // estimated ~100 lbs
        maxNits: 5000,
        maxPowerWattsPerCab: 300,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 16560,
            unitSalePrice: 30000,
            standardMargin: 0.448,
            pixelsW: 768,
            pixelsH: 192,
            sizeLabel: "10'",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Courtside Table",
        modelNumber: "ANC-CT-39-8",
        displayName: "Courtside Table 3.9mm 8'",
        productType: "courtside",
        pixelPitch: 3.9,
        cabinetWidthMm: 2490,  // 8.17 ft
        cabinetHeightMm: 750,
        weightKgPerCabinet: 40,
        maxNits: 5000,
        maxPowerWattsPerCab: 250,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 15851,
            unitSalePrice: 26500,
            standardMargin: 0.402,
            pixelsW: 640,
            pixelsH: 192,
            sizeLabel: "8'",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Courtside Table",
        modelNumber: "ANC-CT-39-6",
        displayName: "Courtside Table 3.9mm 6'",
        productType: "courtside",
        pixelPitch: 3.9,
        cabinetWidthMm: 1999,  // 6.56 ft
        cabinetHeightMm: 750,
        weightKgPerCabinet: 35,
        maxNits: 5000,
        maxPowerWattsPerCab: 200,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 15100,
            unitSalePrice: 24500,
            standardMargin: 0.384,
            pixelsW: 512,
            pixelsH: 192,
            sizeLabel: "6'",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Courtside Table",
        modelNumber: "ANC-CT-39-5",
        displayName: "Courtside Table 3.9mm 5'",
        productType: "courtside",
        pixelPitch: 3.9,
        cabinetWidthMm: 1499,  // 4.92 ft
        cabinetHeightMm: 750,
        weightKgPerCabinet: 30,
        maxNits: 5000,
        maxPowerWattsPerCab: 180,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 16560,
            unitSalePrice: 30000,
            standardMargin: 0.448,
            pixelsW: 384,
            pixelsH: 192,
            sizeLabel: "5'",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Courtside Table",
        modelNumber: "ANC-CT-29-10",
        displayName: "Courtside Table 2.9mm 10'",
        productType: "courtside",
        pixelPitch: 2.9,
        cabinetWidthMm: 2996,
        cabinetHeightMm: 750,
        weightKgPerCabinet: 48,
        maxNits: 5000,
        maxPowerWattsPerCab: 320,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 18145,
            unitSalePrice: 35000,
            standardMargin: 0.482,
            pixelsW: 1008,
            pixelsH: 252,
            sizeLabel: "10'",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Courtside Table",
        modelNumber: "ANC-CT-29-8",
        displayName: "Courtside Table 2.9mm 8'",
        productType: "courtside",
        pixelPitch: 2.9,
        cabinetWidthMm: 2490,
        cabinetHeightMm: 750,
        weightKgPerCabinet: 42,
        maxNits: 5000,
        maxPowerWattsPerCab: 270,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 17125,
            unitSalePrice: 31250,
            standardMargin: 0.452,
            pixelsW: 840,
            pixelsH: 252,
            sizeLabel: "8'",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Courtside Table",
        modelNumber: "ANC-CT-29-6",
        displayName: "Courtside Table 2.9mm 6'",
        productType: "courtside",
        pixelPitch: 2.9,
        cabinetWidthMm: 1999,
        cabinetHeightMm: 750,
        weightKgPerCabinet: 38,
        maxNits: 5000,
        maxPowerWattsPerCab: 220,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 16064,
            unitSalePrice: 28000,
            standardMargin: 0.426,
            pixelsW: 672,
            pixelsH: 252,
            sizeLabel: "6'",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Courtside Table",
        modelNumber: "ANC-CT-29-5",
        displayName: "Courtside Table 2.9mm 5'",
        productType: "courtside",
        pixelPitch: 2.9,
        cabinetWidthMm: 1499,
        cabinetHeightMm: 750,
        weightKgPerCabinet: 33,
        maxNits: 5000,
        maxPowerWattsPerCab: 200,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 18145,
            unitSalePrice: 35000,
            standardMargin: 0.482,
            pixelsW: 504,
            pixelsH: 252,
            sizeLabel: "5'",
        },
    },

    // ===================== STANCHIONS =====================
    // ANC add-on product — whole-unit pricing
    // Single = one-sided display, Double = two-sided
    {
        manufacturer: "ANC",
        productFamily: "Stanchion",
        modelNumber: "ANC-ST-39-SINGLE",
        displayName: "Stanchion 3.9mm Single",
        productType: "stanchion",
        pixelPitch: 3.9,
        cabinetWidthMm: 770,   // 2.528 ft
        cabinetHeightMm: 300,  // 0.9843 ft
        weightKgPerCabinet: 15,
        maxNits: 5000,
        maxPowerWattsPerCab: 80,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 5898.44,
            unitSalePrice: 30000,
            standardMargin: 0.803,
            pixelsW: 192,
            pixelsH: 64,
            sizeLabel: "Single",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Stanchion",
        modelNumber: "ANC-ST-39-DOUBLE",
        displayName: "Stanchion 3.9mm Double",
        productType: "stanchion",
        pixelPitch: 3.9,
        cabinetWidthMm: 770,
        cabinetHeightMm: 600,  // 1.9686 ft
        weightKgPerCabinet: 30,
        maxNits: 5000,
        maxPowerWattsPerCab: 160,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 14751.66,
            unitSalePrice: 33000,
            standardMargin: 0.553,
            pixelsW: 252,
            pixelsH: 84,
            sizeLabel: "Double",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Stanchion",
        modelNumber: "ANC-ST-29-SINGLE",
        displayName: "Stanchion 2.9mm Single",
        productType: "stanchion",
        pixelPitch: 2.9,
        cabinetWidthMm: 1027,  // 3.37 ft
        cabinetHeightMm: 300,
        weightKgPerCabinet: 18,
        maxNits: 5000,
        maxPowerWattsPerCab: 100,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 7005.66,
            unitSalePrice: 45000,
            standardMargin: 0.844,
            pixelsW: 256,
            pixelsH: 128,
            sizeLabel: "Single",
        },
    },
    {
        manufacturer: "ANC",
        productFamily: "Stanchion",
        modelNumber: "ANC-ST-29-DOUBLE",
        displayName: "Stanchion 2.9mm Double",
        productType: "stanchion",
        pixelPitch: 2.9,
        cabinetWidthMm: 1027,
        cabinetHeightMm: 600,
        weightKgPerCabinet: 35,
        maxNits: 5000,
        maxPowerWattsPerCab: 200,
        environment: "indoor",
        serviceType: "front",
        supportsHalfModule: false,
        extendedSpecs: {
            costModel: "per_unit",
            unitCost: 17604.66,
            unitSalePrice: 50000,
            standardMargin: 0.648,
            pixelsW: 336,
            pixelsH: 168,
            sizeLabel: "Double",
        },
    },
];

async function main() {
    console.log("Seeding ManufacturerProduct table...\n");

    let created = 0;
    let skipped = 0;

    for (const product of SEED_PRODUCTS) {
        const existing = await prisma.manufacturerProduct.findUnique({
            where: { modelNumber: product.modelNumber },
        });

        if (existing) {
            console.log(`  SKIP ${product.modelNumber} (already exists)`);
            skipped++;
            continue;
        }

        await prisma.manufacturerProduct.create({
            data: {
                ...product,
                sourceSpreadsheet: "led-products.ts (Phase 1 hardcoded catalog)",
            },
        });
        console.log(`  CREATE ${product.modelNumber} — ${product.displayName}`);
        created++;
    }

    console.log(`\nDone: ${created} created, ${skipped} skipped.`);

    const total = await prisma.manufacturerProduct.count();
    console.log(`Total products in database: ${total}`);
}

main()
    .catch((e) => {
        console.error("Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
