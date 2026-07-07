import { describe, expect, it } from "vitest";
import { mapEstimatorToScoping } from "./estimatorToScopingMapper";
import { getDefaultAnswers, getDefaultDisplayAnswers } from "@/app/components/estimator/questions";

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
