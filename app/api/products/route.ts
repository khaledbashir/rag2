/**
 * /api/products — Product Catalog API
 *
 * GET: List products with filtering by manufacturer, environment, pitch range
 * POST: Create a single product
 */

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);

        // Filtering params
        const manufacturer = searchParams.get("manufacturer");
        const environment = searchParams.get("environment");
        const pitchMin = searchParams.get("pitchMin");
        const pitchMax = searchParams.get("pitchMax");
        const search = searchParams.get("search");
        const productType = searchParams.get("productType");
        const activeOnly = searchParams.get("active") !== "false"; // default true

        const where: any = {};

        if (activeOnly) where.isActive = true;
        if (productType) where.productType = productType;
        if (manufacturer) where.manufacturer = { equals: manufacturer, mode: "insensitive" };
        if (environment) where.environment = environment;
        if (pitchMin || pitchMax) {
            where.pixelPitch = {};
            if (pitchMin) where.pixelPitch.gte = parseFloat(pitchMin);
            if (pitchMax) where.pixelPitch.lte = parseFloat(pitchMax);
        }
        if (search) {
            where.OR = [
                { displayName: { contains: search, mode: "insensitive" } },
                { modelNumber: { contains: search, mode: "insensitive" } },
                { manufacturer: { contains: search, mode: "insensitive" } },
                { productFamily: { contains: search, mode: "insensitive" } },
            ];
        }

        const products = await prisma.manufacturerProduct.findMany({
            where,
            orderBy: [{ manufacturer: "asc" }, { pixelPitch: "asc" }],
        });

        // Also return distinct manufacturers for filter dropdowns
        const manufacturers = await prisma.manufacturerProduct.findMany({
            where: { isActive: true },
            select: { manufacturer: true },
            distinct: ["manufacturer"],
            orderBy: { manufacturer: "asc" },
        });

        return NextResponse.json({
            products,
            total: products.length,
            manufacturers: manufacturers.map((m) => m.manufacturer),
        });
    } catch (error) {
        console.error("[products] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Required fields
        const { manufacturer, modelNumber, pixelPitch, cabinetWidthMm, cabinetHeightMm, maxPowerWattsPerCab } = body;
        if (!manufacturer || !modelNumber || !pixelPitch || !cabinetWidthMm || !cabinetHeightMm || !maxPowerWattsPerCab) {
            return NextResponse.json(
                { error: "Missing required fields: manufacturer, modelNumber, pixelPitch, cabinetWidthMm, cabinetHeightMm, maxPowerWattsPerCab" },
                { status: 400 }
            );
        }

        const product = await prisma.manufacturerProduct.create({
            data: {
                manufacturer: body.manufacturer,
                productFamily: body.productFamily || "Unknown",
                modelNumber: body.modelNumber,
                displayName: body.displayName || `${body.manufacturer} ${body.modelNumber}`,
                pixelPitch: parseFloat(body.pixelPitch),
                cabinetWidthMm: parseFloat(body.cabinetWidthMm),
                cabinetHeightMm: parseFloat(body.cabinetHeightMm),
                cabinetDepthMm: body.cabinetDepthMm ? parseFloat(body.cabinetDepthMm) : null,
                weightKgPerCabinet: parseFloat(body.weightKgPerCabinet || "10"),
                maxNits: parseFloat(body.maxNits || "1000"),
                typicalNits: body.typicalNits ? parseFloat(body.typicalNits) : null,
                refreshRate: body.refreshRate ? parseInt(body.refreshRate) : null,
                maxPowerWattsPerCab: parseFloat(body.maxPowerWattsPerCab),
                typicalPowerWattsPerCab: body.typicalPowerWattsPerCab ? parseFloat(body.typicalPowerWattsPerCab) : null,
                environment: body.environment || "indoor",
                ipRating: body.ipRating || null,
                operatingTempMin: body.operatingTempMin ? parseFloat(body.operatingTempMin) : null,
                operatingTempMax: body.operatingTempMax ? parseFloat(body.operatingTempMax) : null,
                serviceType: body.serviceType || "front",
                supportsHalfModule: body.supportsHalfModule || false,
                isCurved: body.isCurved || false,
                costPerSqFt: body.costPerSqFt ? parseFloat(body.costPerSqFt) : null,
                msrpPerSqFt: body.msrpPerSqFt ? parseFloat(body.msrpPerSqFt) : null,
                extendedSpecs: body.extendedSpecs || undefined,
                sourceSpreadsheet: body.sourceSpreadsheet || "manual",
            },
        });

        return NextResponse.json({ product }, { status: 201 });
    } catch (error: any) {
        if (error?.code === "P2002") {
            return NextResponse.json({ error: "A product with this model number already exists" }, { status: 409 });
        }
        console.error("[products] POST error:", error);
        return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }
}
