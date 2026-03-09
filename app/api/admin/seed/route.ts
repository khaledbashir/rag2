/**
 * /api/admin/seed — One-click database seed for Rate Card + Products
 *
 * POST: Seeds all rate card entries and Yaham products.
 *       Upserts on key/modelNumber — safe to run multiple times.
 *       Requires ADMIN role (enforced by middleware).
 *
 * GET: Returns current seed status (entry counts).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateRateCardCache } from "@/services/rfp/rateCardLoader";
import { log } from "@/lib/logger";

// ============================================================================
// RATE CARD SEED DATA
// ============================================================================

const RATE_CARD_SEED = [
    // --- MARGINS ---
    { category: "margin", key: "margin.led_hardware", label: "LED Hardware Margin", value: 0.30, unit: "pct", provenance: "NBCU LED Cost Sheet: column V=0.3, ALL 9 displays", confidence: "validated" },
    { category: "margin", key: "margin.services_default", label: "Services Margin (Standard)", value: 0.20, unit: "pct", provenance: "Indiana Fever (6 sheets), USC (1 sheet), NBCU 9C Install", confidence: "validated" },
    { category: "margin", key: "margin.services_small", label: "Services Margin (Small <100sqft)", value: 0.30, unit: "pct", provenance: "NBCU Ribbon/History/Lounge Install sheets", confidence: "validated" },
    { category: "margin", key: "margin.livesync", label: "LiveSync / CMS Margin", value: 0.35, unit: "pct", provenance: "NBCU Margin Analysis rows 44-48", confidence: "validated" },

    // --- BOND & TAX ---
    { category: "bond_tax", key: "bond_tax.bond_rate", label: "Bond Rate", value: 0.015, unit: "pct", provenance: "=W*0.015 — 21 formula hits across ALL 3 costed files", confidence: "validated" },
    { category: "bond_tax", key: "bond_tax.nyc_tax", label: "NYC Sales Tax", value: 0.08875, unit: "pct", provenance: "NBCU Margin Analysis", confidence: "validated" },
    { category: "bond_tax", key: "bond_tax.default_sales_tax", label: "Default Sales Tax", value: 0.095, unit: "pct", provenance: "estimator.ts legacy default", confidence: "estimated" },

    // --- INSTALL: STEEL FABRICATION (per lb) ---
    { category: "install", key: "install.steel_fab.simple", label: "Steel Fabrication — Simple", value: 25, unit: "per_lb", provenance: "USC Install(Base): =D19*25", confidence: "validated" },
    { category: "install", key: "install.steel_fab.standard", label: "Steel Fabrication — Standard", value: 35, unit: "per_lb", provenance: "Indiana Fever Locker/Gym: =D19*35", confidence: "validated" },
    { category: "install", key: "install.steel_fab.complex", label: "Steel Fabrication — Complex", value: 55, unit: "per_lb", provenance: "Indiana Fever HOE: =D19*55", confidence: "validated" },
    { category: "install", key: "install.steel_fab.heavy", label: "Steel Fabrication — Heavy", value: 75, unit: "per_lb", provenance: "Indiana Fever Round: =D19*75", confidence: "validated" },

    // --- INSTALL: LED PANEL (per sqft) ---
    { category: "install", key: "install.led_panel.simple", label: "LED Panel Install — Simple", value: 75, unit: "per_sqft", provenance: "USC Install(Base): =D19*75", confidence: "validated" },
    { category: "install", key: "install.led_panel.standard", label: "LED Panel Install — Standard", value: 105, unit: "per_sqft", provenance: "Indiana Fever Locker/TS: =C19*105, =D19*105", confidence: "validated" },
    { category: "install", key: "install.led_panel.complex", label: "LED Panel Install — Complex", value: 145, unit: "per_sqft", provenance: "Indiana Fever Round: =D19*145", confidence: "validated" },

    // --- INSTALL: OTHER ---
    { category: "install", key: "install.heavy_equipment", label: "Heavy Equipment", value: 30, unit: "per_lb", provenance: "USC Install(Base): =D19*30", confidence: "validated" },
    { category: "install", key: "install.pm_gc_travel", label: "PM / GC / Travel", value: 5, unit: "per_lb", provenance: "USC Install(Base): =D19*5", confidence: "validated" },

    // --- ELECTRICAL ---
    { category: "electrical", key: "electrical.materials_per_sqft", label: "Electrical Materials (Budget)", value: 125, unit: "per_sqft", provenance: "USC Install(Base): =D19*125. Budget-stage only.", confidence: "validated" },

    // --- SPARE PARTS ---
    { category: "spare_parts", key: "spare_parts.lcd_pct", label: "Spare Parts % (LCD)", value: 0.05, unit: "pct", provenance: "Indiana Fever: =D*0.05 on LCD displays", confidence: "validated" },
    { category: "spare_parts", key: "spare_parts.led_pct", label: "Spare Parts % (LED)", value: 0.05, unit: "pct", provenance: "Default. No LED-specific rate found in formulas.", confidence: "estimated" },

    // --- LED COST PER SQFT (Legacy + Yaham NX) ---
    { category: "led_cost", key: "led_cost.1_2mm", label: "LED Cost/sqft — 1.2mm", value: 430, unit: "per_sqft", provenance: "Indiana Fever: =M*430 (Locker Room Ribbon)", confidence: "validated" },
    { category: "led_cost", key: "led_cost.2_5mm", label: "LED Cost/sqft — 2.5mm Indoor", value: 251.57, unit: "per_sqft", provenance: "Yaham C2.5-MIP LGEUS 28% landed. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.4mm", label: "LED Cost/sqft — 4mm Indoor", value: 178.09, unit: "per_sqft", provenance: "Yaham C4 Indoor LGEUS 28% landed. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.6mm", label: "LED Cost/sqft — 6mm Indoor", value: 136.51, unit: "per_sqft", provenance: "Yaham C6 Indoor LGEUS 28% landed. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.10mm", label: "LED Cost/sqft — 10mm Indoor", value: 112.22, unit: "per_sqft", provenance: "Yaham C10 Indoor LGEUS 28% landed. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.10mm_fascia_indoor", label: "LED Cost/sqft — 10mm Fascia Indoor", value: 116.25, unit: "per_sqft", provenance: "Yaham H10T Fascia LGEUS 28%. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.2_5mm_outdoor", label: "LED Cost/sqft — 2.5mm Outdoor", value: 536.25, unit: "per_sqft", provenance: "Yaham R2.5-MIP Outdoor LGEUS 28%. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.4mm_outdoor", label: "LED Cost/sqft — 4mm Outdoor", value: 232.53, unit: "per_sqft", provenance: "Yaham R4 Outdoor LGEUS 28%. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.6mm_outdoor", label: "LED Cost/sqft — 6mm Outdoor", value: 260.14, unit: "per_sqft", provenance: "Yaham R6 Outdoor LGEUS 28%. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.8mm_outdoor", label: "LED Cost/sqft — 8mm Outdoor", value: 194.07, unit: "per_sqft", provenance: "Yaham R8 Outdoor LGEUS 28%. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.10mm_outdoor", label: "LED Cost/sqft — 10mm Outdoor", value: 154.79, unit: "per_sqft", provenance: "Yaham R10 Outdoor LGEUS 28%. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.10mm_perimeter", label: "LED Cost/sqft — 10mm Perimeter", value: 206.59, unit: "per_sqft", provenance: "Yaham A10 Perimeter LGEUS 28%. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.10mm_fascia_outdoor", label: "LED Cost/sqft — 10mm Fascia Outdoor", value: 176.45, unit: "per_sqft", provenance: "Yaham HO10T Outdoor Fascia LGEUS 28%. Rate card 02/04/2026.", confidence: "validated" },
    { category: "led_cost", key: "led_cost.6mm_fascia_outdoor", label: "LED Cost/sqft — 6mm Fascia Outdoor", value: 293.20, unit: "per_sqft", provenance: "Yaham HO6T Outdoor Fascia LGEUS 28%. Rate card 02/04/2026.", confidence: "validated" },

    // --- PRICING WATERFALL ---
    { category: "led_cost", key: "led_cost.tariff_pct", label: "Import Tariff Rate", value: 0.10, unit: "pct", provenance: "Yaham NX Rate Card pricing waterfall layer 2", confidence: "validated" },
    { category: "led_cost", key: "led_cost.shipping_pct", label: "Ocean Freight Shipping Rate", value: 0.05, unit: "pct", provenance: "Yaham NX Rate Card pricing waterfall layer 3", confidence: "validated" },
    { category: "led_cost", key: "led_cost.lgeus_markup_pct", label: "LGEUS Distribution Markup", value: 0.28, unit: "pct", provenance: "Yaham NX Rate Card pricing waterfall layer 4 — ANC buy price", confidence: "validated" },
    { category: "led_cost", key: "led_cost.custom_cabinet_pct", label: "Custom Cabinet Premium", value: 0.10, unit: "pct", provenance: "Yaham NX Rate Card pricing waterfall layer 5 (optional)", confidence: "validated" },

    // --- WARRANTY ---
    { category: "warranty", key: "warranty.annual_escalation", label: "Annual Warranty Escalation", value: 0.10, unit: "pct_annual", provenance: "Indiana Fever: =C*1.1 chain (years 4-10)", confidence: "validated" },

    // --- OTHER ---
    { category: "other", key: "other.pm_base_fee", label: "PM Base Fee (zone-multiplied)", value: 5882.35, unit: "fixed", provenance: "estlogic.md + productCatalog.ts", confidence: "extracted" },
    { category: "other", key: "other.eng_base_fee", label: "Engineering Base Fee (zone-multiplied)", value: 4705.88, unit: "fixed", provenance: "estlogic.md + productCatalog.ts", confidence: "extracted" },
    { category: "other", key: "other.complex_modifier", label: "Complex Zone Modifier", value: 1.2, unit: "multiplier", provenance: "productCatalog.ts", confidence: "extracted" },
    { category: "other", key: "other.alt1_upgrade_ratio", label: "Alt-1 Upgrade Ratio", value: 0.07, unit: "pct", provenance: "productCatalog.ts", confidence: "extracted" },

    // --- SPEC DEFAULTS (Natalia/Jeremy rules 2026-03) ---
    // Viewing Angles
    { category: "spec_default", key: "spec.viewing_angle.indoor_h", label: "Indoor Horizontal Viewing Angle", value: 160, unit: "degrees", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.viewing_angle.indoor_v", label: "Indoor Vertical Viewing Angle", value: 160, unit: "degrees", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.viewing_angle.outdoor_h", label: "Outdoor Horizontal Viewing Angle", value: 140, unit: "degrees", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.viewing_angle.outdoor_v_up", label: "Outdoor Vertical Up Viewing Angle", value: 70, unit: "degrees", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.viewing_angle.outdoor_v_down", label: "Outdoor Vertical Down Viewing Angle", value: 70, unit: "degrees", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },

    // Color Space
    { category: "spec_default", key: "spec.color_space.rec709", label: "Color Space — Rec. 709", value: 90, unit: "pct", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.color_space.dci_p3", label: "Color Space — DCI-P3", value: 90, unit: "pct", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.color_space.rec2020", label: "Color Space — Rec. 2020", value: 77, unit: "pct", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.color_space.tolerance", label: "Color Space Tolerance", value: 9, unit: "pct", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },

    // Color Temperature
    { category: "spec_default", key: "spec.color_temp.min", label: "Color Temperature — Min", value: 3200, unit: "kelvin", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.color_temp.max", label: "Color Temperature — Max", value: 9300, unit: "kelvin", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.color_temp.nominal", label: "Color Temperature — Nominal", value: 6500, unit: "kelvin", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },

    // Weight
    { category: "spec_default", key: "spec.weight_multiplier", label: "Total Weight Multiplier (structure/cabling/electronics)", value: 1.25, unit: "multiplier", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },

    // Pixel Fill Factor
    { category: "spec_default", key: "spec.pixel_fill_factor", label: "Pixel Fill Factor", value: 90, unit: "pct", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },

    // Power Ratios
    { category: "spec_default", key: "spec.power_idle_ratio", label: "Power Idle Ratio (0% white)", value: 0.15, unit: "multiplier", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "spec_default", key: "spec.power_avg_ratio", label: "Power Average Ratio (typical)", value: 0.33, unit: "multiplier", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },

    // Cabinet Defaults
    { category: "cabinet_default", key: "spec.cabinet.indoor_width_mm", label: "Indoor Cabinet Width Fallback", value: 500, unit: "mm", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "cabinet_default", key: "spec.cabinet.indoor_height_mm", label: "Indoor Cabinet Height Fallback", value: 500, unit: "mm", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "cabinet_default", key: "spec.cabinet.outdoor_width_mm", label: "Outdoor Cabinet Width Fallback", value: 960, unit: "mm", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "cabinet_default", key: "spec.cabinet.outdoor_height_mm", label: "Outdoor Cabinet Height Fallback", value: 960, unit: "mm", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "cabinet_default", key: "spec.cabinet.indoor_max_power_w", label: "Indoor Cabinet Max Power Fallback", value: 200, unit: "watts", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "cabinet_default", key: "spec.cabinet.outdoor_max_power_w", label: "Outdoor Cabinet Max Power Fallback", value: 650, unit: "watts", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "cabinet_default", key: "spec.cabinet.indoor_weight_kg", label: "Indoor Cabinet Weight Fallback", value: 10, unit: "kg", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
    { category: "cabinet_default", key: "spec.cabinet.outdoor_weight_kg", label: "Outdoor Cabinet Weight Fallback", value: 30, unit: "kg", provenance: "Natalia/Jeremy spec rules 2026-03", confidence: "validated" },
];

// ============================================================================
// PRODUCT SEED DATA — Yaham NX (from LGEUS Rate Card 02/04/2026)
// ============================================================================

const PRODUCT_SEED = [
    // --- Indoor (Corona + Halo Fascia) ---
    {
        manufacturer: "Yaham", productFamily: "Corona", modelNumber: "C2.5-MIP",
        displayName: "Yaham Corona C2.5-MIP Indoor", pixelPitch: 2.5,
        cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
        weightKgPerCabinet: 21, maxNits: 2000, maxPowerWattsPerCab: 370,
        environment: "indoor", ipRating: "IP40", costPerSqFt: 251.57,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Corona", modelNumber: "C4",
        displayName: "Yaham Corona C4 Indoor", pixelPitch: 4,
        cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
        weightKgPerCabinet: 19.5, maxNits: 2000, maxPowerWattsPerCab: 370,
        environment: "indoor", ipRating: "IP40", costPerSqFt: 178.09,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Corona", modelNumber: "C6",
        displayName: "Yaham Corona C6 Indoor", pixelPitch: 6,
        cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
        weightKgPerCabinet: 19.5, maxNits: 2000, maxPowerWattsPerCab: 370,
        environment: "indoor", ipRating: "IP40", costPerSqFt: 136.51,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Corona", modelNumber: "C10",
        displayName: "Yaham Corona C10 Indoor", pixelPitch: 10,
        cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 97,
        weightKgPerCabinet: 19.5, maxNits: 2000, maxPowerWattsPerCab: 370,
        environment: "indoor", ipRating: "IP40", costPerSqFt: 112.22,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Halo", modelNumber: "H10T",
        displayName: "Yaham Halo H10T Fascia Indoor", pixelPitch: 10,
        cabinetWidthMm: 960, cabinetHeightMm: 960, cabinetDepthMm: 150.8,
        weightKgPerCabinet: 26, maxNits: 2000, maxPowerWattsPerCab: 370,
        environment: "indoor", ipRating: "IP40", costPerSqFt: 116.25,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },

    // --- Outdoor (Radiance + Aura Perimeter + Halo Outdoor Fascia) ---
    {
        manufacturer: "Yaham", productFamily: "Radiance", modelNumber: "R2.5-MIP",
        displayName: "Yaham Radiance R2.5-MIP Outdoor", pixelPitch: 2.5,
        cabinetWidthMm: 480, cabinetHeightMm: 540, cabinetDepthMm: 120,
        weightKgPerCabinet: 9.5, maxNits: 3000, maxPowerWattsPerCab: 150,
        environment: "outdoor", ipRating: "IP66", costPerSqFt: 536.25,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Radiance", modelNumber: "R4",
        displayName: "Yaham Radiance R4 Outdoor", pixelPitch: 3.91,
        cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
        weightKgPerCabinet: 31, maxNits: 7000, maxPowerWattsPerCab: 650,
        environment: "outdoor", ipRating: "IP66", costPerSqFt: 232.53,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Radiance", modelNumber: "R6",
        displayName: "Yaham Radiance R6 Outdoor", pixelPitch: 5.95,
        cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
        weightKgPerCabinet: 29.5, maxNits: 10000, maxPowerWattsPerCab: 650,
        environment: "outdoor", ipRating: "IP66", costPerSqFt: 260.14,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Radiance", modelNumber: "R8",
        displayName: "Yaham Radiance R8 Outdoor", pixelPitch: 8.333,
        cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
        weightKgPerCabinet: 29.5, maxNits: 10000, maxPowerWattsPerCab: 650,
        environment: "outdoor", ipRating: "IP66", costPerSqFt: 194.07,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Radiance", modelNumber: "R10",
        displayName: "Yaham Radiance R10 Outdoor", pixelPitch: 10.417,
        cabinetWidthMm: 1000, cabinetHeightMm: 1000, cabinetDepthMm: 120,
        weightKgPerCabinet: 29.5, maxNits: 10000, maxPowerWattsPerCab: 650,
        environment: "outdoor", ipRating: "IP66", costPerSqFt: 154.79,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Aura", modelNumber: "A10",
        displayName: "Yaham Aura A10 Perimeter", pixelPitch: 10.417,
        cabinetWidthMm: 1600, cabinetHeightMm: 900, cabinetDepthMm: 114,
        weightKgPerCabinet: 55, maxNits: 7500, maxPowerWattsPerCab: 680,
        environment: "outdoor", ipRating: "IP66", costPerSqFt: 206.59,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Halo Outdoor", modelNumber: "HO10T",
        displayName: "Yaham Halo HO10T Fascia Outdoor", pixelPitch: 10.417,
        cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
        weightKgPerCabinet: 33, maxNits: 10000, maxPowerWattsPerCab: 460,
        environment: "outdoor", ipRating: "IP66", costPerSqFt: 176.45,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
    {
        manufacturer: "Yaham", productFamily: "Halo Outdoor", modelNumber: "HO6T",
        displayName: "Yaham Halo HO6T Fascia Outdoor", pixelPitch: 6.25,
        cabinetWidthMm: 800, cabinetHeightMm: 900, cabinetDepthMm: 130,
        weightKgPerCabinet: 33, maxNits: 10000, maxPowerWattsPerCab: 460,
        environment: "outdoor", ipRating: "IP66", costPerSqFt: 293.20,
        serviceType: "front", sourceSpreadsheet: "NX Yaham Rate Card - LGEUS Markup 02.16.26 EG.xlsx",
    },
];

// ============================================================================
// HANDLERS
// ============================================================================

export async function GET() {
    try {
        const rateCardCount = await prisma.rateCardEntry.count({ where: { isActive: true } });
        const productCount = await prisma.manufacturerProduct.count({ where: { isActive: true } });

        return NextResponse.json({
            status: "ok",
            rateCardEntries: rateCardCount,
            products: productCount,
            seedAvailable: {
                rateCardEntries: RATE_CARD_SEED.length,
                products: PRODUCT_SEED.length,
            },
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const target = (body as any)?.target || "all"; // "all", "rate-card", "products"

        const results: any = {};

        // --- Seed Rate Card ---
        if (target === "all" || target === "rate-card") {
            let rcCreated = 0;
            let rcUpdated = 0;

            for (const entry of RATE_CARD_SEED) {
                const existing = await prisma.rateCardEntry.findUnique({
                    where: { key: entry.key },
                });
                if (existing) {
                    await prisma.rateCardEntry.update({
                        where: { key: entry.key },
                        data: entry,
                    });
                    rcUpdated++;
                } else {
                    await prisma.rateCardEntry.create({ data: entry });
                    rcCreated++;
                }
            }

            invalidateRateCardCache();
            results.rateCard = { created: rcCreated, updated: rcUpdated, total: RATE_CARD_SEED.length };
        }

        // --- Seed Products ---
        if (target === "all" || target === "products") {
            let pCreated = 0;
            let pUpdated = 0;

            for (const product of PRODUCT_SEED) {
                const existing = await prisma.manufacturerProduct.findUnique({
                    where: { modelNumber: product.modelNumber },
                });
                if (existing) {
                    await prisma.manufacturerProduct.update({
                        where: { modelNumber: product.modelNumber },
                        data: product,
                    });
                    pUpdated++;
                } else {
                    await prisma.manufacturerProduct.create({ data: product });
                    pCreated++;
                }
            }

            results.products = { created: pCreated, updated: pUpdated, total: PRODUCT_SEED.length };
        }

        return NextResponse.json({
            success: true,
            seeded: results,
            message: `Seed complete. Rate card: ${results.rateCard?.created ?? 0} created, ${results.rateCard?.updated ?? 0} updated. Products: ${results.products?.created ?? 0} created, ${results.products?.updated ?? 0} updated.`,
        });
    } catch (err: any) {
        log.error("[admin/seed] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
