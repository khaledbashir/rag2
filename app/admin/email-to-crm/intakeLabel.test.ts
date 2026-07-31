import { describe, expect, it } from "vitest";

import { intakeLabel } from "./intakeLabel";

describe("intakeLabel", () => {
  it("uses the email subject when there is one", () => {
    expect(
      intakeLabel({
        subject: "Camping World Stadium - CMS / Broadcast Pricing ",
        rawBody: "Jackson – Attached is the broadcast specification…",
        extraction: { projectName: "CMS Upgrade", clientOrVenue: "Camping World" },
      }),
    ).toBe("Camping World Stadium - CMS / Broadcast Pricing");
  });

  it("names a pasted email by what the extraction understood it to be", () => {
    expect(
      intakeLabel({
        subject: null,
        rawBody: "Proposals are due Monday.",
        extraction: { projectName: "CMS / Broadcast Upgrade", clientOrVenue: "Camping World Stadium" },
      }),
    ).toBe("Camping World Stadium — CMS / Broadcast Upgrade");
  });

  it("falls back to whichever of venue or project it got", () => {
    expect(
      intakeLabel({ subject: "", rawBody: "x", extraction: { clientOrVenue: "Kia Center", projectName: "" } }),
    ).toBe("Kia Center");
    expect(
      intakeLabel({ subject: "", rawBody: "x", extraction: { clientOrVenue: "", projectName: "Ribbon Board" } }),
    ).toBe("Ribbon Board");
  });

  it("falls back to the first real line of the body", () => {
    expect(
      intakeLabel({
        subject: null,
        rawBody: "\n\n   \nDeploy service: fix(cg): normalize legacy review lanes\nmore text",
        extraction: null,
      }),
    ).toBe("Deploy service: fix(cg): normalize legacy review lanes");
  });

  it("truncates a long opening line instead of blowing out the row", () => {
    const long = "A".repeat(200);
    const label = intakeLabel({ subject: null, rawBody: long, extraction: null });
    expect(label).toHaveLength(91); // 90 chars + ellipsis
    expect(label.endsWith("…")).toBe(true);
  });

  it("only says (no subject) when there is genuinely nothing to show", () => {
    expect(intakeLabel({ subject: null, rawBody: "   \n\n  ", extraction: null })).toBe("(no subject)");
  });
});
