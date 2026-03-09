import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { normalizeExcel } from "@/services/import/excelNormalizer";
import { log } from "@/lib/logger";

/**
 * POST /api/import/normalize
 *
 * Accepts a multipart/form-data upload with an Excel file.
 * Returns either:
 *   - 200 { status: "success", ... } if a saved ImportProfile matches
 *   - 202 { status: "mapping_required", rawPreview, fingerprint } if no profile found
 */
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json(
                { error: "No file uploaded" },
                { status: 400 },
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await normalizeExcel(buffer, file.name);

        if (result.status === "mapping_required") {
            return NextResponse.json(result, { status: 202 });
        }

        return NextResponse.json(result);
    } catch (err) {
        Sentry.captureException(err, { tags: { area: "excelNormalizer" } });
        log.error("[NORMALIZE] Error:", err);
        return NextResponse.json(
            { error: String(err) },
            { status: 500 },
        );
    }
}
