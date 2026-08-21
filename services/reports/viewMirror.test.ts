import { describe, expect, it } from "vitest";
import {
  buildSelection,
  cellValue,
  enumLabel,
  isRenderable,
  isSponsorshipYearField,
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

describe("rollup layout (Jireh, 2026-08-17, revised 2026-08-18)", () => {
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
    col("lgNotes", "TEXT", "Internal Notes"),
  ].map(toMirrorColumn);

  const keys = (drop = new Set<string>()) =>
    rollupLayout(view, "8%", drop).map((c) => c.key);

  it("keeps the CRM's columns, labels and order", () => {
    const layout = rollupLayout(view, "8%");
    expect(layout.map((c) => c.spec.header)).toEqual([
      "Opportunity Name",
      "Company",
      "LG Tier",
      "Technology Vendor Partner",
      "Opportunity Status",
      "Technology Vendor PO Value",
      "PO Source",
      "Alliance 8%",
      "Sponsorship Value",
      "Sponsorship FY2031",
      "Revenue — Total Project",
      "Internal Notes",
    ]);
  });

  // Jireh, 2026-08-18: "the alliance 8% column can be after the tech vendor PO
  // column" — the fee is a percentage of the PO, so it reads beside it.
  it("puts the alliance fee straight after the PO block", () => {
    const keys = rollupLayout(view, "8%").map((c) => c.key);
    const po = keys.indexOf("poValue");
    expect(keys.slice(po, po + 3)).toEqual(["poValue", "poSource", "allianceFee"]);
    expect(keys.indexOf("allianceFee")).toBeLessThan(keys.indexOf("sponsorshipValue"));
  });

  // Removed at his request the same day; the report still calculates it for
  // the JSON payload, it is simply not a column any more.
  it("carries no LG Margin column", () => {
    expect(rollupLayout(view, "8%").map((c) => c.spec.header)).not.toContain("LG Margin");
    expect(rollupLayout(view, "8%").map((c) => c.key)).not.toContain("lgMargin");
  });

  // It used to drop this one, reasoning that every row of an LG report names
  // LG anyway. Jireh read the sheet against the report and saw a column
  // missing (2026-08-21): what the report shows, the sheet shows.
  it("keeps every column the report shows, the vendor included", () => {
    expect(keys()).toContain("technologyVendorPartner");
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
    expect(layout[2].key).toBe("allianceFee");
    expect(layout.map((c) => c.key).filter((k) => k === "allianceFee")).toHaveLength(1);
  });

  it("keeps the fee with the PO when there is no sponsorship column", () => {
    const noSponsorship = view.filter((c) => c.fieldName !== "sponsorshipValue");
    expect(rollupLayout(noSponsorship, "8%").map((c) => c.key)).toEqual([
      "name", "company", "lgTier", "technologyVendorPartner", "bidStatus",
      "poValue", "poSource", "allianceFee",
      "sponsorship2031", "totalProjectRevenue", "lgNotes",
    ]);
  });

  it("still produces one PO block when neither money column is on the view", () => {
    const bare = view.filter(
      (c) => c.fieldName !== "poValue" && c.fieldName !== "sponsorshipValue",
    );
    expect(rollupLayout(bare, "8%").map((c) => c.key).slice(0, 3)).toEqual([
      "poValue", "poSource", "allianceFee",
    ]);
  });

  it("carries the rate into the alliance column header", () => {
    const layout = rollupLayout(view, "5%");
    expect(layout.find((c) => c.key === "allianceFee")!.spec.header).toBe("Alliance 5%");
  });

  it("keeps the money columns formatted as money", () => {
    const layout = rollupLayout(view, "8%");
    for (const key of ["poValue", "allianceFee", "sponsorshipValue"]) {
      expect(layout.find((c) => c.key === key)!.spec.money).toBe(true);
    }
    expect(layout.find((c) => c.key === "poSource")!.spec.money).toBeFalsy();
  });
});

describe("sponsorship year fields", () => {
  // The Sponsorship Value column sums these, so the sheet has to know which
  // mirrored columns are the per-year ones.
  it("recognises a per-year sponsorship field and nothing else", () => {
    expect(isSponsorshipYearField("sponsorship2027")).toBe(true);
    expect(isSponsorshipYearField("sponsorship2032")).toBe(true);
    expect(isSponsorshipYearField("sponsorshipValue")).toBe(false);
    expect(isSponsorshipYearField("revenue2027")).toBe(false);
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

describe("relations resolved by their target object", () => {
  const rel = (fieldName: string, relationTarget?: string): ViewColumn => ({
    fieldName, label: fieldName, type: "RELATION", relationTarget,
  });

  it("still follows the field-name map when no target is given (LG report path)", () => {
    expect(isRenderable(rel("company"))).toBe(true);
    expect(selectionFor(rel("company"))).toBe("company { name }");
  });

  it("follows a target the field name alone would not cover", () => {
    expect(isRenderable(rel("venue", "venue"))).toBe(true);
    expect(selectionFor(rel("assignedEstimator", "workspaceMember")))
      .toBe("assignedEstimator { name { firstName lastName } }");
    expect(selectionFor(rel("pointOfContact", "person")))
      .toBe("pointOfContact { name { firstName lastName } }");
  });

  it("drops a relation pointing somewhere the sheet cannot render", () => {
    expect(isRenderable(rel("someLink", "workflowRun"))).toBe(false);
    expect(selectionFor(rel("someLink", "workflowRun"))).toBeNull();
  });

  // Reading a FULL_NAME identifier as a string emptied the Owner column.
  it("joins a composite name instead of returning blank", () => {
    expect(cellValue(rel("owner", "workspaceMember"),
      { owner: { name: { firstName: "Jireh", lastName: "Billings" } } }, fmtDate))
      .toBe("Jireh Billings");
    expect(cellValue(rel("company"), { company: { name: "Baltimore Ravens" } }, fmtDate))
      .toBe("Baltimore Ravens");
    expect(cellValue(rel("owner", "workspaceMember"), { owner: null }, fmtDate)).toBe("");
  });

  it("tolerates a half-filled composite name", () => {
    expect(cellValue(rel("owner", "workspaceMember"),
      { owner: { name: { firstName: "Krissy", lastName: null } } }, fmtDate))
      .toBe("Krissy");
  });
});
