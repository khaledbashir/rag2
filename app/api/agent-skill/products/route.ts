/**
 * /api/agent-skill/products — Public product catalog endpoint for AnythingLLM skills
 *
 * This route is under /api/agent-skill/ which bypasses auth middleware,
 * allowing AnythingLLM custom agent skills to query the product catalog.
 */

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { log } from "@/lib/logger";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);

        const manufacturer = searchParams.get("manufacturer");
        const environment = searchParams.get("environment");
        const pixelPitch = searchParams.get("pixelPitch");
        const pitchMin = searchParams.get("pitchMin");
        const pitchMax = searchParams.get("pitchMax");
        const minBrightness = searchParams.get("minBrightness");
        const search = searchParams.get("search");

        const where: any = { isActive: true };

        if (manufacturer) where.manufacturer = { equals: manufacturer, mode: "insensitive" };
        if (environment) where.environment = environment;

        // Support both exact pitch and range
        if (pixelPitch) {
            where.pixelPitch = parseFloat(pixelPitch);
        } else if (pitchMin || pitchMax) {
            where.pixelPitch = {};
            if (pitchMin) where.pixelPitch.gte = parseFloat(pitchMin);
            if (pitchMax) where.pixelPitch.lte = parseFloat(pitchMax);
        }

        if (minBrightness) {
            where.maxNits = { gte: parseFloat(minBrightness) };
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

        return NextResponse.json({
            products,
            total: products.length,
        });
    } catch (error) {
        log.error("[agent-skill/products] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }
}
