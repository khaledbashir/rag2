import { NextRequest, NextResponse } from "next/server";
import { generatePremiumSOW } from "@/services/sow/installationSOWPremium";
import type { InstallSOWInput } from "@/services/sow/installationSOWGenerator";
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

    const buffer = await generatePremiumSOW(body);

    const safeName = (body.projectName || "SOW").replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    const filename = `${safeName} - Installation SOW (Premium).docx`;

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
