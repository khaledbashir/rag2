/**
 * Lux API — Chat with the ANC Proposals AI agent.
 * Platform owner only. Talks to OpenClaw's anc-proposals agent.
 *
 * POST /api/rfp/lux
 * Body: { message: string, context?: { displays: any[], sourceText?: string } }
 * Returns: { reply: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { isPlatformOwner } from "@/lib/platformOwner";
import { auth } from "@/auth";

const OPENCLAW_BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://172.17.0.1:18790";
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || "d1cd954f0f49c7e03ed01693727d811bc9778e892d32c5812473e53a8673c144";

export async function POST(req: NextRequest) {
  // Platform owner gate
  const session = await auth();
  if (!isPlatformOwner(session?.user?.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { message, context } = body;

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Build context-aware prompt for Lux
  let fullMessage = message;

  if (context?.displays?.length) {
    const displaySummary = context.displays.map((d: any, i: number) =>
      `${i + 1}. ${d.name || "?"} | ${d.widthFt ?? "?"}' x ${d.heightFt ?? "?"}' | ${d.pixelPitchMm ?? "?"}mm | ${d.brightnessNits ?? "?"} nits | ${d.environment || "?"}`
    ).join("\n");
    fullMessage += `\n\n--- CURRENT EXTRACTION (${context.displays.length} displays) ---\n${displaySummary}`;
  }

  if (context?.sourceText) {
    const truncated = context.sourceText.substring(0, 30000);
    fullMessage += `\n\n--- SOURCE PDF TEXT (first 30KB) ---\n${truncated}`;
  }

  try {
    // Call OpenClaw bridge — agent mode for anc-proposals
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync(
      "openclaw",
      ["agent", "--agent", "anc-proposals", "--message", fullMessage, "--json"],
      {
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, HOME: "/root" },
      },
    );

    const data = JSON.parse(stdout);
    const reply = data.result?.payloads?.[0]?.text
      || data.reply
      || data.message
      || "No response from Lux";

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("[Lux API] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
