/**
 * POST /api/rfp/repair-row
 *
 * Human-in-the-loop row repair. Natalia clicks "Fix this" on a row,
 * the agent reads the source text, finds the correct value, fixes it.
 *
 * Pipeline: OpenClaw → MiMo → Z.AI → error
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const OPENCLAW_BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://172.17.0.1:18790";
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || "";
const MIMO_API_KEY = process.env.MIMO_API_KEY || "";
const MIMO_API_BASE = process.env.MIMO_API_BASE || "https://api.xiaomimimo.com/v1";
const MIMO_MODEL = process.env.MIMO_MODEL || "mimo-v2-pro";
const Z_AI_API_KEY = process.env.Z_AI_API_KEY || "";
const Z_AI_MODEL = process.env.QA_MODEL || "glm-5-turbo";
const Z_AI_BASE_URL = process.env.Z_AI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { analysisId, rowIndex, displayName, issue, currentValues, sourceText } = body;

  if (!analysisId || displayName == null || !sourceText) {
    return NextResponse.json({ error: "Missing required fields: analysisId, displayName, sourceText" }, { status: 400 });
  }

  const prompt = `You are repairing ONE row of extracted LED display data. The user flagged this row as incorrect.

DISPLAY: "${displayName}" (row ${rowIndex})
CURRENT VALUES: ${JSON.stringify(currentValues, null, 2)}
ISSUE REPORTED: ${issue || "Values appear incorrect"}

SOURCE TEXT (from the original PDF):
${sourceText.substring(0, 30000)}

TASK: Find the correct values for "${displayName}" in the source text above. Look for this display name and read the EXACT dimensions, pixel pitch, brightness, and environment from the row where it appears.

Return ONLY a JSON object with the corrected fields. Only include fields that need to change:
{
  "name": "corrected name if typo",
  "widthFt": 14.0,
  "heightFt": 8.0,
  "pixelPitchMm": 3.9,
  "brightnessNits": 8000,
  "environment": "indoor",
  "reason": "Brief explanation of what was wrong and what the source text says"
}

If you cannot find this display in the source text, return:
{"error": "Display not found in source text", "reason": "explanation"}`;

  try {
    let text = "";
    let repairSource = "";

    // 1. Try OpenClaw agent
    if (OPENCLAW_TOKEN) {
      try {
        const clawRes = await fetch(`${OPENCLAW_BRIDGE_URL}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENCLAW_TOKEN}` },
          body: JSON.stringify({ agent: "rfp-extractor", message: prompt }),
          signal: AbortSignal.timeout(60_000),
        });
        if (clawRes.ok) {
          const clawData = await clawRes.json();
          text = clawData.text || clawData.content || clawData.message || "";
          if (text) {
            repairSource = "openclaw";
            console.log(`[RepairRow] OpenClaw responded (${text.length} chars)`);
          }
        }
      } catch (err: any) {
        console.log(`[RepairRow] OpenClaw unavailable: ${err.message}`);
      }
    }

    // 2. Try MiMo
    if (!text && MIMO_API_KEY) {
      try {
        const res = await fetch(`${MIMO_API_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${MIMO_API_KEY}` },
          body: JSON.stringify({ model: MIMO_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 2048, response_format: { type: "json_object" } }),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const data = await res.json();
          text = data.choices?.[0]?.message?.content || "";
          if (text) {
            repairSource = "mimo";
            console.log(`[RepairRow] MiMo responded (${text.length} chars)`);
          }
        }
      } catch (err: any) {
        console.log(`[RepairRow] MiMo unavailable: ${err.message}`);
      }
    }

    // 3. Try Z.AI
    if (!text && Z_AI_API_KEY) {
      try {
        const res = await fetch(`${Z_AI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Z_AI_API_KEY}` },
          body: JSON.stringify({ model: Z_AI_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 2048 }),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const data = await res.json();
          text = data.choices?.[0]?.message?.content || "";
          if (text) {
            repairSource = "z-ai";
            console.log(`[RepairRow] Z.AI responded (${text.length} chars)`);
          }
        }
      } catch (err: any) {
        console.log(`[RepairRow] Z.AI unavailable: ${err.message}`);
      }
    }

    if (!text) {
      return NextResponse.json({ error: "All AI models unavailable for repair" }, { status: 502 });
    }

    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const si = cleaned.indexOf("{");
    const ei = cleaned.lastIndexOf("}") + 1;
    if (si < 0 || ei <= si) {
      return NextResponse.json({ error: "AI returned no valid JSON" }, { status: 502 });
    }

    const repair = JSON.parse(cleaned.substring(si, ei));

    if (repair.error) {
      return NextResponse.json({ fixed: false, error: repair.error, reason: repair.reason }, { status: 200 });
    }

    console.log(`[RepairRow] ${session.user.name || session.user.email} repaired "${displayName}" in analysis ${analysisId}: ${repair.reason}`);

    try {
      const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
      if (analysis?.screens) {
        const screens = analysis.screens as any[];
        const screen = screens[rowIndex] || screens.find((s: any) => s.name === displayName);
        if (screen) {
          if (repair.name != null) screen.name = repair.name;
          if (repair.widthFt != null) screen.widthFt = repair.widthFt;
          if (repair.heightFt != null) screen.heightFt = repair.heightFt;
          if (repair.pixelPitchMm != null) screen.pixelPitchMm = repair.pixelPitchMm;
          if (repair.brightnessNits != null) screen.brightnessNits = repair.brightnessNits;
          if (repair.environment != null) screen.environment = repair.environment;

          await prisma.rfpAnalysis.update({
            where: { id: analysisId },
            data: { screens: screens as any },
          });
        }
      }
    } catch (dbErr: any) {
      console.error("[RepairRow] DB update failed (non-fatal):", dbErr.message);
    }

    return NextResponse.json({
      fixed: true,
      display: repair,
      reason: repair.reason,
      repairedBy: session.user.name || session.user.email,
      repairedAt: new Date().toISOString(),
      repairSource,
    });
  } catch (err: any) {
    console.error("[RepairRow] Failed:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
