/**
 * /api/products/export — Export full product catalog as .xlsx
 *
 * GET → every ManufacturerProduct row (active + inactive) flattened into
 * one spreadsheet so Natalia can review what's in the DB before cleanup.
 *
 * Query params:
 *   ?active=true    Only active rows (default: include both)
 *   ?manufacturer=  Filter to one manufacturer
 */

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

const HEADERS = [
    "id",
    "manufacturer",
    "productFamily",
    "productLine",
    "application",
    "modelNumber",
    "displayName",
    "productType",
    "pixelPitch",
    "environment",
    "ipRating",
    "cabinetWidthMm",
    "cabinetHeightMm",
    "cabinetDepthMm",
    "weightKgPerCabinet",
    "moduleWidthMm",
    "moduleHeightMm",
    "modulesPerCabinetW",
    "modulesPerCabinetH",
    "maxNits",
    "typicalNits",
    "refreshRate",
    "maxPowerWattsPerCab",
    "typicalPowerWattsPerCab",
    "serviceType",
    "supportsHalfModule",
    "isCurved",
    "costPerSqFt",
    "msrpPerSqFt",
    "standardPricePerSqft",
    "customPricePerSqft",
    "unitCost",
    "preferred",
    "sourceSpreadsheet",
    "isActive",
    "importedAt",
    "updatedAt",
];

export async function GET(request: NextRequest) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;

        const { searchParams } = new URL(request.url);
        const activeOnly = searchParams.get("active") === "true";
        const manufacturer = searchParams.get("manufacturer");

        const where: any = {};
        if (activeOnly) where.isActive = true;
        if (manufacturer) where.manufacturer = { equals: manufacturer, mode: "insensitive" };

        const products = await prisma.manufacturerProduct.findMany({
            where,
            orderBy: [{ manufacturer: "asc" }, { productFamily: "asc" }, { pixelPitch: "asc" }],
        });

        const rows = products.map((p) => {
            const ext = (p.extendedSpecs as Record<string, any> | null) ?? null;
            return {
                id: p.id,
                manufacturer: p.manufacturer,
                productFamily: p.productFamily,
                productLine: p.productLine ?? "",
                application: p.application ?? "",
                modelNumber: p.modelNumber,
                displayName: p.displayName,
                productType: p.productType,
                pixelPitch: p.pixelPitch,
                environment: p.environment,
                ipRating: p.ipRating ?? "",
                cabinetWidthMm: p.cabinetWidthMm,
                cabinetHeightMm: p.cabinetHeightMm,
                cabinetDepthMm: p.cabinetDepthMm ?? "",
                weightKgPerCabinet: p.weightKgPerCabinet,
                moduleWidthMm: p.moduleWidthMm ?? "",
                moduleHeightMm: p.moduleHeightMm ?? "",
                modulesPerCabinetW: p.modulesPerCabinetW ?? "",
                modulesPerCabinetH: p.modulesPerCabinetH ?? "",
                maxNits: p.maxNits,
                typicalNits: p.typicalNits ?? "",
                refreshRate: p.refreshRate ?? "",
                maxPowerWattsPerCab: p.maxPowerWattsPerCab,
                typicalPowerWattsPerCab: p.typicalPowerWattsPerCab ?? "",
                serviceType: p.serviceType,
                supportsHalfModule: p.supportsHalfModule ? "yes" : "no",
                isCurved: p.isCurved ? "yes" : "no",
                costPerSqFt: p.costPerSqFt != null ? Number(p.costPerSqFt) : "",
                msrpPerSqFt: p.msrpPerSqFt != null ? Number(p.msrpPerSqFt) : "",
                standardPricePerSqft: p.standardPricePerSqft ?? "",
                customPricePerSqft: p.customPricePerSqft ?? "",
                unitCost: ext?.unitCost ?? "",
                preferred: ext?.preferred === true ? "yes" : "",
                sourceSpreadsheet: p.sourceSpreadsheet ?? "",
                isActive: p.isActive ? "yes" : "no",
                importedAt: p.importedAt.toISOString(),
                updatedAt: p.updatedAt.toISOString(),
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Products");

        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        const stamp = new Date().toISOString().slice(0, 10);
        const filename = `anc-products-export-${stamp}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        log.error("[products/export] GET error:", error);
        return NextResponse.json({ error: "Failed to export products" }, { status: 500 });
    }
}
