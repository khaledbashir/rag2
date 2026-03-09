import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autoRfpFromWorkspace, autoRfpFromText } from "@/services/rfp/autoRfpResponse";
import { log } from "@/lib/logger";

/**
 * POST /api/rfp/auto-response
 *
 * Auto-RFP Response: AI reads the RFP, extracts every screen requirement,
 * matches products, and returns pre-filled EstimatorAnswers.
 *
 * Accepts one of:
 *   { proposalId }     — reads workspace slug from proposal DB record
 *   { workspaceSlug }  — query a specific AnythingLLM workspace directly
 *   { text }           — extract from raw text (for testing or PDF filter output)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { proposalId, workspaceSlug, text } = body as {
            proposalId?: string;
            workspaceSlug?: string;
            text?: string;
        };

        // Direct text extraction
        if (text && text.length > 0) {
            log.info(`[Auto-RFP] Direct text extraction (${text.length} chars)`);
            const result = await autoRfpFromText(text, workspaceSlug);
            return NextResponse.json({
                ok: true,
                ...result,
                rawAiResponse: undefined, // Don't leak full AI response to client
            });
        }

        // Resolve workspace slug from proposal
        let slug = workspaceSlug;
        if (!slug && proposalId) {
            const proposal = await prisma.proposal.findUnique({
                where: { id: proposalId },
                select: { aiWorkspaceSlug: true, clientName: true, venue: true },
            });
            if (!proposal) {
                return NextResponse.json({ ok: false, error: "Proposal not found" }, { status: 404 });
            }
            slug = proposal.aiWorkspaceSlug || undefined;
            if (!slug) {
                return NextResponse.json({
                    ok: false,
                    error: "No AnythingLLM workspace linked to this proposal. Upload an RFP first.",
                }, { status: 400 });
            }
        }

        if (!slug) {
            return NextResponse.json({
                ok: false,
                error: "Provide proposalId, workspaceSlug, or text",
            }, { status: 400 });
        }

        log.info(`[Auto-RFP] Workspace extraction: ${slug}`);
        const result = await autoRfpFromWorkspace(slug);

        return NextResponse.json({
            ok: true,
            project: result.project,
            screens: result.screens,
            estimatorAnswers: result.estimatorAnswers,
            matchReport: result.matchReport,
            extractionMethod: result.extractionMethod,
        });
    } catch (error: any) {
        log.error("[Auto-RFP] Error:", error);
        return NextResponse.json({
            ok: false,
            error: error?.message || "Auto-RFP extraction failed",
        }, { status: 500 });
    }
}
