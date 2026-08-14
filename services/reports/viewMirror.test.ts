import { describe, expect, it } from "vitest";
import {
  buildSelection,
  cellValue,
  enumLabel,
  isRenderable,
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
