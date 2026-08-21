import { describe, expect, it } from "vitest";
import {
  aggregateFormula,
  aggregateLabel,
  aggregateNumFmt,
  composedTotalFormula,
  computeAggregate,
  effectiveAggregate,
  isMoneyResult,
} from "./viewAggregates";

const MONEY = '#,##0;[Red](#,##0)';

describe("effectiveAggregate", () => {
  it("reads the column when the viewField is a custom one", () => {
    expect(effectiveAggregate({ fieldMetadataId: "f", aggregateOperation: "SUM" })).toBe("SUM");
  });

  // The trap that made a whole workspace pass look un-applied: seeded viewFields
  // carry the operation in `overrides` and leave the column null.
  it("prefers overrides, which is where seeded viewFields keep it", () => {
    expect(
      effectiveAggregate({
        fieldMetadataId: "f",
        aggregateOperation: null,
        overrides: { aggregateOperation: "COUNT" },
      }),
    ).toBe("COUNT");
  });

  it("returns null for a column with no total configured", () => {
    expect(effectiveAggregate({ fieldMetadataId: "f" })).toBeNull();
    expect(effectiveAggregate(null)).toBeNull();
  });

  it("refuses an operation the enum does not define", () => {
    expect(effectiveAggregate({ fieldMetadataId: "f", aggregateOperation: "MEDIAN" })).toBeNull();
  });
});

describe("aggregateLabel", () => {
  it("copies the CRM footer wording", () => {
    expect(aggregateLabel("SUM", "Revenue — Total Project")).toBe("Sum of Revenue — Total Project");
    expect(aggregateLabel("MAX", "Employees")).toBe("Max of Employees");
    expect(aggregateLabel("COUNT_NOT_EMPTY", "Address")).toBe("Not empty of Address");
  });

  it("labels COUNT the way the CRM does — records, not values", () => {
    expect(aggregateLabel("COUNT", "Opportunity Name")).toBe("Count all");
  });
});

describe("computeAggregate", () => {
  it("sums money columns, and a sum of nothing is zero", () => {
    expect(computeAggregate("SUM", [10, 20, 30])).toBe(60);
    expect(computeAggregate("SUM", [])).toBe(0);
  });

  it("averages only the rows that carry a number", () => {
    expect(computeAggregate("AVG", [10, null, 20])).toBe(15);
  });

  // A blank average is not zero. Writing 0 would be a figure the reader cannot
  // tell apart from a real one.
  it("returns null rather than zero when there is nothing to average", () => {
    expect(computeAggregate("AVG", [null, ""])).toBeNull();
    expect(computeAggregate("MIN", [])).toBeNull();
    expect(computeAggregate("MAX", [""])).toBeNull();
  });

  it("counts records for COUNT, including the blank ones", () => {
    expect(computeAggregate("COUNT", ["a", "", null])).toBe(3);
  });

  it("counts empties, non-empties and uniques", () => {
    expect(computeAggregate("COUNT_EMPTY", ["a", "", null, "  "])).toBe(3);
    expect(computeAggregate("COUNT_NOT_EMPTY", ["a", "", null, "b"])).toBe(2);
    expect(computeAggregate("COUNT_UNIQUE_VALUES", ["a", "a", "b", ""])).toBe(2);
  });

  it("counts booleans as the words the sheet writes", () => {
    expect(computeAggregate("COUNT_TRUE", ["Yes", "No", "Yes"])).toBe(2);
    expect(computeAggregate("COUNT_FALSE", ["Yes", "No", false])).toBe(2);
  });

  it("returns percentages as fractions so Excel's 0% format renders them", () => {
    expect(computeAggregate("PERCENTAGE_EMPTY", ["a", "", "", ""])).toBe(0.75);
    expect(computeAggregate("PERCENTAGE_NOT_EMPTY", ["a", "", "", ""])).toBe(0.25);
    expect(computeAggregate("PERCENTAGE_EMPTY", [])).toBeNull();
  });

  it("ignores values that are not numbers when summing", () => {
    expect(computeAggregate("SUM", [10, "n/a", 5])).toBe(15);
  });
});

describe("aggregateFormula", () => {
  it("writes a live range so the total moves when the sheet is filtered", () => {
    expect(aggregateFormula("SUM", "H", 9, 20)).toBe("SUM(H9:H20)");
  });

  // SUM(H9:H8) runs backwards in Excel and swallows the total row itself.
  it("refuses to build a range for a group with no rows", () => {
    expect(aggregateFormula("SUM", "H", 9, 8)).toBeNull();
  });

  it("guards the operations that raise on an empty range", () => {
    expect(aggregateFormula("AVG", "H", 2, 5)).toBe('IFERROR(AVERAGE(H2:H5),"")');
    expect(aggregateFormula("MIN", "H", 2, 5)).toBe('IFERROR(MIN(H2:H5),"")');
  });

  // COUNTA would under-report a block whose column holds a blank; "Count all"
  // is a record count.
  it("counts rows for COUNT rather than counting filled cells", () => {
    expect(aggregateFormula("COUNT", "B", 4, 9)).toBe("ROWS(B4:B9)");
  });

  it("matches booleans on the rendered word", () => {
    expect(aggregateFormula("COUNT_TRUE", "D", 2, 4)).toBe('COUNTIF(D2:D4,"Yes")');
    expect(aggregateFormula("COUNT_FALSE", "D", 2, 4)).toBe('COUNTIF(D2:D4,"No")');
  });

  it("divides by the row count for percentages", () => {
    expect(aggregateFormula("PERCENTAGE_EMPTY", "D", 2, 5)).toBe("COUNTBLANK(D2:D5)/4");
  });

  it("builds the unique count over the same range twice", () => {
    expect(aggregateFormula("COUNT_UNIQUE_VALUES", "C", 2, 4)).toBe(
      'SUMPRODUCT((C2:C4<>"")/COUNTIF(C2:C4,C2:C4&""))',
    );
  });
});

/**
 * The LG rollup bands its sections, so its data rows are not one run — a
 * range over them would add each section footer in twice.
 */
describe("the sheet total over banded sections", () => {
  it("adds the section totals rather than the rows", () => {
    expect(composedTotalFormula("SUM", "H", [9, 15, 21])).toBe("H9+H15+H21");
  });

  it("adds counts the same way — a sum of counts is the count", () => {
    expect(composedTotalFormula("COUNT", "B", [9, 15])).toBe("B9+B15");
    expect(composedTotalFormula("COUNT_NOT_EMPTY", "B", [9, 15])).toBe("B9+B15");
  });

  it("takes the extreme of the section extremes", () => {
    expect(composedTotalFormula("MIN", "D", [9, 15])).toBe("MIN(D9,D15)");
    expect(composedTotalFormula("MAX", "D", [9, 15])).toBe("MAX(D9,D15)");
  });

  // An average of averages weights small sections like large ones, and a
  // count of uniques counts a value appearing in two sections twice. Both
  // return null so the caller writes the figure computed over every row.
  it("refuses the operations that do not compose", () => {
    expect(composedTotalFormula("AVG", "D", [9, 15])).toBeNull();
    expect(composedTotalFormula("COUNT_UNIQUE_VALUES", "D", [9, 15])).toBeNull();
    expect(composedTotalFormula("PERCENTAGE_EMPTY", "D", [9, 15])).toBeNull();
  });

  it("has nothing to add when the sheet has no sections", () => {
    expect(composedTotalFormula("SUM", "H", [])).toBeNull();
  });
});

describe("formatting", () => {
  it("keeps money formatting only where the result is still money", () => {
    expect(isMoneyResult("SUM", true)).toBe(true);
    expect(isMoneyResult("AVG", true)).toBe(true);
    // Counting how many revenue cells are filled is a count, not dollars.
    expect(isMoneyResult("COUNT_NOT_EMPTY", true)).toBe(false);
    expect(isMoneyResult("SUM", false)).toBe(false);
  });

  it("picks the number format from the operation", () => {
    expect(aggregateNumFmt("SUM", true, MONEY)).toBe(MONEY);
    expect(aggregateNumFmt("COUNT", false, MONEY)).toBe("#,##0");
    expect(aggregateNumFmt("PERCENTAGE_EMPTY", true, MONEY)).toBe("0%");
  });
});
