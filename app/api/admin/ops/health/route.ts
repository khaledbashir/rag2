import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isPlatformOwner } from "@/lib/platformOwner";
import { mistralOcrHealthCheck } from "@/services/rfp/unified/mistralOcrClient";
import { llamaVisionHealthCheck } from "@/services/rfp/unified/llamaVision";

/**
 * GET /api/admin/ops/health
 * Returns health status of all AI services used in the RFP pipeline.
 * Platform owner only.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!isPlatformOwner(session?.user?.email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [mistral, llama] = await Promise.all([
      mistralOcrHealthCheck().catch((e: any) => ({ ok: false, error: e.message })),
      llamaVisionHealthCheck().catch((e: any) => ({ ok: false, error: e.message })),
    ]);

    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

    return NextResponse.json({
      services: {
        mistral: { ...mistral, role: "OCR (primary)" },
        gemini: {
          ok: !!geminiKey,
          role: "Vision + Spec Extraction (primary)",
          error: geminiKey ? undefined : "No API key configured",
        },
        llama: { ...llama, role: "Spec Extraction + Vision (fallback)" },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[GET /api/admin/ops/health] Error:", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
