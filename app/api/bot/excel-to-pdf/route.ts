import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateBotToken } from "../auth";
import { parsePricingTablesWithValidation, PRICING_PARSER_STRICT_VERSION } from "@/services/pricing/pricingTableParser";
import { mapDbProposalToFormSchema } from "@/lib/proposals/mapDbProposalToForm";
import { generateProposalPdfServiceV2 } from "@/services/proposal/server/generateProposalPdfServiceV2";
import * as xlsx from "xlsx";
import crypto from "node:crypto";

function safeFilenamePart(value: string): string {
    return value
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 80);
}

async function fetchFileFromUrl(url: string): Promise<{ buffer: Buffer; filename: string }> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch file from URL: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const urlPath = new URL(url).pathname;
    const filename = urlPath.split("/").pop() || "uploaded.xlsx";
    return { buffer, filename };
}

export async function POST(req: NextRequest) {
    const authError = validateBotToken(req);
    if (authError) return authError;

    let buffer: Buffer;
    let filename: string;
    let documentMode: "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT" = "BUDGET";
    let returnFormat: "pdf" | "url" = "pdf";

    try {
        const contentType = req.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file") as File | null;
            if (!file) {
                return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
            }
            buffer = Buffer.from(await file.arrayBuffer());
            filename = file.name;
            documentMode = (formData.get("document_mode") as "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT") || "BUDGET";
            returnFormat = (formData.get("return_format") as "pdf" | "url") || "pdf";
        } else if (contentType.includes("application/json")) {
            const body = await req.json();
            
            if (body.file_url) {
                const result = await fetchFileFromUrl(body.file_url);
                buffer = result.buffer;
                filename = result.filename;
            } else if (body.base64_data) {
                buffer = Buffer.from(body.base64_data, "base64");
                filename = body.filename || "uploaded.xlsx";
            } else {
                return NextResponse.json({ 
                    error: "Provide either 'file_url' or 'base64_data' in JSON body" 
                }, { status: 400 });
            }
            
            documentMode = body.document_mode || "BUDGET";
            returnFormat = body.return_format || "pdf";
        } else {
            return NextResponse.json({ 
                error: "Unsupported content type. Use multipart/form-data or application/json" 
            }, { status: 400 });
        }

        if (!filename.toLowerCase().endsWith(".xlsx") && !filename.toLowerCase().endsWith(".xls")) {
            return NextResponse.json({ 
                error: "File must be an Excel file (.xlsx or .xls)" 
            }, { status: 400 });
        }

        const workbook = xlsx.read(buffer, { type: "buffer", cellStyles: true });
        const sourceWorkbookHash = crypto.createHash("sha256").update(buffer).digest("hex");

        const { document: pricingDocument, validation } = parsePricingTablesWithValidation(workbook, filename, {
            strict: true,
            sourceWorkbookHash,
        });

        if (validation.status === "FAIL" || !pricingDocument) {
            return NextResponse.json({
                error: "Failed to parse pricing tables from Excel",
                details: validation.errors,
                help: [
                    "Ensure the workbook has a valid 'Margin Analysis' sheet",
                    "Check that columns include Description, Cost, and Selling Price",
                ],
            }, { status: 422 });
        }

        const tables = pricingDocument.tables;
        const firstTableName = tables.length > 0 ? tables[0].name : null;
        
        const extractClientNameFromFilename = (fn: string): string => {
            let base = fn.replace(/\.xlsx?$/i, "");
            base = base.replace(/^Copy[_ ]of[_ ]/i, "");
            base = base.replace(/^Cost[_ ]Analysis[_ ][-–—][_ ]/i, "");
            base = base.replace(/^anc[_ ](x[_ ])?/i, "");
            base = base.replace(/[_ ](LED[_ ]Displays?|LED|LCD|Budget|Proposal|LOI|Quotation|Estimate)[_ ]?.*/i, "");
            base = base.replace(/[_ -]*\d{4}[-/._]\d{1,2}[-/._]\d{1,2}[_ -]*/g, "");
            base = base.replace(/[_ -]*\d{1,2}[-/._]\d{1,2}[-/._]\d{2,4}[_ -]*/g, "");
            base = base.replace(/\s*\(\d+\)\s*/g, "");
            base = base.replace(/_/g, " ");
            base = base.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "").trim();
            if (base.length < 2 || /^\d+$/.test(base)) return "Unknown Client";
            return base;
        };
        
        const clientName = firstTableName || extractClientNameFromFilename(filename);
        const grandTotal = pricingDocument.documentTotal || 0;

        const agentUser = await prisma.user.upsert({
            where: { email: "bot@ancsports.com" },
            update: {},
            create: { email: "bot@ancsports.com", name: "Slack Bot" },
        });

        const workspace = await prisma.workspace.create({
            data: {
                name: `Bot Import - ${clientName}`,
                users: { connect: { id: agentUser.id } },
            },
        });

        const proposal = await prisma.proposal.create({
            data: {
                workspaceId: workspace.id,
                clientName,
                status: "DRAFT",
                calculationMode: "MIRROR",
                createdByUserId: agentUser.id,
                documentMode,
                pricingMode: "MIRROR",
                mirrorMode: true,
                pricingDocument: pricingDocument as any,
                parserValidationReport: validation as any,
                sourceWorkbookHash,
                parserStrictVersion: PRICING_PARSER_STRICT_VERSION,
                source: "bot_excel_to_pdf",
            },
        });

        console.log(`[BOT] Created proposal ${proposal.id} for "${clientName}" — ${pricingDocument.tables.length} tables, $${grandTotal.toLocaleString()}`);

        if (returnFormat === "url") {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://basheer-natalia.prd42b.easypanel.host";
            const projectUrl = `${baseUrl}/projects/${proposal.id}`;
            const pdfUrl = `${baseUrl}/api/projects/${proposal.id}/pdf`;

            return NextResponse.json({
                success: true,
                proposal_id: proposal.id,
                client_name: clientName,
                document_mode: documentMode,
                grand_total: grandTotal,
                tables_count: pricingDocument.tables.length,
                project_url: projectUrl,
                pdf_download_url: pdfUrl,
                message: `PDF ready. Download from: ${pdfUrl}`,
            });
        }

        const fullProposal = await prisma.proposal.findUnique({
            where: { id: proposal.id },
            include: {
                screens: { include: { lineItems: true } },
            },
        });

        if (!fullProposal) {
            return NextResponse.json({ error: "Proposal not found after creation" }, { status: 500 });
        }

        const formPayload = mapDbProposalToFormSchema(fullProposal);

        const mockReq = new NextRequest("http://localhost/api/proposals/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formPayload),
        });

        const pdfResponse = await generateProposalPdfServiceV2(mockReq);

        if (pdfResponse.status !== 200) {
            const errorBody = await pdfResponse.json().catch(() => ({ error: "Unknown PDF error" }));
            return NextResponse.json({
                error: "PDF generation failed",
                details: errorBody,
            }, { status: pdfResponse.status });
        }

        const pdfBytes = await pdfResponse.arrayBuffer();

        if (pdfBytes.byteLength === 0) {
            return NextResponse.json({ error: "Generated PDF is empty" }, { status: 500 });
        }

        const now = new Date();
        const datePart = `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}`;
        const clientPart = safeFilenamePart(clientName);
        const pdfFilename = `ANC_${clientPart}_${documentMode}_${datePart}.pdf`;

        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${pdfFilename}"`,
                "Cache-Control": "no-cache",
                "X-Proposal-Id": proposal.id,
                "X-Client-Name": clientName,
                "X-Grand-Total": String(grandTotal),
            },
        });

    } catch (error: any) {
        console.error("[BOT] excel-to-pdf error:", error);
        return NextResponse.json({
            error: "Failed to process Excel file",
            details: error?.message || String(error),
        }, { status: 500 });
    }
}
