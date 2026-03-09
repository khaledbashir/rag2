import { NextRequest, NextResponse } from "next/server";
import { scanForLiabilities } from "@/services/sow/liabilityScanner";
import { extractText } from "@/services/kreuzberg/kreuzbergClient";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get("content-type") || "";

        let text = "";
        let documentName = "Unknown Document";

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file") as File | null;

            if (!file) {
                return NextResponse.json(
                    { error: "No file provided" },
                    { status: 400 }
                );
            }

            documentName = file.name;
            const fileName = file.name.toLowerCase();
            const buffer = Buffer.from(await file.arrayBuffer());

            if (
                fileName.endsWith(".pdf") ||
                fileName.endsWith(".docx") ||
                fileName.endsWith(".doc")
            ) {
                // Kreuzberg handles PDF, DOCX, DOC natively with OCR
                const result = await extractText(buffer, file.name);
                text = result.text;
            } else if (
                fileName.endsWith(".txt") ||
                fileName.endsWith(".md")
            ) {
                text = buffer.toString("utf-8");
            } else {
                return NextResponse.json(
                    {
                        error: "Unsupported file type. Upload a PDF, DOCX, TXT, or MD file.",
                    },
                    { status: 400 }
                );
            }
        } else {
            // JSON body with { text, documentName }
            const body = await request.json();
            text = body.text || "";
            documentName = body.documentName || "Pasted Text";
        }

        if (!text.trim()) {
            return NextResponse.json(
                { error: "No text content to scan" },
                { status: 400 }
            );
        }

        const result = scanForLiabilities(text, documentName);

        return NextResponse.json({ result });
    } catch (error) {
        log.error("[sow/scan] POST error:", error);
        return NextResponse.json(
            { error: "Failed to scan document" },
            { status: 500 }
        );
    }
}
