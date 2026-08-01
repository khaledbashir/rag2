import { describe, expect, it } from "vitest";
import {
  compileWidgetFilter,
  fallbackWonFilter,
  type FieldMeta,
  type WidgetFilter,
} from "@/services/crmReports/dashboardParity";

const FIELDS = new Map<string, FieldMeta>([
  ["f-status", { id: "f-status", name: "bidStatus", type: "SELECT" }],
  ["f-revenue", { id: "f-revenue", name: "revenue2026", type: "CURRENCY" }],
  ["f-margin", { id: "f-margin", name: "margin2026", type: "CURRENCY" }],
]);

// Verbatim shape of the live "Closed Won Revenue 2026 by Business Unit" widget
// on dashboard e6459a59-3e4e-4810-a34a-5ef15142e69d: status IS WON, AND
// (revenue or margin non-zero in either direction).
const LIVE_WIDGET_FILTER: WidgetFilter = {
  recordFilters: [
    { id: "1", type: "SELECT", operand: "IS", value: '["WON"]', fieldMetadataId: "f-status", recordFilterGroupId: "root" },
    { id: "2", type: "CURRENCY", operand: "GREATER_THAN_OR_EQUAL", value: "0.01", fieldMetadataId: "f-revenue", recordFilterGroupId: "amounts" },
    { id: "3", type: "CURRENCY", operand: "LESS_THAN_OR_EQUAL", value: "-0.01", fieldMetadataId: "f-revenue", recordFilterGroupId: "amounts" },
    { id: "4", type: "CURRENCY", operand: "GREATER_THAN_OR_EQUAL", value: "0.01", fieldMetadataId: "f-margin", recordFilterGroupId: "amounts" },
    { id: "5", type: "CURRENCY", operand: "LESS_THAN_OR_EQUAL", value: "-0.01", fieldMetadataId: "f-margin", recordFilterGroupId: "amounts" },
  ],
  recordFilterGroups: [
    { id: "root", logicalOperator: "AND" },
    { id: "amounts", logicalOperator: "OR", parentRecordFilterGroupId: "root" },
  ],
};

describe("the report inherits the dashboard's definition of Closed Won", () => {
  it("compiles the live widget filter to the dashboard's own SQL", () => {
    const { sql, params } = compileWidgetFilter(LIVE_WIDGET_FILTER, FIELDS);

    expect(sql).toContain(`o."bidStatus" in ($1)`);
    expect(params[0]).toBe("WON");

    // Currency thresholds are stated in dollars and stored in micros.
    expect(params.slice(1)).toEqual([10_000, -10_000, 10_000, -10_000]);
    expect(sql).toContain(`o."revenue2026AmountMicros" >= $2`);
    expect(sql).toContain(`o."margin2026AmountMicros" <= $5`);

    // Nesting survives: status AND (amount OR amount OR …).
    expect(sql).toMatch(/\(o\."bidStatus" in \(\$1\) AND \(.*OR.*\)\)/s);
  });

  it("never reintroduces a status blocklist", () => {
    const { sql } = compileWidgetFilter(LIVE_WIDGET_FILTER, FIELDS);
    for (const leaked of ["ON_HOLD", "NO_OPPORTUNITY_STATUS", "LOST", "NO_BID", "SCOPING"]) {
      expect(sql).not.toContain(leaked);
    }
  });

  it("follows the dashboard if its filter is edited, without a code change", () => {
    const edited: WidgetFilter = {
      ...LIVE_WIDGET_FILTER,
      recordFilters: LIVE_WIDGET_FILTER.recordFilters.map((entry) =>
        entry.id === "1" ? { ...entry, value: '["WON","VERBAL_AGREEMENT"]' } : entry,
      ),
    };
    const { sql, params } = compileWidgetFilter(edited, FIELDS);
    expect(sql).toContain(`o."bidStatus" in ($1,$2)`);
    expect(params.slice(0, 2)).toEqual(["WON", "VERBAL_AGREEMENT"]);
  });

  it("keeps null-status rows on an IS_NOT filter instead of silently dropping them", () => {
    const isNot: WidgetFilter = {
      recordFilters: [
        { id: "1", type: "SELECT", operand: "IS_NOT", value: '["LOST"]', fieldMetadataId: "f-status", recordFilterGroupId: "root" },
      ],
      recordFilterGroups: [{ id: "root", logicalOperator: "AND" }],
    };
    const { sql } = compileWidgetFilter(isNot, FIELDS);
    expect(sql).toContain(`o."bidStatus" is null or not o."bidStatus" in ($1)`);
  });

  it("refuses a filter it cannot translate rather than guessing", () => {
    const unsupported: WidgetFilter = {
      recordFilters: [
        { id: "1", type: "TEXT", operand: "CONTAINS", value: '"x"', fieldMetadataId: "f-status", recordFilterGroupId: "root" },
      ],
      recordFilterGroups: [{ id: "root", logicalOperator: "AND" }],
    };
    expect(() => compileWidgetFilter(unsupported, FIELDS)).toThrow(/Unsupported filter operand/);
  });

  it("refuses an unknown field rather than dropping the condition", () => {
    const unknownField: WidgetFilter = {
      recordFilters: [
        { id: "1", type: "SELECT", operand: "IS", value: '["WON"]', fieldMetadataId: "nope", recordFilterGroupId: "root" },
      ],
      recordFilterGroups: [{ id: "root", logicalOperator: "AND" }],
    };
    expect(() => compileWidgetFilter(unknownField, FIELDS)).toThrow(/Unknown field/);
  });
});

describe("fallback when the dashboard cannot be read", () => {
  it("is an allowlist, never a blocklist", () => {
    const fallback = fallbackWonFilter();
    expect(fallback.source).toBe("fallback");
    expect(fallback.params).toEqual(["WON"]);
    expect(fallback.sql).toContain(`o."bidStatus" = $1`);
    expect(fallback.sql).not.toContain("not in");
    for (const leaked of ["ON_HOLD", "NO_OPPORTUNITY_STATUS", "LOST", "NO_BID"]) {
      expect(fallback.sql).not.toContain(leaked);
    }
  });
});
