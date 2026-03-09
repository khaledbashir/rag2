import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * POST /api/specsheet/remember
 *
 * Saves user-entered spec field values for a product (manufacturer+model+pitch).
 * Next time that product appears in any project, these values auto-fill.
 *
 * Body: {
 *   entries: Array<{
 *     manufacturer: string;
 *     model: string;
 *     pitchMm: number | null;
 *     fields: Record<string, string>;  // fieldKey → fieldValue
 *   }>
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const entries: Array<{
            manufacturer: string;
            model: string;
            pitchMm: number | null;
            fields: Record<string, string>;
        }> = body.entries;

        if (!entries || !Array.isArray(entries) || entries.length === 0) {
            return NextResponse.json({ error: "entries array required" }, { status: 400 });
        }

        let savedCount = 0;

        for (const entry of entries) {
            const mfr = (entry.manufacturer || "").trim().toLowerCase();
            const mdl = (entry.model || "").trim().toLowerCase();
            if (!mfr || !mdl) continue;

            const pitch = entry.pitchMm != null ? entry.pitchMm : 0;

            for (const [fieldKey, fieldValue] of Object.entries(entry.fields)) {
                const val = (fieldValue || "").trim();
                if (!val) continue;

                await prisma.specFieldMemory.upsert({
                    where: {
                        manufacturer_model_pitchMm_fieldKey: {
                            manufacturer: mfr,
                            model: mdl,
                            pitchMm: pitch ?? 0,
                            fieldKey,
                        },
                    },
                    create: {
                        manufacturer: mfr,
                        model: mdl,
                        pitchMm: pitch,  // 0 = unknown pitch
                        fieldKey,
                        fieldValue: val,
                        source: "user",
                    },
                    update: {
                        fieldValue: val,
                        source: "user",
                    },
                });
                savedCount++;
            }
        }

        return NextResponse.json({ saved: savedCount });
    } catch (err: any) {
        log.error("[specsheet/remember] Error:", err);
        return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
    }
}
