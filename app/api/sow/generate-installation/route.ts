import { NextRequest, NextResponse } from "next/server";
import { generateInstallationSOW, type InstallSOWInput } from "@/services/sow/installationSOWGenerator";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { saveCrmArtifact, universalCrmPush } from "@/services/integrations/twenty/crmAutomation";

export async function POST(request: NextRequest) {
  try {
    const body: InstallSOWInput = await request.json();

    if (!body.projectName || !body.displays?.length) {
      return NextResponse.json(
        { error: "projectName and at least one display are required" },
        { status: 400 }
      );
    }

    const buffer = await generateInstallationSOW(body);

    const safeName = body.projectName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    const filename = `${safeName} - Installation SOW.docx`;

    // Persist to SOW history
    try {
      await prisma.sOWHistory.create({
        data: {
          projectName: body.projectName,
          clientName: body.clientName || "",
          venue: body.venue || "",
          generationInput: body as any,
          displayCount: body.displays.length,
          hasUnionLabor: body.isUnionLabor || false,
          hasNightWork: body.hasNightWork || false,
          fileName: filename,
        },
      });
    } catch (historyErr) {
      // Don't fail the download if history save fails
      log.error("[sow/generate-installation] Failed to save history:", historyErr);
    }

    // Push SOW to Twenty CRM (async — don't block the download)
    if (body.proposalId) {
      saveCrmArtifact({
        buffer: Buffer.from(buffer),
        preferredFilename: filename,
        contentType: "application/pdf", // DOCX stored as binary, closest match
      })
        .then((artifact) =>
          universalCrmPush({
            proposalId: body.proposalId!,
            actionType: "sow_generated",
            title: "Proposal Engine: Installation SOW generated",
            markdownText: `Installation SOW generated for **${body.projectName}** with ${body.displays.length} display(s).`,
            artifacts: [
              { label: "Installation SOW", url: artifact.downloadUrl, filename: artifact.filename },
            ],
          }),
        )
        .catch((err) => log.warn("[sow/generate-installation] CRM sync failed:", err?.message || err));
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    log.error("[sow/generate-installation] POST error:", error);
    return NextResponse.json(
      { error: "Failed to generate Installation SOW" },
      { status: 500 }
    );
  }
}
