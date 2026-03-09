import { NextRequest, NextResponse } from "next/server";
import { generateInstallationSOW, type InstallSOWInput } from "@/services/sow/installationSOWGenerator";
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
