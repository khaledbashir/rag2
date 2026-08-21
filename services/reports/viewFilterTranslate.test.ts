import { describe, expect, it } from "vitest";
import { buildViewFilter, vfClause, type Field } from "./viewFilterTranslate";

const f = (name: string, type: string): Field => ({ name, type });

describe("vfClause — the type decides the shape", () => {
  it("matches a select against the list it stores", () => {
    expect(vfClause(f("bidStatus", "SELECT"), "IS", '["WON","LOST"]'))
      .toEqual({ bidStatus: { in: ["WON", "LOST"] } });
    expect(vfClause(f("bidStatus", "SELECT"), "IS_NOT", '["LOST"]'))
      .toEqual({ not: { bidStatus: { in: ["LOST"] } } });
  });

  // The live 500: `ilike` on a MULTI_SELECT took the whole export down, so any
  // view filtering on Service Type could not be exported at all.
  it("uses containsAny for a multi-select, never ilike or in", () => {
    expect(vfClause(f("serviceType", "MULTI_SELECT"), "CONTAINS", '["LIVESYNC_LICENSE"]'))
      .toEqual({ serviceType: { containsAny: ["LIVESYNC_LICENSE"] } });
    expect(vfClause(f("serviceType", "MULTI_SELECT"), "IS", '["GRAPHICS"]'))
      .toEqual({ serviceType: { containsAny: ["GRAPHICS"] } });
    expect(vfClause(f("serviceType", "MULTI_SELECT"), "IS_NOT", '["GRAPHICS"]'))
      .toEqual({ not: { serviceType: { containsAny: ["GRAPHICS"] } } });
    expect(vfClause(f("serviceType", "MULTI_SELECT"), "DOES_NOT_CONTAIN", '["GRAPHICS"]'))
      .toEqual({ not: { serviceType: { containsAny: ["GRAPHICS"] } } });
  });

  it("empties a multi-select with isEmptyArray, not a null check", () => {
    expect(vfClause(f("serviceType", "MULTI_SELECT"), "IS_EMPTY", "[]"))
      .toEqual({ serviceType: { isEmptyArray: true } });
    expect(vfClause(f("serviceType", "MULTI_SELECT"), "IS_NOT_EMPTY", "[]"))
      .toEqual({ not: { serviceType: { isEmptyArray: true } } });
  });

  it("still does a substring match on text", () => {
    expect(vfClause(f("name", "TEXT"), "CONTAINS", '"Ravens"'))
      .toEqual({ name: { ilike: "%Ravens%" } });
  });

  // CURRENCY is composite; comparing the whole object fails.
  it("compares currency on amountMicros, converting dollars", () => {
    expect(vfClause(f("revenue2026", "CURRENCY"), "GREATER_THAN_OR_EQUAL", "[1]"))
      .toEqual({ revenue2026: { amountMicros: { gte: 1_000_000 } } });
    expect(vfClause(f("revenue2026", "CURRENCY"), "LESS_THAN_OR_EQUAL", "[-1]"))
      .toEqual({ revenue2026: { amountMicros: { lte: -1_000_000 } } });
  });

  // Values arrive JSON-array-wrapped; passing the array-string through 500s.
  it("unwraps an array-wrapped date before comparing", () => {
    expect(vfClause(f("closeDate", "DATE_TIME"), "IS_AFTER", '["2026-08-02T18:13:38Z"]'))
      .toEqual({ closeDate: { gt: "2026-08-02T18:13:38Z" } });
  });

  it("coerces booleans", () => {
    expect(vfClause(f("pricingComplete", "BOOLEAN"), "IS", "true"))
      .toEqual({ pricingComplete: { eq: true } });
  });

  it("declines the field types it cannot translate", () => {
    expect(vfClause(f("company", "RELATION"), "IS", '["x"]')).toBeNull();
    expect(vfClause(f("createdBy", "ACTOR"), "IS", '["x"]')).toBeNull();
    expect(vfClause(f("name", "TEXT"), "SOME_NEW_OPERAND", '"x"')).toBeNull();
  });

  it("handles a relative date window", () => {
    const clause = vfClause(f("pricingCompleteDate", "DATE_TIME"), "IS_RELATIVE",
      '{"direction":"PAST","amount":10,"unit":"DAY"}');
    expect(Object.keys(clause!)).toEqual(["pricingCompleteDate"]);
    expect(clause!.pricingCompleteDate.gte).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("buildViewFilter", () => {
  const fm: Record<string, Field> = {
    a: f("bidStatus", "SELECT"),
    b: f("businessUnit", "SELECT"),
    c: f("revenue2026", "CURRENCY"),
  };

  it("ANDs ungrouped filters", () => {
    const out = buildViewFilter(
      [
        { fieldMetadataId: "a", operand: "IS_NOT", value: '["LOST"]' },
        { fieldMetadataId: "b", operand: "IS", value: '["TECHNOLOGY"]' },
      ],
      [],
      fm,
    );
    expect(out).toEqual({
      and: [{ not: { bidStatus: { in: ["LOST"] } } }, { businessUnit: { in: ["TECHNOLOGY"] } }],
    });
  });

  it("rebuilds a nested OR group inside the root AND", () => {
    const out = buildViewFilter(
      [
        { fieldMetadataId: "a", operand: "IS_NOT", value: '["LOST"]', viewFilterGroupId: "root" },
        { fieldMetadataId: "c", operand: "GREATER_THAN_OR_EQUAL", value: "[1]", viewFilterGroupId: "or" },
        { fieldMetadataId: "c", operand: "LESS_THAN_OR_EQUAL", value: "[-1]", viewFilterGroupId: "or" },
      ],
      [
        { id: "root", logicalOperator: "AND" },
        { id: "or", logicalOperator: "OR", parentViewFilterGroupId: "root" },
      ],
      fm,
    );
    expect(out).toEqual({
      and: [
        { not: { bidStatus: { in: ["LOST"] } } },
        { or: [
          { revenue2026: { amountMicros: { gte: 1_000_000 } } },
          { revenue2026: { amountMicros: { lte: -1_000_000 } } },
        ] },
      ],
    });
  });

  it("returns undefined when a view saves no filters — the export is the whole object", () => {
    expect(buildViewFilter([], [], fm)).toBeUndefined();
  });

  // A filter on a field the translation declines must not silently widen the
  // export; it drops that clause but keeps the rest.
  it("keeps the filters it understands when one cannot be translated", () => {
    const out = buildViewFilter(
      [
        { fieldMetadataId: "gone", operand: "IS", value: '["X"]' },
        { fieldMetadataId: "a", operand: "IS", value: '["WON"]' },
      ],
      [],
      fm,
    );
    expect(out).toEqual({ and: [{ bidStatus: { in: ["WON"] } }] });
  });
});
