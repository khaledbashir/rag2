/**
 * Heat + power rollup for a CMS BOM.
 *
 * Sums maxWatt × qty and heatLoadBtu × qty across every selected line item,
 * derives estimated AC tonnage (1 ton ≈ 12,000 BTU/hr), and flags when the
 * load exceeds standard rack-cooling capacity (~24,000 BTU/hr per rack).
 *
 * Used by both the BOM picker UI (live readout) and the BOM service
 * (persisted totals).
 */

const STANDARD_RACK_BTU_PER_HR = 24000; // ~7 kW per rack — typical IT cooling spec
const BTU_PER_TON = 12000;

export interface HeatRollupLineItem {
  quantity: number;
  catalogItem: {
    maxWatt: number | null;
    heatLoadBtu: number | null;
  };
}

export interface HeatRollup {
  totalWatt: number;
  totalHeatBtu: number;
  estimatedAcTons: number;
  acCapacityFlag: boolean;
  acThresholdBtu: number;
}

export function computeHeatRollup(lineItems: HeatRollupLineItem[]): HeatRollup {
  let totalWatt = 0;
  let totalHeatBtu = 0;

  for (const li of lineItems) {
    const qty = Number(li.quantity ?? 0);
    if (qty <= 0) continue;
    const watt = li.catalogItem.maxWatt ?? 0;
    const btu = li.catalogItem.heatLoadBtu ?? (watt * 3.412);
    totalWatt += watt * qty;
    totalHeatBtu += btu * qty;
  }

  const estimatedAcTons = totalHeatBtu / BTU_PER_TON;
  const acCapacityFlag = totalHeatBtu > STANDARD_RACK_BTU_PER_HR;

  return {
    totalWatt: Number(totalWatt.toFixed(2)),
    totalHeatBtu: Number(totalHeatBtu.toFixed(2)),
    estimatedAcTons: Number(estimatedAcTons.toFixed(2)),
    acCapacityFlag,
    acThresholdBtu: STANDARD_RACK_BTU_PER_HR,
  };
}
