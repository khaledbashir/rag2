/**
 * rag2 ManufacturerProduct ↔ Twenty LedProduct field/enum mapping.
 *
 * rag2 is the source of truth. The CRM mirrors rag2 so Quick Estimate / Scout
 * skills resolve to the same products that rag2's Excel and PDF generators do.
 *
 * Field name diffs (rag2 → Twenty):
 *   maxNits              → maxBrightness
 *   cabinetWidthMm       → cabinetWidth
 *   cabinetHeightMm      → cabinetHeight
 *   weightKgPerCabinet   → weightPerCabinet
 *   maxPowerWattsPerCab  → maxPowerWatts
 *   serviceType          → serviceAccess
 *   displayName          → name
 *
 * Fields that exist only in rag2 (typicalNits, refreshRate, module dimensions,
 * Yaham 80/20 pricing, operating temps, isCurved, supportsHalfModule) are
 * concatenated into Twenty.productNotes so the CRM still surfaces them as
 * read-only context.
 */

import type { ManufacturerProduct } from "@prisma/client";

export type TwentyManufacturerEnum =
  | "YAHAM" | "LG" | "OES" | "ANC_COURTSIDE" | "LG_YAHAM";

export type TwentyEnvironmentEnum =
  | "INDOOR" | "OUTDOOR" | "INDOOR_OUTDOOR";

export type TwentyProductTypeEnum =
  | "LED" | "COURTSIDE" | "STANCHION";

export type TwentyServiceAccessEnum =
  | "FRONT" | "REAR" | "BOTH";

const MANUFACTURER_MAP: Record<string, TwentyManufacturerEnum> = {
  "Yaham": "YAHAM",
  "YAHAM": "YAHAM",
  "OES": "OES",
  "LG": "LG",
  "LG TV": "LG",
  "LG USA": "LG",
  "LG_YAHAM": "LG_YAHAM",
  "ANC Courtside Table": "ANC_COURTSIDE",
  "ANC/UBERdisplays": "ANC_COURTSIDE",
  "ANC_COURTSIDE": "ANC_COURTSIDE",
};

export function mapManufacturer(value: string | null | undefined): TwentyManufacturerEnum | null {
  if (!value) return null;
  const exact = MANUFACTURER_MAP[value];
  if (exact) return exact;
  const trimmed = value.trim();
  if (MANUFACTURER_MAP[trimmed]) return MANUFACTURER_MAP[trimmed];
  const normalized = trimmed.toLowerCase();
  if (normalized.includes("yaham")) return "YAHAM";
  if (normalized.includes("oes")) return "OES";
  if (normalized.includes("courtside") || normalized.includes("uberdisplays")) return "ANC_COURTSIDE";
  if (normalized.includes("lg") && normalized.includes("yaham")) return "LG_YAHAM";
  if (normalized.includes("lg")) return "LG";
  return null;
}

export function mapEnvironment(value: string | null | undefined): TwentyEnvironmentEnum | null {
  if (!value) return null;
  switch (value.toLowerCase().trim()) {
    case "indoor": return "INDOOR";
    case "outdoor": return "OUTDOOR";
    case "indoor_outdoor":
    case "indoor/outdoor":
    case "both":
      return "INDOOR_OUTDOOR";
    default: return null;
  }
}

export function mapProductType(value: string | null | undefined): TwentyProductTypeEnum {
  switch ((value || "").toLowerCase().trim()) {
    case "courtside": return "COURTSIDE";
    case "stanchion": return "STANCHION";
    default: return "LED";
  }
}

export function mapServiceAccess(value: string | null | undefined): TwentyServiceAccessEnum | null {
  if (!value) return null;
  switch (value.toLowerCase().trim()) {
    case "front": return "FRONT";
    case "rear": return "REAR";
    case "front_rear":
    case "front/rear":
    case "both":
      return "BOTH";
    default: return null;
  }
}

function buildProductNotes(p: ManufacturerProduct): string {
  const lines: string[] = [];
  if (p.displayName) lines.push(`**${p.displayName}**`);
  if (p.typicalNits) lines.push(`Typical brightness: ${p.typicalNits} nits`);
  if (p.refreshRate) lines.push(`Refresh rate: ${p.refreshRate} Hz`);
  if (p.cabinetDepthMm) lines.push(`Cabinet depth: ${p.cabinetDepthMm} mm`);
  if (p.typicalPowerWattsPerCab) lines.push(`Typical power: ${p.typicalPowerWattsPerCab} W/cab`);
  if (p.operatingTempMin != null || p.operatingTempMax != null) {
    lines.push(`Operating temp: ${p.operatingTempMin ?? "?"} to ${p.operatingTempMax ?? "?"} °C`);
  }
  if (p.supportsHalfModule) lines.push(`Supports half-module`);
  if (p.isCurved) lines.push(`Curved`);
  if (p.moduleWidthMm && p.moduleHeightMm) {
    lines.push(`Module: ${p.moduleWidthMm} × ${p.moduleHeightMm} mm`);
  }
  if (p.modulesPerCabinetW && p.modulesPerCabinetH) {
    lines.push(`Modules per cabinet: ${p.modulesPerCabinetW} × ${p.modulesPerCabinetH}`);
  }
  if (p.standardPricePerSqft || p.customPricePerSqft) {
    lines.push(
      `Yaham 80/20 pricing — std: $${p.standardPricePerSqft ?? "?"}/sqft · custom: $${p.customPricePerSqft ?? "?"}/sqft`,
    );
  }
  if (p.productLine) lines.push(`Product line: ${p.productLine}`);
  if (p.application) lines.push(`Application: ${p.application}`);
  if (p.msrpPerSqFt) lines.push(`MSRP: $${p.msrpPerSqFt}/sqft`);
  if (p.sourceSpreadsheet) lines.push(`Source: ${p.sourceSpreadsheet}`);
  lines.push(`_Synced from rag2 at ${new Date().toISOString()}_`);
  return lines.join("\n");
}

function decimalToMicros(value: unknown): string | null {
  if (value == null) return null;
  const n = typeof value === "object" && value !== null && "toNumber" in (value as any)
    ? (value as any).toNumber()
    : Number(value);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * 1_000_000));
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberFrom(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "object" && value !== null && "toNumber" in (value as any)
    ? (value as any).toNumber()
    : Number(value);
  return Number.isFinite(n) ? n : null;
}

export type TwentyLedProductPayload = {
  name: string;
  modelNumber: string;
  manufacturer: TwentyManufacturerEnum | null;
  productFamily: string;
  productType: TwentyProductTypeEnum;
  environment: TwentyEnvironmentEnum | null;
  pixelPitch: number;
  maxBrightness: number;
  cabinetWidth: number;
  cabinetHeight: number;
  weightPerCabinet: number;
  maxPowerWatts: number;
  ipRating: string | null;
  serviceAccess: TwentyServiceAccessEnum | null;
  isActive: boolean;
  productNotes: string;
  costPerSqFt: { amountMicros: string; currencyCode: string } | null;
  unitCost: { amountMicros: string; currencyCode: string } | null;
  unitSellPrice: { amountMicros: string; currencyCode: string } | null;
  standardMargin: number | null;
};

/**
 * Map a rag2 ManufacturerProduct row to the exact shape Twenty's LedProduct
 * mutations expect.
 */
export function toTwentyLedProductPayload(p: ManufacturerProduct): TwentyLedProductPayload {
  const costMicros = decimalToMicros(p.costPerSqFt);
  const specs = jsonObject(p.extendedSpecs);
  const unitCostMicros = decimalToMicros(specs.unitCost);
  const unitSellPriceMicros = decimalToMicros(specs.unitSellPrice ?? specs.unitSalePrice);
  const standardMargin = numberFrom(specs.standardMargin ?? specs.margin);
  return {
    name: p.displayName || `${p.manufacturer} ${p.modelNumber}`,
    modelNumber: p.modelNumber,
    manufacturer: mapManufacturer(p.manufacturer),
    productFamily: p.productFamily,
    productType: mapProductType(p.productType),
    environment: mapEnvironment(p.environment),
    pixelPitch: p.pixelPitch,
    maxBrightness: p.maxNits,
    cabinetWidth: p.cabinetWidthMm,
    cabinetHeight: p.cabinetHeightMm,
    weightPerCabinet: p.weightKgPerCabinet,
    maxPowerWatts: p.maxPowerWattsPerCab,
    ipRating: p.ipRating,
    serviceAccess: mapServiceAccess(p.serviceType),
    isActive: p.isActive,
    productNotes: buildProductNotes(p),
    costPerSqFt: costMicros ? { amountMicros: costMicros, currencyCode: "USD" } : null,
    unitCost: unitCostMicros ? { amountMicros: unitCostMicros, currencyCode: "USD" } : null,
    unitSellPrice: unitSellPriceMicros ? { amountMicros: unitSellPriceMicros, currencyCode: "USD" } : null,
    standardMargin,
  };
}
