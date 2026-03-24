/**
 * /api/products/import — Manufacturer Spreadsheet Importer
 *
 * Phase 2A: Accepts Excel/CSV files from manufacturers (LG, Yaham, Absen, etc.)
 * and maps their columns to the ManufacturerProduct schema.
 *
 * Supports:
 * - CSV files (comma or tab delimited)
 * - Excel files (.xlsx)
 * - Smart column name mapping (different manufacturers use different headers)
 * - Upsert: updates existing products by modelNumber, creates new ones
 */

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { log } from "@/lib/logger";

const prisma = new PrismaClient();

// ============================================================================
// COLUMN NAME MAPPING
// ============================================================================

// Maps various column names manufacturers might use to our standard field names.
// Case-insensitive matching. First match wins.
const COLUMN_MAP: Record<string, string[]> = {
    manufacturer:         ["manufacturer", "brand", "mfg", "vendor", "make"],
    productFamily:        ["product_family", "family", "series", "product_line", "product line", "productfamily"],
    modelNumber:          ["model_number", "model", "part_number", "part number", "sku", "modelnumber", "part_no", "part#"],
    displayName:          ["display_name", "name", "product_name", "product name", "displayname", "description"],
    productType:          ["product_type", "producttype", "type"],
    pixelPitch:           ["pixel_pitch", "pitch", "pitch_mm", "pixel pitch", "pixelpitch", "mm_pitch", "pitch (mm)"],
    cabinetWidthMm:       ["cabinet_width_mm", "width_mm", "width", "cabinet_width", "cab_width", "module_width", "panel_width", "cabinetwidthmm", "width (mm)"],
    cabinetHeightMm:      ["cabinet_height_mm", "height_mm", "height", "cabinet_height", "cab_height", "module_height", "panel_height", "cabinetheightmm", "height (mm)"],
    cabinetDepthMm:       ["cabinet_depth_mm", "depth_mm", "depth", "cabinet_depth", "cabinetdepthmm", "depth (mm)"],
    weightKgPerCabinet:   ["weight_kg", "weight_kg_per_cabinet", "weight", "cabinet_weight", "module_weight", "weight_per_cab", "weightkg", "weight (kg)"],
    weightLbs:            ["weight_lbs", "weight_pounds", "lbs", "weightlbs"],
    maxNits:              ["max_nits", "nits", "brightness", "max_brightness", "brightness_max", "maxnits", "nits_max", "brightness (nits)"],
    typicalNits:          ["typical_nits", "typical_brightness", "typicalnits", "brightness_typical"],
    refreshRate:          ["refresh_rate", "refresh", "hz", "refreshrate", "refresh (hz)"],
    maxPowerWattsPerCab:  ["max_power_watts", "max_power", "power_max", "power_watts", "maxpowerwatts", "wattage", "power (w)", "max power (w)"],
    typicalPowerWattsPerCab: ["typical_power_watts", "typical_power", "power_typical", "typicalpowerwatts", "typical power (w)"],
    environment:          ["environment", "env", "indoor_outdoor", "usage", "application"],
    ipRating:             ["ip_rating", "ip", "ingress_protection", "iprating", "ip rating"],
    operatingTempMin:     ["operating_temp_min", "temp_min", "min_temp", "operatingtempmin", "min temp (c)"],
    operatingTempMax:     ["operating_temp_max", "temp_max", "max_temp", "operatingtempmax", "max temp (c)"],
    serviceType:          ["service_type", "service", "access", "servicetype", "service access", "maintenance_access"],
    supportsHalfModule:   ["supports_half_module", "half_module", "halfmodule", "half module"],
    isCurved:             ["is_curved", "curved", "curve", "flexible", "iscurved"],
    costPerSqFt:          ["cost_per_sqft", "cost_sqft", "cost", "buy_price", "costpersqft", "cost/sqft"],
    msrpPerSqFt:          ["msrp_per_sqft", "msrp", "list_price", "retail_price", "msrppersqft", "msrp/sqft"],
    // CMS-specific fields (mapped into extendedSpecs)
    unitCost:             ["unit_cost", "unitcost", "cost_each", "price_each"],
    unitSellPrice:        ["unit_sell_price", "unitsellprice", "sell_price", "selling_price"],
    marginPercent:        ["margin_percent", "marginpercent", "margin", "margin_%"],
    category:             ["category", "product_category", "cat"],
    specs:                ["specs", "specifications", "spec", "description"],
    quoteRef:             ["quote_ref", "quoteref", "quote", "quote_number", "reference"],
};

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const defaultManufacturer = formData.get("manufacturer") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // Parse file
        const buffer = Buffer.from(await file.arrayBuffer());
        const rows = parseFile(buffer, file.name);

        if (rows.length === 0) {
            return NextResponse.json({ error: "No data rows found in file" }, { status: 400 });
        }

        // Map columns
        const headers = Object.keys(rows[0]);
        const columnMapping = mapColumns(headers);

        // Process rows
        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: Array<{ row: number; error: string }> = [];

        for (let i = 0; i < rows.length; i++) {
            try {
                const product = mapRowToProduct(rows[i], columnMapping, defaultManufacturer, file.name);

                if (!product) {
                    skipped++;
                    continue;
                }

                // Upsert by modelNumber
                const existing = await prisma.manufacturerProduct.findUnique({
                    where: { modelNumber: product.modelNumber },
                });

                if (existing) {
                    await prisma.manufacturerProduct.update({
                        where: { modelNumber: product.modelNumber },
                        data: product,
                    });
                    updated++;
                } else {
                    await prisma.manufacturerProduct.create({ data: product });
                    created++;
                }
            } catch (err) {
                errors.push({
                    row: i + 2, // +2 for 1-indexed + header row
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        const total = await prisma.manufacturerProduct.count({ where: { isActive: true } });

        return NextResponse.json({
            success: true,
            summary: {
                created,
                updated,
                skipped,
                errors: errors.length,
                totalProductsInDB: total,
            },
            columnMapping,
            errors: errors.slice(0, 20), // First 20 errors
        });
    } catch (error) {
        log.error("[products/import] Error:", error);
        return NextResponse.json(
            { error: "Failed to import products" },
            { status: 500 }
        );
    }
}

// Also support GET to list all products
export async function GET() {
    const products = await prisma.manufacturerProduct.findMany({
        where: { isActive: true },
        orderBy: [{ manufacturer: "asc" }, { pixelPitch: "asc" }],
    });

    return NextResponse.json({
        products,
        total: products.length,
    });
}

// ============================================================================
// FILE PARSING
// ============================================================================

function parseFile(buffer: Buffer, filename: string): Record<string, unknown>[] {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Take the first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON — header row becomes keys
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    return rows as Record<string, unknown>[];
}

// ============================================================================
// COLUMN MAPPING
// ============================================================================

function mapColumns(headers: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};

    for (const [fieldName, aliases] of Object.entries(COLUMN_MAP)) {
        for (const header of headers) {
            const normalized = header.toLowerCase().trim().replace(/[^a-z0-9_() /]/g, "");
            if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
                mapping[fieldName] = header;
                break;
            }
        }
    }

    return mapping;
}

function getVal(row: Record<string, unknown>, mapping: Record<string, string>, field: string): unknown {
    const header = mapping[field];
    if (!header) return undefined;
    return row[header];
}

function toFloat(val: unknown): number | undefined {
    if (val === null || val === undefined || val === "") return undefined;
    const num = typeof val === "number" ? val : parseFloat(String(val));
    return isNaN(num) ? undefined : num;
}

function toInt(val: unknown): number | undefined {
    if (val === null || val === undefined || val === "") return undefined;
    const num = typeof val === "number" ? Math.round(val) : parseInt(String(val));
    return isNaN(num) ? undefined : num;
}

function toBool(val: unknown): boolean {
    if (val === null || val === undefined || val === "") return false;
    const str = String(val).toLowerCase().trim();
    return ["true", "yes", "1", "y"].includes(str);
}

// ============================================================================
// ROW → PRODUCT MAPPING
// ============================================================================

function mapRowToProduct(
    row: Record<string, unknown>,
    mapping: Record<string, string>,
    defaultManufacturer: string | null,
    sourceFile: string
) {
    const manufacturer = (getVal(row, mapping, "manufacturer") as string) || defaultManufacturer;
    const modelNumber = getVal(row, mapping, "modelNumber") as string;
    const productType = ((getVal(row, mapping, "productType") as string) || "led").toLowerCase().trim();
    const isTV = productType === "tv";
    const isCourtside = productType === "courtside";
    const isStanchion = productType === "stanchion";
    const isUnitPriced = isTV || isCourtside || isStanchion;
    const isCMS = productType === "cms" || isUnitPriced;

    const pixelPitch = toFloat(getVal(row, mapping, "pixelPitch"));
    const cabinetWidthMm = toFloat(getVal(row, mapping, "cabinetWidthMm"));
    const cabinetHeightMm = toFloat(getVal(row, mapping, "cabinetHeightMm"));
    const weightKg = toFloat(getVal(row, mapping, "weightKgPerCabinet"));
    const weightLbs = toFloat(getVal(row, mapping, "weightLbs"));
    const maxNits = toFloat(getVal(row, mapping, "maxNits"));
    const maxPower = toFloat(getVal(row, mapping, "maxPowerWattsPerCab"));

    // Required fields — different for LED vs CMS
    if (!manufacturer || !modelNumber) return null;
    if (!isCMS && (!pixelPitch || !cabinetWidthMm || !cabinetHeightMm || !maxPower)) {
        return null;
    }

    // Infer environment from nits if not explicitly provided
    let environment = (getVal(row, mapping, "environment") as string)?.toLowerCase()?.trim();
    if (!environment) {
        environment = (maxNits && maxNits >= 5000) ? "outdoor" : isCMS ? "outdoor" : "indoor";
    }
    if (["outdoor", "out", "exterior"].includes(environment)) environment = "outdoor";
    else if (["indoor", "in", "interior"].includes(environment)) environment = "indoor";
    else if (["both", "indoor/outdoor", "indoor_outdoor", "versatile"].includes(environment)) environment = "indoor_outdoor";

    // Infer display name
    const displayName = (getVal(row, mapping, "displayName") as string) ||
        (isCMS
            ? `${manufacturer} ${modelNumber}`
            : `${manufacturer} ${getVal(row, mapping, "productFamily") || ""} ${pixelPitch}mm`.trim());

    // CMS-specific fields for extendedSpecs
    const unitCost = toFloat(getVal(row, mapping, "unitCost"));
    const unitSellPrice = toFloat(getVal(row, mapping, "unitSellPrice"));
    const marginPercent = toFloat(getVal(row, mapping, "marginPercent"));
    const category = (getVal(row, mapping, "category") as string) || null;
    const specs = (getVal(row, mapping, "specs") as string) || null;
    const quoteRef = (getVal(row, mapping, "quoteRef") as string) || null;

    // Collect any unmapped columns as extendedSpecs
    const mappedHeaders = new Set(Object.values(mapping));
    const extendedSpecs: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(row)) {
        if (!mappedHeaders.has(key) && val !== null && val !== undefined && val !== "") {
            extendedSpecs[key] = val;
        }
    }

    // For CMS products, merge pricing into extendedSpecs
    if (isCMS) {
        if (unitCost) extendedSpecs.unitCost = unitCost;
        if (unitSellPrice) extendedSpecs.unitSellPrice = unitSellPrice;
        if (marginPercent) extendedSpecs.margin = marginPercent / 100; // Store as decimal
        if (category) extendedSpecs.category = category;
        if (specs) extendedSpecs.specs = specs;
        if (quoteRef) extendedSpecs.quoteRef = quoteRef;
        if (weightLbs) extendedSpecs.weightLbs = weightLbs;
        // Auto-compute sell price if cost and margin given but no sell price
        if (unitCost && marginPercent && !unitSellPrice) {
            extendedSpecs.unitSellPrice = Math.round((unitCost / (1 - marginPercent / 100)) * 100) / 100;
        }
    }

    // Convert lbs to kg if weight_lbs provided but weight_kg not
    const resolvedWeightKg = weightKg || (weightLbs ? Math.round(weightLbs * 0.4536 * 10) / 10 : 10);

    return {
        manufacturer,
        productFamily: (getVal(row, mapping, "productFamily") as string) || (isCMS ? "Scoring & Timing" : "Unknown"),
        modelNumber,
        displayName,
        productType: isUnitPriced ? productType : (isCMS ? "cms" : "led"),
        pixelPitch: pixelPitch || 0,
        cabinetWidthMm: cabinetWidthMm || 0,
        cabinetHeightMm: cabinetHeightMm || 0,
        cabinetDepthMm: toFloat(getVal(row, mapping, "cabinetDepthMm")),
        weightKgPerCabinet: resolvedWeightKg,
        maxNits: maxNits || (isCMS ? 0 : 1000),
        typicalNits: toFloat(getVal(row, mapping, "typicalNits")),
        refreshRate: toInt(getVal(row, mapping, "refreshRate")),
        maxPowerWattsPerCab: maxPower || 0,
        typicalPowerWattsPerCab: toFloat(getVal(row, mapping, "typicalPowerWattsPerCab")),
        environment,
        ipRating: (getVal(row, mapping, "ipRating") as string) || null,
        operatingTempMin: toFloat(getVal(row, mapping, "operatingTempMin")),
        operatingTempMax: toFloat(getVal(row, mapping, "operatingTempMax")),
        serviceType: (getVal(row, mapping, "serviceType") as string)?.toLowerCase() || "front",
        supportsHalfModule: toBool(getVal(row, mapping, "supportsHalfModule")),
        isCurved: toBool(getVal(row, mapping, "isCurved")),
        costPerSqFt: toFloat(getVal(row, mapping, "costPerSqFt")),
        msrpPerSqFt: toFloat(getVal(row, mapping, "msrpPerSqFt")),
        extendedSpecs: Object.keys(extendedSpecs).length > 0
            ? (extendedSpecs as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        sourceSpreadsheet: sourceFile,
    };
}
