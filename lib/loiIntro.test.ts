import { describe, it, expect } from "vitest";

import { buildLoiIntroSegments, loiIntroHtml, loiIntroText } from "@/lib/loiIntro";

const DODGERS = {
  purchaserLegalName: "Los Angeles Dodgers / Dodger Stadium",
  purchaserAddress: "1000 Vin Scully Avenue, Los Angeles, CA 90012",
};

/**
 * Natalia's 2026-07-30 wording, verbatim. Reproduced here so any reword of the
 * clause text fails loudly instead of silently shipping to a client.
 */
const EXPECTED_DODGERS_TEXT =
  "This Letter of Intent (“LOI”) sets forth the preliminary understanding and the terms by which " +
  "Los Angeles Dodgers / Dodger Stadium (“Purchaser”), located at 1000 Vin Scully Avenue, Los Angeles, CA 90012, and " +
  "ANC Sports Enterprises, LLC (“ANC”), located at 2 Manhattanville Road, Suite 402, Purchase, NY 10577 " +
  "(collectively, the “Parties”), intend to proceed with the proposed transaction described herein. " +
  "The purpose of this LOI is to outline the principal terms and conditions under which the Parties intend to " +
  "negotiate and enter into a mutually acceptable definitive agreement. Unless otherwise agreed to in writing by " +
  "both Parties, this LOI shall be binding upon execution and shall remain in effect until it is superseded by a " +
  "fully executed definitive agreement.";

describe("loiIntroText", () => {
  it("reproduces Natalia's Dodgers paragraph word for word", () => {
    expect(loiIntroText(DODGERS)).toBe(EXPECTED_DODGERS_TEXT);
  });

  it("drops the superseded 'agree that ANC will provide the display system' wording", () => {
    const text = loiIntroText(DODGERS);
    expect(text).not.toMatch(/Short Form Agreement/i);
    expect(text).not.toMatch(/display system and related services/i);
  });

  it("renders fill-in rules, never empty gaps, when the purchaser is unknown", () => {
    const text = loiIntroText({});
    expect(text).toContain("____________ (“Purchaser”), located at ____________,");
    expect(text).not.toMatch(/\bnull\b|\bundefined\b/);
    // The fixed legal clauses survive regardless of what is known.
    expect(text).toContain("shall be binding upon execution");
  });

  it("keeps the address when only the purchaser name is known", () => {
    const text = loiIntroText({ purchaserLegalName: "Indiana Fever" });
    expect(text).toContain("Indiana Fever (“Purchaser”), located at ____________,");
  });
});

describe("buildLoiIntroSegments", () => {
  it("emphasizes both party names and nothing else", () => {
    const bold = buildLoiIntroSegments(DODGERS).filter((s) => s.bold).map((s) => s.text);
    expect(bold).toEqual(["Los Angeles Dodgers / Dodger Stadium", "ANC Sports Enterprises, LLC"]);
  });
});

describe("loiIntroHtml", () => {
  it("bolds the parties for the jsreport path and matches the JSX text exactly", () => {
    const html = loiIntroHtml(DODGERS);
    expect(html).toContain('<strong style="color:black">Los Angeles Dodgers / Dodger Stadium</strong>');
    expect(html).toContain('<strong style="color:black">ANC Sports Enterprises, LLC</strong>');
    // Both render paths must produce identical prose — this is what used to drift.
    expect(html.replace(/<[^>]+>/g, "")).toBe(EXPECTED_DODGERS_TEXT);
  });

  it("escapes markup in a purchaser name", () => {
    const html = loiIntroHtml({ purchaserLegalName: "Smith & Sons <Sports>" });
    expect(html).toContain("Smith &amp; Sons &lt;Sports&gt;");
  });
});
