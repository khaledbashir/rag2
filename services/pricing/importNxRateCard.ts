/**
 * Land an NX Yaham rate card on the two surfaces that price LED hardware.
 *
 * They are separate, and only one of them was ever being updated. That is the
 * bug this exists to close:
 *
 *   1. `ManufacturerProduct` — the catalog. Browsed in the estimator, pushed to
 *      the CRM, quoted on spec sheets. Carried April prices.
 *   2. `RateCardEntry` `led_cost.*` — what the estimator actually multiplies by
 *      area. Carried FEBRUARY prices, and had done since 2026-02-16, because
 *      every previous card was landed by hand-writing a `prisma/seed-*.ts` file
 *      that only ever touched the catalog.
 *
 * So a card refresh updated the price Natalia could *see* and not the price the
 * estimator *used*.
 *
 * ── Which card drives which surface ───────────────────────────────────────
 * The ANC card (Yaham direct, ex-works) and the LGEUS card (same panels through
 * LG USA, plus their distribution markup) each maintain their own catalog rows,
 * under manufacturer "Yaham" and "LG USA".
 *
 * Only the LGEUS card moves `led_cost.*`. Every one of those keys was derived
 * from an LGEUS landed price — the provenance on all thirteen says so, and each
 * still reconciles to the cent against the 02.16.26 workbook's markup row. The
 * estimator quotes on the LG-landed basis, so importing the ANC card must not
 * silently re-base it ~20% lower.
 *
 * ── What "landed" means, and the one thing it no longer covers ────────────
 * On the old card the markup row sat at the end of a waterfall:
 *
 *     ex-works → ×1.10 tariff → ×1.05 shipping → ×1.28 LGEUS
 *
 * The 08.01.26 card drops both middle steps. Its markup applies straight to
 * ex-works (×1.38), and freight moved to a flat "Vessel Shipping" line of
 * $12/sqft. To keep `led_cost.*` meaning the same thing it has always meant —
 * cost per sqft delivered — the vessel shipping line is added back on. Without
 * it the estimator would quietly stop charging freight it used to include.
 *
 * Tariff is the piece the new card no longer states at all. It is NOT invented
 * here: `led_cost.tariff_pct` is left exactly as it is, and the caller is told,
 * because whether the 10% still applies is a commercial question for Natalia
 * rather than something to infer from a workbook that went silent on it.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { parseNxRateCard, type NxRateCard, type NxRateCardProduct } from "@/lib/pricing/nxRateCard";
import { invalidateRateCardCache } from "@/services/rfp/rateCardLoader";

// ── Catalog identity ─────────────────────────────────────────────────────────

interface VariantConfig {
  manufacturer: string;
  skuPrefix: string;
  /** Shown to a human; also what `costPerSqFt` is measured on. */
  basis: string;
}

const VARIANTS: Record<NxRateCard["variant"], VariantConfig> = {
  ANC: { manufacturer: "Yaham", skuPrefix: "YAHAM-", basis: "Yaham direct, ex-works" },
  LGEUS: { manufacturer: "LG USA", skuPrefix: "LGEUS-", basis: "via LG USA, marked up" },
};

// ── Estimator rate keys ──────────────────────────────────────────────────────

/**
 * One `led_cost` key per model, exactly as the existing thirteen were built.
 * Keyed on the card's own model label so a renamed SKU cannot silently detach a
 * key from its product.
 */
const LED_COST_KEYS: Array<{
  key: string;
  label: string;
  model: string;
  environment: "indoor" | "outdoor";
}> = [
  // Outdoor
  { key: "led_cost.2_5mm_outdoor", label: "LED Cost/sqft — 2.5mm Outdoor", model: "R2.5-MIP", environment: "outdoor" },
  { key: "led_cost.4mm_outdoor", label: "LED Cost/sqft — 4mm Outdoor", model: "R4", environment: "outdoor" },
  { key: "led_cost.6mm_outdoor", label: "LED Cost/sqft — 6mm Outdoor", model: "R6", environment: "outdoor" },
  { key: "led_cost.8mm_outdoor", label: "LED Cost/sqft — 8mm Outdoor", model: "R8", environment: "outdoor" },
  { key: "led_cost.10mm_outdoor", label: "LED Cost/sqft — 10mm Outdoor", model: "R10", environment: "outdoor" },
  { key: "led_cost.10mm_perimeter", label: "LED Cost/sqft — 10mm Perimeter", model: "A10", environment: "outdoor" },
  { key: "led_cost.6mm_fascia_outdoor", label: "LED Cost/sqft — 6mm Fascia Outdoor", model: "HO6T", environment: "outdoor" },
  // The card has always priced HO8T; it just never had a key of its own, so an
  // 8mm fascia quote fell back to the flat 8mm outdoor rate.
  { key: "led_cost.8mm_fascia_outdoor", label: "LED Cost/sqft — 8mm Fascia Outdoor", model: "HO8T", environment: "outdoor" },
  { key: "led_cost.10mm_fascia_outdoor", label: "LED Cost/sqft — 10mm Fascia Outdoor", model: "HO10T", environment: "outdoor" },
  // Indoor
  { key: "led_cost.2_5mm", label: "LED Cost/sqft — 2.5mm Indoor", model: "C2.5-MIP", environment: "indoor" },
  { key: "led_cost.4mm", label: "LED Cost/sqft — 4mm Indoor", model: "C4", environment: "indoor" },
  { key: "led_cost.6mm", label: "LED Cost/sqft — 6mm Indoor", model: "C6", environment: "indoor" },
  { key: "led_cost.10mm", label: "LED Cost/sqft — 10mm Indoor", model: "C10", environment: "indoor" },
  { key: "led_cost.6mm_fascia_indoor", label: "LED Cost/sqft — 6mm Fascia Indoor", model: "H6T", environment: "indoor" },
  { key: "led_cost.10mm_fascia_indoor", label: "LED Cost/sqft — 10mm Fascia Indoor", model: "H10T", environment: "indoor" },
];

/** `C1.875-MIP (5G， DAC传输))` → `C1.875-MIP`; `R4 ` → `R4`. */
function bareModel(label: string): string {
  return label.replace(/\([^)]*\)?/g, "").trim().toUpperCase();
}

/**
 * The panel a rate key should quote: the premium configuration, which is what
 * every existing key was built from and is the conservative choice when the card
 * offers a cheaper alternative.
 *
 * Brightest first, then the established LED supplier over the newly-offered
 * second source, then the baseline package over an alternative, then 1G over 5G.
 */
function pickRepresentative(candidates: NxRateCardProduct[]): NxRateCardProduct | null {
  if (candidates.length === 0) return null;
  const score = (p: NxRateCardProduct): number[] => [
    -(p.maxNits ?? 0),
    /sinyopto/i.test(p.ledManufacturer ?? "") ? 1 : 0,
    /-(MIP|BLK|WHT)(-|$)/.test(p.sku) ? 1 : 0,
    /-5G(-|$)/.test(p.sku) ? 1 : 0,
    p.pricePerSqft, // deterministic final tiebreak
  ];
  return [...candidates].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
    return 0;
  })[0];
}

// ── Report ───────────────────────────────────────────────────────────────────

export interface ProductChange {
  modelNumber: string;
  displayName: string;
  action: "created" | "updated" | "unchanged" | "retired";
  oldCostPerSqFt: number | null;
  newCostPerSqFt: number | null;
}

export interface RateChange {
  key: string;
  model: string;
  sourceSku: string;
  oldValue: number | null;
  newValue: number;
  action: "created" | "updated" | "unchanged";
}

export interface NxImportReport {
  dryRun: boolean;
  variant: NxRateCard["variant"];
  manufacturer: string;
  basis: string;
  sourceFile: string;
  pricedOn: string | null;
  markupPct: number | null;
  landedIncludesShipping: boolean;
  vesselShippingPerSqft: number | null;
  products: { created: number; updated: number; unchanged: number; retired: number; changes: ProductChange[] };
  estimatorRates: { applied: boolean; reason: string; changes: RateChange[] };
  warnings: string[];
}

// ── Mapping a parsed column onto the catalog row ─────────────────────────────

function displayName(p: NxRateCardProduct, manufacturer: string): string {
  const line = p.productLine ? ` ${p.productLine}` : "";
  return `${p.modelLabel.trim()}${line} (${manufacturer})`;
}

function serviceType(serviceAccess: string | null): string {
  const s = (serviceAccess ?? "").toLowerCase();
  if (s.includes("front") && s.includes("rear")) return "front_rear";
  if (s.includes("rear")) return "rear";
  if (s.includes("top")) return "top";
  if (s.includes("front")) return "front";
  return "front";
}

function titleCaseApplication(app: string | null): string | null {
  if (!app) return null;
  return app
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function toProductRow(p: NxRateCardProduct, card: NxRateCard, cfg: VariantConfig) {
  return {
    manufacturer: cfg.manufacturer,
    productFamily: p.productLine?.split("-")[0].trim() || "Unknown",
    modelNumber: `${cfg.skuPrefix}${p.sku}`,
    displayName: displayName(p, cfg.manufacturer),
    productType: "led",
    pixelPitch: p.pixelPitchMm,
    cabinetWidthMm: p.cabinetWidthMm ?? 0,
    cabinetHeightMm: p.cabinetHeightMm ?? 0,
    weightKgPerCabinet: p.weightKgPerCabinet ?? 0,
    maxNits: p.maxNits ?? 0,
    refreshRate: p.refreshRate ? Math.round(p.refreshRate) : null,
    maxPowerWattsPerCab: p.maxPowerWattsPerCab ?? 0,
    typicalPowerWattsPerCab: p.typicalPowerWattsPerCab,
    environment: p.environment,
    ipRating: p.ipRatingFront,
    serviceType: serviceType(p.serviceAccess),
    moduleWidthMm: p.moduleWidthMm,
    moduleHeightMm: p.moduleHeightMm,
    modulesPerCabinetW: p.modulesPerCabinetW,
    modulesPerCabinetH: p.modulesPerCabinetH,
    standardPricePerSqft: p.pricePerSqft,
    customPricePerSqft: p.customPerSqft,
    productLine: p.productLine,
    application: titleCaseApplication(p.application),
    costPerSqFt: new Prisma.Decimal(p.pricePerSqft.toFixed(2)),
    extendedSpecs: {
      ledManufacturer: p.ledManufacturer,
      pixelConfiguration: p.pixelConfiguration,
      ledPackage: p.ledPackage,
      cabinetAreaSqm: p.cabinetAreaSqm,
      ipRatingRear: p.ipRatingRear,
      serviceAccess: p.serviceAccess,
      exworkPerSqft: p.exworkPerSqft,
      pricePerPanel: p.pricePerPanel,
      pricePerSqm: p.pricePerSqm,
      vesselShippingPerSqft: p.vesselShippingPerSqft,
      markupPct: card.markupPct,
      pricingBasis: cfg.basis,
      pricedOn: card.updatedOn,
      sourceCell: `${p.sourceSheet}!${p.sourceColumn}`,
    } as Prisma.InputJsonValue,
    sourceSpreadsheet: card.sourceFile,
    isActive: true,
  };
}

// ── Import ───────────────────────────────────────────────────────────────────

export interface NxImportOptions {
  dryRun?: boolean;
  /** Add the card's flat vessel-shipping line into `led_cost.*`. Default true. */
  includeShippingInLedCost?: boolean;
  changedBy?: string;
}

export async function importNxRateCard(
  prisma: PrismaClient,
  buffer: Buffer,
  filename: string,
  options: NxImportOptions = {}
): Promise<NxImportReport> {
  const {
    dryRun = false,
    includeShippingInLedCost = true,
    changedBy = "nx-rate-card-import",
  } = options;

  const card = parseNxRateCard(buffer, filename);
  const cfg = VARIANTS[card.variant];
  const warnings = [...card.warnings];

  // ── Catalog ────────────────────────────────────────────────────────────────
  // Every row for this manufacturer, so an upsert can never miss one and hit the
  // unique constraint on modelNumber.
  const existing = await prisma.manufacturerProduct.findMany({
    where: { manufacturer: cfg.manufacturer, productType: "led" },
    select: {
      id: true,
      modelNumber: true,
      displayName: true,
      costPerSqFt: true,
      isActive: true,
      sourceSpreadsheet: true,
    },
  });
  const existingByModel = new Map(existing.map((e) => [e.modelNumber, e]));

  const changes: ProductChange[] = [];
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const p of card.products) {
    const row = toProductRow(p, card, cfg);
    seen.add(row.modelNumber);
    const prior = existingByModel.get(row.modelNumber);
    const oldCost = prior?.costPerSqFt ? Number(prior.costPerSqFt) : null;
    const newCost = Number(row.costPerSqFt);

    if (!prior) {
      created++;
      changes.push({ modelNumber: row.modelNumber, displayName: row.displayName, action: "created", oldCostPerSqFt: null, newCostPerSqFt: newCost });
      if (!dryRun) await prisma.manufacturerProduct.create({ data: row });
      continue;
    }

    const same = oldCost !== null && Math.abs(oldCost - newCost) < 0.005 && prior.isActive;
    if (same) unchanged++;
    else updated++;
    changes.push({
      modelNumber: row.modelNumber,
      displayName: row.displayName,
      action: same ? "unchanged" : "updated",
      oldCostPerSqFt: oldCost,
      newCostPerSqFt: newCost,
    });
    // Re-written even when the price matches so specs, packing and provenance
    // follow the current card.
    if (!dryRun) {
      await prisma.manufacturerProduct.update({ where: { modelNumber: row.modelNumber }, data: row });
    }
  }

  // Anything a PREVIOUS NX card put here that this one no longer lists is
  // deactivated, never deleted — proposals link to these rows, and a soft retire
  // keeps that history readable.
  //
  // Scoped by source on purpose. "Yaham" also covers four panels from the
  // original hardcoded Phase 1 catalog (YAHAM-OUT-100, -OUT-160, -S3-039,
  // -S3-060) that no rate card has ever described; a manufacturer-wide sweep
  // would retire them as collateral.
  const fromARateCard = (source: string | null) => /yaham rate card/i.test(source ?? "");
  const stale = existing.filter(
    (e) => e.isActive && !seen.has(e.modelNumber) && fromARateCard(e.sourceSpreadsheet)
  );
  for (const s of stale) {
    changes.push({
      modelNumber: s.modelNumber,
      displayName: s.displayName,
      action: "retired",
      oldCostPerSqFt: s.costPerSqFt ? Number(s.costPerSqFt) : null,
      newCostPerSqFt: null,
    });
  }
  if (!dryRun && stale.length > 0) {
    await prisma.manufacturerProduct.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { isActive: false },
    });
  }

  // ── Estimator rates ────────────────────────────────────────────────────────
  const rateChanges: RateChange[] = [];
  let ratesApplied = false;
  let reason: string;

  if (card.variant !== "LGEUS") {
    reason =
      "Skipped — every led_cost key is on the LG USA landed basis. Import the LGEUS card to move estimator pricing.";
  } else {
    ratesApplied = true;
    const shipping = card.products.find((p) => p.vesselShippingPerSqft)?.vesselShippingPerSqft ?? 0;
    reason = includeShippingInLedCost
      ? `Marked-up price + $${shipping.toFixed(2)}/sqft vessel shipping, matching the landed basis these keys have always carried.`
      : "Marked-up price only — vessel shipping excluded by request.";

    for (const spec of LED_COST_KEYS) {
      const candidates = card.products.filter(
        (p) => p.environment === spec.environment && bareModel(p.modelLabel) === spec.model
      );
      const rep = pickRepresentative(candidates);
      if (!rep) {
        warnings.push(`No "${spec.model}" on the ${spec.environment} sheet — ${spec.key} left unchanged.`);
        continue;
      }

      const landed =
        rep.pricePerSqft + (includeShippingInLedCost ? rep.vesselShippingPerSqft ?? 0 : 0);
      const value = Math.round(landed * 100) / 100;

      const prior = await prisma.rateCardEntry.findUnique({ where: { key: spec.key } });
      const oldValue = prior ? Number(prior.value) : null;
      const action: RateChange["action"] =
        !prior ? "created" : Math.abs((oldValue ?? 0) - value) < 0.005 ? "unchanged" : "updated";

      rateChanges.push({
        key: spec.key,
        model: spec.model,
        sourceSku: `${cfg.skuPrefix}${rep.sku}`,
        oldValue,
        newValue: value,
        action,
      });

      if (dryRun || action === "unchanged") continue;

      const provenance = `Yaham ${rep.modelLabel.trim()} ${cfg.basis}${
        card.markupPct ? ` ${(card.markupPct * 100).toFixed(0)}%` : ""
      }${includeShippingInLedCost ? " + vessel shipping" : ""}. Rate card ${card.updatedOn ?? card.sourceFile}.`;

      const entry = await prisma.rateCardEntry.upsert({
        where: { key: spec.key },
        create: {
          category: "led_cost",
          key: spec.key,
          label: spec.label,
          value: new Prisma.Decimal(value.toFixed(2)),
          unit: "per_sqft",
          provenance,
          confidence: "validated",
        },
        update: {
          value: new Prisma.Decimal(value.toFixed(2)),
          label: spec.label,
          provenance,
          confidence: "validated",
          isActive: true,
        },
      });
      await prisma.rateCardAudit.create({
        data: {
          entryId: entry.id,
          action: prior ? "update" : "create",
          field: "value",
          oldValue: oldValue?.toString() ?? null,
          newValue: value.toString(),
          changedBy,
        },
      });
    }

    // The markup is on the card's own label, so it tracks a future card by itself.
    if (card.markupPct !== null) {
      const key = "led_cost.lgeus_markup_pct";
      const prior = await prisma.rateCardEntry.findUnique({ where: { key } });
      const oldValue = prior ? Number(prior.value) : null;
      const action: RateChange["action"] =
        !prior ? "created" : Math.abs((oldValue ?? 0) - card.markupPct) < 0.0001 ? "unchanged" : "updated";
      rateChanges.push({
        key,
        model: "—",
        sourceSku: "—",
        oldValue,
        newValue: card.markupPct,
        action,
      });
      if (!dryRun && action !== "unchanged") {
        const entry = await prisma.rateCardEntry.upsert({
          where: { key },
          create: {
            category: "led_cost",
            key,
            label: "LGEUS Distribution Markup",
            value: new Prisma.Decimal(card.markupPct.toString()),
            unit: "pct",
            provenance: `Read off the markup row of ${card.sourceFile}.`,
            confidence: "validated",
          },
          update: {
            value: new Prisma.Decimal(card.markupPct.toString()),
            provenance: `Read off the markup row of ${card.sourceFile}.`,
            isActive: true,
          },
        });
        await prisma.rateCardAudit.create({
          data: {
            entryId: entry.id,
            action: prior ? "update" : "create",
            field: "value",
            oldValue: oldValue?.toString() ?? null,
            newValue: card.markupPct.toString(),
            changedBy,
          },
        });
      }
    }

    warnings.push(
      "This card states no tariff. led_cost.tariff_pct is unchanged — confirm with Natalia whether the 10% still applies on top."
    );
  }

  if (!dryRun && ratesApplied) invalidateRateCardCache();

  return {
    dryRun,
    variant: card.variant,
    manufacturer: cfg.manufacturer,
    basis: cfg.basis,
    sourceFile: card.sourceFile,
    pricedOn: card.updatedOn,
    markupPct: card.markupPct,
    landedIncludesShipping: includeShippingInLedCost,
    vesselShippingPerSqft: card.products.find((p) => p.vesselShippingPerSqft)?.vesselShippingPerSqft ?? null,
    products: { created, updated, unchanged, retired: stale.length, changes },
    estimatorRates: { applied: ratesApplied, reason, changes: rateChanges },
    warnings,
  };
}
