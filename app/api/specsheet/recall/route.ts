import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * POST /api/specsheet/recall
 *
 * Batch-retrieves saved spec field values for multiple model groups.
 * Used by the spec sheet generator to pre-fill fields from memory
 * before falling back to catalog defaults.
 *
 * Body: {
 *   groups: Array<{
 *     manufacturer: string;
 *     model: string;
 *     pitchMm: number | null;
 *   }>
 * }
 *
 * Returns: {
 *   memories: Record<string, Record<string, string>>
 *   // key = "manufacturer|model", value = { fieldKey: fieldValue }
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const groups: Array<{
            manufacturer: string;
            model: string;
            pitchMm: number | null;
        }> = body.groups;

        if (!groups || !Array.isArray(groups) || groups.length === 0) {
            return NextResponse.json({ memories: {} });
        }

        const memories: Record<string, Record<string, string>> = {};

        for (const g of groups) {
            const mfr = (g.manufacturer || "").trim().toLowerCase();
            const mdl = (g.model || "").trim().toLowerCase();
            if (!mfr || !mdl) continue;

            const key = `${mfr}|${mdl}`;

            // Look up by exact manufacturer+model, with pitch or generic (0)
            const pitch = g.pitchMm ?? 0;
            const rows = await prisma.specFieldMemory.findMany({
                where: {
                    manufacturer: mfr,
                    model: mdl,
                    OR: [
                        { pitchMm: pitch },
                        ...(pitch !== 0 ? [{ pitchMm: 0 }] : []),
                    ],
                },
                orderBy: { updatedAt: "desc" },
            });

            if (rows.length > 0) {
                const fields: Record<string, string> = {};
                // More specific (with pitch) wins over generic (null pitch)
                // Since ordered by updatedAt desc, first occurrence wins
                const seen = new Set<string>();
                for (const row of rows) {
                    if (!seen.has(row.fieldKey)) {
                        seen.add(row.fieldKey);
                        fields[row.fieldKey] = row.fieldValue;
                    }
                }
                memories[key] = fields;
            }
        }

        return NextResponse.json({ memories });
    } catch (err: any) {
        log.error("[specsheet/recall] Error:", err);
        return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
    }
}
