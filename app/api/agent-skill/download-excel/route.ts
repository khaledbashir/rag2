import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { log } from "@/lib/logger";

/**
 * GET /api/agent-skill/download-excel?file=<filename>
 *
 * Serves a generated Excel file from /tmp/anc-exports/.
 * Used by the AnythingLLM agent skill to provide download links.
 */

const EXPORT_DIR = "/tmp/anc-exports";

export async function GET(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("file");

    if (!filename) {
      return NextResponse.json({ error: "Missing 'file' parameter" }, { status: 400 });
    }

    // Prevent path traversal
    const safeName = path.basename(filename);
    if (safeName !== filename || !safeName.endsWith(".xlsx")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const filePath = path.join(EXPORT_DIR, safeName);

    // Check file exists
    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
    }

    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    log.error("[AGENT-SKILL] Download Excel failed:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}
