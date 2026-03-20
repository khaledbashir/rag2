import { NextRequest, NextResponse } from "next/server";
import { generateInstallationSOW, type InstallSOWInput } from "@/services/sow/installationSOWGenerator";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

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
