import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAuditExcelBuffer } from "@/services/proposal/server/exportFormulaicExcel";
import { generateMirrorUglySheetExcelBuffer } from "@/services/proposal/server/exportMirrorUglySheetExcel";
import { generateScopingWorkbook } from "@/services/rfp/pipeline/generateScopingWorkbook";
import { mapMirrorToScoping } from "@/services/rfp/pipeline/pricingDocumentToScopingMapper";

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
    let buffer: Buffer;
    if (effectiveMode === "MIRROR" && pricingDocument?.tables?.length) {
      // Primary Mirror export: canonical 14-tab workbook via generateScopingWorkbook
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
      // Fallback: no pricingDocument — use legacy 5-tab generator
      console.warn("[Audit Export] MIRROR mode missing pricingDocument — falling back to legacy 5-tab export");
      buffer = await generateMirrorUglySheetExcelBuffer({
        clientName: proposal?.clientName || body.clientName,
        projectName: proposal?.clientName || body.projectName,
        screens: effectiveScreens,
        internalAudit,
        currency,
        pricingDocument,
        summaryInfo,
      });
    } else {
      buffer = await generateAuditExcelBuffer(screensWithAudit, {
        proposalName,
        clientName: proposal?.clientName,
        status: (proposal?.status as any) ?? "DRAFT",
        boTaxApplies: /morgantown|wvu|milan\s+puskar/i.test(`${projectAddress} ${venue}`),
        // REQ-126: Pass financial overrides for Zero Math Error compliance
        bondRateOverride: body.bondRateOverride ?? (proposal?.bondRateOverride ? Number(proposal.bondRateOverride) : undefined),
        taxRateOverride: body.taxRateOverride ?? (proposal?.taxRateOverride ? Number(proposal.taxRateOverride) : undefined),
        // REQ-126: Pass PDF total for verification section
        pdfTotal: body.pdfTotal ?? internalAudit?.totals?.finalClientTotal,
        // REQ-86: Structural steel tonnage
        structuralTonnage: body.structuralTonnage ?? (proposal?.structuralTonnage ? Number(proposal.structuralTonnage) : undefined),
        reinforcingTonnage: body.reinforcingTonnage ?? (proposal?.reinforcingTonnage ? Number(proposal.reinforcingTonnage) : undefined),
        currency,
        summaryInfo,
      });
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
