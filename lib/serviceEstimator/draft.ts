import {
  DEFAULT_SECTION_LABELS,
  type BundleDiscountMode,
  type ServiceBreakFixInput,
  type ServiceCapexInput,
  type ServiceEstimatorInput,
  type ServiceEstimatorOption,
  type ServiceEventInput,
  type ServiceFlatAmount,
  type ServicePartsWarrantySchedule,
  type ServiceSectionLabels,
} from "./types";

/**
 * Upgrade a saved estimator draft to the shape the page renders today.
 *
 * The estimator keeps a working draft in the browser. That draft was written
 * by whichever build of the page the estimator last ran, so every field added
 * since — typed lines, options, capex, the parts warranty schedule, the
 * editable section headings — is simply absent from it. Restoring one of those
 * drafts verbatim and rendering it took the whole page down with
 * "Cannot read properties of undefined (reading 'eventSupport')", and it stayed
 * down on every reload because the bad draft was read back each time.
 *
 * So a stored draft is treated as untrusted input, not as a typed object: each
 * field is taken only when it carries the right type, and anything missing or
 * wrong falls back to the blank estimate. Nothing the draft legitimately holds
 * is discarded — including a half-finished estimate with no client name, which
 * the submit schema would reject but which is exactly what a draft is for.
 */
export function normalizeEstimatorDraft(
  raw: unknown,
  base: ServiceEstimatorInput,
): ServiceEstimatorInput {
  const blank = clone(base);
  if (!isRecord(raw)) return blank;

  return {
    clientName: str(raw.clientName, blank.clientName),
    venueName: str(raw.venueName, blank.venueName),
    location: str(raw.location, blank.location),
    contractStart: str(raw.contractStart, blank.contractStart),
    contractEnd: str(raw.contractEnd, blank.contractEnd),
    paymentTerms: str(raw.paymentTerms, blank.paymentTerms),
    scopeOfServices: str(raw.scopeOfServices, blank.scopeOfServices),
    currency: oneOf(raw.currency, CURRENCIES, blank.currency),
    termStartYear: num(raw.termStartYear, blank.termStartYear),
    termYears: num(raw.termYears, blank.termYears),
    revenueEscalationPct: num(raw.revenueEscalationPct, blank.revenueEscalationPct),
    costEscalationPct: num(raw.costEscalationPct, blank.costEscalationPct),
    bundleDiscountMode: oneOf(raw.bundleDiscountMode, BUNDLE_MODES, blank.bundleDiscountMode),
    bundleDiscountPct: num(raw.bundleDiscountPct, blank.bundleDiscountPct),
    events: Array.isArray(raw.events)
      ? raw.events.map((line, index) => serviceLine(line, index))
      : blank.events,
    breakFix: breakFix(raw.breakFix, blank.breakFix),
    options: Array.isArray(raw.options)
      ? raw.options.map((option, index) => estimatorOption(option, index, blank.breakFix))
      : blank.options,
    capex: Array.isArray(raw.capex) ? raw.capex.map((item, index) => capexItem(item, index)) : blank.capex,
    partsWarranty: partsWarranty(raw.partsWarranty, blank.partsWarranty),
    sectionLabels: sectionLabels(raw.sectionLabels),
    marketingOpportunityValue: num(raw.marketingOpportunityValue, blank.marketingOpportunityValue),
    marketingSharePct: num(raw.marketingSharePct, blank.marketingSharePct),
  };
}

const CURRENCIES = ["USD", "CAD", "GBP", "EUR"] as const;
const BUNDLE_MODES = ["none", "included-in-rates", "apply-to-subtotal"] as const;
const PRICING_MODES = ["calculated", "flat"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const str = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** A typed cell: the word "Included", or a non-negative number. Anything else reads as zero. */
const flatAmount = (value: unknown): ServiceFlatAmount => {
  if (typeof value === "string") {
    if (/^inc(luded)?$/i.test(value.trim())) return "included";
    const cleaned = value.replace(/[$,\s]/g, "");
    if (cleaned === "") return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return 0;
};

const flatAmounts = (value: unknown): ServiceFlatAmount[] =>
  Array.isArray(value) ? value.map(flatAmount) : [];

const serviceLine = (value: unknown, index: number): ServiceEventInput => {
  const raw = isRecord(value) ? value : {};
  return {
    id: str(raw.id, `line-${index + 1}`),
    name: str(raw.name, `Service Line ${index + 1}`),
    pricingMode: oneOf(raw.pricingMode, PRICING_MODES, "calculated"),
    days: num(raw.days, 0),
    technicians: num(raw.technicians, 0),
    clientDayRate: num(raw.clientDayRate, 0),
    technicianDayCost: num(raw.technicianDayCost, 0),
    flatRevenue: flatAmounts(raw.flatRevenue),
    flatCost: flatAmounts(raw.flatCost),
    flatEscalates: bool(raw.flatEscalates, false),
  };
};

const breakFix = (value: unknown, fallback: ServiceBreakFixInput): ServiceBreakFixInput => {
  const raw = isRecord(value) ? value : {};
  return {
    enabled: bool(raw.enabled, fallback.enabled),
    label: str(raw.label, fallback.label),
    pricingMode: oneOf(raw.pricingMode, PRICING_MODES, fallback.pricingMode),
    days: num(raw.days, fallback.days),
    technicians: num(raw.technicians, fallback.technicians),
    hoursPerDay: num(raw.hoursPerDay, fallback.hoursPerDay),
    technicianHourlyCost: num(raw.technicianHourlyCost, fallback.technicianHourlyCost),
    priceMultiplier: num(raw.priceMultiplier, fallback.priceMultiplier),
    flatRevenue: flatAmounts(raw.flatRevenue),
    flatCost: flatAmounts(raw.flatCost),
    flatEscalates: bool(raw.flatEscalates, fallback.flatEscalates),
  };
};

const estimatorOption = (
  value: unknown,
  index: number,
  fallbackBreakFix: ServiceBreakFixInput,
): ServiceEstimatorOption => {
  const raw = isRecord(value) ? value : {};
  return {
    id: str(raw.id, `option-${index + 1}`),
    name: str(raw.name, `Option ${index + 1}`),
    events: Array.isArray(raw.events) ? raw.events.map((line, i) => serviceLine(line, i)) : [],
    breakFix: breakFix(raw.breakFix, fallbackBreakFix),
  };
};

const capexItem = (value: unknown, index: number): ServiceCapexInput => {
  const raw = isRecord(value) ? value : {};
  return {
    id: str(raw.id, `capex-${index + 1}`),
    name: str(raw.name, `Capital Item ${index + 1}`),
    amount: num(raw.amount, 0),
    usefulLifeYears: num(raw.usefulLifeYears, 5),
  };
};

const partsWarranty = (
  value: unknown,
  fallback: ServicePartsWarrantySchedule,
): ServicePartsWarrantySchedule => {
  const raw = isRecord(value) ? value : {};
  return {
    enabled: bool(raw.enabled, fallback.enabled),
    title: str(raw.title, fallback.title),
    columns: Array.isArray(raw.columns)
      ? raw.columns.map((column, index) => str(column, `Column ${index + 1}`))
      : [],
    rows: Array.isArray(raw.rows)
      ? raw.rows.map((row, index) => {
          const rowRaw = isRecord(row) ? row : {};
          return {
            id: str(rowRaw.id, `warranty-${index + 1}`),
            label: str(rowRaw.label, ""),
            values: flatAmounts(rowRaw.values),
          };
        })
      : [],
  };
};

/** Headings are editable, so a saved rename wins — but only a real one. */
const sectionLabels = (value: unknown): ServiceSectionLabels => {
  const raw = isRecord(value) ? value : {};
  const labels = { ...DEFAULT_SECTION_LABELS };
  for (const key of Object.keys(DEFAULT_SECTION_LABELS) as (keyof ServiceSectionLabels)[]) {
    const saved = raw[key];
    if (typeof saved === "string" && saved.trim() !== "") labels[key] = saved;
  }
  return labels;
};

export type { ServiceEstimatorInput };
