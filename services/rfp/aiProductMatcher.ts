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

const MIMO_API_KEY = process.env.MIMO_API_KEY || "";
const MIMO_API_BASE = process.env.MIMO_API_BASE || "https://api.xiaomimimo.com/v1";
const MIMO_MODEL = process.env.MIMO_MODEL || "mimo-v2-omni";

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

    onProgress?.(`Matching ${displays.length} displays with MiMo...`);

    const prompt = `You are an LED product matcher. For each display below, find the best product from the database.

Call query_products for each unique environment+pitch combination.

Display specs:
${JSON.stringify(displayList, null, 2)}

Rules:
- Match indoor displays to indoor products, outdoor to outdoor
- Pitch ±2mm tolerance acceptable
- Always exclude: courtside, stanchion, scoring, clock, tv, mesh
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

export async function matchProductsWithAI(
  displays: ExtractedLEDSpec[],
  onProgress?: (msg: string) => void,
): Promise<AIProductMatch[]> {
  if (displays.length === 0) return [];

  onProgress?.(`Matching ${displays.length} displays to products...`);

  // Try MiMo first (AI-powered matching with DB function calling)
  const mimoMatches = await matchViaMiMo(displays, onProgress);
  if (mimoMatches) return mimoMatches;

  // Fallback: deterministic DB matcher (always works, no AI needed)
  console.log("[AIProductMatcher] MiMo unavailable — using deterministic DB matcher");
  onProgress?.("Matching products from database...");
  return Promise.all(displays.map(d => matchViaDb(d)));
}
