/**
 * /api/vendor/parse — Parse vendor spec sheet (PDF or Excel)
 *
 * POST: Upload a vendor file, extract LED specs.
 * Accepts multipart/form-data with a single file.
 */

import { NextRequest, NextResponse } from "next/server";
import { extractFromExcel, extractFromText } from "@/services/vendor/vendorParser";
import { extractText } from "@/services/kreuzberg/kreuzbergClient";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const fileName = file.name.toLowerCase();
        const buffer = Buffer.from(await file.arrayBuffer());

        // Determine file type and extract
        if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".csv")) {
            const spec = extractFromExcel(buffer);
            return NextResponse.json({
                spec,
                fileName: file.name,
                fileType: "excel",
            });
        }

        if (fileName.endsWith(".pdf")) {
            // Kreuzberg handles PDFs with full OCR (scanned docs work too)
            const result = await extractText(buffer, file.name);
            const text = result.text;

            if (!text.trim()) {
                return NextResponse.json(
                    { error: "Could not extract text from PDF. Try an Excel file instead." },
                    { status: 422 }
                );
            }

            const spec = extractFromText(text);
            return NextResponse.json({
                spec,
                fileName: file.name,
                fileType: "pdf",
            });
        }

        // Plain text fallback
        if (fileName.endsWith(".txt")) {
            const text = buffer.toString("utf-8");
            const spec = extractFromText(text);
            return NextResponse.json({
                spec,
                fileName: file.name,
                fileType: "text",
            });
        }

        return NextResponse.json(
            { error: "Unsupported file type. Upload a PDF, Excel (.xlsx/.xls), or text file." },
            { status: 400 }
        );
    } catch (error) {
        log.error("[vendor/parse] Error:", error);
        return NextResponse.json(
            { error: "Failed to parse vendor file" },
            { status: 500 }
        );
    }
}
