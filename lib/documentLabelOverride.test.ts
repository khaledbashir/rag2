import { describe, expect, it } from "vitest";

import { getDocumentFileLabel, getDocumentTypeLabel, resolveDocumentLabel } from "./documentMode";

/**
 * Natalia 2026-07-30: "on occasion, can we change word in blue — contract,
 * service contract, proposal — like to call it amendment etc. Currently I do it
 * when I export a pdf but Krissy can't."
 *
 * The blue word is the per-mode headerText rendered by PdfHeader. These lock in
 * that details.documentLabelOverride replaces it everywhere without changing the
 * document's lifecycle mode, and that an empty override changes nothing.
 */
describe("resolveDocumentLabel — the blue header word", () => {
  it("falls back to the document mode's own label when there is no override", () => {
    expect(resolveDocumentLabel({ documentMode: "PROPOSAL" })).toBe("PROPOSAL");
    expect(resolveDocumentLabel({ documentMode: "SERVICE_CONTRACT" })).toBe("SERVICE CONTRACT");
    expect(resolveDocumentLabel({ documentMode: "SERVICE_PROPOSAL" })).toBe("SERVICE PROPOSAL");
    expect(resolveDocumentLabel({ documentMode: "CHANGE_ORDER" })).toBe("CHANGE ORDER");
  });

  it("prints whatever she types, without changing the document mode", () => {
    expect(
      resolveDocumentLabel({ documentMode: "SERVICE_CONTRACT", documentLabelOverride: "Amendment" }),
    ).toBe("Amendment");
    expect(
      resolveDocumentLabel({ documentMode: "PROPOSAL", documentLabelOverride: "Addendum No. 2" }),
    ).toBe("Addendum No. 2");
  });

  it("treats blank / whitespace-only as no override", () => {
    expect(resolveDocumentLabel({ documentMode: "CONTRACT", documentLabelOverride: "" })).toBe("CONTRACT");
    expect(resolveDocumentLabel({ documentMode: "CONTRACT", documentLabelOverride: "   " })).toBe("CONTRACT");
    expect(resolveDocumentLabel({ documentMode: "CONTRACT", documentLabelOverride: null })).toBe("CONTRACT");
  });

  it("trims stray spaces around the typed label", () => {
    expect(resolveDocumentLabel({ documentMode: "BUDGET", documentLabelOverride: "  Renewal  " })).toBe("Renewal");
  });

  // The CO number suffix is spec'd separately (CO #4) — an override must not eat it.
  it("keeps the change order number suffix alongside an override", () => {
    expect(resolveDocumentLabel({ documentMode: "CHANGE_ORDER" }, "CO-01")).toBe("CHANGE ORDER · CO-01");
    expect(
      resolveDocumentLabel({ documentMode: "CHANGE_ORDER", documentLabelOverride: "Amendment" }, "CO-01"),
    ).toBe("Amendment · CO-01");
  });

  it("defaults an unknown/absent mode the same way resolveDocumentMode does", () => {
    expect(resolveDocumentLabel({})).toBe("BUDGET ESTIMATE");
    expect(resolveDocumentLabel({ documentLabelOverride: "Amendment" })).toBe("Amendment");
  });
});

describe("getDocumentFileLabel — export filename follows the header label", () => {
  it("keeps the existing per-mode filenames when no override is set", () => {
    expect(getDocumentFileLabel({ documentMode: "CHANGE_ORDER" })).toBe(getDocumentTypeLabel("CHANGE_ORDER"));
    expect(getDocumentFileLabel({ documentMode: "SERVICE_CONTRACT" })).toBe("Service_Contract");
    expect(getDocumentFileLabel({})).toBe("Budget_Estimate");
  });

  it("uses the override, sanitized for a filename", () => {
    expect(getDocumentFileLabel({ documentMode: "SERVICE_CONTRACT", documentLabelOverride: "Amendment" })).toBe("Amendment");
    expect(getDocumentFileLabel({ documentMode: "PROPOSAL", documentLabelOverride: "Addendum No. 2" })).toBe("Addendum_No_2");
    expect(getDocumentFileLabel({ documentMode: "PROPOSAL", documentLabelOverride: "Amendment / Renewal" })).toBe("Amendment_Renewal");
  });

  it("falls back to the mode label when the override sanitizes down to nothing", () => {
    expect(getDocumentFileLabel({ documentMode: "PROPOSAL", documentLabelOverride: "///" })).toBe("Proposal");
  });
});
