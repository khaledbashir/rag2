import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateScopingWorkbook } from "@/services/rfp/pipeline/generateScopingWorkbook";
import { mapMirrorToScoping } from "@/services/rfp/pipeline/pricingDocumentToScopingMapper";
import { mapIntelligenceToScoping } from "@/services/rfp/pipeline/screenAuditToScopingMapper";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const proposalId = body.proposalId;
    const projectAddress = typeof body.projectAddress === "string" ? body.projectAddress : "";
    const venue = typeof body.venue === "string" ? body.venue : "";
    const bodyInternalAudit = body.internalAudit;
    const bodyScreens = Array.isArray(body.screens) ? body.screens : null;
    const bodyMode = typeof body.calculationMode === "string" ? body.calculationMode : undefined;
    const currency = typeof body.currency === "string" ? body.currency : "USD";
    const bodyMirrorMode = typeof body.mirrorMode === "boolean" ? body.mirrorMode : undefined;

    if (!proposalId && !bodyScreens) {
      return NextResponse.json({ error: "proposalId or screens is required" }, { status: 400 });
    }

    const isPreview = !proposalId || proposalId === "new";
    const proposal = isPreview
      ? null
      : await prisma.proposal.findUnique({
        where: { id: proposalId },
        include: { screens: true },
      });

    if (!isPreview && !proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Map internalAudit data to screens for the exporter
    let internalAudit: any = null;
    if (!isPreview) {
      internalAudit = proposal?.internalAudit;
      if (typeof internalAudit === "string" && internalAudit.trim() !== "") {
        try {
          internalAudit = JSON.parse(internalAudit);
        } catch {
          internalAudit = null;
        }
      }
    }
    if (!internalAudit && bodyInternalAudit) internalAudit = bodyInternalAudit;

    const effectiveScreens = bodyScreens
      ? bodyScreens.map((s: any) => ({
        name: s.name,
        pixelPitch: Number(s.pixelPitch || s.pitchMm || 0),
        width: Number(s.width || s.widthFt || 0),
        height: Number(s.height || s.heightFt || 0),
      }))
      : ((proposal?.screens || []) as any[]).map((s: any) => ({
        name: s.name,
        pixelPitch: Number(s.pixelPitch || 0),
        width: Number(s.width || 0),
        height: Number(s.height || 0),
      }));

    // Use body screens for new/draft so Excel has data; otherwise use proposal.screens
    const baseScreens = (bodyScreens?.length ? bodyScreens : (proposal?.screens || []) as any[]);
    const screensWithAudit = baseScreens.map((screen: any, idx: number) => ({
      ...screen,
      name: screen.name,
      width: Number(screen.width ?? screen.widthFt ?? 0),
      height: Number(screen.height ?? screen.heightFt ?? 0),
      widthFt: Number(screen.widthFt ?? screen.width ?? 0),
      heightFt: Number(screen.heightFt ?? screen.height ?? 0),
      pixelPitch: Number(screen.pixelPitch ?? screen.pitchMm ?? 0),
      internalAudit: internalAudit?.perScreen?.[idx] ?? null,
    }));

    // Extract pricingDocument for Mirror Mode per-section Margin Analysis export
    // pricingDocument is stored as a top-level field on the proposal (not inside details)
    const pricingDocument = (!isPreview && proposal ? (proposal as any).pricingDocument : null)
      || body.pricingDocument || null;

    const effectiveMode = (bodyMode === "MIRROR" || bodyMode === "INTELLIGENCE")
      ? bodyMode
      : bodyMirrorMode === true
        ? "MIRROR"
        : bodyMirrorMode === false
          ? "INTELLIGENCE"
          : proposal?.calculationMode ?? "INTELLIGENCE";

    console.log(`[Audit Export] Mode: ${effectiveMode}, Screens: ${effectiveScreens.length}, InternalAudit keys: ${internalAudit ? Object.keys(internalAudit).join(',') : 'null'}, pricingDocument tables: ${pricingDocument?.tables?.length ?? 'null'}`);
    if (effectiveMode === "MIRROR" && !pricingDocument?.tables?.length) {
      console.warn(`[Audit Export] WARNING: MIRROR mode proposal missing pricingDocument. Margin Analysis will use flat fallback (screens only). Re-upload the source Excel to populate per-section pricing data.`);
    }

    const proposalName = (body.projectName || proposal?.clientName || body.clientName || "Proposal").toString();
    const safeFilename = proposalName.replace(/\s+/g, "_").replace(/[^\w\-_.]/g, "") || "Proposal";
    // Summary metadata available to both export paths
    // body.clientName = receiver/contact name (from frontend form receiver.name)
    // proposal.clientName = project name in DB (confusing legacy naming)
    const receiverName = (body.clientName || "").toString();
    const summaryInfo = {
      projectName: proposalName,
      clientName: receiverName !== proposalName ? receiverName : "",
      createdAt: proposal?.createdAt ? new Date(proposal.createdAt).toLocaleDateString() : new Date().toLocaleDateString(),
      updatedAt: proposal?.updatedAt ? new Date(proposal.updatedAt).toLocaleDateString() : new Date().toLocaleDateString(),
      documentMode: ((proposal as any)?.documentMode || body.documentMode || "BUDGET").toString().toUpperCase(),
      displayCount: effectiveScreens.length,
    };
    // All paths converge on generateScopingWorkbook — one MA structure, one workbook contract.
    let buffer: Buffer;
    if (effectiveMode === "MIRROR" && pricingDocument?.tables?.length) {
      // Mirror with pricingDocument: map uploaded Excel pricing → canonical workbook
      const scopingOptions = mapMirrorToScoping({
        pricingDocument,
        screens: effectiveScreens,
        internalAudit,
        currency,
        clientName: receiverName || proposal?.clientName || body.clientName,
        projectName: proposalName,
        location: projectAddress || venue || null,
      });
      const result = await generateScopingWorkbook(scopingOptions);
      buffer = result.buffer;
    } else if (effectiveMode === "MIRROR") {
      // Mirror without pricingDocument: use screens + internalAudit → canonical workbook
      // (same path as Intelligence — screens have dims/pitch, generator computes costs)
      console.warn("[Audit Export] MIRROR mode missing pricingDocument — generating canonical workbook from screen data");
      const scopingOptions = mapIntelligenceToScoping({
        screens: screensWithAudit,
        currency,
        proposalName,
        clientName: receiverName || proposal?.clientName || body.clientName,
        location: projectAddress || venue || null,
        bondRateOverride: body.bondRateOverride ?? (proposal?.bondRateOverride ? Number(proposal.bondRateOverride) : undefined),
        taxRateOverride: body.taxRateOverride ?? (proposal?.taxRateOverride ? Number(proposal.taxRateOverride) : undefined),
      });
      const result = await generateScopingWorkbook(scopingOptions);
      buffer = result.buffer;
    } else {
      // Intelligence/Manual Mode: map screen audit data → canonical workbook
      const scopingOptions = mapIntelligenceToScoping({
        screens: screensWithAudit,
        currency,
        proposalName,
        clientName: receiverName || proposal?.clientName || body.clientName,
        location: projectAddress || venue || null,
        bondRateOverride: body.bondRateOverride ?? (proposal?.bondRateOverride ? Number(proposal.bondRateOverride) : undefined),
        taxRateOverride: body.taxRateOverride ?? (proposal?.taxRateOverride ? Number(proposal.taxRateOverride) : undefined),
      });
      const result = await generateScopingWorkbook(scopingOptions);
      buffer = result.buffer;
    }

    return new Response(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFilename}_Audit.xlsx"`,
      },
    });
  } catch (err) {
    console.error("Audit export error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
