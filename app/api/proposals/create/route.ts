import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { calculateProposalAudit, ScreenInput } from "@/lib/estimator";
import { logActivity } from "@/services/proposal/server/activityLogService";
import { provisionProjectWorkspace } from "@/lib/anything-llm";

export interface CreateProposalRequest {
  workspaceId: string;
  clientName: string;
  // accept screens in the same shape as ScreenInput but allow legacy names
  screens: Array<Partial<ScreenInput> & {
    name: string;
    // legacy fields still accepted:
    pixelPitch?: number; // mm
    width?: number; // ft
    height?: number; // ft
    isOutdoor?: boolean;
  }>;
}

/**
 * POST /api/proposals/create
 * Creates a new proposal with screen configurations and cost line items
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateProposalRequest = await request.json();

    // Validate required fields
    if (!body.workspaceId || !body.clientName || !body.screens) {
      return NextResponse.json(
        { error: "Missing required fields: workspaceId, clientName, or screens" },
        { status: 400 }
      );
    }

    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: body.workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Resolve current user for Created By tracking
    const session = await auth();
    const userId = session?.user?.email
      ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id
      : null;

    // Convert incoming screens to the estimator's ScreenInput shape
    const screenInputs: ScreenInput[] = body.screens.map((s) => ({
      name: s.name,
      productType: s.productType ?? "Unknown",
      heightFt: (s.height ?? s.heightFt) ?? 0,
      widthFt: (s.width ?? s.widthFt) ?? 0,
      quantity: s.quantity ?? 1,
      pitchMm: (s.pixelPitch ?? s.pitchMm) ?? undefined,
      costPerSqFt: s.costPerSqFt,
      desiredMargin: s.desiredMargin,
      serviceType: s.serviceType,
      formFactor: s.formFactor,
      outletDistance: s.outletDistance,
    }));

    // Run deterministic audit for all screens (includes client summary + internal audit)
    const audit = calculateProposalAudit(screenInputs);

    // Create the proposal with nested screens and line items based on audit (persisting audit JSON)
    const proposal = await prisma.proposal.create({
      data: {
        workspaceId: body.workspaceId,
        clientName: body.clientName,
        status: "DRAFT",
        ...(userId ? { createdByUserId: userId } : {}),
        internalAudit: JSON.stringify(audit.internalAudit),
        clientSummary: JSON.stringify(audit.clientSummary),
        screens: {
          create: await Promise.all(
            audit.internalAudit.perScreen.map(async (screenAudit, idx) => {
              const input = screenInputs[idx];
              const desiredMargin = input.desiredMargin ?? 0.25;

              // Build line items
              const li = screenAudit.breakdown;
              const lineItemsData = [
                { category: "Hardware", cost: Number(li.hardware), margin: Number(desiredMargin), price: roundToCents(li.hardware * (1 + desiredMargin)) },
                { category: "Structure", cost: Number(li.structure), margin: Number(desiredMargin), price: roundToCents(li.structure * (1 + desiredMargin)) },
                { category: "Install", cost: Number(li.install), margin: Number(desiredMargin), price: roundToCents(li.install * (1 + desiredMargin)) },
                { category: "Power", cost: Number(li.power), margin: Number(desiredMargin), price: roundToCents(li.power * (1 + desiredMargin)) },
                { category: "Shipping", cost: Number(li.shipping), margin: Number(desiredMargin), price: roundToCents(li.shipping * (1 + desiredMargin)) },
                { category: "Labor", cost: Number(li.labor), margin: Number(desiredMargin), price: roundToCents(li.labor * (1 + desiredMargin)) },
                { category: "PM", cost: Number(li.pm), margin: Number(desiredMargin), price: roundToCents(li.pm * (1 + desiredMargin)) },
                { category: "General Conditions", cost: Number(li.generalConditions), margin: Number(desiredMargin), price: roundToCents(li.generalConditions * (1 + desiredMargin)) },
                { category: "Travel", cost: Number(li.travel), margin: Number(desiredMargin), price: roundToCents(li.travel * (1 + desiredMargin)) },
                { category: "Submittals", cost: Number(li.submittals), margin: Number(desiredMargin), price: roundToCents(li.submittals * (1 + desiredMargin)) },
                { category: "Engineering", cost: Number(li.engineering), margin: Number(desiredMargin), price: roundToCents(li.engineering * (1 + desiredMargin)) },
                { category: "Permits", cost: Number(li.permits), margin: Number(desiredMargin), price: roundToCents(li.permits * (1 + desiredMargin)) },
                { category: "CMS", cost: Number(li.cms), margin: Number(desiredMargin), price: roundToCents(li.cms * (1 + desiredMargin)) },
                { category: "Bond", cost: Number(li.bondCost), margin: 0, price: Number(li.bondCost) },
                { category: "ANC Margin", cost: 0, margin: 0, price: Number(li.ancMargin) },
              ];

              return {
                name: screenAudit.name,
                pixelPitch: input.pitchMm ?? 0,
                width: input.widthFt ?? 0,
                height: input.heightFt ?? 0,
                lineItems: {
                  create: lineItemsData.map(li => ({
                    category: li.category,
                    cost: li.cost,
                    margin: li.margin,
                    price: li.price,
                  })),
                },
              };
            })
          ),
        },
      },
      include: {
        screens: {
          include: {
            lineItems: true,
          },
        },
      },
    });

    // Log project creation
    logActivity(
      proposal.id,
      "created",
      `Project created for ${body.clientName} with ${body.screens.length} screen(s)`,
      null,
      { clientName: body.clientName, screenCount: body.screens.length },
    ).catch((err) => console.error("[Proposals/Create] Activity log failed:", err));

    // Provision dedicated AnythingLLM workspace (non-blocking)
    provisionProjectWorkspace(body.clientName, proposal.id).then(async (slug) => {
      if (!slug) return;
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: { aiWorkspaceSlug: slug },
      });
    }).catch((e) => console.error("[Proposals/Create] AI provisioning failed:", e));

    return NextResponse.json(
      {
        success: true,
        proposal,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating proposal:", error);
    return NextResponse.json(
      { error: "Failed to create proposal", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

function roundToCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
