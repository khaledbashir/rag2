import { z } from "zod";

const nonNegativeNumber = z.coerce.number().finite().min(0);
const positiveNumber = z.coerce.number().finite().gt(0);

export const ServiceEstimatorInputSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required").max(160),
  venueName: z.string().trim().max(160).default(""),
  location: z.string().trim().max(200).default(""),
  contractStart: z.string().trim().max(80).default(""),
  contractEnd: z.string().trim().max(80).default(""),
  paymentTerms: z.string().trim().max(500).default(""),
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
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1, "Every event line needs a name").max(160),
        days: nonNegativeNumber,
        technicians: nonNegativeNumber,
        clientDayRate: nonNegativeNumber,
        technicianDayCost: nonNegativeNumber,
      }),
    )
    .min(1, "Add at least one event-support line")
    .max(40),
  breakFix: z.object({
    enabled: z.boolean().default(true),
    label: z.string().trim().min(1).max(160).default("Break/Fix Hardware Maintenance"),
    days: nonNegativeNumber,
    technicians: nonNegativeNumber,
    hoursPerDay: nonNegativeNumber,
    technicianHourlyCost: nonNegativeNumber,
    priceMultiplier: positiveNumber.max(20),
  }),
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
  marketingOpportunityValue: nonNegativeNumber.default(0),
  marketingSharePct: nonNegativeNumber.max(100).default(0),
});

export type ParsedServiceEstimatorInput = z.infer<typeof ServiceEstimatorInputSchema>;
