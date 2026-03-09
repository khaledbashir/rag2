import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { parseANCExcel } from "@/services/proposal/server/excelImportService";
import { parsePricingTablesWithValidation, PRICING_PARSER_STRICT_VERSION } from "@/services/pricing/pricingTableParser";
import { normalizeExcel } from "@/services/import/excelNormalizer";
import * as xlsx from "xlsx";
import crypto from "node:crypto";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // --- Step 1: Try Intelligence Mode parser (full LED Sheet extraction) ---
        let data: any = null;
        let intelligenceError: Error | null = null;
        try {
            data = await parseANCExcel(buffer, file.name);
        } catch (err) {
            intelligenceError = err instanceof Error ? err : new Error(String(err));
            console.warn("[EXCEL IMPORT] Intelligence parser skipped:", intelligenceError.message);
        }

        // --- Step 2: Always try PricingTable parser (Mirror Mode) ---
        const workbook = xlsx.read(buffer, { type: "buffer", cellStyles: true });
        const sourceWorkbookHash = crypto.createHash("sha256").update(buffer).digest("hex");
        let pricingDocument: any = null;
        let validation: any = null;
        try {
            const result = parsePricingTablesWithValidation(workbook, file.name, {
                strict: true,
                sourceWorkbookHash,
            });
            pricingDocument = result.document;
            validation = result.validation;
        } catch (pricingErr) {
            Sentry.captureException(pricingErr, { tags: { area: "pricingTableParser" } });
            console.warn("[EXCEL IMPORT] PricingTable parser warning:", pricingErr);
        }

        // --- Step 3: Handle results ---

        // Case A: Intelligence parser succeeded — enrich with pricing data
        if (data) {
            if (pricingDocument && pricingDocument.tables.length > 0 && data.formData?.details) {
                (data.formData.details as any).pricingDocument = pricingDocument;
                (data.formData.details as any).parserValidationReport = validation;
                (data.formData.details as any).parserStrictVersion = PRICING_PARSER_STRICT_VERSION;
                (data.formData.details as any).sourceWorkbookHash = sourceWorkbookHash;

                // REQ-127: Backfill screen.group if missing by correlating with Pricing Tables
                const screens = (data.formData.details.screens as any[]) || [];
                const tables = pricingDocument.tables;
                const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();

                screens.forEach((screen: any) => {
                    if (!screen.group) {
                        const sName = norm(screen.name);
                        const match = tables.find((t: any) => {
                            const tName = norm(t.name);
                            return tName.includes(sName) || sName.includes(tName);
                        });
                        if (match) {
                            screen.group = match.name;
                            console.log(`[EXCEL IMPORT] Backfilled group for screen "${screen.name}" -> "${match.name}"`);
                        }
                    }
                });

                console.log(`[EXCEL IMPORT] PricingDocument: ${pricingDocument.tables.length} tables, ${pricingDocument.documentTotal} total`);
                (data as any).validation = validation;
            } else if (validation?.status === "FAIL" || !pricingDocument) {
                // Use the actual parser errors so users know exactly what went wrong
                const parserErrors: string[] = validation?.errors || [];
                const respCandidates = validation?.evidence?.respMatrixSheetCandidates || [];
                const hasRespHint = respCandidates.length > 0 || parserErrors.some((e: string) => /resp matrix/i.test(e));

                let message: string;
                if (hasRespHint) {
                    message = "We couldn't read the Responsibility Matrix from this Excel. If your file includes one, make sure the sheet name starts with 'Resp Matrix' and includes ANC/Purchaser columns.";
                } else if (parserErrors.length > 0) {
                    // Show the actual parser error — it now contains specific diagnostics
                    message = parserErrors[0];
                } else {
                    message = "Parser could not extract pricing data from this file.";
                }

                return NextResponse.json({
                    error: message,
                    parserErrors,
                    detectedSheet: validation?.evidence?.marginSheetDetected || null,
                    help: [
                        "The file must have a 'Margin Analysis' tab.",
                        "That tab needs 'Cost' and/or 'Selling Price' column headers.",
                        "If this is a different template format, use the Column Mapper after upload.",
                    ],
                }, { status: 422 });
            }

            return NextResponse.json(data);
        }

        // Case B: Intelligence parser failed but Mirror Mode (pricingTableParser) succeeded
        // This handles simple cost-analysis-only files (e.g. CAA ICON single-product proposals)
        if (pricingDocument && pricingDocument.tables.length > 0 && validation?.status !== "FAIL") {
            console.log(`[EXCEL IMPORT] Mirror-only mode: ${pricingDocument.tables.length} tables, ${pricingDocument.documentTotal} total`);

            // Build a minimal formData envelope so the frontend can hydrate the proposal
            const minimalData = {
                formData: {
                    details: {
                        proposalName: pricingDocument.projectName || file.name.replace(/\.(xlsx?|csv)$/i, ""),
                        screens: [],
                        items: [],
                        pricingDocument,
                        parserValidationReport: validation,
                        parserStrictVersion: PRICING_PARSER_STRICT_VERSION,
                        sourceWorkbookHash,
                        calculationMode: "MIRROR",
                        mirrorMode: true,
                    },
                    receiver: {
                        name: pricingDocument.projectName || "",
                    },
                },
                validation,
                mirrorModeOnly: true,
            };

            return NextResponse.json(minimalData);
        }

        // Case C: Both parsers failed — try the Frankenstein normalizer as fallback
        console.warn("[EXCEL IMPORT] Both parsers failed, trying normalizer. Intelligence error:", intelligenceError?.message);
        try {
            const fallbackFormData = await req.clone().formData();
            const fallbackFile = fallbackFormData.get("file") as File;
            if (fallbackFile) {
                const fallbackBuffer = Buffer.from(await fallbackFile.arrayBuffer());
                const normResult = await normalizeExcel(fallbackBuffer, fallbackFile.name);

                if (normResult.status === "success") {
                    return NextResponse.json({
                        ...normResult,
                        normalizedImport: true,
                    });
                }

                return NextResponse.json({
                    ...normResult,
                    normalizedImport: true,
                    originalError: String(intelligenceError),
                }, { status: 202 });
            }
        } catch (normErr) {
            Sentry.captureException(normErr, { tags: { area: "excelNormalizerFallback" } });
            console.error("[EXCEL IMPORT] Normalizer fallback also failed:", normErr);
        }

        // All parsers failed
        const finalErr = intelligenceError || new Error("All parsers failed");
        Sentry.captureException(finalErr, { tags: { area: "excelImport" } });
        console.error("Excel import error:", finalErr);
        return NextResponse.json({ error: String(finalErr) }, { status: 500 });
    } catch (err) {
        Sentry.captureException(err, { tags: { area: "excelImport" } });
        console.error("Excel import unexpected error:", err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
