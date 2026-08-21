import { describe, expect, it } from "vitest";
import {
  groupByViewField,
  layoutFromView,
  orderGroups,
  sortByViewSorts,
  sortValue,
  type FieldMeta,
  type ViewFieldRow,
} from "./viewExportLayout";

const fmtDate = (v: string | null) => (v ? String(v).slice(0, 10) : "");

const FIELDS: Record<string, FieldMeta> = {
  name: { name: "name", type: "TEXT", label: "Opportunity Name" },
  rev: { name: "totalProjectRevenue", type: "CURRENCY", label: "Revenue — Total Project" },
  status: { name: "bidStatus", type: "SELECT", label: "Opportunity Status" },
  owner: { name: "owner", type: "RELATION", label: "Owner", relationTarget: "workspaceMember" },
  company: { name: "company", type: "RELATION", label: "Account", relationTarget: "company" },
  award: { name: "closeDate", type: "DATE_TIME", label: "Award Date" },
  runs: { name: "workflowRuns", type: "RELATION", label: "Runs", relationTarget: "workflowRun" },
};

const vf = (id: string, position: number, extra: Partial<ViewFieldRow> = {}): ViewFieldRow => ({
  fieldMetadataId: id, isVisible: true, position, ...extra,
});

describe("layoutFromView", () => {
  it("takes the view's visible columns, in the view's order", () => {
    const { columns } = layoutFromView(
      [vf("rev", 3), vf("name", -1), vf("status", 1)],
      FIELDS,
    );
    expect(columns.map((c) => c.label)).toEqual([
      "Opportunity Name", "Opportunity Status", "Revenue — Total Project",
    ]);
  });

  it("leaves hidden columns off the sheet", () => {
    const { columns } = layoutFromView([vf("name", 0), vf("rev", 1, { isVisible: false })], FIELDS);
    expect(columns.map((c) => c.fieldName)).toEqual(["name"]);
  });

  // Seeded viewFields keep visibility and position in the jsonb, not the column.
  it("reads visibility and position out of overrides when they are there", () => {
    const { columns } = layoutFromView(
      [
        vf("rev", 0, { overrides: { position: 9 } }),
        vf("name", 5, { isVisible: false, overrides: { isVisible: true } }),
      ],
      FIELDS,
    );
    expect(columns.map((c) => c.fieldName)).toEqual(["name", "totalProjectRevenue"]);
  });

  it("carries each column's total across, overrides included", () => {
    const { columns } = layoutFromView(
      [
        vf("name", 0, { aggregateOperation: "COUNT" }),
        vf("rev", 1, { aggregateOperation: null, overrides: { aggregateOperation: "SUM" } }),
        vf("status", 2),
      ],
      FIELDS,
    );
    expect(columns.map((c) => c.aggregate)).toEqual(["COUNT", "SUM", null]);
  });

  it("marks money columns so the sheet formats them", () => {
    const { columns } = layoutFromView([vf("rev", 0), vf("name", 1)], FIELDS);
    expect(columns[0].money).toBe(true);
    expect(columns[1].money).toBe(false);
  });

  it("names the columns it cannot render rather than dropping them silently", () => {
    const { columns, skipped } = layoutFromView([vf("name", 0), vf("runs", 1)], FIELDS);
    expect(columns).toHaveLength(1);
    expect(skipped).toEqual(["Runs"]);
  });

  it("ignores a viewField whose field no longer exists", () => {
    const { columns, skipped } = layoutFromView([vf("name", 0), vf("ghost", 1)], FIELDS);
    expect(columns).toHaveLength(1);
    expect(skipped).toEqual([]);
  });
});

describe("sortValue", () => {
  it("compares money on the raw micros, not the rendered string", () => {
    expect(sortValue(FIELDS.rev, { totalProjectRevenue: { amountMicros: "9000000" } })).toBe(9_000_000);
  });

  it("compares a person relation on the joined name", () => {
    expect(sortValue(FIELDS.owner, { owner: { name: { firstName: "Jireh", lastName: "Billings" } } }))
      .toBe("jireh billings");
  });

  it("returns null for an absent value so it can sort last", () => {
    expect(sortValue(FIELDS.rev, { totalProjectRevenue: null })).toBeNull();
    expect(sortValue(FIELDS.name, {})).toBeNull();
  });
});

describe("sortByViewSorts", () => {
  const rows = [
    { name: "Uber — Tsongas Center" },
    { name: "Arizona Athletic Ground" },
    { name: "Gilmer High School" },
  ];

  it("sorts alphabetically, which is what every report now defaults to", () => {
    const out = sortByViewSorts(rows, [{ fieldMetadataId: "name", direction: "ASC" }], FIELDS);
    expect(out.map((r) => r.name)).toEqual([
      "Arizona Athletic Ground", "Gilmer High School", "Uber — Tsongas Center",
    ]);
  });

  it("honours DESC", () => {
    const out = sortByViewSorts(rows, [{ fieldMetadataId: "name", direction: "DESC" }], FIELDS);
    expect(out[0].name).toBe("Uber — Tsongas Center");
  });

  // Sorting blanks to the top makes an alphabetical report open on nothing.
  it("puts empty values last in both directions", () => {
    const withBlank = [
      { name: "B", totalProjectRevenue: null },
      { name: "A", totalProjectRevenue: { amountMicros: "5000000" } },
    ];
    for (const direction of ["ASC", "DESC"]) {
      const out = sortByViewSorts(withBlank, [{ fieldMetadataId: "rev", direction }], FIELDS);
      expect(out[1].name).toBe("B");
    }
  });

  it("falls through to the next sort when the first ties", () => {
    const out = sortByViewSorts(
      [
        { bidStatus: "WON", name: "Zeta" },
        { bidStatus: "WON", name: "Alpha" },
        { bidStatus: "LOST", name: "Mid" },
      ],
      [{ fieldMetadataId: "status", direction: "ASC" }, { fieldMetadataId: "name", direction: "ASC" }],
      FIELDS,
    );
    expect(out.map((r) => r.name)).toEqual(["Mid", "Alpha", "Zeta"]);
  });

  it("leaves the order alone when the view has no sorts", () => {
    expect(sortByViewSorts(rows, [], FIELDS).map((r) => r.name)).toEqual(rows.map((r) => r.name));
  });

  it("ignores a sort on a field that is gone", () => {
    expect(sortByViewSorts(rows, [{ fieldMetadataId: "ghost" }], FIELDS)).toHaveLength(3);
  });

  it("orders numbers inside names naturally, not as text", () => {
    const out = sortByViewSorts(
      [{ name: "Phase 10" }, { name: "Phase 2" }],
      [{ fieldMetadataId: "name", direction: "ASC" }],
      FIELDS,
    );
    expect(out.map((r) => r.name)).toEqual(["Phase 2", "Phase 10"]);
  });
});

describe("groupByViewField", () => {
  const rows = [
    { bidStatus: "WON", name: "a" },
    { bidStatus: "PROSPECTING", name: "b" },
    { bidStatus: "WON", name: "c" },
    { bidStatus: null, name: "d" },
  ];

  it("splits on the view's own grouping field, using the CRM's labels", () => {
    const groups = groupByViewField(rows, FIELDS.status, fmtDate);
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.records.length]));
    expect(byLabel).toEqual({ Won: 2, Prospecting: 1, "No Value": 1 });
  });

  it("returns one unlabelled group when the view is not grouped", () => {
    const groups = groupByViewField(rows, null, fmtDate);
    expect(groups).toHaveLength(1);
    expect(groups[0].records).toHaveLength(4);
  });

  it("groups on a relation by the related record's name", () => {
    const groups = groupByViewField(
      [{ company: { name: "Baltimore Ravens" } }, { company: { name: "Baltimore Ravens" } }],
      FIELDS.company,
      fmtDate,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Baltimore Ravens");
  });
});

describe("orderGroups", () => {
  const g = (label: string) => ({ key: label, label, records: [] as unknown[] });

  it("keeps the pipeline order a status export has always opened in", () => {
    const out = orderGroups(
      [g("Lost"), g("Won"), g("Scoping")],
      ["Won", "Scoping", "Lost"],
    );
    expect(out.map((x) => x.label)).toEqual(["Won", "Scoping", "Lost"]);
  });

  it("falls back to alphabetical for labels the order does not name", () => {
    const out = orderGroups([g("Zebra"), g("Won"), g("Apple")], ["Won"]);
    expect(out.map((x) => x.label)).toEqual(["Won", "Apple", "Zebra"]);
  });

  it("always sends the no-value section to the bottom", () => {
    const out = orderGroups([g("No Value"), g("Apple")], []);
    expect(out.map((x) => x.label)).toEqual(["Apple", "No Value"]);
  });
});
