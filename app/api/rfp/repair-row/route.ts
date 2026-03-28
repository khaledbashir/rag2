/**
 * POST /api/rfp/repair-row
 *
 * Human-in-the-loop row repair. Natalia clicks "Fix this" on a row,
 * the agent reads the source text, finds the correct value, fixes it.
 *
 * Input: { analysisId, rowIndex, displayName, issue, sourceText }
 * Output: { fixed: true, display: {...corrected fields}, reason: "..." }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
const GEMINI_MODEL = "gemini-3.1-pro-preview"; // Use Pro for repair — accuracy matters more than speed
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

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

  // Build the repair prompt — narrow, specific, bounded
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
    const res = await fetch(`${BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI repair failed: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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

    // Log the repair for audit trail
    console.log(`[RepairRow] ${session.user.name || session.user.email} repaired "${displayName}" in analysis ${analysisId}: ${repair.reason}`);

    // Update the analysis in the database
    try {
      const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
      if (analysis?.screens) {
        const screens = analysis.screens as any[];
        const screen = screens[rowIndex] || screens.find((s: any) => s.name === displayName);
        if (screen) {
          // Apply corrections
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
    });
  } catch (err: any) {
    console.error("[RepairRow] Failed:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
