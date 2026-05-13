/**
 * /api/cms/catalog/[id]
 *
 * GET    — fetch single catalog item with version history
 * PATCH  — admin update fields. Any unitCost or unitPrice change snapshots
 *          a new CmsCatalogVersion so historical proposals can pin.
 * DELETE — soft-delete (isActive = false). Hard delete blocked if line items
 *          on existing proposals reference it.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";

const prisma = new PrismaClient();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;
    const { id } = await params;

    const item = await prisma.cmsCatalogItem.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { effectiveAt: "desc" }, take: 20 },
      },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const inUseCount = await prisma.cmsBomLineItem.count({
      where: { catalogItemId: id },
    });

    return NextResponse.json({ item, inUseCount });
  } catch (error) {
    log.error("[cms/catalog/:id] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch CMS item" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, authError] = await requireAuth();
    if (authError) return authError;
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.cmsCatalogItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updateData: Prisma.CmsCatalogItemUpdateInput = {};
    if (body.displayName != null) updateData.displayName = body.displayName;
    if (body.category != null) updateData.category = body.category;
    if (body.unitCost != null) updateData.unitCost = new Prisma.Decimal(body.unitCost);
    if (body.unitPrice !== undefined)
      updateData.unitPrice = body.unitPrice == null ? null : new Prisma.Decimal(body.unitPrice);
    if (body.unit != null) updateData.unit = body.unit;
    if (body.maxWatt !== undefined)
      updateData.maxWatt = body.maxWatt == null ? null : Number(body.maxWatt);
    if (body.heatLoadBtu !== undefined)
      updateData.heatLoadBtu = body.heatLoadBtu == null ? null : Number(body.heatLoadBtu);
    if (body.internalNotes !== undefined) updateData.internalNotes = body.internalNotes;
    if (body.customerNotes !== undefined) updateData.customerNotes = body.customerNotes;
    if (body.sortOrder != null) updateData.sortOrder = body.sortOrder;
    if (body.isActive != null) updateData.isActive = body.isActive;

    const priceChanged =
      (body.unitCost != null && Number(body.unitCost) !== Number(existing.unitCost)) ||
      (body.unitPrice !== undefined &&
        Number(body.unitPrice ?? 0) !== Number(existing.unitPrice ?? 0));

    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.cmsCatalogItem.update({ where: { id }, data: updateData });
      if (priceChanged) {
        // Retire the active version and snapshot the new one
        await tx.cmsCatalogVersion.updateMany({
          where: { catalogItemId: id, retiredAt: null },
          data: { retiredAt: new Date() },
        });
        await tx.cmsCatalogVersion.create({
          data: {
            catalogItemId: id,
            unitCost: item.unitCost,
            unitPrice: item.unitPrice,
            changedBy: session?.user?.email ?? "unknown",
          },
        });
      }
      return item;
    });

    return NextResponse.json({ item: updated, priceChanged });
  } catch (error) {
    log.error("[cms/catalog/:id] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update CMS item" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;
    const { id } = await params;

    // Soft-delete: mark inactive. Per feedback_soft_delete_default_for_bulk —
    // never hard-delete a SKU referenced by historical BOMs.
    const updated = await prisma.cmsCatalogItem.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ item: updated });
  } catch (error) {
    log.error("[cms/catalog/:id] DELETE error:", error);
    return NextResponse.json({ error: "Failed to archive CMS item" }, { status: 500 });
  }
}
