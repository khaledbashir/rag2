/**
 * /api/cms/project/[id]/bom
 *
 * GET — fetch (or create) the BOM for a proposal. Returns line items grouped
 *       by category, computed subtotals, heat/power rollup.
 * PUT — replace the BOM line items in one call. Body: { items: [{ catalogItemId, quantity }] }
 *       Pins the active catalog version for each item at write time. Recomputes
 *       all subtotals afterward.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";
import { ensureProjectBom, recomputeBomTotals } from "@/lib/cms/bomService";
import { computeSmartDefaults } from "@/lib/cms/smartDefaults";

const prisma = new PrismaClient();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;
    const { id: proposalId } = await params;

    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, clientName: true, venue: true, workspaceId: true },
    });
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    const bom = await ensureProjectBom(prisma, proposalId);

    // Smart-defaults recommendation for the current loadout (does NOT mutate).
    const smartDefaults = computeSmartDefaults(
      bom.lineItems.map((li) => ({
        category: li.catalogItem.category,
        quantity: Number(li.quantity),
      }))
    );

    // Empty-row warnings: which soft-cost categories are missing or $0?
    const softCostWarnings: string[] = [];
    const hasItemsByCategory = (cat: string) =>
      bom.lineItems.some(
        (li) => li.catalogItem.category === cat && Number(li.quantity) > 0
      );
    const hasHardware = ["SERVER_EQUIPMENT", "SCALER", "ROUTER", "RACK"].some(hasItemsByCategory);
    if (hasHardware) {
      if (!hasItemsByCategory("INTEGRATION"))
        softCostWarnings.push("Integration is $0 — quotes with hardware almost always need on-site integration.");
      if (!hasItemsByCategory("TRAINING"))
        softCostWarnings.push("Training is $0 — most projects bill at least one training week.");
      if (!hasItemsByCategory("SHIPPING"))
        softCostWarnings.push("Shipping is $0 — hardware needs to physically arrive.");
    }

    return NextResponse.json({
      proposal,
      bom,
      smartDefaults,
      softCostWarnings,
    });
  } catch (error) {
    log.error("[cms/project/:id/bom] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch BOM" }, { status: 500 });
  }
}

interface IncomingLineItem {
  catalogItemId: string;
  quantity: number | string;
  isAutoDefault?: boolean;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;
    const { id: proposalId } = await params;
    const body = await request.json();
    const incoming: IncomingLineItem[] = Array.isArray(body.items) ? body.items : [];

    const proposal = await prisma.proposal.findUnique({ where: { id: proposalId }, select: { id: true } });
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    const bom = await ensureProjectBom(prisma, proposalId);

    // Pre-load every referenced catalog item + its active version.
    const ids = Array.from(new Set(incoming.map((it) => it.catalogItemId).filter(Boolean)));
    const catalogItems = await prisma.cmsCatalogItem.findMany({
      where: { id: { in: ids } },
      include: {
        versions: { where: { retiredAt: null }, orderBy: { effectiveAt: "desc" }, take: 1 },
      },
    });
    const itemMap = new Map(catalogItems.map((ci) => [ci.id, ci]));

    await prisma.$transaction(async (tx) => {
      await tx.cmsBomLineItem.deleteMany({ where: { bomId: bom.id } });

      for (const it of incoming) {
        const ci = itemMap.get(it.catalogItemId);
        if (!ci) continue;
        const qty = Number(it.quantity ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const activeVersion = ci.versions[0]?.id ?? null;
        await tx.cmsBomLineItem.create({
          data: {
            bomId: bom.id,
            catalogItemId: ci.id,
            catalogVersionId: activeVersion,
            quantity: new Prisma.Decimal(qty),
            unitCostSnapshot: ci.unitCost,
            unitPriceSnapshot: ci.unitPrice,
            isAutoDefault: Boolean(it.isAutoDefault),
          },
        });
      }
    });

    const fresh = await recomputeBomTotals(prisma, bom.id);
    return NextResponse.json({ bom: fresh });
  } catch (error) {
    log.error("[cms/project/:id/bom] PUT error:", error);
    return NextResponse.json({ error: "Failed to save BOM" }, { status: 500 });
  }
}
