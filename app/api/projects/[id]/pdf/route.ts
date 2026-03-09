import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapDbProposalToFormSchema } from "@/lib/proposals/mapDbProposalToForm";
import { generateProposalPdfServiceV2 } from "@/services/proposal/server/generateProposalPdfServiceV2";
import { log } from "@/lib/logger";

function safeFilenamePart(value: string): string {
    return value
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 80);
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const project = await prisma.proposal.findUnique({
            where: { id },
            include: {
                screens: {
                    include: { lineItems: true },
                },
            },
        });

        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const formPayload = mapDbProposalToFormSchema(project);
        
        // Create a mock request to call the PDF service directly
        // This avoids the internal HTTP fetch which can fail in some environments
        const mockReq = new NextRequest("http://localhost/api/proposals/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formPayload),
        });
        
        const pdfResponse = await generateProposalPdfServiceV2(mockReq);
        
        // Check if the response is an error (non-200 status or JSON content type)
        if (pdfResponse.status !== 200) {
            const errorBody = await pdfResponse.json().catch(() => ({ error: "Unknown error" }));
            log.error("PDF generation failed:", errorBody);
            return NextResponse.json(
                {
                    error: typeof errorBody?.error === "string" ? errorBody.error : "We couldn't generate this PDF right now.",
                    guidance: Array.isArray(errorBody?.guidance) ? errorBody.guidance : undefined,
                },
                { status: pdfResponse.status }
            );
        }
        
        // Get the PDF bytes
        const bytes = await pdfResponse.arrayBuffer();
        
        // Verify we got actual PDF content
        if (bytes.byteLength === 0) {
            return NextResponse.json(
                { error: "Generated PDF is empty" },
                { status: 500 }
            );
        }

        const now = new Date();
        const datePart = `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}`;
        const clientPart = safeFilenamePart(project.clientName || "Project");
        const filename = `ANC_${clientPart}_${project.documentMode}_${datePart}.pdf`;

        return new NextResponse(bytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-cache",
            },
        });
    } catch (error: any) {
        log.error("POST /api/projects/[id]/pdf error:", error);
        return NextResponse.json(
            { error: "Failed to export PDF", details: error?.message || String(error) },
            { status: 500 }
        );
    }
}
