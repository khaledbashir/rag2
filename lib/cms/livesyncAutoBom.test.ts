import { describe, expect, it } from "vitest";
import {
  buildLivesyncAutoBom,
  outputsForScreen,
  type CatalogEntry,
} from "./livesyncAutoBom";

// Minimal catalog mirroring prisma/seed-cms-catalog.ts prices
const CATALOG: CatalogEntry[] = [
  ["ANC-1U-4TB-4ADA-V1", "SERVER_EQUIPMENT", 8990],
  ["ANC-1U-6TB-4ADA-V1", "SERVER_EQUIPMENT", 10150],
  ["ANC-1U-8TB-4ADA-V1", "SERVER_EQUIPMENT", 11250],
  ["ANC-1U-4TB-2x4ADA-V1", "SERVER_EQUIPMENT", 11550],
  ["ANC-1U-6TB-2x4ADA-V1", "SERVER_EQUIPMENT", 12350],
  ["ANC-1U-8TB-2x4ADA-V1", "SERVER_EQUIPMENT", 13690],
  ["ANC-1U-4TB-4ADA-CC", "SERVER_EQUIPMENT", 14890],
  ["ANC-1U-6TB-4ADA-CC", "SERVER_EQUIPMENT", 16980],
  ["ANC-1U-8TB-4ADA-CC", "SERVER_EQUIPMENT", 17990],
  ["CMS-ADDON-DANTE", "SERVER_ADDON", 500],
  ["CMS-ADDON-RS232IP", "SERVER_ADDON", 290],
  ["CMS-WS-PWR", "USER_STATION", 1150],
  ["CMS-NET-SWITCH", "INTERCONNECT", 5600],
  ["CMS-GPI-TRIGGER", "TRIGGER_HARDWARE", 2270],
  ["ADDER-TX", "KVM", 2150],
  ["ADDER-RX", "KVM", 2150],
  ["ADDER-MGT", "KVM", 2980],
  ["ANC-MTRX-4x4-5YR", "ROUTER", 6200],
  ["ANC-MTRX-8x8-5YR", "ROUTER", 8550],
  ["ANC-MTRX-16x16-5YR", "ROUTER", 23850],
  ["ANC-MTRX-24x24-5YR", "ROUTER", 31550],
  ["ANC-MTRX-32x32-5YR", "ROUTER", 47500],
  ["ANC-MTRX-48x48-5YR", "ROUTER", 63400],
  ["CMS-ROUTER-CABLE", "ROUTER", 120],
  ["CMS-RACK-WS", "RACK", 3000],
  ["CMS-RACK-ACC", "RACK", 1260],
  ["CMS-RACK-UPS", "RACK", 3440],
  ["CMS-RACK-ACOUT", "RACK", 10000],
  ["CMS-RACK-CABINET", "RACK", 3397.55],
  ["CMS-INTEG-WEEK", "INTEGRATION", 19500],
  ["LIVESYNC-LICENSE", "LICENSE", 10000],
].map(([sku, category, unitCost]) => ({
  sku: sku as string,
  displayName: sku as string,
  category: category as string,
  unitCost: unitCost as number,
  unitPrice: null,
  isActive: true,
}));

const qty = (result: ReturnType<typeof buildLivesyncAutoBom>, sku: string) =>
  result.lines.find((l) => l.sku === sku)?.quantity ?? 0;

// House divisor model, P = C / (1 - M), at the rate card's LiveSync margin.
const PRICING = { margin: 0.35, marginSource: "the rate card (LiveSync / CMS Margin, validated)" };

describe("outputsForScreen — 3840×2160 per output", () => {
  it("matches Jackson's 7680×1000 example: 2 outputs", () => {
    expect(outputsForScreen(7680, 1000)).toBe(2);
  });
  it("sub-4K screen needs 1 output", () => {
    expect(outputsForScreen(3000, 1000)).toBe(1);
  });
  it("7680×4320 needs 4 outputs (2 wide × 2 tall)", () => {
    expect(outputsForScreen(7680, 4320)).toBe(4);
  });
});

describe("Jackson's canonical 7680×1000 deployment", () => {
  const result = buildLivesyncAutoBom(
    { screens: [{ name: "Main Board", pixelWidth: 7680, pixelHeight: 1000 }] },
    CATALOG,
    PRICING
  );

  it("produces 4 servers total: 2 UI (8TB) + 2 render (4TB, primary+backup)", () => {
    expect(result.counts.uiServers).toBe(2);
    expect(result.counts.renderServers).toBe(2);
    expect(result.counts.totalServers).toBe(4);
    expect(qty(result, "ANC-1U-4TB-4ADA-V1")).toBe(2); // render pair
    expect(qty(result, "ANC-1U-8TB-4ADA-V1")).toBe(2); // UI pair
  });

  it("adds 1 audio element per server (4 servers → 4 audio)", () => {
    expect(qty(result, "CMS-ADDON-DANTE")).toBe(4);
  });

  it("4 servers × 2 outputs = 8 matrix inputs → 16×16 (next size up, never exact)", () => {
    expect(result.counts.matrixInputsNeeded).toBe(8);
    expect(result.counts.matrixSize).toBe(16);
    expect(qty(result, "ANC-MTRX-16x16-5YR")).toBe(1);
  });

  it("1 rack → 1 week of install labor, 3 switches minimum, 1 GPI trigger", () => {
    expect(result.counts.racks).toBe(1);
    expect(qty(result, "CMS-INTEG-WEEK")).toBe(1);
    expect(qty(result, "CMS-NET-SWITCH")).toBe(3);
    expect(qty(result, "CMS-GPI-TRIGGER")).toBe(1);
  });

  it("sports venue default → RS-232 scoring intake included", () => {
    expect(qty(result, "CMS-ADDON-RS232IP")).toBeGreaterThan(0);
  });

  it("KVM: TX per UI server, RX per workstation, 1 management", () => {
    expect(qty(result, "ADDER-TX")).toBe(2);
    expect(qty(result, "ADDER-RX")).toBe(1);
    expect(qty(result, "ADDER-MGT")).toBe(1);
  });

  it("license excluded by default but flagged for review", () => {
    expect(qty(result, "LIVESYNC-LICENSE")).toBe(0);
    expect(result.reviewFlags.some((f) => f.toLowerCase().includes("licens"))).toBe(true);
  });
});

describe("matrix sizing — never select exactly what you need", () => {
  it("16 inputs needed steps up to 24×24 (Jackson's 4-pairs example)", () => {
    // 3 screens of 2 outputs each → 3 render pairs (6) + 2 UI = 8 servers → 16 inputs
    const result = buildLivesyncAutoBom(
      {
        screens: [
          { name: "A", pixelWidth: 7680, pixelHeight: 1000 },
          { name: "B", pixelWidth: 7680, pixelHeight: 1000 },
          { name: "C", pixelWidth: 7680, pixelHeight: 1000 },
        ],
      },
      CATALOG,
      PRICING
    );
    expect(result.counts.totalServers).toBe(8);
    expect(result.counts.matrixInputsNeeded).toBe(16);
    expect(result.counts.matrixSize).toBe(24);
  });
});

describe("matrix sizing — dual-GPU servers feed 4 outputs", () => {
  it("counts dual boxes at 4 inputs and flags the assumption", () => {
    // Three 8000×2000 boards: each is wider than 7680 → dual-GPU, 3 outputs,
    // 1 primary + 1 backup each → 6 dual servers. Plus 2 UI (standard).
    const result = buildLivesyncAutoBom(
      {
        screens: [
          { name: "A", pixelWidth: 8000, pixelHeight: 2000 },
          { name: "B", pixelWidth: 8000, pixelHeight: 2000 },
          { name: "C", pixelWidth: 8000, pixelHeight: 2000 },
        ],
      },
      CATALOG,
      PRICING
    );
    expect(result.counts.totalServers).toBe(8);
    // 6 dual × 4 + 2 UI × 2 = 28 inputs → next size up = 32×32
    // (the old servers×2 math would have undersized this to a 24×24)
    expect(result.counts.matrixInputsNeeded).toBe(28);
    expect(result.counts.matrixSize).toBe(32);
    const matrixLine = result.lines.find((l) => l.sku === "ANC-MTRX-32x32-5YR");
    expect(matrixLine).toBeDefined();
    expect(matrixLine!.flags.some((f) => f.includes("Dual-GPU"))).toBe(true);
  });

  it("standard-only jobs keep Jackson's servers × 2 math unchanged", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "Main Board", pixelWidth: 7680, pixelHeight: 1000 }] },
      CATALOG,
      PRICING
    );
    expect(result.counts.matrixInputsNeeded).toBe(8);
    expect(result.counts.matrixSize).toBe(16);
  });
});

describe("live video screens", () => {
  it("selects the CC capture variant for a center-hung with live video", () => {
    const result = buildLivesyncAutoBom(
      {
        screens: [
          { name: "Center Hung", pixelWidth: 5000, pixelHeight: 2000, liveVideo: true },
        ],
      },
      CATALOG,
      PRICING
    );
    // 5000×2000 = 10M px → 6TB tier, CC capture variant, primary + backup
    expect(qty(result, "ANC-1U-6TB-4ADA-CC")).toBe(2);
  });
});

describe("dual video card rule — screen wider than 7680 stays on one box", () => {
  it("selects a dual-GPU server for an 8000×2000 board", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "End Zone", pixelWidth: 8000, pixelHeight: 2000 }] },
      CATALOG,
      PRICING
    );
    const dual = result.lines.find((l) => l.sku.includes("2x4ADA"));
    expect(dual).toBeDefined();
    expect(dual!.quantity).toBe(2); // primary + backup
  });
});

describe("small screens pack 2-per-server", () => {
  it("3 sub-4K screens → 2 primaries + 2 backups", () => {
    const result = buildLivesyncAutoBom(
      {
        screens: [
          { name: "Ribbon A", pixelWidth: 3000, pixelHeight: 500 },
          { name: "Ribbon B", pixelWidth: 3000, pixelHeight: 500 },
          { name: "Concourse", pixelWidth: 1920, pixelHeight: 1080 },
        ],
      },
      CATALOG,
      PRICING
    );
    expect(qty(result, "ANC-1U-4TB-4ADA-V1")).toBe(4); // ceil(3/2)=2 primaries ×2
  });
});

describe("workstations scale with screen count", () => {
  it("7 screens → 2 workstations (1 per 5 screens, min 1)", () => {
    const screens = Array.from({ length: 7 }, (_, i) => ({
      name: `S${i}`,
      pixelWidth: 3000,
      pixelHeight: 600,
    }));
    const result = buildLivesyncAutoBom({ screens }, CATALOG, PRICING);
    expect(result.counts.workstations).toBe(2);
    expect(qty(result, "CMS-WS-PWR")).toBe(2);
    expect(qty(result, "ADDER-RX")).toBe(2);
  });
});

describe("outdoor screens", () => {
  it("250 ft wide outdoor board → 2 outdoor A/C racks (every 150 ft)", () => {
    const result = buildLivesyncAutoBom(
      {
        screens: [
          {
            name: "Outdoor Main",
            pixelWidth: 7000,
            pixelHeight: 1500,
            outdoor: true,
            physicalWidthFt: 250,
          },
        ],
      },
      CATALOG,
      PRICING
    );
    expect(qty(result, "CMS-RACK-ACOUT")).toBe(2);
  });
});

describe("processor advisory — 650k pixels per port", () => {
  it("computes ports, processor class, closets, fiber pairs", () => {
    const result = buildLivesyncAutoBom(
      {
        screens: [
          {
            name: "Main",
            pixelWidth: 7680,
            pixelHeight: 1000,
            physicalWidthFt: 300,
          },
        ],
      },
      CATALOG,
      PRICING
    );
    const adv = result.processorAdvisories[0];
    expect(adv.portsNeeded).toBe(Math.ceil((7680 * 1000) / 650000)); // 12
    expect(adv.recommendedClass).toContain("4K");
    expect(adv.closets).toBe(2); // 300 ft / 150 ft rule
    expect(adv.fiberConverterPairs).toBe(2); // 6 ports per closet → 1 pair each
  });
});

describe("flag-don't-guess behavior", () => {
  it("missing catalog SKU produces a review flag instead of throwing", () => {
    const tiny = CATALOG.filter((c) => c.category === "SERVER_EQUIPMENT");
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "X", pixelWidth: 7680, pixelHeight: 1000 }] },
      tiny,
      PRICING
    );
    expect(result.reviewFlags.some((f) => f.includes("missing SKU"))).toBe(true);
  });

  it("marks up every price-less SKU instead of quoting it at bare cost", () => {
    // The real catalog carries cost for all 80 SKUs and a sell price for none,
    // so this is the production case: nothing may come out at cost.
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "X", pixelWidth: 3000, pixelHeight: 600 }] },
      CATALOG,
      PRICING
    );
    expect(result.pricing.linesFromCostPlusMargin).toBe(result.lines.length);
    expect(result.pricing.linesFromCatalogSell).toBe(0);
    for (const line of result.lines) {
      expect(line.priceBasis).toBe("cost-plus-margin");
      expect(line.unitPrice).toBeGreaterThan(line.unitCost);
      expect(line.unitPrice).toBeCloseTo(line.unitCost / (1 - PRICING.margin), 2);
    }
    // and the sheet says which margin it used, and where it came from
    const flag = result.reviewFlags.find((f) => f.includes("cost ÷"));
    expect(flag).toContain("35.0%");
    expect(flag).toContain(PRICING.marginSource);
  });

  it("totals carry both the cost roll-up and the marked-up sell price", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "X", pixelWidth: 3000, pixelHeight: 600 }] },
      CATALOG,
      PRICING
    );
    const lineCostSum = result.lines.reduce((s, l) => s + l.lineCost, 0);
    expect(result.totals.cost).toBeCloseTo(lineCostSum, 2);
    expect(result.totals.grand).toBeGreaterThan(result.totals.cost);
    // realised margin on the sheet is the margin we asked for
    const realised = (result.totals.grand - result.totals.cost) / result.totals.grand;
    expect(realised).toBeCloseTo(PRICING.margin, 3);
  });

  it("an explicit catalog sell price wins over the markup", () => {
    const priced = CATALOG.map((c) =>
      c.sku === "CMS-GPI-TRIGGER" ? { ...c, unitPrice: 2900 } : c
    );
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "X", pixelWidth: 3000, pixelHeight: 600 }] },
      priced,
      PRICING
    );
    const trigger = result.lines.find((l) => l.sku === "CMS-GPI-TRIGGER");
    expect(trigger?.unitPrice).toBe(2900);
    expect(trigger?.priceBasis).toBe("catalog-sell");
    expect(trigger?.unitCost).toBe(2270);
    expect(result.pricing.linesFromCatalogSell).toBe(1);
    expect(result.pricing.linesFromCostPlusMargin).toBe(result.lines.length - 1);
  });

  it("refuses an impossible margin rather than dividing by zero", () => {
    for (const bad of [1, 1.2, -0.1, NaN]) {
      expect(() =>
        buildLivesyncAutoBom(
          { screens: [{ name: "X", pixelWidth: 3000, pixelHeight: 600 }] },
          CATALOG,
          { margin: bad, marginSource: "test" }
        )
      ).toThrow(/Invalid LiveSync margin/);
    }
  });

  it("says plainly that processing is not priced, and why", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "X", pixelWidth: 7680, pixelHeight: 1000, physicalWidthFt: 300 }] },
      CATALOG,
      PRICING
    );
    expect(result.processing.priced).toBe(false);
    expect(result.processing.summary).toContain("NOT priced");
    expect(result.processing.missingInputs.length).toBeGreaterThan(0);
    expect(
      result.reviewFlags.some((f) => f.includes("Processing carries NO price"))
    ).toBe(true);
    // the layout math is still solved and reported
    expect(result.processorAdvisories[0].portsNeeded).toBeGreaterThan(0);
    expect(result.processorAdvisories[0].closets).toBe(2); // 300ft / 150ft rule
  });

  it("flips processing to priced once processor SKUs exist in the catalog", () => {
    const withProcessors: CatalogEntry[] = [
      ...CATALOG,
      {
        sku: "PROC-660-PRO",
        displayName: "660 Pro",
        category: "PROCESSOR",
        unitCost: 12000,
        unitPrice: null,
        isActive: true,
      },
    ];
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "X", pixelWidth: 3000, pixelHeight: 600 }] },
      withProcessors,
      PRICING
    );
    expect(result.processing.priced).toBe(true);
    expect(result.processing.missingInputs).toHaveLength(0);
    expect(
      result.reviewFlags.some((f) => f.includes("Processing carries NO price"))
    ).toBe(false);
  });

  it("always warns about the 15-day price fluctuation", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "X", pixelWidth: 3000, pixelHeight: 600 }] },
      CATALOG,
      PRICING
    );
    expect(result.reviewFlags.some((f) => f.includes("15 days"))).toBe(true);
  });

  it("emits an ordered reasoning trail covering every decision phase", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "Main", pixelWidth: 7680, pixelHeight: 1000 }] },
      CATALOG,
      PRICING
    );
    const phases = result.reasoning.map((s) => s.phase);
    for (const expected of [
      "Read the job",
      "Size each screen",
      "Select render servers",
      "Add UI servers",
      "Attach per-server pieces",
      "Place workstations & KVM",
      "Size the matrix",
      "Build the racks",
      "Network & triggers",
      "Price the labor",
      "Licensing & review",
      "Check the processing side",
    ]) {
      expect(phases).toContain(expected);
    }
    // the trail carries real numbers, not placeholders
    expect(result.reasoning.some((s) => s.text.includes("16×16"))).toBe(true);
  });

  it("includeLicense adds the LiveSync license line", () => {
    const result = buildLivesyncAutoBom(
      {
        screens: [{ name: "X", pixelWidth: 3000, pixelHeight: 600 }],
        includeLicense: true,
      },
      CATALOG,
      PRICING
    );
    expect(qty(result, "LIVESYNC-LICENSE")).toBe(1);
  });
});
