/**
 * POST /api/cms/project/[id]/bom/apply-smart-defaults
 *
 * Applies smart-default quantities for Integration / Training / Shipping
 * based on the existing hardware loadout. Only fills rows that are currently
 * $0 — never overrides a value the user already set.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";
import { ensureProjectBom, recomputeBomTotals } from "@/lib/cms/bomService";
import { computeSmartDefaults } from "@/lib/cms/smartDefaults";

const prisma = new PrismaClient();

const SOFT_COST_SKUS = {
  INTEGRATION: "CMS-INTEG-WEEK",
  TRAINING: "CMS-TRAINING-WEEK",
  SHIP_PKG: "CMS-SHIP-PKG",
  SHIP_MILES: "CMS-SHIP-MILES",
  SHIP_WEIGHT: "CMS-SHIP-WEIGHT",
};

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;
    const { id: proposalId } = await params;

    const bom = await ensureProjectBom(prisma, proposalId);

    const defaults = computeSmartDefaults(
      bom.lineItems.map((li) => ({
        category: li.catalogItem.category,
        quantity: Number(li.quantity),
      }))
    );

    const catalogBySku = new Map(
      (
        await prisma.cmsCatalogItem.findMany({
          where: { sku: { in: Object.values(SOFT_COST_SKUS) } },
        })
      ).map((c) => [c.sku, c])
    );

    const proposed: Array<{ sku: string; qty: number }> = [
      { sku: SOFT_COST_SKUS.INTEGRATION, qty: defaults.integrationWeeks },
      { sku: SOFT_COST_SKUS.TRAINING, qty: defaults.trainingWeeks },
      { sku: SOFT_COST_SKUS.SHIP_PKG, qty: defaults.shippingPackages },
      { sku: SOFT_COST_SKUS.SHIP_MILES, qty: defaults.shippingMiles },
      { sku: SOFT_COST_SKUS.SHIP_WEIGHT, qty: defaults.shippingWeightLbs },
    ];

    await prisma.$transaction(async (tx) => {
      for (const { sku, qty } of proposed) {
        if (qty <= 0) continue;
        const ci = catalogBySku.get(sku);
        if (!ci) continue;
        const existing = bom.lineItems.find((li) => li.catalogItemId === ci.id);
        if (existing && Number(existing.quantity) > 0) continue; // don't override user

        const activeVersion = await tx.cmsCatalogVersion.findFirst({
          where: { catalogItemId: ci.id, retiredAt: null },
          orderBy: { effectiveAt: "desc" },
        });

        if (existing) {
          await tx.cmsBomLineItem.update({
            where: { id: existing.id },
            data: {
              quantity: new Prisma.Decimal(qty),
              isAutoDefault: true,
              catalogVersionId: activeVersion?.id ?? null,
              unitCostSnapshot: ci.unitCost,
              unitPriceSnapshot: ci.unitPrice,
            },
          });
        } else {
          await tx.cmsBomLineItem.create({
            data: {
              bomId: bom.id,
              catalogItemId: ci.id,
              catalogVersionId: activeVersion?.id ?? null,
              quantity: new Prisma.Decimal(qty),
              unitCostSnapshot: ci.unitCost,
              unitPriceSnapshot: ci.unitPrice,
              isAutoDefault: true,
            },
          });
        }
      }
      await tx.cmsProjectBom.update({
        where: { id: bom.id },
        data: { smartDefaultsApplied: true },
      });
    });

    const fresh = await recomputeBomTotals(prisma, bom.id);
    return NextResponse.json({ bom: fresh, rationale: defaults.rationale });
  } catch (error) {
    log.error("[cms/project/:id/bom/apply-smart-defaults] error:", error);
    return NextResponse.json({ error: "Failed to apply smart defaults" }, { status: 500 });
  }
}
