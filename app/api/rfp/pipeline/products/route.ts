import { NextRequest, NextResponse } from "next/server";
import { ProductMatcher } from "@/services/catalog/productMatcher";
import { log } from "@/lib/logger";

/**
 * GET /api/rfp/pipeline/products?environment=indoor|outdoor
 * Returns all available LED products for a dropdown selector.
 */
export async function GET(request: NextRequest) {
  try {
    const env = request.nextUrl.searchParams.get("environment") as "indoor" | "outdoor" | null;
    const products = await ProductMatcher.listProducts(env || undefined);

    return NextResponse.json({
      products: products.map((p) => ({
        id: p.id,
        label: p.nits > 0
          ? `${p.name} (${p.pitch}mm, ${p.nits} nits)`
          : `${p.name} [Scoring/Timing]`,
        manufacturer: p.manufacturer,
        name: p.name,
        modelNumber: p.modelNumber,
        pitch: p.pitch,
        nits: p.nits,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        moduleWidthMm: p.moduleWidthMm,
        moduleHeightMm: p.moduleHeightMm,
        supportsHalfModule: p.supportsHalfModule,
        weightKg: p.weightKg,
        maxPowerWatts: p.maxPowerWatts,
        environment: p.environment,
      })),
    });
  } catch (err: any) {
    log.error("[products] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
