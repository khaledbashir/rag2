import { z } from "zod";

import { DEFAULT_SECTION_LABELS } from "./types";

const nonNegativeNumber = z.coerce.number().finite().min(0);
const positiveNumber = z.coerce.number().finite().gt(0);

/**
 * A typed per-year amount: a number, or the word "Included" when the project
 * covers that year (Alexis, 2026-07-30). Accepted case-insensitively, and a
 * blank cell reads as zero so a half-filled row still parses.
 */
const flatAmount = z.union([
  z.literal("included"),
  z
    .string()
    .trim()
    .transform((raw) => raw.replace(/[$,\s]/g, ""))
    .pipe(z.union([z.literal("").transform(() => 0), z.coerce.number().finite().min(0)])),
  z.coerce.number().finite().min(0),
]);

const flatAmountList = z
  .array(z.preprocess(
    (value) => (typeof value === "string" && /^included$/i.test(value.trim()) ? "included" : value),
    flatAmount,
  ))
  .max(10)
  .default([]);

const pricingMode = z.enum(["calculated", "flat"]).default("calculated");

const serviceLine = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1, "Every service line needs a name").max(160),
  pricingMode,
  days: nonNegativeNumber.default(0),
  technicians: nonNegativeNumber.default(0),
  clientDayRate: nonNegativeNumber.default(0),
  technicianDayCost: nonNegativeNumber.default(0),
  flatRevenue: flatAmountList,
  flatCost: flatAmountList,
  flatEscalates: z.boolean().default(false),
});

const breakFixLine = z.object({
  enabled: z.boolean().default(true),
  label: z.string().trim().min(1).max(160).default("Break/Fix Hardware Maintenance"),
  pricingMode,
  days: nonNegativeNumber.default(0),
  technicians: nonNegativeNumber.default(0),
  hoursPerDay: nonNegativeNumber.default(0),
  technicianHourlyCost: nonNegativeNumber.default(0),
  priceMultiplier: positiveNumber.max(20).default(1),
  flatRevenue: flatAmountList,
  flatCost: flatAmountList,
  flatEscalates: z.boolean().default(false),
});

export const ServiceEstimatorInputSchema = z
  .object({
    clientName: z.string().trim().min(1, "Client name is required").max(160),
    venueName: z.string().trim().max(160).default(""),
    location: z.string().trim().max(200).default(""),
    contractStart: z.string().trim().max(80).default(""),
    contractEnd: z.string().trim().max(80).default(""),
    paymentTerms: z.string().trim().max(500).default(""),
    scopeOfServices: z.string().trim().max(4000).default(""),
    currency: z.enum(["USD", "CAD", "GBP", "EUR"]).default("USD"),
    termStartYear: z.coerce.number().int().min(2000).max(2100),
    termYears: z.coerce.number().int().min(1).max(10),
    revenueEscalationPct: nonNegativeNumber.max(100).default(0),
    costEscalationPct: nonNegativeNumber.max(100).default(0),
    bundleDiscountMode: z
      .enum(["none", "included-in-rates", "apply-to-subtotal"])
      .default("included-in-rates"),
    bundleDiscountPct: nonNegativeNumber.max(100).default(0),
    events: z
      .array(serviceLine)
      .min(1, "Add at least one service line")
      .max(40),
    breakFix: breakFixLine,
    options: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(80),
          name: z.string().trim().min(1, "Every option needs a name").max(160),
          events: z.array(serviceLine).min(1, "Add at least one service line").max(40),
          breakFix: breakFixLine,
        }),
      )
      .max(8)
      .default([]),
    capex: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(80),
          name: z.string().trim().min(1).max(160),
          amount: nonNegativeNumber,
          usefulLifeYears: z.coerce.number().int().min(1).max(20),
        }),
      )
      .max(30)
      .default([]),
    partsWarranty: z
      .object({
        enabled: z.boolean().default(false),
        title: z.string().trim().max(160).default("Parts Warranty"),
        columns: z.array(z.string().trim().max(80)).max(12).default([]),
        rows: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(80),
              label: z.string().trim().max(160).default(""),
              values: flatAmountList,
            }),
          )
          .max(40)
          .default([]),
      })
      .default({ enabled: false, title: "Parts Warranty", columns: [], rows: [] }),
    sectionLabels: z
      .object({
        eventSupport: z.string().trim().min(1).max(80).default(DEFAULT_SECTION_LABELS.eventSupport),
        breakFix: z.string().trim().min(1).max(80).default(DEFAULT_SECTION_LABELS.breakFix),
        capex: z.string().trim().min(1).max(80).default(DEFAULT_SECTION_LABELS.capex),
        clientSchedule: z.string().trim().min(1).max(80).default(DEFAULT_SECTION_LABELS.clientSchedule),
        internalModel: z.string().trim().min(1).max(80).default(DEFAULT_SECTION_LABELS.internalModel),
        operatingExpenses: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .default(DEFAULT_SECTION_LABELS.operatingExpenses),
      })
      .default({ ...DEFAULT_SECTION_LABELS }),
    marketingOpportunityValue: nonNegativeNumber.default(0),
    marketingSharePct: nonNegativeNumber.max(100).default(0),
  })
  // The first option IS the top-level service lines, so the two can never
  // disagree about what the primary option prices.
  .transform((input) => {
    if (input.options.length === 0) return input;
    const [primary, ...rest] = input.options;
    return {
      ...input,
      events: primary.events,
      breakFix: primary.breakFix,
      options: [primary, ...rest],
    };
  });

export type ParsedServiceEstimatorInput = z.infer<typeof ServiceEstimatorInputSchema>;
