/**
 * Lux API — Chat with the ANC Proposals AI agent.
 * Platform owner only. Routes through OpenClaw HTTP bridge on the host.
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
    // Route through OpenClaw HTTP bridge (host:18790) — NOT the CLI.
    // The bridge accepts JSON with agent + message and returns the response.
    // This works from Docker because the bridge runs on the host.
    const res = await fetch(`${OPENCLAW_BRIDGE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_TOKEN}`,
      },
      body: JSON.stringify({
        agent: "anc-proposals",
        message: fullMessage,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (res.ok) {
      const data = await res.json();
      const reply = data.text || data.reply || data.message || data.result?.payloads?.[0]?.text || "No response from Lux";
      return NextResponse.json({ reply });
    }

    // Bridge might not have /chat endpoint yet — fall back to direct OpenAI call
    // using the same model Lux is configured with (MiniMax M2.7 or GPT-5.4-mini)
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: "Bridge unavailable and no OpenAI key" }, { status: 502 });
    }

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content: `You are Lux, the AI assistant for ANC's Proposal Engine. You help review and fix LED display extractions from RFPs. You are sharp, precise, and domain-expert. Fix first, explain only if asked. Use real numbers. If something's wrong, say what and fix it. You know LED specs: pixel pitch, brightness (nits), cabinet sizing, 80/20 pricing, indoor vs outdoor. You know LG, Yaham, Absen product lines.`,
          },
          { role: "user", content: fullMessage },
        ],
        temperature: 0,
        max_completion_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (gptRes.ok) {
      const gptData = await gptRes.json();
      const reply = gptData.choices?.[0]?.message?.content || "No response";
      return NextResponse.json({ reply });
    }

    return NextResponse.json({ error: `API failed: ${gptRes.status}` }, { status: 502 });
  } catch (err: any) {
    console.error("[Lux API] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
