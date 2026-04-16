/**
 * POST /api/contracts/parse-exhibit-a
 *
 * Accepts a multipart upload with a contract PDF, extracts the Exhibit A SKU
 * table via Gemini, and returns structured JSON. Hidden from nav — called only
 * from the admin submittal-compiler prototype page.
 *
 * Body: multipart/form-data with field "file" = contract PDF
 * Auth: ADMIN via middleware (path sits under /api/contracts, routed through
 *       /admin/submittal-compiler which is ADMIN-only).
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { requireAuth } from "@/lib/apiAuth";
import { extractExhibitA } from "@/services/contracts/exhibitAExtractor";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const [session, authError] = await requireAuth();
    if (authError) return authError;

    // Role guard: admin-only until we take it live
    const role = (session as any)?.user?.role;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — admin-only preview" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided (expected multipart field 'file')" }, { status: 400 });
    }

    // Persist temp upload
    const buffer = Buffer.from(await file.arrayBuffer());
    const tmpDir = join(tmpdir(), "anc-exhibit-a");
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = join(tmpDir, `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
    await writeFile(tmpPath, buffer);

    try {
      const result = await extractExhibitA(tmpPath);
      return NextResponse.json({ success: true, result });
    } finally {
      // Best-effort cleanup — don't crash the response on cleanup failure
      unlink(tmpPath).catch(() => {});
    }
  } catch (error: any) {
    console.error("[parse-exhibit-a] Error:", error);
    return NextResponse.json({ error: error?.message || "Extraction failed" }, { status: 500 });
  }
}
