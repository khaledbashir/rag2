import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { provisionProjectWorkspace } from "@/lib/anything-llm";
import { findClientLogo } from "@/lib/brand-discovery";
import { ensureAnythingLlmUser, assignWorkspaceToUser } from "@/services/anythingllm/userProvisioner";
import { log } from "@/lib/logger";
import { resolveProposalTitle } from "@/lib/proposals/resolveProposalTitle";

export interface CreateWorkspaceRequest {
  name: string;
  userEmail: string;
  createInitialProposal?: boolean;
  clientName?: string;
  enableKnowledgeBase?: boolean;
  calculationMode?: "MIRROR" | "STRATEGIC" | "ESTIMATE";
  excelData?: {
    screens?: any[];
    receiverName?: string;
    proposalName?: string;
    internalAudit?: any;
    pricingDocument?: any;
    marginAnalysis?: any;
    pricingMode?: string;
    parserValidationReport?: any;
    sourceWorkbookHash?: string;
    parserStrictVersion?: string;
    clientSummary?: any;
  };
}

/**
 * POST /api/workspaces/create
 * Creates a new workspace and an initial project (proposal)
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateWorkspaceRequest = await request.json();

    // 1. DATA VALIDATION
    if (!body.name || !body.userEmail) {
      return NextResponse.json(
        { error: "MISSION CRITICAL: Project Name and User Identity are required." },
        { status: 400 }
      );
    }

    // NEW: Auto-discover client logo (Consultant Quick Win)
    const projectTitle = resolveProposalTitle(
      body.excelData?.proposalName,
      body.clientName,
      body.excelData?.receiverName,
      body.name,
    );
    const clientNameForLogo = resolveProposalTitle(
      body.excelData?.receiverName,
      body.clientName,
      body.name,
      projectTitle,
    );
    const clientLogo = await findClientLogo(clientNameForLogo);

    // 2. PROJECT VAULT PERSISTENCE (Bulletproof)
    const workspace = await prisma.workspace.create({
      data: {
        name: projectTitle,
        clientLogo, // Store found logo
        users: {
          connectOrCreate: {
            where: { email: body.userEmail },
            create: { email: body.userEmail },
          },
        },
      },
    });

    let proposal: any = null;
    // Prompt 52: Diagnostic logging for project persistence
    log.info("[WORKSPACE/CREATE] Received:", {
      name: body.name,
      clientName: body.clientName,
      hasExcelData: !!body.excelData,
      screenCount: body.excelData?.screens?.length ?? 0,
      hasInternalAudit: !!body.excelData?.internalAudit,
      internalAuditKeys: body.excelData?.internalAudit ? Object.keys(body.excelData.internalAudit) : [],
      hasPricingDocument: !!body.excelData?.pricingDocument,
      hasClientSummary: !!body.excelData?.clientSummary,
      hasMarginAnalysis: !!body.excelData?.marginAnalysis,
    });
    // Resolve LOGGED-IN user for Created By (not body.userEmail which is the client contact)
    const session = await auth();
    const creatorUser = session?.user?.email
      ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      : null;

    if (body.createInitialProposal) {
      proposal = await prisma.proposal.create({
        data: {
          workspaceId: workspace.id,
          clientName: projectTitle,
          clientLogo, // Store found logo here too
          status: "DRAFT",
          ...(creatorUser ? { createdByUserId: creatorUser.id } : {}),
          calculationMode: body.calculationMode === "MIRROR" ? "MIRROR" : body.calculationMode === "ESTIMATE" ? "ESTIMATE" : "INTELLIGENCE",
          internalAudit: body.excelData?.internalAudit ? JSON.stringify(body.excelData.internalAudit) : undefined,
          clientSummary: body.excelData?.clientSummary ? JSON.stringify(body.excelData.clientSummary) : undefined,
          pricingDocument: body.excelData?.pricingDocument || undefined,
          marginAnalysis: body.excelData?.marginAnalysis || undefined,
          parserValidationReport: body.excelData?.parserValidationReport || undefined,
          sourceWorkbookHash: body.excelData?.sourceWorkbookHash || undefined,
          parserStrictVersion: body.excelData?.parserStrictVersion || undefined,
          pricingMode: body.excelData?.pricingMode || undefined,
          screens: body.excelData?.screens ? {
            create: body.excelData.screens.map((screen: any) => ({
              name: screen.name || "Unnamed Screen",
              externalName: screen.externalName || null,
              group: screen.group || null,
              pixelPitch: Number(screen.pixelPitch || screen.pitchMm || 10),
              width: Number(screen.width || screen.widthFt || 0),
              height: Number(screen.height || screen.heightFt || 0),
              lineItems: {
                create: (screen.lineItems || []).map((li: any) => ({
                  category: li.category || "Other",
                  cost: Number(li.cost || 0),
                  margin: Number(li.margin || 0),
                  price: Number(li.price || 0),
                }))
              }
            }))
          } : undefined
        },
        include: {
          screens: {
            include: { lineItems: true }
          }
        }
      });
    }

    // 3. KNOWLEDGE BASE PROVISIONING (non-blocking, opt-in)
    const enableKB = body.enableKnowledgeBase !== false; // default true for backwards compat
    if (enableKB) {
    provisionProjectWorkspace(body.name, workspace.id).then(async (slug) => {
      if (!slug) return;

      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { aiWorkspaceSlug: slug },
      });

      if (proposal) {
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: { aiWorkspaceSlug: slug },
        });
      }

      // Assign workspace to the creating user's AnythingLLM account
      const user = await prisma.user.findUnique({
        where: { email: body.userEmail },
        select: { id: true, anythingLlmUserId: true },
      });
      if (user) {
        const almId = user.anythingLlmUserId ?? await ensureAnythingLlmUser(user.id, body.userEmail);
        if (almId) await assignWorkspaceToUser(slug, almId);
      }
    }).catch((e) => log.error("[Workspace/Create] Knowledge Base provisioning failed:", e));
    } else {
      log.info("[Workspace/Create] Knowledge Base disabled by user — skipping AI provisioning");
    }

    // 4. STRATEGIC HANDOFF
    return NextResponse.json(
      {
        success: true,
        workspace,
        proposal,
      },
      { status: 201 }
    );
  } catch (error) {
    log.error("CRITICAL VAULT FAILURE:", error);
    return NextResponse.json(
      {
        error: "Database Persistence Failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
