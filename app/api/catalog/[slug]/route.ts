import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const catalogs: any[] = await prisma.$queryRawUnsafe(`
    SELECT c.id, c.slug, c."clientName", c.title, c.subtitle
    FROM "ImprovementCatalog" c WHERE c.slug = $1 LIMIT 1
  `, slug);

  if (!catalogs.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const catalog = catalogs[0];

  const items: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, description, tier, price::float, discount::float, position, status
    FROM "CatalogItem" WHERE "catalogId" = $1
    ORDER BY position ASC
  `, catalog.id);

  return NextResponse.json({ ...catalog, items });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json();

  if (body.action === "updateItem") {
    const { itemId, ...fields } = body;
    const sets: string[] = [];
    const vals: any[] = [itemId];
    let idx = 2;

    for (const [key, val] of Object.entries(fields)) {
      if (["title", "description", "tier", "status"].includes(key)) {
        sets.push(`"${key}" = $${idx}`);
        vals.push(val);
        idx++;
      }
      if (["price", "discount", "position"].includes(key)) {
        sets.push(`"${key}" = $${idx}`);
        vals.push(Number(val));
        idx++;
      }
    }

    if (sets.length > 0) {
      sets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
      await prisma.$executeRawUnsafe(
        `UPDATE "CatalogItem" SET ${sets.join(", ")} WHERE id = $1`,
        ...vals
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === "addItem") {
    const id = `ci-${Date.now()}`;
    const catalogs: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM "ImprovementCatalog" WHERE slug = $1`, slug
    );
    if (!catalogs.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const maxPos: any[] = await prisma.$queryRawUnsafe(
      `SELECT COALESCE(MAX(position), 0) + 1 as next FROM "CatalogItem" WHERE "catalogId" = $1`,
      catalogs[0].id
    );

    await prisma.$executeRawUnsafe(`
      INSERT INTO "CatalogItem" (id, "catalogId", title, description, tier, price, discount, position, status, "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'available', CURRENT_TIMESTAMP)
    `, id, catalogs[0].id, body.title || "New Item", body.description || "", body.tier || "small", body.price || 0, maxPos[0].next);

    return NextResponse.json({ id });
  }

  if (body.action === "deleteItem") {
    await prisma.$executeRawUnsafe(`DELETE FROM "CatalogItem" WHERE id = $1`, body.itemId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reorder") {
    for (const { id, position } of body.items) {
      await prisma.$executeRawUnsafe(
        `UPDATE "CatalogItem" SET position = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        id, position
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
