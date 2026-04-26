import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/proposal/server/activityLogService";
import { universalCrmPush } from "@/services/integrations/twenty/crmAutomation";
import { log } from "@/lib/logger";

/**
 * Map client-side activity action strings to the universalCrmPush actionType
 * union. Only actions we want to mirror to CRM are listed; anything else is
 * a no-op (returns null) so unrelated activity logs don't trigger CRM pushes.
 */
function actionToCrmType(action: string): "pdf_exported" | "excel_uploaded" | "sow_generated" | "rfp_analyzed" | null {
    switch (action) {
        case "pdf_exported": return "pdf_exported";
        case "excel_imported":
        case "excel_exported": return "excel_uploaded";
        case "sow_generated":
        case "premium_sow_generated":
        case "installation_sow_generated": return "sow_generated";
        case "rfp_analyzed": return "rfp_analyzed";
        default: return null;
    }
}

/**
 * GET /api/projects/[id]/activities
 * Fetch activity log for a proposal (reverse-chronological, max 50)
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const activities = await prisma.activityLog.findMany({
            where: { proposalId: id },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
                id: true,
                action: true,
                description: true,
                actor: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ activities });
    } catch (error) {
        log.error("GET /api/projects/[id]/activities error:", error);
        return NextResponse.json(
            { error: "Failed to fetch activities" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/projects/[id]/activities
 * Log an activity (e.g., from client-side after PDF export)
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const body = await req.json();
        const { action, description, actor, metadata } = body;

        if (!action || !description) {
            return NextResponse.json(
                { error: "action and description are required" },
                { status: 400 }
            );
        }

        await logActivity(id, action, description, actor, metadata);

        // Mirror to Twenty CRM as a Note + Activity, and run any registered
        // workflows (e.g. pdf_exported → Opp.bidStatus = BID_SUBMITTED).
        // Fire-and-forget: any failure logs but never affects the response.
        const crmActionType = actionToCrmType(action);
        if (crmActionType) {
            const fileName = (metadata as any)?.fileName;
            const titleSuffix = fileName ? ` (${fileName})` : "";
            universalCrmPush({
                proposalId: id,
                actionType: crmActionType,
                title: `Proposal Engine: ${description}`,
                markdownText: `${description}${titleSuffix}`,
                workspaceMemberEmail: typeof actor === "string" ? null : null,
            }).catch((err) => log.warn("[activities] CRM push failed:", err?.message || err));
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        log.error("POST /api/projects/[id]/activities error:", error);
        return NextResponse.json(
            { error: "Failed to log activity" },
            { status: 500 }
        );
    }
}
