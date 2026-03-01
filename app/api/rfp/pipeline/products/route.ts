import { NextRequest, NextResponse } from "next/server";
import { ProductMatcher } from "@/services/catalog/productMatcher";

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
        label: `${p.name} (${p.pitch}mm, ${p.nits} nits)`,
        manufacturer: p.manufacturer,
        name: p.name,
        modelNumber: p.modelNumber,
        pitch: p.pitch,
        nits: p.nits,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        environment: p.environment,
      })),
    });
  } catch (err: any) {
    console.error("[products] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
