import { describe, expect, it } from "vitest";
import {
  buildLivesyncAutoBom,
  isRibbonShape,
  outputsForScreen,
  stripRibbonToCanvas,
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

// ─────────────────────── Ribbon stripping (Jackson, 2026-08-25) ───────────────────────
//
// "Take the total screen width and divide it by 3840 (the size of one render
// output) and you stack the stripes on top of each other until you fill 75% of
// the canvas height, then you go to use a second output."

describe("stripRibbonToCanvas — the stripping practice itself", () => {
  it("cuts a 30,720px ring ribbon into 8 stripes that all stack on ONE output", () => {
    const plan = stripRibbonToCanvas(30720, 96)!;
    expect(plan.stripes).toBe(8); // 30720 / 3840, divides evenly
    expect(plan.fullWidthStripes).toBe(8);
    expect(plan.remainderStripeWidth).toBe(0);
    expect(plan.usableCanvasHeight).toBe(1620); // 75% of 2160
    expect(plan.stripesPerOutput).toBe(16); // ⌊1620 / 96⌋
    expect(plan.outputs).toBe(1);
    expect(plan.stackedHeight).toBe(768); // 8 × 96
    // Tiled the standard way this same ribbon costs 8 outputs.
    expect(outputsForScreen(30720, 96)).toBe(8);
  });

  it("carries the short tail stripe when the width does not divide evenly", () => {
    const plan = stripRibbonToCanvas(8000, 96)!;
    expect(plan.stripes).toBe(3);
    expect(plan.fullWidthStripes).toBe(2);
    expect(plan.remainderStripeWidth).toBe(320); // 8000 − 2 × 3840
    expect(plan.outputs).toBe(1);
  });

  it("moves to a second output once the stack would pass 75%", () => {
    // 200px stripes → ⌊1620/200⌋ = 8 stripes per output; 10 stripes needed.
    const plan = stripRibbonToCanvas(38400, 200)!;
    expect(plan.stripes).toBe(10);
    expect(plan.stripesPerOutput).toBe(8);
    expect(plan.outputs).toBe(2);
    expect(plan.stripesOnLastOutput).toBe(2);
    expect(plan.stackedHeight).toBe(1600); // 8 × 200, inside the 1620 budget
  });

  it("fills exactly 75% when the stripe height divides the budget", () => {
    const plan = stripRibbonToCanvas(3840 * 5, 540)!;
    expect(plan.stripesPerOutput).toBe(3);
    expect(plan.stackedHeight).toBe(1620);
    expect(plan.canvasFillPct).toBe(75);
  });

  it("never stacks past the 75% budget, at any stripe height", () => {
    for (let h = 1; h <= 1620; h++) {
      const plan = stripRibbonToCanvas(3840 * 40, h)!;
      expect(plan.stackedHeight).toBeLessThanOrEqual(1620);
      // and every stripe is accounted for on some output
      expect(plan.stripesPerOutput * plan.outputs).toBeGreaterThanOrEqual(plan.stripes);
    }
  });

  it("refuses to strip a screen taller than the stacking budget", () => {
    expect(stripRibbonToCanvas(20000, 1621)).toBeNull();
    expect(stripRibbonToCanvas(20000, 2160)).toBeNull();
  });
});

describe("isRibbonShape — what reads as a ribbon without being told", () => {
  it("recognises long thin bands", () => {
    expect(isRibbonShape(30720, 96)).toBe(true); // ring ribbon
    expect(isRibbonShape(8000, 240)).toBe(true); // fascia run
    expect(isRibbonShape(3841, 810)).toBe(true); // boundary: 2 stripes still stack
  });
  it("leaves video boards alone", () => {
    expect(isRibbonShape(7680, 1000)).toBe(false); // Jackson's main-board example
    expect(isRibbonShape(8000, 2000)).toBe(false); // end zone
    expect(isRibbonShape(7000, 1500)).toBe(false); // outdoor main
    expect(isRibbonShape(3000, 96)).toBe(false); // narrower than one output: nothing to strip
    expect(isRibbonShape(3841, 811)).toBe(false); // a 2nd stripe no longer stacks
  });
});

describe("ribbon stripping through the BOM", () => {
  const ribbon = { name: "Upper Bowl Ribbon", pixelWidth: 30720, pixelHeight: 96 };

  it("puts a 30,720px ribbon on ONE output and a standard render pair", () => {
    const result = buildLivesyncAutoBom({ screens: [ribbon] }, CATALOG, PRICING);
    const plan = result.screenPlans[0];
    expect(plan.ribbon).toBe(true);
    expect(plan.ribbonSource).toBe("shape");
    expect(plan.outputs).toBe(1);
    expect(plan.strip!.stripes).toBe(8);
    // One output → a standard 4TB render primary + its 1:1 backup, no dual GPU.
    expect(plan.dualVideoCard).toBe(false);
    expect(qty(result, "ANC-1U-4TB-2x4ADA-V1")).toBe(0);
    expect(qty(result, "ANC-1U-4TB-4ADA-V1")).toBe(2);
  });

  it("costs far less hardware than the same ribbon tiled the standard way", () => {
    const stripped = buildLivesyncAutoBom({ screens: [ribbon] }, CATALOG, PRICING);
    const tiled = buildLivesyncAutoBom(
      { screens: [{ ...ribbon, ribbon: false }] },
      CATALOG,
      PRICING
    );
    expect(tiled.screenPlans[0].ribbon).toBe(false);
    expect(tiled.screenPlans[0].outputs).toBe(8);
    expect(stripped.counts.renderServers).toBeLessThan(tiled.counts.renderServers);
    expect(stripped.totals.grand).toBeLessThan(tiled.totals.grand);
  });

  it("explains the mapping in the reasoning trail, with the real numbers", () => {
    const result = buildLivesyncAutoBom({ screens: [ribbon] }, CATALOG, PRICING);
    const text = result.reasoning.map((s) => s.text).join(" ");
    expect(text).toContain("stripped onto the canvas");
    expect(text).toContain("8 stripe(s)");
    expect(text).toContain("1620px");
    expect(text).toContain("16 stripe(s) per output");
    expect(text).toContain("would have taken 8 output(s)");
  });

  it("names auto-detected ribbons on the review list so the call can be reversed", () => {
    const result = buildLivesyncAutoBom({ screens: [ribbon] }, CATALOG, PRICING);
    expect(
      result.reviewFlags.some(
        (f) => f.includes("ribbon board(s) from their shape") && f.includes("Upper Bowl Ribbon")
      )
    ).toBe(true);
  });

  it("spans two outputs when the stripes overflow the canvas budget", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "Deep Ribbon", pixelWidth: 38400, pixelHeight: 200 }] },
      CATALOG,
      PRICING
    );
    const plan = result.screenPlans[0];
    expect(plan.outputs).toBe(2);
    expect(plan.renderPrimaries).toBe(1); // 2 outputs still fit one server
    expect(plan.renderServersTotal).toBe(2);
    expect(plan.flags.some((f) => f.includes("does not divide evenly"))).toBe(true);
  });

  it("never strips a live-video screen — a feed is one contiguous image", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "Center Hung", pixelWidth: 8000, pixelHeight: 600, liveVideo: true }] },
      CATALOG,
      PRICING
    );
    expect(result.screenPlans[0].ribbon).toBe(false);
    expect(result.screenPlans[0].outputs).toBe(3);
  });

  it("honours an explicit ribbon call on a screen the shape would not catch", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "Tall Fascia", pixelWidth: 11520, pixelHeight: 1200, ribbon: true }] },
      CATALOG,
      PRICING
    );
    const plan = result.screenPlans[0];
    expect(plan.ribbon).toBe(true);
    expect(plan.ribbonSource).toBe("explicit");
    expect(plan.strip!.stripesPerOutput).toBe(1); // only one 1200px stripe fits
    expect(plan.outputs).toBe(3); // so stripping saves nothing here — same as tiled
  });

  it("says so instead of guessing when a screen called a ribbon cannot be stripped", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "Too Tall", pixelWidth: 8000, pixelHeight: 1800, ribbon: true }] },
      CATALOG,
      PRICING
    );
    const plan = result.screenPlans[0];
    expect(plan.ribbon).toBe(false);
    expect(plan.strip).toBeNull();
    expect(plan.flags.some((f) => f.includes("stacking budget"))).toBe(true);
  });

  it("leaves the main video board mapping exactly as it was", () => {
    const result = buildLivesyncAutoBom(
      { screens: [{ name: "Main Video Board", pixelWidth: 7680, pixelHeight: 1000 }] },
      CATALOG,
      PRICING
    );
    expect(result.screenPlans[0].ribbon).toBe(false);
    expect(result.screenPlans[0].outputs).toBe(2);
    expect(result.screenPlans[0].renderServersTotal).toBe(2);
  });
});
