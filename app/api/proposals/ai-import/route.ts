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

const ANYTHING_LLM_BASE = process.env.ANYTHING_LLM_API_BASE || "https://basheer-anything-llm.prd42b.easypanel.host/api/v1";
const ANYTHING_LLM_KEY = process.env.ANYTHING_LLM_API_KEY || "";

const SYSTEM_PROMPT = `You are an ANC Proposal Engine data extractor. You receive raw spreadsheet data (tab-separated) from an LED display project's Margin Analysis tab. Extract ALL pricing information into a JSON object.

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
  "documentTotal": number
}

RULES:
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

    // Step 1: Convert Excel to text (dead simple — no parsing logic)
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetTexts: { name: string; text: string }[] = [];

    // Find Margin Analysis tab first, fall back to first sheet
    const maSheet = workbook.SheetNames.find(
      (n) => /margin.*analysis/i.test(n) && !/cms/i.test(n)
    );
    const targetSheets = maSheet
      ? [maSheet]
      : workbook.SheetNames.slice(0, 3); // First 3 sheets as fallback

    for (const sheetName of targetSheets) {
      const sheet = workbook.Sheets[sheetName];
      // Convert to CSV-like text (tab-separated for clarity)
      const text = xlsx.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
      // Trim to reasonable size (first 200 lines)
      const lines = text.split("\n").slice(0, 200);
      sheetTexts.push({ name: sheetName, text: lines.join("\n") });
    }

    if (sheetTexts.length === 0) {
      return NextResponse.json({ error: "No readable sheets found" }, { status: 422 });
    }

    // Step 2: Build the AI prompt
    const excelText = sheetTexts
      .map((s) => `=== Sheet: ${s.name} ===\n${s.text}`)
      .join("\n\n");

    console.log(`[AI IMPORT] Sending ${excelText.length} chars from ${sheetTexts.length} sheet(s) to AI`);

    // Step 3: Call AnythingLLM (non-streaming, simpler)
    const aiResult = await callAI(excelText);

    if (!aiResult) {
      return NextResponse.json({
        error: "AI extraction failed. Try the standard parser instead.",
      }, { status: 500 });
    }

    // Step 4: Convert AI JSON → PricingDocument
    const pricingDocument = buildPricingDocument(aiResult, file.name, sourceWorkbookHash, maSheet || sheetTexts[0].name);

    console.log(`[AI IMPORT] Success: ${pricingDocument.tables.length} tables, $${Math.round(pricingDocument.documentTotal)} total`);

    // Step 5: Return in the same format as the standard import
    const minimalData = {
      formData: {
        details: {
          proposalName: aiResult.projectName || file.name.replace(/\.(xlsx?|csv)$/i, ""),
          screens: [],
          items: [],
          pricingDocument,
          parserValidationReport: {
            status: "PASS",
            strict: false,
            errors: [],
            warnings: ["Imported via AI extraction (BETA)"],
            evidence: {
              marginSheetDetected: maSheet || sheetTexts[0].name,
              headerRowIndex: null,
              sectionCount: pricingDocument.tables.length,
              respMatrixSheetCandidates: [],
              respMatrixSheetUsed: null,
              respMatrixCategoryCount: 0,
            },
          },
          parserStrictVersion: "2026.02.12.strict-v1",
          sourceWorkbookHash,
          calculationMode: "MIRROR",
          mirrorMode: true,
        },
        receiver: {
          name: aiResult.clientName || aiResult.projectName || "",
        },
      },
      validation: { status: "PASS", strict: false, errors: [], warnings: ["AI extraction (BETA)"] },
      mirrorModeOnly: true,
      aiImport: true,
    };

    return NextResponse.json(minimalData);
  } catch (err: any) {
    console.error("[AI IMPORT] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── AI Call ────────────────────────────────────────────────────────────────

async function callAI(excelText: string): Promise<any> {
  // Try AnythingLLM first
  if (ANYTHING_LLM_KEY) {
    try {
      const result = await callAnythingLLM(excelText);
      if (result) return result;
    } catch (err: any) {
      console.warn("[AI IMPORT] AnythingLLM failed:", err.message);
    }
  }

  // Fallback: try LiteLLM/OpenAI-compatible endpoint
  const litellmBase = process.env.LITELLM_BASE_URL;
  const litellmKey = process.env.LITELLM_API_KEY;
  if (litellmBase && litellmKey) {
    try {
      const result = await callLiteLLM(excelText, litellmBase, litellmKey);
      if (result) return result;
    } catch (err: any) {
      console.warn("[AI IMPORT] LiteLLM failed:", err.message);
    }
  }

  return null;
}

async function callAnythingLLM(excelText: string): Promise<any> {
  const base = ANYTHING_LLM_BASE.replace(/\/+$/, "");
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

async function callLiteLLM(excelText: string, base: string, key: string): Promise<any> {
  const res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.LITELLM_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract pricing data from this spreadsheet:\n\n${excelText}` },
      ],
      temperature: 0,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    throw new Error(`LiteLLM ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content || "";
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
