/**
 * @vitest-environment jsdom
 *
 * Regression: Natalia, 2026-08-14 (Hard Rock Stadium bid, sent 4:59pm).
 * The Technical Specifications table used a fixed-layout table with
 * `white-space: nowrap` + `text-overflow: ellipsis`, so any long value was
 * silently clipped — "3.94' x 2103.68'" reached the client as
 * "3.94' x 2103....". A spec table must never drop characters.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

import ExhibitA_TechnicalSpecs from "@/app/components/templates/proposal-pdf/exhibits/ExhibitA_TechnicalSpecs";

/** The widest real values from the Hard Rock Stadium proposal. */
const HARD_ROCK_SCREENS = [
  { id: "s1", name: "Corner Boards (4 Total)", heightFt: 50.26, widthFt: 113.09, pitchMm: 10.42, quantity: 4 },
  { id: "s2", name: "360° Fascia Board", heightFt: 3.94, widthFt: 2103.68, pitchMm: 10, quantity: 1 },
  { id: "s3", name: "End Zone Board (10mm)", heightFt: 20.76, widthFt: 360.89, pitchMm: 10.42, quantity: 2 },
  { id: "s4", name: "Side Line Board (10mm)", heightFt: 20.76, widthFt: 447.83, pitchMm: 10.42, quantity: 2 },
];

const makeData = (screens: any[], extra: Record<string, any> = {}) =>
  ({ details: { screens, ...extra } } as any);

const renderSpecs = (screens: any[], extra: Record<string, any> = {}) =>
  render(<ExhibitA_TechnicalSpecs data={makeData(screens, extra)} />);

describe("ExhibitA_TechnicalSpecs — no cell is ever truncated", () => {
  it("renders every dimension in full, including the widest screen", () => {
    const { container } = renderSpecs(HARD_ROCK_SCREENS);
    const text = container.textContent || "";

    expect(text).toContain("50.26' x 113.09'");
    expect(text).toContain("3.94' x 2103.68'");
    expect(text).toContain("20.76' x 360.89'");
    expect(text).toContain("20.76' x 447.83'");
    expect(text).not.toContain("...");
    expect(text).not.toContain("…");
  });

  it("never sets text-overflow: ellipsis on a body cell", () => {
    const { container } = renderSpecs(HARD_ROCK_SCREENS);
    const cells = Array.from(container.querySelectorAll("tbody td"));
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const style = (cell as HTMLElement).style;
      expect(style.textOverflow).toBe("");
      expect(style.overflow).toBe("");
      // Cells wrap; nowrap is what caused the clipping.
      expect(style.whiteSpace).not.toBe("nowrap");
    }
  });

  it("keeps each measurement atomic so a wrap never splits a number", () => {
    const { container } = renderSpecs(HARD_ROCK_SCREENS);
    const dimsCell = container.querySelectorAll("tbody tr")[1].querySelectorAll("td")[1];
    const tokens = Array.from(dimsCell.querySelectorAll("span")).map((s) => s.textContent);
    expect(tokens).toEqual(["3.94'", "2103.68'"]);
    for (const span of Array.from(dimsCell.querySelectorAll("span"))) {
      expect((span as HTMLElement).style.whiteSpace).toBe("nowrap");
    }
  });

  it("renders resolution in full for a very wide board", () => {
    const { container } = renderSpecs(HARD_ROCK_SCREENS);
    // 3.94ft / 10mm and 2103.68ft / 10mm
    expect(container.textContent).toContain("120 x 64120");
  });

  it("does not truncate weight or max power when Exhibit G data is present", () => {
    const { container } = renderSpecs([
      {
        ...HARD_ROCK_SCREENS[1],
        calculatedExhibitG: { totalWeightLbs: 128456, maxPowerW: 1043210 },
      },
    ]);
    const text = container.textContent || "";
    expect(text).toContain("128,456.00 lbs");
    expect(text).toContain("1,043,210.00 W");
    expect(text).toContain("3.94' x 2103.68'");
    expect(text).not.toContain("…");
  });

  it("does not truncate in condensed mode either", () => {
    const { container } = renderSpecs(HARD_ROCK_SCREENS, { specsDisplayMode: "condensed" });
    const text = container.textContent || "";
    expect(text).toContain("3.94' x 2103.68'");
    expect(text).not.toContain("…");
  });
});
