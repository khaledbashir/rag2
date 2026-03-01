import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAuditExcelBuffer } from "@/services/proposal/server/exportFormulaicExcel";
import { generateMirrorUglySheetExcelBuffer } from "@/services/proposal/server/exportMirrorUglySheetExcel";

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

    const effectiveMode = (bodyMode === "MIRROR" || bodyMode === "INTELLIGENCE")
      ? bodyMode
      : bodyMirrorMode === true
        ? "MIRROR"
        : bodyMirrorMode === false
          ? "INTELLIGENCE"
          : proposal?.calculationMode ?? "INTELLIGENCE";

    console.log(`[Audit Export] Mode: ${effectiveMode}, Screens: ${effectiveScreens.length}, InternalAudit keys: ${internalAudit ? Object.keys(internalAudit).join(',') : 'null'}`);

    const proposalName = (body.projectName || proposal?.clientName || body.clientName || "Proposal").toString();
    const safeFilename = proposalName.replace(/\s+/g, "_").replace(/[^\w\-_.]/g, "") || "Proposal";
    const buffer = effectiveMode === "MIRROR"
      ? await generateMirrorUglySheetExcelBuffer({
        clientName: proposal?.clientName || body.clientName,
        projectName: proposal?.clientName || body.projectName,
        screens: effectiveScreens,
        internalAudit,
        currency,
      })
      : await generateAuditExcelBuffer(screensWithAudit, {
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
      });

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
