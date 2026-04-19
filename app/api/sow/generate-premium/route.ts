import { NextRequest, NextResponse } from "next/server";
import { generatePremiumSOW } from "@/services/sow/installationSOWPremium";
import type { InstallSOWInput } from "@/services/sow/installationSOWGenerator";
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

    const buffer = await generatePremiumSOW(body);

    const safeName = (body.projectName || "SOW").replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    const filename = `${safeName} - Installation SOW (Premium).docx`;

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
            title: "Proposal Engine: Premium SOW generated",
            markdownText: `Premium Installation SOW generated for **${body.projectName}** with ${body.displays.length} display(s).`,
            artifacts: [
              { label: "Premium SOW", url: artifact.downloadUrl, filename: artifact.filename },
            ],
          }),
        )
        .catch((err) => log.warn("[sow/generate-premium] CRM sync failed:", err?.message || err));
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    log.error("[sow/generate-premium] POST error:", error);
    return NextResponse.json(
      { error: "Failed to generate Premium SOW" },
      { status: 500 }
    );
  }
}
