import { describe, expect, it } from "vitest";

import {
  buildChangeOrderIntroSegments,
  changeOrderIntroHtml,
  changeOrderIntroText,
} from "./changeOrderIntro";
import { getDocumentTypeLabel } from "./documentMode";

const FULL = {
  changeOrderNumber: "CO-02",
  originalAgreementDate: "March 4, 2026",
  purchaserLegalName: "Baltimore Ravens LP",
  purchaserAddress: "1 Winning Drive, Owings Mills, MD 21117",
  projectName: "M&T Bank Stadium LED Upgrade",
};

describe("change order intro (Natalia 2026-07-09)", () => {
  it("renders her wording verbatim with every blank filled", () => {
    expect(changeOrderIntroText(FULL)).toBe(
      "This Change Order No. CO-02 modifies Agreement dated March 4, 2026 (the “Original Agreement”) " +
      "by and between Baltimore Ravens LP (“Purchaser”) located at 1 Winning Drive, Owings Mills, MD 21117, " +
      "and ANC Sports Enterprises, LLC (“ANC”) located at 2 Manhattanville Road, Suite 402, Purchase, NY 10577 " +
      "(collectively, the “Parties”). The Parties hereby agree to amend the scope of Work for the " +
      "M&T Bank Stadium LED Upgrade project as described below. This Change Order shall be incorporated into " +
      "and become part of the Original Agreement. Except as expressly modified herein, all terms and conditions " +
      "of the Original Agreement remain in full force and effect."
    );
  });

  it("leaves fill-in-by-hand rules where data is missing, never the word undefined", () => {
    const text = changeOrderIntroText({});
    expect(text).toContain("This Change Order No. ___ modifies Agreement dated ________");
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it("emphasizes the party and project names, not the boilerplate", () => {
    const bold = buildChangeOrderIntroSegments(FULL).filter((s) => s.bold).map((s) => s.text);
    expect(bold).toEqual([
      "Baltimore Ravens LP",
      "ANC Sports Enterprises, LLC",
      "M&T Bank Stadium LED Upgrade",
    ]);
  });

  it("escapes HTML so a client name with an ampersand cannot break the jsreport markup", () => {
    const html = changeOrderIntroHtml(FULL);
    expect(html).toContain("<strong style=\"color:black\">M&amp;T Bank Stadium LED Upgrade</strong>");
    expect(html).not.toContain("M&T Bank");
  });

  it("keeps the HTML and plain-text renders in lockstep", () => {
    const stripped = changeOrderIntroHtml(FULL)
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&");
    expect(stripped).toBe(changeOrderIntroText(FULL));
  });
});

describe("getDocumentTypeLabel (Natalia: 'CO comes up exported and in file name it says Budget')", () => {
  it("names a change order Change_Order, not Budget_Estimate", () => {
    expect(getDocumentTypeLabel("CHANGE_ORDER")).toBe("Change_Order");
  });

  it("covers every document mode", () => {
    expect(getDocumentTypeLabel("LOI")).toBe("Short_Form_Agreement");
    expect(getDocumentTypeLabel("CONTRACT")).toBe("Short_Form_Contract");
    expect(getDocumentTypeLabel("SERVICE_CONTRACT")).toBe("Service_Contract");
    expect(getDocumentTypeLabel("SERVICE_AGREEMENT")).toBe("Service_Contract");
    expect(getDocumentTypeLabel("PROPOSAL")).toBe("Proposal");
    expect(getDocumentTypeLabel("BUDGET")).toBe("Budget_Estimate");
  });

  it("falls back to Budget_Estimate only for genuinely unknown modes", () => {
    expect(getDocumentTypeLabel(undefined)).toBe("Budget_Estimate");
    expect(getDocumentTypeLabel("SOMETHING_NEW")).toBe("Budget_Estimate");
  });
});
