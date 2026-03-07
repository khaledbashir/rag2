/**
 * POST /api/proposals/ai-import
 *
 * BETA: AI-powered Excel import
 * Instead of brittle column/row parsing, converts Excel to text
 * and lets AI extract structured pricing data.
 *
 * Flow: Excel → CSV text → AI extraction → PricingDocument JSON
 */

import { NextRequest, NextResponse } from "next/server";
import * as xlsx from "xlsx";
import crypto from "node:crypto";
import { PricingTable, PricingDocument, createTableId } from "@/types/pricing";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";
import { parseRespMatrixDetailed } from "@/services/pricing/respMatrixParser";

const SYSTEM_PROMPT = `You are an ANC Proposal Engine data extractor. You receive raw spreadsheet data (tab-separated) from an LED display project. Extract ALL data into a single JSON object.

OUTPUT THIS EXACT JSON SCHEMA (no markdown, no explanation, ONLY the JSON):
{
  "projectName": "string",
  "clientName": "string or empty",
  "currency": "USD",
  "tables": [
    {
      "name": "string (section/screen name)",
      "items": [
        { "description": "string", "cost": number_or_null, "sell": number }
      ],
      "subtotal": number,
      "tax": { "label": "string", "rate": number_0_to_1, "amount": number } or null,
      "bond": number,
      "tariff": number,
      "grandTotal": number
    }
  ],
  "documentTotal": number,
  "screens": [
    {
      "name": "string (display name, e.g. LED-C1-01 - LED Display)",
      "heightFt": number,
      "widthFt": number,
      "pixelPitch": number,
      "resolution": "string (e.g. 70 x 11368)",
      "quantity": number,
      "location": "string or empty",
      "product": "string (manufacturer/model if listed)"
    }
  ]
}

PRICING RULES (from Margin Analysis sheet):
- Extract EVERY line item with a selling price. Do not skip any.
- "cost" is the cost/budget column. "sell" is the selling price/revenue column.
- If only one numeric column exists, use it as "sell" and set cost to null.
- Subtotal = sum of item selling prices (before tax/bond).
- Tax: extract rate (as decimal 0-1) and dollar amount. Label is the tax name (Tax, HST, GST, etc).
- Bond: performance/P&P bond amount. 0 if none.
- Tariff: tariff amount. 0 if none.
- Grand Total: the final total including tax, bond, tariff.
- Document Total: the overall project total (sum of all table grand totals, or BASE BID GRAND TOTAL if present).
- Items labeled "Included", "N/A", or with $0 → include them with sell: 0.
- Do NOT include subtotal/tax/bond/tariff/grand total rows as line items.
- If there are multiple sections (e.g. per-screen breakdowns), create separate tables for each.
- If there's only one section, create one table.

SCREEN RULES (from LED Cost Sheet or similar):
- Extract every LED display/screen with its dimensions and specs.
- heightFt/widthFt: display dimensions in feet (convert from inches if needed).
- pixelPitch: in millimeters (e.g. 3.9, 10, 1.2).
- resolution: columns x rows (e.g. "70 x 11368").
- quantity: number of units (default 1).
- If no LED sheet exists, set screens to empty array [].

GENERAL:
- Project name: look in the first few rows for a project name or title.
- RESPOND WITH ONLY THE JSON. No text before or after.`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceWorkbookHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const workbook = xlsx.read(buffer, { type: "buffer" });

    // ── Step 1: Convert relevant sheets to text for AI ──
    const sheetTexts: { name: string; text: string }[] = [];
    const maSheet = workbook.SheetNames.find(
      (n) => /margin.*analysis/i.test(n) && !/cms/i.test(n)
    );
    const ledSheet = workbook.SheetNames.find(
      (n) => /led.*(?:cost|sheet)/i.test(n)
    );

    // Collect sheets: MA + LED + first 2 others as context
    const sheetsToSend = new Set<string>();
    if (maSheet) sheetsToSend.add(maSheet);
    if (ledSheet) sheetsToSend.add(ledSheet);
    // Add first few sheets as fallback context
    for (const name of workbook.SheetNames.slice(0, 4)) {
      if (sheetsToSend.size < 4) sheetsToSend.add(name);
    }

    for (const sheetName of sheetsToSend) {
      const sheet = workbook.Sheets[sheetName];
      const text = xlsx.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
      const lines = text.split("\n").slice(0, 200);
      sheetTexts.push({ name: sheetName, text: lines.join("\n") });
    }

    if (sheetTexts.length === 0) {
      return NextResponse.json({ error: "No readable sheets found" }, { status: 422 });
    }

    // ── Step 2: Extract Resp Matrix (structured parser — reliable, no AI needed) ──
    let respMatrix: any = undefined;
    try {
      const rmResult = parseRespMatrixDetailed(workbook);
      if (rmResult.matrix?.categories?.length) {
        respMatrix = rmResult.matrix;
        console.log(`[AI IMPORT] Resp Matrix: ${rmResult.matrix.categories.length} categories`);
      }
    } catch {}

    // ── Step 3: Send to AI ──
    const excelText = sheetTexts
      .map((s) => `=== Sheet: ${s.name} ===\n${s.text}`)
      .join("\n\n");

    console.log(`[AI IMPORT] Sending ${excelText.length} chars from ${sheetTexts.length} sheet(s) to AI`);

    const aiResult = await callAI(excelText);

    if (!aiResult) {
      return NextResponse.json({
        error: "AI extraction failed. Try the standard parser instead.",
      }, { status: 500 });
    }

    // ── Step 4: Build PricingDocument + Screens from AI result ──
    const pricingDocument = buildPricingDocument(aiResult, file.name, sourceWorkbookHash, maSheet || sheetTexts[0].name);
    if (respMatrix) {
      pricingDocument.respMatrix = respMatrix;
    }

    const screens = buildScreens(aiResult);

    console.log(`[AI IMPORT] Success: ${pricingDocument.tables.length} tables, ${screens.length} screens, $${Math.round(pricingDocument.documentTotal)} total`);

    // ── Step 5: Return full proposal data ──
    const validation = {
      status: "PASS" as const,
      strict: false,
      errors: [] as string[],
      warnings: ["Imported via AI extraction (BETA)"],
      evidence: {
        marginSheetDetected: maSheet || sheetTexts[0].name,
        headerRowIndex: null,
        sectionCount: pricingDocument.tables.length,
        respMatrixSheetCandidates: [] as string[],
        respMatrixSheetUsed: null,
        respMatrixCategoryCount: respMatrix?.categories?.length || 0,
      },
    };

    const responseData = {
      formData: {
        details: {
          proposalName: aiResult.projectName || file.name.replace(/\.(xlsx?|csv)$/i, ""),
          screens,
          items: [],
          pricingDocument,
          parserValidationReport: validation,
          parserStrictVersion: "2026.02.12.strict-v1",
          sourceWorkbookHash,
          calculationMode: "MIRROR",
          mirrorMode: true,
        },
        receiver: {
          name: aiResult.clientName || aiResult.projectName || "",
        },
      },
      validation,
      mirrorModeOnly: true,
      aiImport: true,
    };

    return NextResponse.json(responseData);
  } catch (err: any) {
    console.error("[AI IMPORT] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── AI Call ────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

async function callAI(excelText: string): Promise<any> {
  // Primary: Gemini Flash — fast, reliable, no embeddings
  if (GEMINI_API_KEY) {
    try {
      const result = await callGemini(excelText);
      if (result) return result;
    } catch (err: any) {
      console.warn("[AI IMPORT] Gemini failed:", err.message);
    }
  }

  // Fallback: AnythingLLM workspace
  if (ANYTHING_LLM_KEY) {
    try {
      const result = await callAnythingLLM(excelText);
      if (result) return result;
    } catch (err: any) {
      console.warn("[AI IMPORT] AnythingLLM failed:", err.message);
    }
  }

  return null;
}

async function callGemini(excelText: string): Promise<any> {
  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${SYSTEM_PROMPT}\n\n--- SPREADSHEET DATA ---\n${excelText}`,
        }],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 65536,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.substring(0, 300)}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const reply = candidate?.content?.parts?.[0]?.text || "";
  const finishReason = candidate?.finishReason || "unknown";
  const thoughtTokens = data.usageMetadata?.thoughtsTokenCount || 0;
  console.log(`[AI IMPORT] Gemini: ${reply.length} chars, finish=${finishReason}, thinking=${thoughtTokens} tokens`);
  if (finishReason === "MAX_TOKENS") {
    console.warn("[AI IMPORT] Gemini hit token limit — response truncated");
  }
  return extractJSON(reply);
}

async function callAnythingLLM(excelText: string): Promise<any> {
  const base = ANYTHING_LLM_BASE_URL.replace(/\/+$/, "");
  const workspace = process.env.ANYTHING_LLM_REASONING_WORKSPACE || process.env.ANYTHING_LLM_WORKSPACE || "reasoning";

  const res = await fetch(`${base}/workspace/${workspace}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
    },
    body: JSON.stringify({
      message: `${SYSTEM_PROMPT}\n\n--- SPREADSHEET DATA ---\n${excelText}`,
      mode: "chat",
    }),
  });

  if (!res.ok) {
    throw new Error(`AnythingLLM ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const reply = data.textResponse || data.response || "";
  return extractJSON(reply);
}

function extractJSON(text: string): any {
  // Strip <think>...</think> tags
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Try extracting JSON from markdown code block
  const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1].trim());
    } catch {}
  }

  // Try finding JSON object in text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  console.error("[AI IMPORT] Could not extract JSON from AI response:", cleaned.substring(0, 500));
  return null;
}

// ─── PricingDocument Builder ────────────────────────────────────────────────

function buildPricingDocument(
  ai: any,
  fileName: string,
  hash: string,
  sourceSheet: string
): PricingDocument {
  const tables: PricingTable[] = (ai.tables || []).map((t: any, idx: number) => {
    const items = (t.items || []).map((item: any) => ({
      description: String(item.description || "").trim(),
      sellingPrice: Number(item.sell) || 0,
      cost: item.cost != null ? Number(item.cost) : undefined,
      isIncluded: (Number(item.sell) || 0) === 0,
    }));

    const subtotal = Number(t.subtotal) || items.reduce((s: number, i: any) => s + i.sellingPrice, 0);
    const tax = t.tax ? {
      label: String(t.tax.label || "Tax"),
      rate: Number(t.tax.rate) || 0,
      amount: Number(t.tax.amount) || 0,
    } : null;
    const bond = Number(t.bond) || 0;
    const tariff = Number(t.tariff) || 0;
    const grandTotal = Number(t.grandTotal) || (subtotal + (tax?.amount || 0) + bond + tariff);

    return {
      id: createTableId(t.name || `Section ${idx + 1}`, idx),
      name: String(t.name || `Section ${idx + 1}`).trim(),
      currency: (ai.currency || "USD") as "USD" | "CAD" | "GBP" | "EUR",
      items,
      subtotal,
      tax,
      bond,
      tariff,
      grandTotal,
      alternates: [],
      sourceStartRow: -1,
      sourceEndRow: -1,
    };
  });

  const documentTotal = Number(ai.documentTotal) || tables.reduce((s, t) => s + t.grandTotal, 0);

  return {
    tables,
    mode: "MIRROR",
    sourceSheet,
    currency: (ai.currency || "USD") as "USD" | "CAD" | "GBP" | "EUR",
    documentTotal,
    metadata: {
      importedAt: new Date().toISOString(),
      fileName,
      tablesCount: tables.length,
      itemsCount: tables.reduce((s, t) => s + t.items.length, 0),
      alternatesCount: 0,
      warnings: ["Imported via AI extraction (BETA)"],
      parserStrictVersion: "2026.02.12.strict-v1",
      sourceWorkbookHash: hash,
    },
  };
}

// ─── Screen Builder ─────────────────────────────────────────────────────────

function buildScreens(ai: any): any[] {
  if (!Array.isArray(ai.screens) || ai.screens.length === 0) return [];

  return ai.screens.map((s: any, idx: number) => ({
    id: `ai-screen-${idx}`,
    name: String(s.name || `Display ${idx + 1}`).trim(),
    heightFt: Number(s.heightFt) || 0,
    widthFt: Number(s.widthFt) || 0,
    pixelPitch: Number(s.pixelPitch) || 0,
    pitchMm: Number(s.pixelPitch) || 0,
    resolution: String(s.resolution || ""),
    quantity: Number(s.quantity) || 1,
    location: String(s.location || ""),
    product: String(s.product || ""),
    brightness: 0,
    brightnessNits: 0,
  }));
}
