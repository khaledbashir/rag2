import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const catalogs = await prisma.$queryRawUnsafe(`
    SELECT c.id, c.slug, c."clientName", c.title, c."createdAt",
           COUNT(i.id)::int as "itemCount",
           COALESCE(SUM(CASE WHEN i.status != 'shipped' AND i.tier != 'retainer' THEN i.price * (1 - i.discount/100) ELSE 0 END), 0)::float as "totalAvailable",
           COALESCE(SUM(CASE WHEN i.status = 'selected' THEN i.price * (1 - i.discount/100) ELSE 0 END), 0)::float as "totalSelected"
    FROM "ImprovementCatalog" c
    LEFT JOIN "CatalogItem" i ON i."catalogId" = c.id
    GROUP BY c.id
    ORDER BY c."createdAt" DESC
  `);
  return NextResponse.json(catalogs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const slug = body.slug || `catalog-${Date.now()}`;
  const catalog = await prisma.$executeRawUnsafe(`
    INSERT INTO "ImprovementCatalog" (id, slug, "clientName", title, subtitle, "updatedAt")
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
  `, `cat-${Date.now()}`, slug, body.clientName || "Client", body.title || "Improvement Catalog", body.subtitle || null);
  return NextResponse.json({ slug }, { status: 201 });
}
