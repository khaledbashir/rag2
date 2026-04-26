/**
 * POST /api/admin/sync-products-to-crm
 *
 * One-shot mirror: walks every active rag2 ManufacturerProduct and upserts
 * the matching Twenty LedProduct (by modelNumber). Paced at 0.7s per row to
 * stay under the 100/60s shared Twenty rate limit. ADMIN only.
 *
 * Returns a per-row report with action ('created' | 'updated' | 'failed') so
 * we have proof of what landed in Twenty without grepping logs.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncProductToTwenty } from "@/services/integrations/twenty/productSync";
import type { UserRole } from "@/lib/rbac";

export const maxDuration = 600;

type RowResult = {
  modelNumber: string;
  manufacturer: string;
  ok: boolean;
  action?: "created" | "updated";
  twentyId?: string;
  error?: string;
};

export async function POST() {
  const session = await auth();
  const userRole = (session?.user as any)?.role as UserRole | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const products = await prisma.manufacturerProduct.findMany({
    where: { isActive: true },
    orderBy: [{ manufacturer: "asc" }, { modelNumber: "asc" }],
    select: { id: true, modelNumber: true, manufacturer: true },
  });

  const results: RowResult[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const p of products) {
    const r = await syncProductToTwenty(p.id);
    if (r.ok) {
      results.push({
        modelNumber: p.modelNumber,
        manufacturer: p.manufacturer,
        ok: true,
        action: r.action,
        twentyId: r.twentyId,
      });
      if (r.action === "created") created++;
      else updated++;
    } else {
      results.push({
        modelNumber: p.modelNumber,
        manufacturer: p.manufacturer,
        ok: false,
        error: r.error,
      });
      failed++;
    }
    // Pace under 100/60s shared rate limit (≈1.4 req/s upper bound; 2 GraphQL
    // calls per row — find + upsert — so 0.7s gap keeps us comfortably under).
    await new Promise((res) => setTimeout(res, 700));
  }

  return NextResponse.json({
    summary: {
      total: products.length,
      created,
      updated,
      failed,
    },
    failures: results.filter((r) => !r.ok),
    results,
  });
}
