import { describe, expect, it } from "vitest";
import {
  groupByViewField,
  layoutFromView,
  orderGroups,
  resolveSectionField,
  sectionOrderFromView,
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

describe("sectionOrderFromView", () => {
  const SELECT_FIELD: FieldMeta = { name: "lgTier", type: "SELECT", label: "LG Tier" };
  const STATUS_ORDER = ["Won", "Scoping", "Lost"];

  // Jireh's LG Alliance Sponsorship Detail, 2026-08-25. The saved view reads
  // Tier 1, 2, 3, Needs Review, Additional Technology, No Sponsorship; the
  // export opened on "Additional Technology..." with Tier 1 fourth, because
  // none of these labels are in the status pipeline list so every section tied
  // at the bottom rank and the tie-break sorted them alphabetically.
  const LG_VIEW_GROUPS = [
    { fieldValue: "TIER_1", position: 0 },
    { fieldValue: "TIER_2", position: 1 },
    { fieldValue: "TIER_3", position: 2 },
    { fieldValue: "NEEDS_REVIEW", position: 3 },
    { fieldValue: "ADDITIONAL_TECHNOLOGY_FROM_SPONSORSHIP", position: 4 },
    { fieldValue: "NO_SPONSORSHIP", position: 5 },
    { fieldValue: "", position: 6 },
  ];

  it("takes the section order the view was arranged in", () => {
    expect(sectionOrderFromView(LG_VIEW_GROUPS, SELECT_FIELD, STATUS_ORDER)).toEqual([
      "Tier 1",
      "Tier 2",
      "Tier 3",
      "Needs Review",
      "Additional Technology From Sponsorship",
      "No Sponsorship",
    ]);
  });

  it("puts Jireh's tiers back at the top of the sheet", () => {
    const g = (label: string) => ({ key: label, label, records: [] as unknown[] });
    const out = orderGroups(
      [
        g("Additional Technology From Sponsorship"),
        g("Needs Review"),
        g("No Sponsorship"),
        g("Tier 1"),
        g("Tier 2"),
        g("Tier 3"),
        g("No Value"),
      ],
      sectionOrderFromView(LG_VIEW_GROUPS, SELECT_FIELD, STATUS_ORDER),
    );
    expect(out.map((x) => x.label)).toEqual([
      "Tier 1",
      "Tier 2",
      "Tier 3",
      "Needs Review",
      "Additional Technology From Sponsorship",
      "No Sponsorship",
      "No Value",
    ]);
  });

  it("reads the saved positions, not the order the rows arrive in", () => {
    const shuffled = [...LG_VIEW_GROUPS].reverse();
    expect(sectionOrderFromView(shuffled, SELECT_FIELD, STATUS_ORDER)[0]).toBe("Tier 1");
  });

  it("keeps the pipeline order for a view that saved no groups", () => {
    expect(sectionOrderFromView([], SELECT_FIELD, STATUS_ORDER)).toEqual(STATUS_ORDER);
    expect(sectionOrderFromView(null, SELECT_FIELD, STATUS_ORDER)).toEqual(STATUS_ORDER);
  });

  it("keeps the pipeline order when the sheet is sectioning on the status fallback", () => {
    expect(sectionOrderFromView(LG_VIEW_GROUPS, null, STATUS_ORDER)).toEqual(STATUS_ORDER);
  });

  // A group whose only entry is the CRM's no-value bucket must not become the
  // whole order — that would rank every real section below nothing.
  it("ignores the no-value group and falls back when it is all there is", () => {
    expect(sectionOrderFromView([{ fieldValue: "", position: 0 }], SELECT_FIELD, STATUS_ORDER))
      .toEqual(STATUS_ORDER);
  });

  it("passes non-select group values through untouched", () => {
    const relation: FieldMeta = { name: "company", type: "RELATION", label: "Company" };
    expect(
      sectionOrderFromView(
        [{ fieldValue: "Baltimore Ravens", position: 0 }, { fieldValue: "Chicago Fire FC", position: 1 }],
        relation,
        STATUS_ORDER,
      ),
    ).toEqual(["Baltimore Ravens", "Chicago Fire FC"]);
  });
});

describe("resolveSectionField", () => {
  it("sections on the view's own grouping when it has one", () => {
    expect(resolveSectionField("company", FIELDS, "bidStatus")?.name).toBe("company");
  });

  // Alexis, 2026-08-24: her Service Forecast view groups on nothing, and the
  // export arrived as one 410-row alphabetical block. Every export of this
  // object carried status sections before the mirrored layout shipped.
  it("sections on status when the view groups on nothing", () => {
    expect(resolveSectionField(null, FIELDS, "bidStatus")?.name).toBe("bidStatus");
  });

  it("sections on status when the view names a field the metadata no longer has", () => {
    expect(resolveSectionField("deleted-field-id", FIELDS, "bidStatus")?.name).toBe("bidStatus");
  });

  it("returns nothing rather than guessing when the fallback field is absent", () => {
    expect(resolveSectionField(null, { name: FIELDS.name }, "bidStatus")).toBeNull();
  });
});
