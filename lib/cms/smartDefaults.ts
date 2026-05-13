/**
 * Smart-defaults engine for CMS BOMs.
 *
 * The source CMS_BASE_BOM Excel has Integration / Training / Shipping
 * rows that default to $0 quantity and almost always stay there — so
 * quotes ship under-priced by 20-30%. This engine computes sensible
 * non-zero defaults based on the hardware loadout already on the BOM.
 *
 * Formulas:
 *   Integration weeks = max(1, ceil(serverCount / 4))
 *     — 2 engineers × 1 week per ~4 servers, floor of 1 week
 *   Training weeks    = 1 if any servers/scalers, else 0
 *   Shipping packages = ceil(serverCount + scalerCount + routerCount + 2)
 *     — 2 baseline (workstation/cables) + 1 per major piece
 *   Shipping miles    = 600 (national median — overridable)
 *   Shipping weight   = serverCount × 25 + scalerCount × 15 + 50 base lbs
 */

import type { CmsCategory } from "@prisma/client";

export interface SmartDefaultsLineItem {
  category: CmsCategory;
  quantity: number;
}

export interface SmartDefaultsResult {
  integrationWeeks: number;
  trainingWeeks: number;
  shippingPackages: number;
  shippingMiles: number;
  shippingWeightLbs: number;
  rationale: string;
}

const SHIPPING_DEFAULT_MILES = 600; // National median single-leg

export function computeSmartDefaults(items: SmartDefaultsLineItem[]): SmartDefaultsResult {
  let serverCount = 0;
  let scalerCount = 0;
  let routerCount = 0;
  let kvmCount = 0;
  let rackCount = 0;

  for (const it of items) {
    const qty = Number(it.quantity ?? 0);
    if (qty <= 0) continue;
    switch (it.category) {
      case "SERVER_EQUIPMENT":
      case "SERVER_ADDON":
        serverCount += qty;
        break;
      case "SCALER":
        scalerCount += qty;
        break;
      case "ROUTER":
        routerCount += qty;
        break;
      case "KVM":
        kvmCount += qty;
        break;
      case "RACK":
        rackCount += qty;
        break;
    }
  }

  const hasHardware = serverCount + scalerCount + routerCount + rackCount > 0;
  const integrationWeeks = hasHardware ? Math.max(1, Math.ceil(serverCount / 4)) : 0;
  const trainingWeeks = hasHardware ? 1 : 0;
  const shippingPackages = hasHardware
    ? Math.ceil(serverCount + scalerCount + routerCount + kvmCount + 2)
    : 0;
  const shippingMiles = hasHardware ? SHIPPING_DEFAULT_MILES : 0;
  const shippingWeightLbs = hasHardware
    ? Math.round(serverCount * 25 + scalerCount * 15 + 50)
    : 0;

  const rationale =
    `Based on ${serverCount} server(s), ${scalerCount} scaler(s), ` +
    `${routerCount} router(s). Integration scaled to 1 week per ~4 servers ` +
    `(minimum 1). Shipping miles default to national median; override per project.`;

  return {
    integrationWeeks,
    trainingWeeks,
    shippingPackages,
    shippingMiles,
    shippingWeightLbs,
    rationale,
  };
}
