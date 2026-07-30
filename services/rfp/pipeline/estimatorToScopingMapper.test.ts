import { describe, expect, it } from "vitest";
import { mapEstimatorToScoping } from "./estimatorToScopingMapper";
import { generateScopingWorkbook } from "./generateScopingWorkbook";
import {
  getDefaultAnswers,
  getDefaultDisplayAnswers,
  type DisplayAnswers,
  type EstimatorAnswers,
} from "@/app/components/estimator/questions";

/**
 * Regression guard for the Sponsorship input wiring (Natalia 2026-07-07).
 * The Sponsorship column + Project Overview master cell existed in the workbook
 * generator, but `sponsorshipMargin` was never carried from estimator answers
 * into `ov.sponsorshipPct`, so it was always 0 no matter what the user typed.
 */
describe("mapEstimatorToScoping — sponsorship wiring", () => {
  const withSponsorship = (pct: number) =>
    mapEstimatorToScoping({
      ...getDefaultAnswers(),
      clientName: "T",
      projectName: "P",
      sponsorshipMargin: pct,
      displays: [{ ...getDefaultDisplayAnswers(), displayName: "D", widthFt: 10, heightFt: 3, quantity: 1 }],
    } as any);

  it("carries sponsorshipMargin (%) into overrides.sponsorshipPct (0-1)", () => {
    expect(withSponsorship(5).overrides?.sponsorshipPct).toBeCloseTo(0.05, 6);
    expect(withSponsorship(12.5).overrides?.sponsorshipPct).toBeCloseTo(0.125, 6);
  });

  it("keeps sponsorshipPct at 0 when margin is 0 (no sponsorship uplift)", () => {
    const ov = withSponsorship(0).overrides;
    expect(ov?.sponsorshipPct == null || ov?.sponsorshipPct === 0).toBe(true);
  });
});

/**
 * Regression guard for the Project Overview rate-linking fix (Jeremy 2026-07-08):
 * bond/tax/tariff rates typed on the Project Overview must flow from estimator
 * answers into the workbook overrides so Margin Analysis + the export reflect them.
 */
describe("mapEstimatorToScoping — rate linking (bond/tax/tariff)", () => {
  const withRates = (patch: Partial<{ bondRate: number; salesTaxRate: number; tariffRate: number }>) =>
    mapEstimatorToScoping({
      ...getDefaultAnswers(),
      clientName: "T",
      projectName: "P",
      displays: [{ ...getDefaultDisplayAnswers(), displayName: "D", widthFt: 10, heightFt: 3, quantity: 1 }],
      ...patch,
    } as any);

  it("carries bondRate (%) into overrides.bondRate (0-1)", () => {
    expect(withRates({ bondRate: 2 }).overrides?.bondRate).toBeCloseTo(0.02, 6);
  });

  it("carries salesTaxRate (%) into overrides.taxRate (0-1)", () => {
    expect(withRates({ salesTaxRate: 8.875 }).overrides?.taxRate).toBeCloseTo(0.08875, 6);
  });

  it("carries tariffRate (%) into overrides.tariffRate (0-1)", () => {
    expect(withRates({ tariffRate: 10 }).overrides?.tariffRate).toBeCloseTo(0.1, 6);
    expect(withRates({ tariffRate: 0 }).overrides?.tariffRate == null || withRates({ tariffRate: 0 }).overrides?.tariffRate === 0).toBe(true);
  });
});

/**
 * Regression guard for alternates reaching the workbook (Jack McCrossin
 * 2026-07-29: "alternates are not showing up in the workbooks or populating
 * anywhere").
 *
 * The estimator UI writes alternates to `alternates` and CLEARS the legacy
 * `altPitches`. Any consumer still reading `altPitches` directly sees an empty
 * list and silently drops every alternate. This mapper feeds both the scoping
 * workbook and the bid-form filler, so a miss here makes alternates vanish from
 * every downstream artifact at once — which is exactly what happened.
 */
describe("mapEstimatorToScoping — alternates reach the workbook", () => {
  const primary = (overrides: Partial<DisplayAnswers> = {}): DisplayAnswers => ({
    ...getDefaultDisplayAnswers(),
    displayName: "Main Scoreboard",
    displayType: "main-scoreboard",
    widthFt: 40,
    heightFt: 20,
    quantity: 1,
    pixelPitch: "6",
    ...overrides,
  });

  const answersWith = (...displays: DisplayAnswers[]): EstimatorAnswers => ({
    ...getDefaultAnswers(),
    clientName: "Test Client",
    projectName: "Alternates Regression",
    displays,
  });

  it("maps a same-footprint alternate into an alternate spec", () => {
    const opts = mapEstimatorToScoping(answersWith(primary({ alternates: [{ pixelPitch: "4" }] })));

    expect(opts.specs).toHaveLength(2);
    const alts = opts.specs.filter((s) => s.isAlternate);
    expect(alts).toHaveLength(1);
    expect(alts[0].pixelPitchMm).toBe(4);
    expect(alts[0].widthFt).toBe(40);
    expect(alts[0].heightFt).toBe(20);
    expect(alts[0].name).toContain("Alt 4mm");
  });

  it("carries the alternate's own dimensions and quantity when it is resized", () => {
    const opts = mapEstimatorToScoping(
      answersWith(primary({ alternates: [{ pixelPitch: "4", widthFt: 60, heightFt: 30, quantity: 2 }] })),
    );

    const alt = opts.specs.find((s) => s.isAlternate)!;
    expect(alt.widthFt).toBe(60);
    expect(alt.heightFt).toBe(30);
    expect(alt.quantity).toBe(2);
    expect(alt.name).toContain("60x30ft");
    expect(alt.alternateDescription).toContain("base: 6mm at 40x20 ft");
  });

  it("still maps a legacy altPitches entry so saved estimates keep working", () => {
    const opts = mapEstimatorToScoping(answersWith(primary({ altPitches: ["4"] })));

    const alts = opts.specs.filter((s) => s.isAlternate);
    expect(alts).toHaveLength(1);
    expect(alts[0].pixelPitchMm).toBe(4);
  });

  it("does not emit the same pitch twice when legacy and new lists overlap", () => {
    const opts = mapEstimatorToScoping(
      answersWith(primary({ altPitches: ["4"], alternates: [{ pixelPitch: "4" }] })),
    );

    expect(opts.specs.filter((s) => s.isAlternate)).toHaveLength(1);
  });

  it("honours a custom alternate label", () => {
    const opts = mapEstimatorToScoping(
      answersWith(primary({ alternates: [{ pixelPitch: "4", label: "Alternate No. 1" }] })),
    );

    expect(opts.specs.find((s) => s.isAlternate)!.name).toContain("Alternate No. 1");
  });

  it("keeps alternates out of the base bid", () => {
    const opts = mapEstimatorToScoping(answersWith(primary({ alternates: [{ pixelPitch: "4" }] })));
    expect(opts.includeAlternatesInBase).toBe(false);
  });

  it("renders the alternate on the LED Cost Sheet of a generated workbook", async () => {
    const opts = mapEstimatorToScoping(
      answersWith(primary({ alternates: [{ pixelPitch: "4", widthFt: 60, heightFt: 30 }] })),
    );

    const { workbook } = await generateScopingWorkbook(opts);
    const ws = workbook.getWorksheet("LED Cost Sheet");
    expect(ws).toBeTruthy();

    const text: string[] = [];
    ws!.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === "string") text.push(cell.value);
      });
    });

    const joined = text.join(" | ").toLowerCase();
    expect(joined).toContain("alternates");
    expect(joined).toContain("alt 4mm");
  });

  it("publishes the alternate's own size, not the primary's, in the RFP columns", () => {
    // mapDisplay reads `rfpWidthFt || widthFt`. A resized alternate that inherits
    // the primary's rfp dims lands on the LED Cost Sheet at the primary's size and
    // the cabinet-snap formulas on its row then compute against the wrong height.
    const alt = mapEstimatorToScoping(
      answersWith(primary({ rfpWidthFt: 40, rfpHeightFt: 20, alternates: [{ pixelPitch: "2.5", heightFt: 10 }] })),
    ).specs.find((s) => s.isAlternate)!;

    expect(alt.heightFt).toBe(10);
    expect(alt.widthFt).toBe(40);
  });

  it("gives every alternate its own Install tab, like a base screen", async () => {
    const opts = mapEstimatorToScoping(
      answersWith(primary({ alternates: [{ pixelPitch: "4", label: "Alternate No. 1" }] })),
    );

    const { workbook } = await generateScopingWorkbook(opts);
    const names = workbook.worksheets.map((w) => w.name);

    expect(names).toContain("Main Scoreboard - Install");
    expect(names).toContain("ALT1 Main Scoreboard - Install");
  });

  it("gives each alternate a distinct Install tab when a screen has several", async () => {
    const opts = mapEstimatorToScoping(
      answersWith(primary({ alternates: [{ pixelPitch: "4" }, { pixelPitch: "2.5" }] })),
    );

    const { workbook } = await generateScopingWorkbook(opts);
    const installTabs = workbook.worksheets.map((w) => w.name).filter((n) => n.endsWith(" - Install"));

    expect(installTabs).toEqual([
      "Main Scoreboard - Install",
      "ALT1 Main Scoreboard - Install",
      "ALT2 Main Scoreboard - Install",
    ]);
  });

  it("keeps per-display install complexity aligned when a screen has an alternate", () => {
    // `perDisplayComplexity` is parallel to the full specs array (base + alternates
    // interleaved). The workbook filters alternates out of the base bid, so without
    // re-indexing, one alternate on screen 1 shifts screen 2 onto screen 1's setting.
    const opts = mapEstimatorToScoping(
      answersWith(
        primary({ displayName: "Screen A", installComplexity: "simple", alternates: [{ pixelPitch: "4" }] }),
        primary({ displayName: "Screen B", installComplexity: "heavy" }),
      ),
    );

    expect(opts.overrides?.perDisplayComplexity).toEqual(["simple", "simple", "heavy"]);
  });

  it("keeps a typed cost override on the screen it was typed on", async () => {
    // Same parallel-array problem, but this one moves money: `perDisplayCostOverrides`
    // is indexed the same way, so an alternate on Screen A shifted Screen B's typed
    // display cost off Screen B entirely.
    const OVERRIDE = 876543;
    const opts = mapEstimatorToScoping(
      answersWith(
        primary({ displayName: "Screen A", alternates: [{ pixelPitch: "4" }] }),
        primary({ displayName: "Screen B", costOverrides: { shipping: OVERRIDE } }),
      ),
    );

    const { workbook } = await generateScopingWorkbook(opts);
    const ws = workbook.getWorksheet("LED Cost Sheet")!;
    const numbers: number[] = [];
    ws.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v: any = cell.value;
        if (typeof v === "number") numbers.push(v);
        else if (v && typeof v === "object" && typeof v.result === "number") numbers.push(v.result);
      });
    });

    expect(numbers).toContain(OVERRIDE);
  });
});
