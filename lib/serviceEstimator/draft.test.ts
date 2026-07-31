import { describe, expect, it } from "vitest";

import { normalizeEstimatorDraft } from "./draft";
import { DEFAULT_SECTION_LABELS, type ServiceEstimatorInput } from "./types";

/**
 * A minimal, valid, CURRENT-shape estimate. Tests mutate copies of this to
 * simulate the drafts older builds of the page wrote to the browser.
 */
const base = (): ServiceEstimatorInput => ({
  clientName: "",
  venueName: "",
  location: "",
  contractStart: "",
  contractEnd: "",
  paymentTerms: "Six equal monthly installments per Contract Year",
  scopeOfServices: "",
  currency: "USD",
  termStartYear: 2026,
  termYears: 5,
  revenueEscalationPct: 3,
  costEscalationPct: 3,
  bundleDiscountMode: "included-in-rates",
  bundleDiscountPct: 0,
  events: [
    {
      id: "evt-1",
      name: "Event Support",
      pricingMode: "calculated",
      days: 0,
      technicians: 2,
      clientDayRate: 850,
      technicianDayCost: 280,
      flatRevenue: [],
      flatCost: [],
      flatEscalates: false,
    },
  ],
  breakFix: {
    enabled: true,
    label: "Break/Fix Hardware Maintenance",
    pricingMode: "calculated",
    days: 0,
    technicians: 2,
    hoursPerDay: 8,
    technicianHourlyCost: 35,
    priceMultiplier: 1.62,
    flatRevenue: [],
    flatCost: [],
    flatEscalates: false,
  },
  options: [],
  capex: [],
  partsWarranty: { enabled: false, title: "Parts Warranty", columns: [], rows: [] },
  sectionLabels: { ...DEFAULT_SECTION_LABELS },
  marketingOpportunityValue: 0,
  marketingSharePct: 20,
});

/** A mutable, untyped copy of a saved draft — what localStorage actually hands back. */
const staleDraft = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(base())) as Record<string, unknown>;

describe("normalizeEstimatorDraft", () => {
  it("fills in section labels a pre-labels draft never had", () => {
    const stale = staleDraft();
    delete stale.sectionLabels;

    const draft = normalizeEstimatorDraft(stale, base());

    // The exact crash from production: input.sectionLabels.eventSupport.
    expect(draft.sectionLabels.eventSupport).toBe(DEFAULT_SECTION_LABELS.eventSupport);
    expect(draft.sectionLabels).toEqual(DEFAULT_SECTION_LABELS);
  });

  it("fills in every branch a draft may predate, without dropping what it has", () => {
    const stale = staleDraft();
    delete stale.partsWarranty;
    delete stale.options;
    delete stale.capex;
    delete stale.marketingSharePct;
    stale.clientName = "Carolina Panthers";

    const draft = normalizeEstimatorDraft(stale, base());

    expect(draft.partsWarranty).toEqual({
      enabled: false,
      title: "Parts Warranty",
      columns: [],
      rows: [],
    });
    expect(draft.options).toEqual([]);
    expect(draft.capex).toEqual([]);
    expect(draft.marketingSharePct).toBe(20);
    expect(draft.clientName).toBe("Carolina Panthers");
  });

  it("upgrades service lines written before typed (flat) pricing existed", () => {
    const stale = staleDraft();
    stale.events = [{ id: "evt-1", name: "Game Day Support", days: 41, technicians: 2, clientDayRate: 850, technicianDayCost: 280 }];

    const draft = normalizeEstimatorDraft(stale, base());

    expect(draft.events[0]).toEqual({
      id: "evt-1",
      name: "Game Day Support",
      pricingMode: "calculated",
      days: 41,
      technicians: 2,
      clientDayRate: 850,
      technicianDayCost: 280,
      flatRevenue: [],
      flatCost: [],
      flatEscalates: false,
    });
  });

  it("keeps a mid-edit draft that no submit schema would accept", () => {
    // A draft is work in progress: no client name yet, escalation half-typed.
    const stale = staleDraft();
    stale.clientName = "";
    stale.venueName = "Bank of America Stadium";

    const draft = normalizeEstimatorDraft(stale, base());

    expect(draft.clientName).toBe("");
    expect(draft.venueName).toBe("Bank of America Stadium");
  });

  it("preserves typed 'Included' cells and per-year amounts", () => {
    const stale = staleDraft();
    stale.events = [
      {
        id: "evt-flat",
        name: "LiveSync Licence",
        pricingMode: "flat",
        days: 0,
        technicians: 0,
        clientDayRate: 0,
        technicianDayCost: 0,
        flatRevenue: ["Included", 12000, "12,500", ""],
        flatCost: [],
        flatEscalates: true,
      },
    ];

    const draft = normalizeEstimatorDraft(stale, base());

    expect(draft.events[0].pricingMode).toBe("flat");
    expect(draft.events[0].flatRevenue).toEqual(["included", 12000, 12500, 0]);
    expect(draft.events[0].flatEscalates).toBe(true);
  });

  it("normalizes options, capex rows and the parts warranty schedule", () => {
    const stale = staleDraft();
    stale.options = [
      { id: "opt-1", name: "With Event Support", events: [{ id: "e", name: "Support" }] },
    ];
    stale.capex = [{ id: "cap-1", name: "Spare LED Modules", amount: 40000 }];
    stale.partsWarranty = { enabled: true, rows: [{ id: "r1", label: "Modules", values: ["Included"] }] };

    const draft = normalizeEstimatorDraft(stale, base());

    expect(draft.options[0].name).toBe("With Event Support");
    expect(draft.options[0].events[0].pricingMode).toBe("calculated");
    expect(draft.options[0].breakFix.priceMultiplier).toBe(1.62);
    expect(draft.capex[0]).toEqual({
      id: "cap-1",
      name: "Spare LED Modules",
      amount: 40000,
      usefulLifeYears: 5,
    });
    expect(draft.partsWarranty.enabled).toBe(true);
    expect(draft.partsWarranty.title).toBe("Parts Warranty");
    expect(draft.partsWarranty.rows[0].values).toEqual(["included"]);
  });

  it("falls back to a blank estimate when the stored draft is not an estimate", () => {
    for (const junk of [null, undefined, "corrupted", 42, [], true]) {
      expect(normalizeEstimatorDraft(junk, base())).toEqual(base());
    }
  });

  it("rejects values of the wrong type rather than rendering them", () => {
    const stale = staleDraft();
    stale.termYears = "five";
    stale.currency = "BTC";
    stale.events = "not an array";
    stale.breakFix = null;

    const draft = normalizeEstimatorDraft(stale, base());

    expect(draft.termYears).toBe(5);
    expect(draft.currency).toBe("USD");
    expect(draft.events).toEqual(base().events);
    expect(draft.breakFix).toEqual(base().breakFix);
  });

  it("leaves a current-shape draft untouched", () => {
    const current = base();
    current.clientName = "Fifth Third Park";
    current.sectionLabels.capex = "Capital Items";

    expect(normalizeEstimatorDraft(JSON.parse(JSON.stringify(current)), base())).toEqual(current);
  });
});
