/**
 * /api/cms/catalog
 *
 * GET — list catalog items, optionally filtered by category / active state.
 * POST — admin create a new SKU. Snapshots a CmsCatalogVersion at creation.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, CmsCategory, Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";

const prisma = new PrismaClient();

const VALID_CATEGORIES: CmsCategory[] = [
  "SERVER_EQUIPMENT",
  "SERVER_ADDON",
  "USER_STATION",
  "INTERCONNECT",
  "TRIGGER_HARDWARE",
  "SCALER",
  "ROUTER",
  "KVM",
  "BROADCAST_DA",
  "RACK",
  "TRAINING",
  "INTEGRATION",
  "SHIPPING",
  "LICENSE",
  "SUPPORT_TIER",
];

export async function GET(request: NextRequest) {
  try {
    const [, authError] = await requireAuth();
    if (authError) return authError;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const activeOnly = searchParams.get("active") !== "false";
    const groupBy = searchParams.get("groupBy"); // "category" returns grouped shape

    const where: Prisma.CmsCatalogItemWhereInput = {};
    if (activeOnly) where.isActive = true;
    if (category && (VALID_CATEGORIES as string[]).includes(category)) {
      where.category = category as CmsCategory;
    }

    const items = await prisma.cmsCatalogItem.findMany({
      where,
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { displayName: "asc" }],
    });

    if (groupBy === "category") {
      const grouped: Record<string, typeof items> = {};
      for (const it of items) {
        (grouped[it.category] ??= []).push(it);
      }
      return NextResponse.json({ grouped, total: items.length });
    }

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    log.error("[cms/catalog] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch CMS catalog" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const [session, authError] = await requireAuth();
    if (authError) return authError;
    const body = await request.json();

    const { sku, displayName, category, unitCost } = body;
    if (!sku || !displayName || !category || unitCost == null) {
      return NextResponse.json(
        { error: "Missing required: sku, displayName, category, unitCost" },
        { status: 400 }
      );
    }
    if (!(VALID_CATEGORIES as string[]).includes(category)) {
      return NextResponse.json({ error: `Invalid category: ${category}` }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.cmsCatalogItem.create({
        data: {
          sku,
          displayName,
          category,
          unitCost: new Prisma.Decimal(unitCost),
          unitPrice: body.unitPrice != null ? new Prisma.Decimal(body.unitPrice) : null,
          unit: body.unit ?? "each",
          maxWatt: body.maxWatt != null ? Number(body.maxWatt) : null,
          heatLoadBtu: body.heatLoadBtu != null ? Number(body.heatLoadBtu) : null,
          internalNotes: body.internalNotes ?? null,
          customerNotes: body.customerNotes ?? null,
          sortOrder: body.sortOrder ?? 0,
        },
      });
      await tx.cmsCatalogVersion.create({
        data: {
          catalogItemId: item.id,
          unitCost: item.unitCost,
          unitPrice: item.unitPrice,
          changedBy: session?.user?.email ?? "unknown",
        },
      });
      return item;
    });

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "SKU already exists" }, { status: 409 });
    }
    log.error("[cms/catalog] POST error:", error);
    return NextResponse.json({ error: "Failed to create CMS item" }, { status: 500 });
  }
}
