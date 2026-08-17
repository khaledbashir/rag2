import { describe, expect, it } from "vitest";
import {
  buildSelection,
  cellValue,
  enumLabel,
  isRenderable,
  rollupLayout,
  selectionFor,
  toMirrorColumn,
  type ViewColumn,
} from "./viewMirror";

const col = (fieldName: string, type: string, label = fieldName): ViewColumn => ({
  fieldName,
  label,
  type,
});

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "";

describe("GraphQL selection", () => {
  it("asks composite money fields for their sub-fields", () => {
    expect(selectionFor(col("sponsorshipValue", "CURRENCY")))
      .toBe("sponsorshipValue { amountMicros currencyCode }");
  });

  it("asks a link field for the URL", () => {
    expect(selectionFor(col("digiLink", "LINKS")))
      .toBe("digiLink { primaryLinkUrl primaryLinkLabel }");
  });

  it("follows the company relation to its name", () => {
    expect(selectionFor(col("company", "RELATION"))).toBe("company { name }");
  });

  it("selects a scalar by name", () => {
    expect(selectionFor(col("projectType", "SELECT"))).toBe("projectType");
  });

  // A wrong shape here fails the whole query, so anything unrecognised is
  // dropped rather than guessed at.
  it("drops relations it cannot resolve and unknown composites", () => {
    expect(selectionFor(col("pointOfContact", "RELATION"))).toBeNull();
    expect(selectionFor(col("createdBy", "ACTOR"))).toBeNull();
    expect(isRenderable(col("createdBy", "ACTOR"))).toBe(false);
  });

  it("does not repeat a field the report already selects by hand", () => {
    const selection = buildSelection(
      [col("poValue", "CURRENCY"), col("projectType", "SELECT"), col("name", "TEXT")],
      ["poValue", "name"],
    );
    expect(selection).toBe("projectType");
  });

  it("de-duplicates within the column set too", () => {
    expect(buildSelection([col("league", "SELECT"), col("league", "SELECT")])).toBe("league");
  });
});

describe("cell values", () => {
  it("converts micros to dollars", () => {
    expect(cellValue(col("poValue", "CURRENCY"), { poValue: { amountMicros: "13000000000000" } }, fmtDate))
      .toBe(13_000_000);
  });

  it("leaves an unset money cell empty rather than zero", () => {
    expect(cellValue(col("poValue", "CURRENCY"), { poValue: { amountMicros: null } }, fmtDate)).toBeNull();
    expect(cellValue(col("poValue", "CURRENCY"), {}, fmtDate)).toBeNull();
  });

  it("renders a date in UTC so an award date does not slip a day", () => {
    expect(cellValue(col("closeDate", "DATE_TIME"), { closeDate: "2027-03-15T00:00:00.000Z" }, fmtDate))
      .toBe("Mar 15, 2027");
  });

  it("joins a multi-select", () => {
    expect(cellValue(col("lgBusinessUnits", "MULTI_SELECT"), { lgBusinessUnits: ["LED", "SKS_APPLIANCE"] }, fmtDate))
      .toBe("LED, SKS / Appliance");
  });

  it("takes the URL from a link field", () => {
    expect(cellValue(col("digiLink", "LINKS"), { digiLink: { primaryLinkUrl: "https://x.test/a" } }, fmtDate))
      .toBe("https://x.test/a");
  });

  it("takes the related record's name", () => {
    expect(cellValue(col("company", "RELATION"), { company: { name: "Carolina Panthers" } }, fmtDate))
      .toBe("Carolina Panthers");
  });

  it("renders an empty text cell as blank, not the string null", () => {
    expect(cellValue(col("lgNotes", "TEXT"), { lgNotes: null }, fmtDate)).toBe("");
  });
});

describe("enum labels", () => {
  // "Fy2027" on a sheet Jireh forwards to LG reads as a typo.
  it("leaves fiscal years alone", () => {
    expect(enumLabel("FY2027")).toBe("FY2027");
    expect(cellValue(col("lgFiscalYear", "MULTI_SELECT"), { lgFiscalYear: ["FY2027", "FY2028"] }, fmtDate))
      .toBe("FY2027, FY2028");
  });

  it("title-cases a status but keeps acronyms", () => {
    expect(enumLabel("RFP_RECEIVED")).toBe("RFP Received");
    expect(enumLabel("TIER_1")).toBe("Tier 1");
    expect(enumLabel("LG")).toBe("LG");
  });
});

describe("column layout", () => {
  it("marks money columns so the sheet right-aligns and formats them", () => {
    expect(toMirrorColumn(col("poValue", "CURRENCY")).money).toBe(true);
    expect(toMirrorColumn(col("projectType", "SELECT")).money).toBe(false);
  });

  it("wraps long free text and leaves the name column on one line", () => {
    expect(toMirrorColumn(col("lgNotes", "TEXT")).wrap).toBe(true);
    expect(toMirrorColumn(col("name", "TEXT")).wrap).toBe(false);
  });
});

describe("rollup layout (Jireh, 2026-08-17)", () => {
  // The LG Alliance Detail list, in the order he keeps it.
  const view = [
    col("name", "TEXT", "Opportunity Name"),
    col("company", "RELATION", "Company"),
    col("lgTier", "SELECT", "LG Tier"),
    col("technologyVendorPartner", "SELECT", "Technology Vendor Partner"),
    col("bidStatus", "SELECT", "Opportunity Status"),
    col("poValue", "CURRENCY", "Technology Vendor PO Value"),
    col("sponsorshipValue", "CURRENCY", "Sponsorship Value"),
    col("sponsorship2031", "CURRENCY", "Sponsorship FY2031"),
    col("totalProjectRevenue", "CURRENCY", "Revenue — Total Project"),
    col("lgNotes", "TEXT", "LG Notes"),
  ].map(toMirrorColumn);

  const keys = (drop = new Set<string>()) =>
    rollupLayout(view, "8%", drop).map((c) => c.key);

  it("keeps the CRM's columns, labels and order", () => {
    const layout = rollupLayout(view, "8%");
    expect(layout.map((c) => c.spec.header)).toEqual([
      "Opportunity Name",
      "Company",
      "LG Tier",
      "Opportunity Status",
      "Technology Vendor PO Value",
      "PO Source",
      "Sponsorship Value",
      "Alliance 8%",
      "LG Margin",
      "Sponsorship FY2031",
      "Revenue — Total Project",
      "LG Notes",
    ]);
  });

  // Every row of an LG report names LG as the vendor.
  it("drops the vendor column the whole sheet is scoped to", () => {
    expect(keys()).not.toContain("technologyVendorPartner");
  });

  it("drops the columns the caller found empty", () => {
    expect(keys(new Set(["sponsorship2031"]))).not.toContain("sponsorship2031");
  });

  // Tracking the PO is the point of the sheet — a view edit cannot cost it.
  it("puts the PO back when the view stops showing it", () => {
    const withoutPo = view.filter((c) => c.fieldName !== "poValue");
    const layout = rollupLayout(withoutPo, "8%");
    expect(layout[0].key).toBe("poValue");
    expect(layout[0].spec.header).toBe("Technology Vendor PO Value");
    expect(layout[1].key).toBe("poSource");
    // Sponsorship is still there, so the calculated pair stays beside it.
    expect(layout.map((c) => c.key).filter((k) => k === "allianceFee")).toHaveLength(1);
  });

  it("keeps the calculated pair with the PO when there is no sponsorship column", () => {
    const noSponsorship = view.filter((c) => c.fieldName !== "sponsorshipValue");
    expect(rollupLayout(noSponsorship, "8%").map((c) => c.key)).toEqual([
      "name", "company", "lgTier", "bidStatus",
      "poValue", "poSource", "allianceFee", "lgMargin",
      "sponsorship2031", "totalProjectRevenue", "lgNotes",
    ]);
  });

  it("still produces one PO block when neither money column is on the view", () => {
    const bare = view.filter(
      (c) => c.fieldName !== "poValue" && c.fieldName !== "sponsorshipValue",
    );
    expect(rollupLayout(bare, "8%").map((c) => c.key).slice(0, 4)).toEqual([
      "poValue", "poSource", "allianceFee", "lgMargin",
    ]);
  });

  it("carries the rate into the alliance column header", () => {
    const layout = rollupLayout(view, "5%");
    expect(layout.find((c) => c.key === "allianceFee")!.spec.header).toBe("Alliance 5%");
  });

  it("keeps the money columns formatted as money", () => {
    const layout = rollupLayout(view, "8%");
    for (const key of ["poValue", "allianceFee", "lgMargin", "sponsorshipValue"]) {
      expect(layout.find((c) => c.key === key)!.spec.money).toBe(true);
    }
    expect(layout.find((c) => c.key === "poSource")!.spec.money).toBeFalsy();
  });
});

describe("fiscal year multi-select", () => {
  // The CRM stores the years in click order, which reads as a typo on a sheet.
  it("sorts a run of fiscal years chronologically", () => {
    expect(cellValue(col("lgFiscalYear", "MULTI_SELECT"), { lgFiscalYear: ["FY2030", "FY2027", "FY2028"] }, fmtDate))
      .toBe("FY2027, FY2028, FY2030");
  });

  it("leaves other multi-selects in the order the CRM keeps them", () => {
    expect(cellValue(col("lgBusinessUnits", "MULTI_SELECT"), { lgBusinessUnits: ["LED", "AIR_SOLUTIONS"] }, fmtDate))
      .toBe("LED, Air Solutions");
  });
});
