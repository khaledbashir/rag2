/**
 * BOM service — recompute and persist subtotals for a project BOM.
 *
 * Called after every line-item mutation. Keeps the LED estimate read-side
 * O(1) by storing the grand subtotal directly on the CmsProjectBom row.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { computeHeatRollup } from "./heatRollup";

const SOFT_COST_CATEGORIES: Prisma.CmsCategoryEnumFilter["in"] = [
  "TRAINING",
  "INTEGRATION",
  "SHIPPING",
];
const LICENSE_CATEGORIES: Prisma.CmsCategoryEnumFilter["in"] = [
  "LICENSE",
  "SUPPORT_TIER",
];

export async function recomputeBomTotals(prisma: PrismaClient, bomId: string) {
  const lineItems = await prisma.cmsBomLineItem.findMany({
    where: { bomId },
    include: { catalogItem: true },
  });

  let hardwareSubtotal = 0;
  let licenseSubtotal = 0;
  let softCostSubtotal = 0;

  for (const li of lineItems) {
    const qty = Number(li.quantity ?? 0);
    if (qty <= 0) continue;
    const unit = Number(li.unitPriceSnapshot ?? li.unitCostSnapshot ?? 0);
    const lineTotal = qty * unit;
    const cat = li.catalogItem.category;
    if (cat === "LICENSE" || cat === "SUPPORT_TIER") {
      licenseSubtotal += lineTotal;
    } else if (cat === "TRAINING" || cat === "INTEGRATION" || cat === "SHIPPING") {
      softCostSubtotal += lineTotal;
    } else {
      hardwareSubtotal += lineTotal;
    }
  }

  const heat = computeHeatRollup(
    lineItems.map((li) => ({
      quantity: Number(li.quantity),
      catalogItem: {
        maxWatt: li.catalogItem.maxWatt,
        heatLoadBtu: li.catalogItem.heatLoadBtu,
      },
    }))
  );

  const grandSubtotal = hardwareSubtotal + licenseSubtotal + softCostSubtotal;

  return prisma.cmsProjectBom.update({
    where: { id: bomId },
    data: {
      hardwareSubtotal: new Prisma.Decimal(hardwareSubtotal.toFixed(2)),
      licenseSubtotal: new Prisma.Decimal(licenseSubtotal.toFixed(2)),
      softCostSubtotal: new Prisma.Decimal(softCostSubtotal.toFixed(2)),
      grandSubtotal: new Prisma.Decimal(grandSubtotal.toFixed(2)),
      totalWatt: heat.totalWatt,
      totalHeatBtu: heat.totalHeatBtu,
      estimatedAcTons: heat.estimatedAcTons,
      acCapacityFlag: heat.acCapacityFlag,
    },
    include: { lineItems: { include: { catalogItem: true } } },
  });
}

export async function ensureProjectBom(prisma: PrismaClient, proposalId: string) {
  return prisma.cmsProjectBom.upsert({
    where: { proposalId },
    update: {},
    create: { proposalId },
    include: { lineItems: { include: { catalogItem: true } } },
  });
}

export { SOFT_COST_CATEGORIES, LICENSE_CATEGORIES };
