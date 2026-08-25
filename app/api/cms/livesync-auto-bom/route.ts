/**
 * /api/cms/livesync-auto-bom
 *
 * POST — generate a LiveSync Control System BOM from a screen list using
 * Jackson Hart's selection rules (2026-07-02 call). Prices come from the
 * live CMS catalog so admin rate-card updates flow through immediately.
 *
 * Read-only against the database; persists nothing. The result is a
 * proposal for a human to review — every judgment call carries a flag.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
import type { UserRole } from "@/lib/rbac";
import { log } from "@/lib/logger";
import {
  buildLivesyncAutoBom,
  type LivesyncJobInput,
  type LivesyncScreenInput,
} from "@/lib/cms/livesyncAutoBom";
import { LIVESYNC_TOOL_ROLES } from "@/lib/cms/livesyncAccess";
import { resolveLivesyncPricing } from "@/lib/cms/livesyncPricing";

const ALLOWED_ROLES: UserRole[] = LIVESYNC_TOOL_ROLES;

export async function POST(request: NextRequest) {
  try {
    const [session, authError] = await requireAuth();
    if (authError) return authError;
    const role = (session as unknown as { user?: { role?: UserRole } } | null)?.user?.role;
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.screens) || body.screens.length === 0) {
      return NextResponse.json(
        { error: "Provide at least one screen: { screens: [{ name, pixelWidth, pixelHeight }] }" },
        { status: 400 }
      );
    }

    const screens: LivesyncScreenInput[] = [];
    for (const raw of body.screens as Record<string, unknown>[]) {
      const pixelWidth = Number(raw.pixelWidth);
      const pixelHeight = Number(raw.pixelHeight);
      if (!Number.isFinite(pixelWidth) || pixelWidth <= 0 || !Number.isFinite(pixelHeight) || pixelHeight <= 0) {
        return NextResponse.json(
          { error: `Screen "${String(raw.name ?? "?")}" needs positive pixelWidth and pixelHeight.` },
          { status: 400 }
        );
      }
      const widthFt = raw.physicalWidthFt == null || raw.physicalWidthFt === "" ? null : Number(raw.physicalWidthFt);
      // Ribbon mapping is deliberately tri-state: true forces stripping, false
      // forces the standard grid, and absent lets the screen's shape decide.
      const ribbon =
        raw.ribbon === true || raw.ribbon === "true"
          ? true
          : raw.ribbon === false || raw.ribbon === "false"
            ? false
            : undefined;
      screens.push({
        name: String(raw.name || `Screen ${screens.length + 1}`),
        pixelWidth,
        pixelHeight,
        liveVideo: !!raw.liveVideo,
        outdoor: !!raw.outdoor,
        physicalWidthFt: Number.isFinite(widthFt as number) && (widthFt as number) > 0 ? widthFt : null,
        ribbon,
      });
    }

    const job: LivesyncJobInput = {
      screens,
      sportsVenue: body.sportsVenue !== false,
      includeLicense: !!body.includeLicense,
    };

    const catalogItems = await prisma.cmsCatalogItem.findMany({
      orderBy: { sortOrder: "asc" },
    });
    const catalog = catalogItems.map((item) => ({
      sku: item.sku,
      displayName: item.displayName,
      category: item.category as string,
      unitCost: Number(item.unitCost),
      unitPrice: item.unitPrice == null ? null : Number(item.unitPrice),
      isActive: item.isActive,
    }));

    const pricing = await resolveLivesyncPricing();
    const result = buildLivesyncAutoBom(job, catalog, pricing);

    const newestPriceUpdate = catalogItems.reduce<Date | null>(
      (acc, item) => (acc == null || item.updatedAt > acc ? item.updatedAt : acc),
      null
    );

    return NextResponse.json({
      ...result,
      catalog: {
        itemCount: catalog.length,
        lastPriceUpdate: newestPriceUpdate?.toISOString() ?? null,
      },
    });
  } catch (error) {
    log.error("livesync-auto-bom failed", { error: String(error) });
    return NextResponse.json({ error: "Failed to generate BOM" }, { status: 500 });
  }
}
