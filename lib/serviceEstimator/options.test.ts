import { describe, expect, it } from "vitest";

import { calculateServiceEstimateOptions } from "./engine";
import {
  addOption,
  commitOptions,
  hasMultipleOptions,
  materializeOptions,
  patchOption,
  removeOption,
  renameOption,
  resolveSelectedOption,
} from "./options";
import { DEFAULT_SECTION_LABELS } from "./types";
import type { ServiceEstimatorInput, ServiceEventInput } from "./types";

const line = (id: string, name: string, days: number): ServiceEventInput => ({
  id,
  name,
  pricingMode: "calculated",
  days,
  technicians: 2,
  clientDayRate: 1000,
  technicianDayCost: 300,
  flatRevenue: [],
  flatCost: [],
  flatEscalates: false,
});

const baseInput = (): ServiceEstimatorInput => ({
  clientName: "Carolina Panthers",
  venueName: "Bank of America Stadium",
  location: "Charlotte, NC",
  contractStart: "2026-01-01",
  contractEnd: "2028-12-31",
  paymentTerms: "Net 30",
  scopeOfServices: "Event support",
  currency: "USD",
  termStartYear: 2026,
  termYears: 3,
  revenueEscalationPct: 0,
  costEscalationPct: 0,
  bundleDiscountMode: "none",
  bundleDiscountPct: 0,
  events: [line("line-1", "Event Support", 10)],
  breakFix: {
    enabled: true,
    label: "Break/Fix Hardware Maintenance",
    pricingMode: "calculated",
    days: 5,
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
  marketingSharePct: 0,
});

describe("service estimator options", () => {
  it("reports one option for an estimate that never used them", () => {
    const input = baseInput();
    const options = materializeOptions(input);

    expect(options).toHaveLength(1);
    expect(options[0].name).toBe("Option 1");
    expect(options[0].events).toEqual(input.events);
    expect(hasMultipleOptions(input)).toBe(false);
  });

  it("adds a second option numbered the way Natalia names them", () => {
    const { input, addedId } = addOption(baseInput());

    const options = materializeOptions(input);
    expect(options.map((option) => option.name)).toEqual(["Option 1", "Option 2"]);
    expect(options[1].id).toBe(addedId);
    expect(hasMultipleOptions(input)).toBe(true);
  });

  it("starts a new option from the one being viewed, with its own line ids", () => {
    const { input, addedId } = addOption(baseInput());
    const [first, second] = materializeOptions(input);

    expect(second.events.map((event) => event.name)).toEqual(
      first.events.map((event) => event.name),
    );
    expect(second.events[0].id).not.toBe(first.events[0].id);
    expect(addedId).toBe(second.id);
  });

  it("keeps one option's services out of the other", () => {
    const { input: twoOptions, addedId } = addOption(baseInput());
    const withExtra = patchOption(twoOptions, addedId, {
      events: [
        ...resolveSelectedOption(twoOptions, addedId).events,
        line("added-line", "Optional Add-On — Event Support", 20),
      ],
    });

    const [first, second] = materializeOptions(withExtra);
    expect(first.events).toHaveLength(1);
    expect(second.events).toHaveLength(2);
    expect(second.events[1].name).toBe("Optional Add-On — Event Support");
  });

  it("prices every option separately", () => {
    const { input: twoOptions, addedId } = addOption(baseInput());
    const withExtra = patchOption(twoOptions, addedId, {
      events: [
        ...resolveSelectedOption(twoOptions, addedId).events,
        line("added-line", "Optional Add-On", 20),
      ],
    });

    const priced = calculateServiceEstimateOptions(withExtra);
    expect(priced.map((option) => option.name)).toEqual(["Option 1", "Option 2"]);
    expect(priced[1].result.totalContractIncome).toBeGreaterThan(
      priced[0].result.totalContractIncome,
    );
  });

  it("mirrors the primary option onto the top-level lines", () => {
    const { input, addedId } = addOption(baseInput());
    const [first] = materializeOptions(input);
    const renamedFirst = patchOption(input, first.id, {
      events: [line("only-line", "Primary Only", 4)],
    });

    expect(renamedFirst.events[0].name).toBe("Primary Only");
    // …and editing the second option must not disturb them.
    const touchedSecond = patchOption(renamedFirst, addedId, {
      events: [line("second-line", "Second Only", 9)],
    });
    expect(touchedSecond.events[0].name).toBe("Primary Only");
  });

  it("collapses back to the implicit single-option shape on removal", () => {
    const { input: twoOptions, addedId } = addOption(baseInput());
    const backToOne = removeOption(twoOptions, addedId);

    expect(backToOne.options).toEqual([]);
    expect(hasMultipleOptions(backToOne)).toBe(false);
    expect(materializeOptions(backToOne)).toHaveLength(1);
  });

  it("never removes the last option", () => {
    const input = baseInput();
    const [only] = materializeOptions(input);

    expect(removeOption(input, only.id)).toBe(input);
  });

  it("renames an option and falls back to its position when cleared", () => {
    const { input: twoOptions, addedId } = addOption(baseInput());
    const named = renameOption(twoOptions, addedId, "With Event Support");
    expect(materializeOptions(named)[1].name).toBe("With Event Support");

    const cleared = renameOption(named, addedId, "   ");
    expect(materializeOptions(cleared)[1].name).toBe("Option 2");
  });

  it("falls back to the first option when a selection goes stale", () => {
    const input = baseInput();
    expect(resolveSelectedOption(input, "no-such-option").name).toBe("Option 1");
  });

  it("ignores an empty commit rather than emptying the estimate", () => {
    const input = baseInput();
    expect(commitOptions(input, [])).toBe(input);
  });
});
