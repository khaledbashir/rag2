import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { log } from "@/lib/logger";

const EXPORT_DIR = "/tmp/anc-exports";

export async function GET(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("file");

    if (!filename) {
      return NextResponse.json({ error: "Missing 'file' parameter" }, { status: 400 });
    }

    const safeName = path.basename(filename);
    if (safeName !== filename || !safeName.endsWith(".pdf")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const filePath = path.join(EXPORT_DIR, safeName);

    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
    }

    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    log.error("[AGENT-SKILL] Download PDF failed:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}
