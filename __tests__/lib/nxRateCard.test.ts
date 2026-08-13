/**
 * The fixtures are the real workbooks Natalia sent on 2026-08-13, unedited.
 *
 * The numbers asserted below were read straight out of the sheets, so a failure
 * here means the parser drifted from the card — not that the card is wrong.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseNxRateCard, type NxRateCard } from "@/lib/pricing/nxRateCard";

const FIXTURES = join(process.cwd(), "test-fixtures/pricing/rate-cards");
const ANC_FILE = "NX Yaham Rate Card - ANC 08.01.26 EG.xlsx";
const LGEUS_FILE = "NX Yaham Rate Card - LEGUS 08.01.26 EG.xlsx";

const load = (file: string): NxRateCard =>
  parseNxRateCard(readFileSync(join(FIXTURES, file)), file);

const anc = load(ANC_FILE);
const lgeus = load(LGEUS_FILE);

const sku = (card: NxRateCard, s: string) => card.products.find((p) => p.sku === s);
const round = (n: number) => Math.round(n * 100) / 100;

describe("parseNxRateCard — card identity", () => {
  it("reads the ANC card as ex-works with no distribution markup", () => {
    expect(anc.variant).toBe("ANC");
    expect(anc.markupPct).toBeNull();
  });

  it("reads the LGEUS card as marked up, taking the rate from the label", () => {
    expect(lgeus.variant).toBe("LGEUS");
    expect(lgeus.markupPct).toBe(0.38);
  });

  it("reads the price date off the header", () => {
    expect(anc.updatedOn).toBe("2026/07/22");
    expect(lgeus.updatedOn).toBe("2026/07/22");
  });

  it("parses both sheets of both cards without warnings", () => {
    expect(anc.warnings).toEqual([]);
    expect(lgeus.warnings).toEqual([]);
  });

  it("finds every priced column — 18 outdoor + 36 indoor", () => {
    for (const card of [anc, lgeus]) {
      expect(card.products.filter((p) => p.environment === "outdoor")).toHaveLength(18);
      expect(card.products.filter((p) => p.environment === "indoor")).toHaveLength(36);
    }
  });
});

describe("parseNxRateCard — prices", () => {
  it("takes ex-works as the buy price on the ANC card", () => {
    // NX Outdoor Sport!D56 / !H56 / !I56
    expect(round(sku(anc, "R2.5-MIP")!.pricePerSqft)).toBe(526.52);
    expect(round(sku(anc, "R6")!.pricePerSqft)).toBe(225.01);
    expect(round(sku(anc, "R6-SY")!.pricePerSqft)).toBe(177.54);
  });

  it("takes the markup row as the buy price on the LGEUS card", () => {
    // NX Outdoor Sport!D58 / !H58 / !I58 — the 38% row, not the ex-works row
    expect(round(sku(lgeus, "R2.5-MIP")!.pricePerSqft)).toBe(635.59);
    expect(round(sku(lgeus, "R6")!.pricePerSqft)).toBe(271.67);
    expect(round(sku(lgeus, "R6-SY")!.pricePerSqft)).toBe(214.36);
  });

  it("keeps ex-works alongside the marked-up price on the LGEUS card", () => {
    const r6 = sku(lgeus, "R6")!;
    expect(round(r6.exworkPerSqft)).toBe(196.86);
    expect(round(r6.exworkPerSqft * 1.38)).toBe(round(r6.pricePerSqft));
  });

  it("prices a non-standard cabinet at the card's flat +10%", () => {
    for (const card of [anc, lgeus]) {
      for (const p of card.products) {
        // The two indoor all-in-one units are not customisable; the card puts 0
        // in their custom-cost cell rather than leaving it blank.
        if (!p.customPerSqft) continue;
        expect(round(p.customPerSqft)).toBe(round(p.pricePerSqft * 1.1));
      }
    }
  });

  it("carries the flat vessel shipping line", () => {
    expect(sku(anc, "R6")!.vesselShippingPerSqft).toBe(12);
    expect(sku(lgeus, "C10")!.vesselShippingPerSqft).toBe(12);
  });

  it("prices every product above zero", () => {
    for (const card of [anc, lgeus]) {
      for (const p of card.products) expect(p.pricePerSqft).toBeGreaterThan(0);
    }
  });

  it("costs the same panel ~20.7% more through LG USA than direct", () => {
    for (const direct of anc.products) {
      const viaLg = lgeus.products.find(
        (p) => p.sku === direct.sku && p.environment === direct.environment
      );
      expect(viaLg, `no LGEUS row for ${direct.sku}`).toBeDefined();
      const uplift = viaLg!.pricePerSqft / direct.pricePerSqft - 1;
      expect(uplift).toBeGreaterThan(0.2);
      expect(uplift).toBeLessThan(0.21);
    }
  });
});

describe("parseNxRateCard — SKUs follow what the card distinguishes", () => {
  it("suffixes the LED supplier only where the card offers both", () => {
    // R6 ships NationStar and Sinyopto at one brightness → supplier is the axis.
    expect(sku(anc, "R6")!.ledManufacturer).toBe("NationStar");
    expect(sku(anc, "R6-SY")!.ledManufacturer).toBe("Sinyopto");
    // R2.5-MIP ships one way, so it stays bare.
    expect(anc.products.filter((p) => p.sku.startsWith("R2.5-MIP"))).toHaveLength(1);
  });

  it("suffixes the package where a model offers more than one", () => {
    // R4: NationStar White, NationStar Black, Sinyopto White.
    const r4 = anc.products.filter((p) => p.modelLabel.trim() === "R4");
    expect(r4.map((p) => p.sku).sort()).toEqual(["R4", "R4-BLK", "R4-SY"]);
    expect(sku(anc, "R4-BLK")!.pixelConfiguration).toContain("Black");
  });

  it("marks the brighter of a brightness pair -HB, keeping the existing names", () => {
    const c4 = sku(anc, "C4")!;
    const c4hb = sku(anc, "C4-HB")!;
    expect(c4.maxNits).toBe(1200);
    expect(c4hb.maxNits).toBe(2000);
    expect(c4hb.pricePerSqft).toBeGreaterThan(c4.pricePerSqft);
  });

  it("keeps the transmission tier and drops the DAC note from the model name", () => {
    // "C1.875-MIP (5G， DAC传输))" must not leak punctuation or Chinese into a SKU.
    expect(sku(anc, "C1.875-MIP-5G")).toBeDefined();
    expect(sku(anc, "C1.875-MIP-1G")).toBeDefined();
    for (const card of [anc, lgeus]) {
      for (const p of card.products) expect(p.sku).toMatch(/^[A-Z0-9.\-]+$/);
    }
  });

  it("gives every column in a card a unique SKU", () => {
    for (const card of [anc, lgeus]) {
      const keys = card.products.map((p) => `${p.environment}:${p.sku}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("names the same panel identically on both cards", () => {
    const a = anc.products.map((p) => `${p.environment}:${p.sku}`).sort();
    const l = lgeus.products.map((p) => `${p.environment}:${p.sku}`).sort();
    expect(l).toEqual(a);
  });
});

describe("parseNxRateCard — specs", () => {
  it("sizes the cabinet from module dimension × module count, not the FT rows", () => {
    // The card's own "Cabinet Width - FT" divides by 0.294 instead of 0.3048 and
    // would read 1.63ft / 3.40ft here.
    const mip = sku(anc, "R2.5-MIP")!;
    expect(mip.moduleWidthMm).toBe(240);
    expect(mip.moduleHeightMm).toBe(270);
    expect(mip.modulesPerCabinetW).toBe(2);
    expect(mip.modulesPerCabinetH).toBe(2);
    expect(mip.cabinetWidthMm).toBe(480);
    expect(mip.cabinetHeightMm).toBe(540);

    const r4 = sku(anc, "R4")!;
    expect(r4.cabinetWidthMm).toBe(1000);
    expect(r4.cabinetHeightMm).toBe(1000);
  });

  it("reads the optical, electrical and service specs", () => {
    const r6 = sku(anc, "R6")!;
    expect(r6.pixelPitchMm).toBeCloseTo(5.95, 2);
    expect(r6.maxNits).toBe(10000);
    expect(r6.maxPowerWattsPerCab).toBe(650);
    expect(r6.weightKgPerCabinet).toBe(29.5);
    expect(r6.ipRatingFront).toBe("IP66");
    expect(r6.serviceAccess).toBe("Front and Rear");
    expect(r6.productLine).toBe("Radiance");
    expect(r6.application).toBe("FIXED INSTALLATION");
  });

  it("reads a fascia product's top service access", () => {
    const ho10t = sku(anc, "HO10T")!;
    expect(ho10t.serviceAccess).toBe("Top");
    expect(ho10t.application).toContain("FASCIA");
    expect(ho10t.productLine).toBe("Halo - Fascia");
  });

  it("labels the indoor sheet indoor and leaves it without an application row", () => {
    const c10 = sku(anc, "C10")!;
    expect(c10.environment).toBe("indoor");
    expect(c10.application).toBeNull();
    expect(c10.pixelPitchMm).toBe(10);
  });

  it("gives every product a pitch and a model", () => {
    for (const card of [anc, lgeus]) {
      for (const p of card.products) {
        expect(p.pixelPitchMm).toBeGreaterThan(0);
        expect(p.modelLabel.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("parseNxRateCard — refuses to guess", () => {
  it("throws on a workbook with no NX sheets", () => {
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["hello"]]), "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(() => parseNxRateCard(buf, "not-a-rate-card.xlsx")).toThrow(/NX Outdoor Sport/);
  });

  it("still parses when the sheet name is only close", () => {
    // Guards the sheet match against an exact-name assumption.
    const XLSX = require("xlsx");
    const src = XLSX.read(readFileSync(join(FIXTURES, ANC_FILE)), { type: "buffer" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, src.Sheets["NX Outdoor Sport"], "Outdoor Sport 2027");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const card = parseNxRateCard(buf, "renamed.xlsx");
    expect(card.products.length).toBe(18);
  });
});
