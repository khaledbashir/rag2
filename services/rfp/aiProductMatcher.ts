/**
 * AI Product Matcher — Gemini with function calling against live DB
 *
 * Replaces the scoring algorithm in productMatcher.ts. Gemini sees the
 * extracted display specs, calls query_products to search the real database,
 * and picks the best match — explaining why in a matchReason field.
 *
 * If a new product gets added to the DB tomorrow, the AI sees it immediately.
 * No code change needed.
 */

import { prisma } from "@/lib/prisma";
import type { ExtractedLEDSpec } from "./unified/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_EXTRACTION_MODEL || "gemini-2.5-flash";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// ── Tool definition for Gemini function calling ──

const QUERY_PRODUCTS_TOOL = {
  functionDeclarations: [{
    name: "query_products",
    description: "Search the ANC product database for LED display products matching the given criteria. Returns real products with pricing.",
    parameters: {
      type: "OBJECT",
      properties: {
        environment: {
          type: "STRING",
          enum: ["indoor", "outdoor"],
          description: "Installation environment",
        },
        minPixelPitch: {
          type: "NUMBER",
          description: "Minimum pixel pitch in mm (e.g., 3.0)",
        },
        maxPixelPitch: {
          type: "NUMBER",
          description: "Maximum pixel pitch in mm (e.g., 5.0)",
        },
        minBrightness: {
          type: "NUMBER",
          description: "Minimum brightness in nits the product must meet",
        },
        excludePatterns: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Product name patterns to exclude (e.g., ['courtside', 'stanchion', 'mesh', 'scoring', 'clock', 'tv'])",
        },
      },
      required: ["environment"],
    },
  }],
};

// ── Execute the tool: query ManufacturerProduct table ──

async function executeQueryProducts(args: {
  environment: string;
  minPixelPitch?: number;
  maxPixelPitch?: number;
  minBrightness?: number;
  excludePatterns?: string[];
}): Promise<any[]> {
  const where: any = { isActive: true };

  // Environment filter
  if (args.environment === "outdoor") {
    where.environment = { in: ["outdoor", "indoor_outdoor"] };
  } else {
    where.environment = { in: ["indoor", "indoor_outdoor"] };
  }

  // Pitch range
  if (args.minPixelPitch != null || args.maxPixelPitch != null) {
    where.pixelPitch = {};
    if (args.minPixelPitch != null) where.pixelPitch.gte = args.minPixelPitch;
    if (args.maxPixelPitch != null) where.pixelPitch.lte = args.maxPixelPitch;
  }

  // Brightness minimum
  if (args.minBrightness != null) {
    where.maxNits = { gte: args.minBrightness };
  }

  const products = await prisma.manufacturerProduct.findMany({
    where,
    orderBy: { pixelPitch: "asc" },
    take: 30,
  });

  // Apply exclude patterns in code (Prisma doesn't support NOT LIKE arrays easily)
  const excludePatterns = (args.excludePatterns || []).map(p => new RegExp(p, "i"));
  const filtered = excludePatterns.length > 0
    ? products.filter(p => !excludePatterns.some(rx => rx.test(p.displayName) || rx.test(p.modelNumber)))
    : products;

  return filtered.map(p => ({
    id: p.id,
    modelNumber: p.modelNumber,
    name: p.displayName,
    manufacturer: p.manufacturer,
    pitch: p.pixelPitch,
    nits: p.maxNits,
    environment: p.environment,
    cabinetWidthMm: p.cabinetWidthMm,
    cabinetHeightMm: p.cabinetHeightMm,
    weightKgPerCab: p.weightKgPerCabinet,
    maxPowerWPerCab: p.maxPowerWattsPerCab,
    pricePerSqft: p.standardPricePerSqft,
    productLine: p.productLine,
    application: p.application,
  }));
}

// ── Match result type ──

export interface AIProductMatch {
  displayName: string;
  productId: string | null;
  productModelNumber: string | null;
  productName: string | null;
  matchReason: string;
}

// ── Main: match products for extracted displays using Gemini + function calling ──

export async function matchProductsWithAI(
  displays: ExtractedLEDSpec[],
  onProgress?: (msg: string) => void,
): Promise<AIProductMatch[]> {
  if (!GEMINI_API_KEY || displays.length === 0) {
    return displays.map(d => ({
      displayName: d.name,
      productId: null,
      productModelNumber: null,
      productName: null,
      matchReason: "No API key or no displays",
    }));
  }

  const url = `${BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  // Build the display list for Gemini
  const displayList = displays.map((d, i) => ({
    index: i,
    name: d.name,
    environment: d.environment,
    pixelPitchMm: d.pixelPitchMm,
    brightnessNits: d.brightnessNits,
    widthFt: d.widthFt,
    heightFt: d.heightFt,
    areaSqFt: (d.widthFt || 0) * (d.heightFt || 0),
  }));

  onProgress?.(`Matching products for ${displays.length} displays...`);

  // Step 1: Send displays to Gemini with the query_products tool
  const step1Body = {
    contents: [{
      role: "user",
      parts: [{
        text: `You are an LED display product matcher for ANC (stadium LED integrator). You have ${displays.length} displays extracted from an RFP that need to be matched to real products from our database.

For each display, call the query_products tool to find matching products. Use these rules:
- Set environment to match the display (indoor/outdoor)
- Set pitch range to ±2mm of the display's pixel pitch
- Set minBrightness to 50% of the display's nits requirement (allows close matches — e.g., 7500 nits product for 8000 nits spec is acceptable)
- Always exclude: courtside, stanchion, scoring, clock, tv, mesh (unless the display is specifically a mesh application)

Here are the displays to match:
${JSON.stringify(displayList, null, 2)}

Call query_products for each unique combination of environment + pitch range. You can batch displays with the same specs into one query.`,
      }],
    }],
    tools: [QUERY_PRODUCTS_TOOL],
    generationConfig: { temperature: 0 },
  };

  const step1Res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(step1Body),
  });

  if (!step1Res.ok) {
    const err = await step1Res.text();
    throw new Error(`Gemini product matching failed (step 1): ${step1Res.status} — ${err.substring(0, 300)}`);
  }

  const step1Data = await step1Res.json();
  const candidate = step1Data.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  // Step 2: Execute all function calls
  const functionResponses: any[] = [];
  const toolCalls = parts.filter((p: any) => p.functionCall);

  if (toolCalls.length === 0) {
    console.warn("[AIProductMatcher] Gemini made no tool calls — returning empty matches");
    return displays.map(d => ({
      displayName: d.name,
      productId: null,
      productModelNumber: null,
      productName: null,
      matchReason: "AI did not query products",
    }));
  }

  onProgress?.(`Querying database for ${toolCalls.length} product searches...`);

  for (const part of toolCalls) {
    const args = part.functionCall.args;
    console.log(`[AIProductMatcher] Tool call: query_products(${JSON.stringify(args)})`);
    const result = await executeQueryProducts(args);
    console.log(`[AIProductMatcher] → ${result.length} products returned`);
    functionResponses.push({
      functionResponse: {
        name: "query_products",
        response: { products: result },
      },
    });
  }

  // Step 3: Send function results back to Gemini for final matching
  onProgress?.("AI selecting best product for each display...");

  const step3Body = {
    contents: [
      // Original request
      { role: "user", parts: step1Body.contents[0].parts },
      // Gemini's function calls
      { role: "model", parts: toolCalls },
      // Our function responses
      { role: "function", parts: functionResponses },
      // Ask for final matching
      {
        role: "user",
        parts: [{
          text: `Now match each display to the best product from the query results. Return ONLY a JSON array:
[
  {
    "displayIndex": 0,
    "displayName": "Panthers Den",
    "productId": "cuid_from_db",
    "productModelNumber": "model_number",
    "productName": "Full Product Name",
    "matchReason": "Brief explanation of why this product was selected"
  }
]

Rules:
- Pick the product with the closest pixel pitch that meets or exceeds the brightness requirement
- Prefer products from the same manufacturer family (all Yaham or all LG for consistency)
- If no product meets the specs, set productId to null and explain why in matchReason
- EVERY display must have an entry in the array`,
        }],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 16384,
    },
  };

  const step3Res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(step3Body),
  });

  if (!step3Res.ok) {
    const err = await step3Res.text();
    throw new Error(`Gemini product matching failed (step 3): ${step3Res.status} — ${err.substring(0, 300)}`);
  }

  const step3Data = await step3Res.json();
  const matchText = step3Data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!matchText) {
    throw new Error("Gemini returned empty match response");
  }

  const cleaned = matchText.replace(/^```json\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  const matches: any[] = JSON.parse(cleaned);

  console.log(`[AIProductMatcher] ${matches.length} matches returned`);
  onProgress?.(`Matched ${matches.filter((m: any) => m.productId).length}/${displays.length} displays to products`);

  // Map back to our return type, ensuring every display has a match entry
  return displays.map((d, i) => {
    const match = matches.find((m: any) => m.displayIndex === i) || matches.find((m: any) => m.displayName === d.name);
    return {
      displayName: d.name,
      productId: match?.productId || null,
      productModelNumber: match?.productModelNumber || null,
      productName: match?.productName || null,
      matchReason: match?.matchReason || "No match found",
    };
  });
}
