export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { parseFormSheet } from "@/services/specsheet/formSheetParser";
import { log } from "@/lib/logger";

/**
 * POST /api/specsheet/preview
 * Parses FORM sheet and returns structured display specs for UI preview + editing.
 */
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = xlsx.read(buffer, { type: "buffer" });
        const result = parseFormSheet(workbook);

        if (result.displays.length === 0) {
            return NextResponse.json({
                error: "No displays found in FORM sheet",
                warnings: result.warnings,
                displays: [],
            }, { status: 422 });
        }

        return NextResponse.json({
            projectName: result.projectName,
            venueName: result.venueName,
            clientName: result.clientName,
            clientAddress: result.clientAddress,
            displays: result.displays,
            warnings: result.warnings,
            displayCount: result.displays.length,
        });
    } catch (err: any) {
        log.error("[SPEC SHEET PREVIEW] Error:", err);
        return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
    }
}
