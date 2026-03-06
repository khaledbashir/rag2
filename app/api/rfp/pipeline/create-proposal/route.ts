/**
 * POST /api/rfp/pipeline/create-proposal
 *
 * Bridge: RFP Analysis → Proposal
 *
 * Takes an RfpAnalysis ID, creates a workspace + proposal with
 * all extracted LED specs pre-filled as ScreenConfigs with full
 * cost breakdowns from the estimator.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateProposalAudit, ScreenInput } from "@/lib/estimator";
import { findClientLogo } from "@/lib/brand-discovery";
import { provisionProjectWorkspace } from "@/lib/anything-llm";
import { logActivity } from "@/services/proposal/server/activityLogService";

export const maxDuration = 60;

interface CreateFromRfpRequest {
  analysisId: string;
  userEmail: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateFromRfpRequest = await request.json();

    if (!body.analysisId || !body.userEmail) {
      return NextResponse.json(
        { error: "Missing analysisId or userEmail" },
        { status: 400 },
      );
    }

    // 1. Load the RFP analysis
    const analysis = await prisma.rfpAnalysis.findUnique({
      where: { id: body.analysisId },
    });

    if (!analysis) {
      return NextResponse.json(
        { error: "RFP Analysis not found" },
        { status: 404 },
      );
    }

    const screens = (analysis.screens as any[]) || [];
    const project = (analysis.project as any) || {};

    if (screens.length === 0) {
      return NextResponse.json(
        { error: "No LED displays found in this analysis" },
        { status: 400 },
      );
    }

    console.log(`[create-proposal] Processing ${screens.length} screens from analysis ${body.analysisId}`);

    // 2. Transform ExtractedLEDSpec[] → ScreenInput[]
    const screenInputs: ScreenInput[] = screens.map((spec: any) => ({
      name: spec.name || "Unnamed Display",
      productType: spec.environment === "outdoor" ? "Outdoor LED" : "Indoor LED",
      widthFt: spec.widthFt ?? spec.width_ft ?? 0,
      heightFt: spec.heightFt ?? spec.height_ft ?? 0,
      quantity: spec.quantity ?? 1,
      pitchMm: spec.pixelPitchMm ?? spec.pixel_pitch_mm ?? undefined,
      serviceType: spec.serviceType ?? spec.service_type ?? undefined,
      desiredMargin: 0.25,
    }));

    // 3. Run cost estimator
    console.log("[create-proposal] Running cost estimator...");
    let audit;
    try {
      audit = calculateProposalAudit(screenInputs);
    } catch (auditErr: any) {
      console.error("[create-proposal] Estimator failed:", auditErr);
      return NextResponse.json(
        { error: `Cost estimator failed: ${auditErr.message}` },
        { status: 500 },
      );
    }
    console.log(`[create-proposal] Estimator produced ${audit.internalAudit.perScreen.length} screen audits`);

    // 4. Determine project metadata
    const clientName = project.clientName || project.client_name || analysis.clientName || "New Client";
    const projectName = project.projectName || project.project_name || analysis.projectName || `${clientName} LED Project`;
    const venue = project.venue || analysis.venue || null;
    const location = project.location || analysis.location || null;

    // 5. Find client logo + resolve user for Created By
    const clientLogo = await findClientLogo(clientName);
    const creatorUser = await prisma.user.findUnique({
      where: { email: body.userEmail },
      select: { id: true },
    });

    // 6. Create workspace
    console.log("[create-proposal] Creating workspace...");
    const workspace = await prisma.workspace.create({
      data: {
        name: projectName,
        clientLogo,
        users: {
          connectOrCreate: {
            where: { email: body.userEmail },
            create: { email: body.userEmail },
          },
        },
      },
    });

    // 7. Build pricingDocument from estimator output so Excel export gets per-section layout
    const pricingDocTables = audit.internalAudit.perScreen.map((sa: any, idx: number) => {
      const b = sa.breakdown || {};
      const desiredMargin = screenInputs[idx]?.desiredMargin ?? 0.25;
      const categories = [
        { label: "Hardware", cost: b.hardware },
        { label: "Structure", cost: b.structure },
        { label: "Install", cost: b.install },
        { label: "Power", cost: b.power },
        { label: "Shipping", cost: b.shipping },
        { label: "Labor", cost: b.labor },
        { label: "PM", cost: b.pm },
        { label: "General Conditions", cost: b.generalConditions },
        { label: "Travel", cost: b.travel },
        { label: "Submittals", cost: b.submittals },
        { label: "Engineering", cost: b.engineering },
        { label: "Permits", cost: b.permits },
        { label: "CMS", cost: b.cms },
      ].filter((c) => Number(c.cost) > 0);

      const items = categories.map((c) => {
        const cost = Number(c.cost) || 0;
        const sell = round(cost / (1 - desiredMargin));
        return { description: c.label, sellingPrice: sell, cost, isIncluded: false };
      });

      const subtotal = items.reduce((sum, i) => sum + i.sellingPrice, 0);
      const bondCost = Number(b.bondCost) || 0;
      return {
        id: `table-${idx}-${(sa.name || "screen").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
        name: sa.name || `Display ${idx + 1}`,
        currency: "USD",
        items,
        subtotal,
        tax: null,
        bond: bondCost,
        tariff: 0,
        grandTotal: subtotal + bondCost,
        alternates: [],
      };
    });

    const docTotal = pricingDocTables.reduce((sum: number, t: any) => sum + (t.grandTotal || 0), 0);
    const builtPricingDocument = {
      tables: pricingDocTables,
      mode: "CALCULATED",
      sourceSheet: "RFP Estimator",
      currency: "USD",
      documentTotal: docTotal,
      metadata: {
        importedAt: new Date().toISOString(),
        fileName: analysis.filename || "rfp-analysis",
        tablesCount: pricingDocTables.length,
        itemsCount: pricingDocTables.reduce((sum: number, t: any) => sum + (t.items?.length || 0), 0),
        alternatesCount: 0,
      },
    };

    // 8. Create proposal (without screens first — add them after)
    console.log("[create-proposal] Creating proposal...");
    const proposal = await prisma.proposal.create({
      data: {
        workspaceId: workspace.id,
        clientName,
        clientLogo,
        venue,
        clientAddress: location,
        status: "DRAFT",
        calculationMode: "INTELLIGENCE",
        ...(creatorUser ? { createdByUserId: creatorUser.id } : {}),
        source: "rfp_analysis",
        embeddingStatus: "complete",
        aiWorkspaceSlug: analysis.aiWorkspaceSlug,
        internalAudit: JSON.stringify(audit.internalAudit),
        clientSummary: JSON.stringify(audit.clientSummary),
        pricingDocument: builtPricingDocument,
      },
    });

    // 9. Create screens with line items in batches
    console.log(`[create-proposal] Creating ${audit.internalAudit.perScreen.length} screens...`);
    for (let idx = 0; idx < audit.internalAudit.perScreen.length; idx++) {
      const screenAudit = audit.internalAudit.perScreen[idx];
      const input = screenInputs[idx];
      const spec = screens[idx];
      const desiredMargin = input.desiredMargin ?? 0.25;
      const li = screenAudit.breakdown;

      try {
        await prisma.screenConfig.create({
          data: {
            proposalId: proposal.id,
            name: screenAudit.name,
            externalName: spec?.location || spec?.externalName || null,
            pixelPitch: input.pitchMm ?? 0,
            width: input.widthFt ?? 0,
            height: input.heightFt ?? 0,
            brightness: spec?.brightnessNits ?? spec?.brightness_nits ?? null,
            quantity: input.quantity ?? 1,
            serviceType: input.serviceType ?? null,
            lineItems: {
              create: [
                { category: "Hardware", cost: Number(li.hardware), margin: desiredMargin, price: round(li.hardware * (1 + desiredMargin)) },
                { category: "Structure", cost: Number(li.structure), margin: desiredMargin, price: round(li.structure * (1 + desiredMargin)) },
                { category: "Install", cost: Number(li.install), margin: desiredMargin, price: round(li.install * (1 + desiredMargin)) },
                { category: "Power", cost: Number(li.power), margin: desiredMargin, price: round(li.power * (1 + desiredMargin)) },
                { category: "Shipping", cost: Number(li.shipping), margin: desiredMargin, price: round(li.shipping * (1 + desiredMargin)) },
                { category: "Labor", cost: Number(li.labor), margin: desiredMargin, price: round(li.labor * (1 + desiredMargin)) },
                { category: "PM", cost: Number(li.pm), margin: desiredMargin, price: round(li.pm * (1 + desiredMargin)) },
                { category: "General Conditions", cost: Number(li.generalConditions), margin: desiredMargin, price: round(li.generalConditions * (1 + desiredMargin)) },
                { category: "Travel", cost: Number(li.travel), margin: desiredMargin, price: round(li.travel * (1 + desiredMargin)) },
                { category: "Submittals", cost: Number(li.submittals), margin: desiredMargin, price: round(li.submittals * (1 + desiredMargin)) },
                { category: "Engineering", cost: Number(li.engineering), margin: desiredMargin, price: round(li.engineering * (1 + desiredMargin)) },
                { category: "Permits", cost: Number(li.permits), margin: desiredMargin, price: round(li.permits * (1 + desiredMargin)) },
                { category: "CMS", cost: Number(li.cms), margin: desiredMargin, price: round(li.cms * (1 + desiredMargin)) },
                { category: "Bond", cost: Number(li.bondCost), margin: 0, price: Number(li.bondCost) },
                { category: "ANC Margin", cost: 0, margin: 0, price: Number(li.ancMargin) },
              ],
            },
          },
        });
      } catch (screenErr: any) {
        console.error(`[create-proposal] Screen ${idx + 1} (${screenAudit.name}) failed:`, screenErr.message);
        // Continue — don't let one bad screen kill the whole proposal
      }
    }

    // 9. Log activity
    logActivity(
      proposal.id,
      "created",
      `Proposal auto-created from RFP analysis (${screens.length} displays extracted from ${analysis.filename})`,
      null,
      { source: "rfp_analysis", analysisId: body.analysisId, displayCount: screens.length },
    );

    // 10. Provision AnythingLLM workspace (non-blocking)
    if (!analysis.aiWorkspaceSlug) {
      provisionProjectWorkspace(clientName, proposal.id)
        .then(async (slug) => {
          if (!slug) return;
          await prisma.proposal.update({
            where: { id: proposal.id },
            data: { aiWorkspaceSlug: slug },
          });
        })
        .catch((e) => console.error("[create-proposal] AI provisioning failed:", e));
    }

    console.log(`[create-proposal] Done — proposal ${proposal.id} with ${screens.length} screens`);

    return NextResponse.json(
      {
        ok: true,
        proposalId: proposal.id,
        workspaceId: workspace.id,
        screenCount: screens.length,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("[create-proposal] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create proposal" },
      { status: 500 },
    );
  }
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
