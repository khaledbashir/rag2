/**
 * Natalia's 2026-08-12 ask, tested against the shapes her Cleveland workbook
 * produces. Values are modelled on that file (Team Tunnel, the seven Bowl
 * Entrance ribbons, the outdoor plaza boards) without carrying client pricing
 * into the repo.
 */
import { describe, it, expect } from "vitest";

import {
  applyDisplaySpecDescriptions,
  formatDisplaySpecDescription,
} from "./displaySpecDescription";
import type { PricingDocument, PricingTable } from "@/types/pricing";

function table(name: string, firstDescription: string): PricingTable {
  return {
    id: `table-${name}`,
    name,
    currency: "USD",
    items: [
      { description: firstDescription, sellingPrice: 273386.88, isIncluded: false },
      { description: "Structural Materials", sellingPrice: 8173.89, isIncluded: false },
      { description: "Engineering & Permits", sellingPrice: 5458.64, isIncluded: false },
    ],
    alternates: [],
    subtotal: 287019.41,
    tax: null,
    bond: 0,
    tariff: 0,
    grandTotal: 287019.41,
  } as unknown as PricingTable;
}

const doc = (tables: PricingTable[]) => ({ tables }) as unknown as PricingDocument;

describe("formatDisplaySpecDescription", () => {
  it("writes the line in the shape Natalia types by hand", () => {
    expect(
      formatDisplaySpecDescription({
        name: "Team Tunnel LED",
        heightFt: 9.965551181102361,
        widthFt: 29.527559055118108,
        pitchMm: 1.25,
        quantity: 1,
      }),
    ).toBe("Team Tunnel LED - 9.97' x 29.53' - 1.25mm - QTY 1");
  });

  it("drops trailing zeros from a whole-number pitch", () => {
    expect(
      formatDisplaySpecDescription({
        name: "Bowl Entrance Ribbon (Display 1)",
        heightFt: 1.9685039370078738,
        widthFt: 23.62204724409449,
        pitchMm: 10,
        quantity: 1,
      }),
    ).toBe("Bowl Entrance Ribbon (Display 1) - 1.97' x 23.62' - 10mm - QTY 1");
  });

  it("rounds an outdoor product's reported pitch to two decimals", () => {
    expect(
      formatDisplaySpecDescription({
        name: "Exterior Board Main Plaza",
        heightFt: 56.811023622047244,
        widthFt: 224.73753280839895,
        pitchMm: 10.4167,
        quantity: 1,
      }),
    ).toBe("Exterior Board Main Plaza - 56.81' x 224.74' - 10.42mm - QTY 1");
  });

  it("carries a real quantity through", () => {
    expect(
      formatDisplaySpecDescription({
        name: "Cleveland Social Bar Boards",
        heightFt: 32.11122047244094,
        widthFt: 35.43307086614173,
        pitchMm: 1.25,
        quantity: 4,
      }),
    ).toBe("Cleveland Social Bar Boards - 32.11' x 35.43' - 1.25mm - QTY 4");
  });

  it("trims the trailing space an LED Cost Sheet name can carry", () => {
    expect(
      formatDisplaySpecDescription({ name: "Team Tunnel LED ", pitchMm: 1.25, quantity: 1 }),
    ).toBe("Team Tunnel LED - 1.25mm - QTY 1");
  });

  it("omits dimensions and pitch it does not have rather than printing zeros", () => {
    expect(formatDisplaySpecDescription({ name: "Interview Room Screen" })).toBe(
      "Interview Room Screen - QTY 1",
    );
    expect(
      formatDisplaySpecDescription({ name: "Club Screen LED", heightFt: 0, widthFt: 0, pitchMm: 0 }),
    ).toBe("Club Screen LED - QTY 1");
  });

  it("declines a screen with no name", () => {
    expect(formatDisplaySpecDescription({ heightFt: 10, widthFt: 20, pitchMm: 1.25 })).toBeNull();
  });
});

describe("applyDisplaySpecDescriptions", () => {
  const screens = [
    { name: "Team Tunnel LED ", heightFt: 9.965551181102361, widthFt: 29.527559055118108, pitchMm: 1.25, quantity: 1 },
    { name: "Bowl Entrance Ribbon (Display 1)", heightFt: 1.9685039370078738, widthFt: 23.62204724409449, pitchMm: 10, quantity: 1 },
    { name: "Bowl Entrance Ribbon (Display 2)", heightFt: 1.9685039370078738, widthFt: 20.99737532808399, pitchMm: 10, quantity: 1 },
  ];

  it("replaces the LED hardware label with the screen spec", () => {
    const d = doc([table("Team Tunnel LED", "LED Hardware")]);
    const rewrites = applyDisplaySpecDescriptions(d, screens);

    expect(rewrites).toHaveLength(1);
    expect(d.tables[0].items[0].description).toBe(
      "Team Tunnel LED - 9.97' x 29.53' - 1.25mm - QTY 1",
    );
  });

  it("keeps the mirrored label on the row it replaced", () => {
    const d = doc([table("Team Tunnel LED", "LED Hardware")]);
    applyDisplaySpecDescriptions(d, screens);
    expect(d.tables[0].items[0].sourceDescription).toBe("LED Hardware");
  });

  it("leaves every other line of the table exactly as the workbook had it", () => {
    const d = doc([table("Team Tunnel LED", "LED Hardware")]);
    applyDisplaySpecDescriptions(d, screens);
    expect(d.tables[0].items.slice(1).map((i) => i.description)).toEqual([
      "Structural Materials",
      "Engineering & Permits",
    ]);
    expect(d.tables[0].grandTotal).toBe(287019.41);
    expect(d.tables[0].items[0].sellingPrice).toBe(273386.88);
  });

  it("tells the near-identical ribbon displays apart", () => {
    const d = doc([
      table("Bowl Entrance Ribbon (Display 1)", "LED Hardware"),
      table("Bowl Entrance Ribbon (Display 2)", "LED Hardware"),
    ]);
    applyDisplaySpecDescriptions(d, screens);

    expect(d.tables[0].items[0].description).toBe(
      "Bowl Entrance Ribbon (Display 1) - 1.97' x 23.62' - 10mm - QTY 1",
    );
    expect(d.tables[1].items[0].description).toBe(
      "Bowl Entrance Ribbon (Display 2) - 1.97' x 21.00' - 10mm - QTY 1",
    );
  });

  it("also catches the estimator's 'LED Hardware (1.25mm)' wording", () => {
    const d = doc([table("Team Tunnel LED", "LED Hardware (1.25mm)")]);
    expect(applyDisplaySpecDescriptions(d, screens)).toHaveLength(1);
    expect(d.tables[0].items[0].description).toBe(
      "Team Tunnel LED - 9.97' x 29.53' - 1.25mm - QTY 1",
    );
  });

  it("leaves a table alone when no screen matches its name", () => {
    const d = doc([table("ANC Travel", "LED Hardware")]);
    expect(applyDisplaySpecDescriptions(d, screens)).toHaveLength(0);
    expect(d.tables[0].items[0].description).toBe("LED Hardware");
    expect(d.tables[0].items[0].sourceDescription).toBeUndefined();
  });

  it("leaves a table alone when it has no LED hardware line", () => {
    const d = doc([table("Team Tunnel LED", "Structural Labor & LED Installation")]);
    expect(applyDisplaySpecDescriptions(d, screens)).toHaveLength(0);
    expect(d.tables[0].items[0].description).toBe("Structural Labor & LED Installation");
  });

  it("refuses an ambiguous match rather than spelling out the wrong screen", () => {
    const ambiguous = [
      { name: "Ribbon", heightFt: 2, widthFt: 20, pitchMm: 10, quantity: 1 },
      { name: "Ribbon North", heightFt: 3, widthFt: 30, pitchMm: 10, quantity: 1 },
    ];
    const d = doc([table("Ribbon North Upper", "LED Hardware")]);
    expect(applyDisplaySpecDescriptions(d, ambiguous)).toHaveLength(0);
    expect(d.tables[0].items[0].description).toBe("LED Hardware");
  });

  it("is a no-op on a workbook that imported no screens", () => {
    const d = doc([table("Team Tunnel LED", "LED Hardware")]);
    expect(applyDisplaySpecDescriptions(d, [])).toHaveLength(0);
    expect(applyDisplaySpecDescriptions(d, undefined)).toHaveLength(0);
    expect(applyDisplaySpecDescriptions(null, screens)).toHaveLength(0);
    expect(d.tables[0].items[0].description).toBe("LED Hardware");
  });

  it("is idempotent across a re-import", () => {
    const d = doc([table("Team Tunnel LED", "LED Hardware")]);
    applyDisplaySpecDescriptions(d, screens);
    expect(applyDisplaySpecDescriptions(d, screens)).toHaveLength(0);
    expect(d.tables[0].items[0].sourceDescription).toBe("LED Hardware");
  });
});
