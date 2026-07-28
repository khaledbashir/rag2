/**
 * Payment Terms must render exactly as typed.
 *
 * Regression: the renderer used to split on commas as well as newlines, which
 * shattered real payment-terms prose into one fragment per clause and broke
 * currency figures apart — "$40,000.00" came out as "$40" / "000.00" on two
 * lines. Natalia, AAC service contract, 2026-07-28.
 */
import { describe, expect, it } from "vitest";

import { splitPaymentTermsLines } from "@/lib/proposals/paymentTerms";

const NATALIA_AAC_TERMS =
  "The annual fee shall be payable in two (2) equal installments of Forty Thousand Dollars ($40,000.00) each, with the first installment due September 1st of each contract year and the second installment due January 1st of each contract year. \n" +
  "ANC shall invoice Purchaser accordingly, and payment shall be due within thirty (30) days of the invoice date. \n" +
  "Any services, materials, travel, parts, repairs, or replacement components not expressly included within the annual maintenance fee, including but not limited to Lighthouse module RMA services and replacement parts, shall be billed separately at ANC's then-current rates or at mutually agreed pricing and shall be invoiced as incurred.";

describe("splitPaymentTermsLines", () => {
  it("keeps Natalia's AAC prose as three lines, commas intact", () => {
    const lines = splitPaymentTermsLines(NATALIA_AAC_TERMS);

    expect(lines).toHaveLength(3);
    // Currency figures survive — the clearest signal of a comma split.
    expect(lines[0]).toContain("$40,000.00");
    expect(lines[1]).toBe(
      "ANC shall invoice Purchaser accordingly, and payment shall be due within thirty (30) days of the invoice date.",
    );
    expect(lines[2]).toContain("Any services, materials, travel, parts, repairs,");
  });

  it("renders one line per newline for the short-form default", () => {
    expect(
      splitPaymentTermsLines("50% on Deposit\n40% on Mobilization\n10% on Substantial Completion"),
    ).toEqual(["50% on Deposit", "40% on Mobilization", "10% on Substantial Completion"]);
  });

  it("never splits a single comma-separated line into multiple lines", () => {
    expect(splitPaymentTermsLines("50% on Deposit, 40% on Mobilization, 10% on Completion")).toEqual([
      "50% on Deposit, 40% on Mobilization, 10% on Completion",
    ]);
  });

  it("drops surrounding blank lines but keeps interior ones for paragraph spacing", () => {
    expect(splitPaymentTermsLines("\n\nFirst para.\n\nSecond para.\n\n")).toEqual([
      "First para.",
      "",
      "Second para.",
    ]);
  });

  it("returns no lines for empty input", () => {
    expect(splitPaymentTermsLines("")).toEqual([]);
    expect(splitPaymentTermsLines("   \n  \n ")).toEqual([]);
  });
});
