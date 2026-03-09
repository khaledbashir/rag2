import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export async function GET() {
    try {
        const rows = await prisma.manufacturerProduct.findMany({
            where: { isActive: true },
            select: { manufacturer: true },
            distinct: ["manufacturer"],
            orderBy: { manufacturer: "asc" },
        });

        const manufacturers = rows.map((r) => r.manufacturer);

        return NextResponse.json({ manufacturers });
    } catch (error) {
        log.error("[manufacturers/list] Error:", error);
        // Return empty — panel falls back to hardcoded list
        return NextResponse.json({ manufacturers: [] });
    }
}
