/**
 * AI Product Matcher — matches extracted displays to real products.
 *
 * Pipeline:
 * 1. Try MiMo V2 (vision model) — queries DB, picks best match per display
 * 2. Fallback: ProductMatcher.matchProduct (deterministic, no AI needed)
 *
 * Never depends on Gemini. MiMo is the primary, DB matcher is the safety net.
 */

import { prisma } from "@/lib/prisma";
import type { ExtractedLEDSpec } from "./unified/types";
import { ProductMatcher } from "@/services/catalog/productMatcher";

const MERCURY_API_KEY = process.env.MERCURY_API_KEY || "";
const MERCURY_API_BASE = process.env.MERCURY_API_BASE || "https://api.inceptionlabs.ai/v1";
const MERCURY_MODEL = process.env.MERCURY_MODEL || "mercury-2";
const MIMO_API_KEY = process.env.MIMO_API_KEY || "";
const MIMO_API_BASE = process.env.MIMO_API_BASE || "https://api.xiaomimimo.com/v1";
const MIMO_MODEL = process.env.MIMO_MODEL || "mimo-v2-pro";

export interface AIProductMatch {
  displayName: string;
  productId: string | null;
  productModelNumber: string | null;
  productName: string | null;
  matchReason: string;
}

async function queryProductsFromDb(args: {
  environment: string;
  minPixelPitch?: number;
  maxPixelPitch?: number;
  minBrightness?: number;
  excludePatterns?: string[];
}): Promise<any[]> {
  const where: any = { isActive: true };

  if (args.environment === "outdoor") {
    where.environment = { in: ["outdoor", "indoor_outdoor"] };
  } else {
    where.environment = { in: ["indoor", "indoor_outdoor"] };
  }

  if (args.minPixelPitch != null || args.maxPixelPitch != null) {
    where.pixelPitch = {};
    if (args.minPixelPitch != null) where.pixelPitch.gte = args.minPixelPitch;
    if (args.maxPixelPitch != null) where.pixelPitch.lte = args.maxPixelPitch;
  }

  if (args.minBrightness != null) {
    where.maxNits = { gte: args.minBrightness };
  }

  const products = await prisma.manufacturerProduct.findMany({
    where,
    orderBy: { pixelPitch: "asc" },
    take: 30,
  });

  const excludePatterns = (args.excludePatterns || []).map(p => new RegExp(p, "i"));
  return excludePatterns.length > 0
    ? products.filter(p => !excludePatterns.some(rx => rx.test(p.displayName) || rx.test(p.modelNumber)))
    : products;
}

function matchViaDb(spec: ExtractedLEDSpec): Promise<AIProductMatch> {
  return ProductMatcher.matchProduct({
    widthFt: spec.widthFt || 0,
    heightFt: spec.heightFt || 0,
    pixelPitch: spec.pixelPitchMm ?? undefined,
    brightnessNits: spec.brightnessNits ?? undefined,
    isOutdoor: spec.environment === "outdoor",
  }).then(match => ({
    displayName: spec.name,
    productId: match.module.id,
    productModelNumber: match.module.modelNumber,
    productName: match.module.name,
    matchReason: `${match.module.manufacturer} ${match.module.pitch}mm ${match.module.environment} (fit=${match.fitScore}%, ${match.confidence} confidence)`,
  })).catch(() => ({
    displayName: spec.name,
    productId: null,
    productModelNumber: null,
    productName: null,
    matchReason: "No matching product in database",
  }));
}

async function matchViaMiMo(
  displays: ExtractedLEDSpec[],
  onProgress?: (msg: string) => void,
): Promise<AIProductMatch[] | null> {
  if (!MIMO_API_KEY) return null;

  try {
    const displayList = displays.map((d, i) => ({
      index: i,
      name: d.name,
      environment: d.environment,
      pixelPitchMm: d.pixelPitchMm,
      brightnessNits: d.brightnessNits,
      widthFt: d.widthFt,
      heightFt: d.heightFt,
    }));

    onProgress?.(`Product matching: ${displays.length} displays (fallback)...`);

    const prompt = `You are an LED product matcher. For each display below, find the best product from the database.

Call query_products for each unique environment+pitch combination.

Display specs:
${JSON.stringify(displayList, null, 2)}

Rules:
- Match indoor displays to indoor products, outdoor to outdoor
- Pitch ±2mm tolerance acceptable
- Always exclude: courtside, stanchion, scoring, clock, tv, mesh
- STRONGLY prefer Yaham products over LG. Only use LG if no Yaham product meets the spec.
- Prefer same manufacturer for consistency within a project

Return ONLY a JSON array:
[{"displayIndex": 0, "productId": "cuid", "productModelNumber": "model", "productName": "Full Name", "matchReason": "why"}]

Every display must have an entry. If no product fits, set productId to null.`;

    const res = await fetch(`${MIMO_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MIMO_API_KEY}`,
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 8192,
        response_format: { type: "json_object" },
        tools: [{
          type: "function",
          function: {
            name: "query_products",
            description: "Search ANC product database for matching LED displays",
            parameters: {
              type: "object",
              properties: {
                environment: { type: "string", enum: ["indoor", "outdoor"] },
                minPixelPitch: { type: "number" },
                maxPixelPitch: { type: "number" },
                minBrightness: { type: "number" },
                excludePatterns: { type: "array", items: { type: "string" } },
              },
              required: ["environment"],
            },
          },
        }],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      console.error(`[AIProductMatcher] MiMo failed (${res.status})`);
      return null;
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) return null;

    if (msg.tool_calls?.length > 0) {
      const toolResults: any[] = [];
      for (const tc of msg.tool_calls) {
        const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        const products = await queryProductsFromDb(args);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify({ products }),
        });
      }

      const followUp = await fetch(`${MIMO_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MIMO_API_KEY}`,
        },
        body: JSON.stringify({
          model: MIMO_MODEL,
          messages: [
            { role: "user", content: prompt },
            msg,
            ...toolResults.map(tr => ({ role: "tool", content: tr.content })),
            { role: "user", content: "Now match each display. Return ONLY a JSON array with displayIndex, productId, productModelNumber, productName, matchReason." },
          ],
          temperature: 0,
          max_tokens: 8192,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (followUp.ok) {
        const followData = await followUp.json();
        const followText = followData.choices?.[0]?.message?.content || "";
        const start = followText.indexOf("[");
        const end = followText.lastIndexOf("]") + 1;
        if (start >= 0 && end > start) {
          const matches = JSON.parse(followText.substring(start, end));
          console.log(`[AIProductMatcher] MiMo matched ${matches.filter((m: any) => m.productId).length}/${displays.length}`);
          return displays.map((d, i) => {
            const m = matches.find((x: any) => x.displayIndex === i) || matches.find((x: any) => x.displayName === d.name);
            return {
              displayName: d.name,
              productId: m?.productId || null,
              productModelNumber: m?.productModelNumber || null,
              productName: m?.productName || null,
              matchReason: m?.matchReason || "No match",
            };
          });
        }
      }
    }

    const content = msg.content || "";
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]") + 1;
    if (start >= 0 && end > start) {
      const matches = JSON.parse(content.substring(start, end));
      console.log(`[AIProductMatcher] MiMo matched ${matches.filter((m: any) => m.productId).length}/${displays.length}`);
      return displays.map((d, i) => {
        const m = matches.find((x: any) => x.displayIndex === i) || matches.find((x: any) => x.displayName === d.name);
        return {
          displayName: d.name,
          productId: m?.productId || null,
          productModelNumber: m?.productModelNumber || null,
          productName: m?.productName || null,
          matchReason: m?.matchReason || "No match",
        };
      });
    }

    return null;
  } catch (err: any) {
    console.error(`[AIProductMatcher] MiMo error:`, err.message);
    return null;
  }
}

async function matchViaMercury(
  displays: ExtractedLEDSpec[],
  onProgress?: (msg: string) => void,
): Promise<AIProductMatch[] | null> {
  if (!MERCURY_API_KEY) return null;

  try {
    // Pre-query DB for indoor and outdoor products (single call each, instant)
    const envs = [...new Set(displays.map(d => d.environment || "indoor"))];
    const allProducts: any[] = [];
    for (const env of envs) {
      const products = await queryProductsFromDb({
        environment: env,
        excludePatterns: ["courtside", "stanchion", "scoring", "clock", "tv", "mesh"],
      });
      allProducts.push(...products);
    }

    if (allProducts.length === 0) return null;

    const displayList = displays.map((d, i) => ({
      index: i,
      name: d.name,
      environment: d.environment,
      pixelPitchMm: d.pixelPitchMm,
      brightnessNits: d.brightnessNits,
      widthFt: d.widthFt,
      heightFt: d.heightFt,
    }));

    const productList = allProducts.map(p => ({
      id: p.id,
      name: p.displayName,
      model: p.modelNumber,
      manufacturer: p.manufacturer,
      pitch: p.pixelPitch,
      brightness: p.brightness,
      environment: p.environment,
    }));

    onProgress?.(`Product matching: ${displays.length} displays...`);

    const prompt = `Match each LED display to the best product from the catalog.

DISPLAYS:
${JSON.stringify(displayList, null, 2)}

AVAILABLE PRODUCTS:
${JSON.stringify(productList, null, 2)}

Rules:
- Match indoor displays to indoor products, outdoor to outdoor
- Pitch ±2mm tolerance
- STRONGLY prefer Yaham products over LG. Only use LG if no Yaham product meets the spec.
- Prefer same manufacturer for consistency
- Every display must have an entry

Return ONLY a JSON array:
[{"displayIndex": 0, "productId": "id", "productModelNumber": "model", "productName": "name", "matchReason": "why"}]`;

    const res = await fetch(`${MERCURY_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MERCURY_API_KEY}`,
      },
      body: JSON.stringify({
        model: MERCURY_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 8192,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.error(`[AIProductMatcher] Mercury failed (${res.status})`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]") + 1;
    if (start >= 0 && end > start) {
      const matches = JSON.parse(content.substring(start, end));
      console.log(`[AIProductMatcher] Mercury matched ${matches.filter((m: any) => m.productId).length}/${displays.length}`);
      return displays.map((d, i) => {
        const m = matches.find((x: any) => x.displayIndex === i) || matches.find((x: any) => x.displayName === d.name);
        return {
          displayName: d.name,
          productId: m?.productId || null,
          productModelNumber: m?.productModelNumber || null,
          productName: m?.productName || null,
          matchReason: m?.matchReason || "No match",
        };
      });
    }

    return null;
  } catch (err: any) {
    console.error(`[AIProductMatcher] Mercury error:`, err.message);
    return null;
  }
}

export interface ProductMatchEvent {
  displayIndex: number;
  displayName: string;
  productName: string | null;
  productModel: string | null;
  manufacturer: string | null;
  pitch: string | null;
  matchReason: string;
  fitPercent: number | null;
  total: number;
}

export async function matchProductsWithAI(
  displays: ExtractedLEDSpec[],
  onProgress?: (msg: string) => void,
  onProductMatch?: (event: ProductMatchEvent) => void,
): Promise<AIProductMatch[]> {
  if (displays.length === 0) return [];

  onProgress?.(`Selecting products for ${displays.length} displays...`);

  // Try Mercury first (fastest — single call, no tool calling)
  const mercuryMatches = await matchViaMercury(displays, onProgress);
  if (mercuryMatches) {
    // Emit individual match events for the UI
    if (onProductMatch) {
      for (let i = 0; i < mercuryMatches.length; i++) {
        const m = mercuryMatches[i];
        const fitMatch = m.matchReason?.match(/fit=(\d+)%/);
        onProductMatch({
          displayIndex: i,
          displayName: m.displayName,
          productName: m.productName,
          productModel: m.productModelNumber,
          manufacturer: m.productName?.split(" ")[0] || null,
          pitch: m.productName?.match(/(\d+\.?\d*mm)/)?.[1] || null,
          matchReason: m.matchReason,
          fitPercent: fitMatch ? parseInt(fitMatch[1]) : null,
          total: displays.length,
        });
        // Frontend handles stagger — no delay needed here
      }
    }
    return mercuryMatches;
  }

  // Try MiMo (AI-powered matching with DB function calling)
  const mimoMatches = await matchViaMiMo(displays, onProgress);
  if (mimoMatches) {
    if (onProductMatch) {
      for (let i = 0; i < mimoMatches.length; i++) {
        const m = mimoMatches[i];
        const fitMatch = m.matchReason?.match(/fit=(\d+)%/);
        onProductMatch({
          displayIndex: i,
          displayName: m.displayName,
          productName: m.productName,
          productModel: m.productModelNumber,
          manufacturer: m.productName?.split(" ")[0] || null,
          pitch: m.productName?.match(/(\d+\.?\d*mm)/)?.[1] || null,
          matchReason: m.matchReason,
          fitPercent: fitMatch ? parseInt(fitMatch[1]) : null,
          total: displays.length,
        });
      }
    }
    return mimoMatches;
  }

  // Fallback: deterministic DB matcher (always works, no AI needed)
  console.log("[AIProductMatcher] AI matchers unavailable — using deterministic DB matcher");
  onProgress?.("Matching products from database...");
  const dbMatches = await Promise.all(displays.map(d => matchViaDb(d)));
  if (onProductMatch) {
    for (let i = 0; i < dbMatches.length; i++) {
      const m = dbMatches[i];
      const fitMatch = m.matchReason?.match(/fit=(\d+)%/);
      onProductMatch({
        displayIndex: i,
        displayName: m.displayName,
        productName: m.productName,
        productModel: m.productModelNumber,
        manufacturer: m.productName?.split(" ")[0] || null,
        pitch: m.productName?.match(/(\d+\.?\d*mm)/)?.[1] || null,
        matchReason: m.matchReason,
        fitPercent: fitMatch ? parseInt(fitMatch[1]) : null,
        total: displays.length,
      });
    }
  }
  return dbMatches;
}
