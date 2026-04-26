/**
 * /api/products/[id] — Individual Product CRUD
 *
 * GET: Fetch single product by ID
 * PUT: Update product
 * DELETE: Soft-delete product (sets isActive = false)
 */

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";
import { syncProductToTwenty, softDeleteProductInTwenty } from "@/services/integrations/twenty/productSync";

const prisma = new PrismaClient();

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const { id } = await params;
        const product = await prisma.manufacturerProduct.findUnique({
            where: { id },
        });

        if (!product) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        return NextResponse.json({ product });
    } catch (error) {
        log.error("[products/[id]] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const { id } = await params;
        const body = await request.json();

        const existing = await prisma.manufacturerProduct.findUnique({
            where: { id },
        });

        if (!existing) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        // Build update data — only include fields that are provided
        const data: any = {};
        const fields = [
            "manufacturer", "productFamily", "modelNumber", "displayName",
            "environment", "ipRating", "serviceType", "sourceSpreadsheet",
        ];
        const floatFields = [
            "pixelPitch", "cabinetWidthMm", "cabinetHeightMm", "cabinetDepthMm",
            "weightKgPerCabinet", "maxNits", "typicalNits", "maxPowerWattsPerCab",
            "typicalPowerWattsPerCab", "operatingTempMin", "operatingTempMax",
            "costPerSqFt", "msrpPerSqFt",
        ];
        const intFields = ["refreshRate"];
        const boolFields = ["supportsHalfModule", "isCurved", "isActive"];

        for (const f of fields) {
            if (body[f] !== undefined) data[f] = body[f];
        }
        for (const f of floatFields) {
            if (body[f] !== undefined) data[f] = body[f] === null ? null : parseFloat(body[f]);
        }
        for (const f of intFields) {
            if (body[f] !== undefined) data[f] = body[f] === null ? null : parseInt(body[f]);
        }
        for (const f of boolFields) {
            if (body[f] !== undefined) data[f] = !!body[f];
        }
        if (body.extendedSpecs !== undefined) data.extendedSpecs = body.extendedSpecs;

        const product = await prisma.manufacturerProduct.update({
            where: { id },
            data,
        });

        const twentySync = await syncProductToTwenty(product.id);
        if (twentySync.ok) {
            log.info(`[products/[id]] CRM sync OK (${twentySync.action}) — ${product.modelNumber} → ${twentySync.twentyId}`);
        } else {
            log.warn(`[products/[id]] CRM sync FAILED — ${product.modelNumber}: ${twentySync.error}`);
        }

        return NextResponse.json({ product, twentySync });
    } catch (error: any) {
        if (error?.code === "P2002") {
            return NextResponse.json({ error: "A product with this model number already exists" }, { status: 409 });
        }
        log.error("[products/[id]] PUT error:", error);
        return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const [, authError] = await requireAuth();
        if (authError) return authError;
        const { id } = await params;
        const existing = await prisma.manufacturerProduct.findUnique({
            where: { id },
        });

        if (!existing) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        // Soft delete
        await prisma.manufacturerProduct.update({
            where: { id },
            data: { isActive: false },
        });

        const twentySync = await softDeleteProductInTwenty(existing.modelNumber);
        if (twentySync.ok) {
            log.info(`[products/[id]] CRM soft-delete OK — ${existing.modelNumber} → ${twentySync.twentyId}`);
        } else {
            log.warn(`[products/[id]] CRM soft-delete FAILED — ${existing.modelNumber}: ${twentySync.error}`);
        }

        return NextResponse.json({ success: true, message: "Product deactivated", twentySync });
    } catch (error) {
        log.error("[products/[id]] DELETE error:", error);
        return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
    }
}
