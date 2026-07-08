import { describe, expect, it } from "vitest";
import { getDefaultTemplate, getTemplate, listTemplates, resolveExhibits } from "./registry";
import { renderMarkdown } from "./renderMarkdown";
import { resolveDocumentMode } from "../documentMode";
import { RAVENS_TEMPLATE } from "./templates/ravens";
import { SERVICE_CONTRACT_PRESETS, getPreset } from "./presets";

// Render PdfTermsAndConditions to a string to assert the byte-identical default
// (no override) still contains every original clause. This is the CONTRACT-path
// regression guard for the Priority-1 "General Terms" refactor.
async function renderTcToString(override?: string): Promise<string> {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const Mod = (await import("../../app/components/templates/proposal-pdf/sections/PdfTermsAndConditions")).default;
  const colors = {
    primary: "#1f4e79", primaryDark: "#1f4e79", text: "#1f2937", textMuted: "#6b7280",
  } as any;
  const markup = renderToStaticMarkup(
    React.createElement(Mod, {
      colors,
      config: {
        purchaserName: "Los Angeles Dodgers",
        warrantyYears: 5,
        includeLaborWarranty: true,
        includeMaterialsWarranty: true,
        includeCms: false,
        includeGraphics: false,
        exhibitLetter: "C",
        bodyOverride: override,
      },
    } as any)
  );
  return markup;
}

describe("service contract registry", () => {
  it("exposes the Ravens template as the default", () => {
    expect(getDefaultTemplate().id).toBe("ravens");
    expect(getTemplate("ravens")?.id).toBe("ravens");
    expect(listTemplates().length).toBeGreaterThanOrEqual(1);
  });

  it("Ravens General Terms body is verbatim (all-caps limitation + every section title)", () => {
    const body = RAVENS_TEMPLATE.exhibits.find((e) => e.id === "general-terms")!.bodyMarkdown;
    // All-caps limitation preserved verbatim
    expect(body).toContain("THE PROVISIONS OF THE FOREGOING WARRANTIES ARE IN LIEU OF ANY OTHER WARRANTY");
    expect(body).toContain("IN NO EVENT SHALL ANC BE LIABLE TO PURCHASER OR ANY OTHER PERSON OR ENTITY FOR SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES");
    // All 10 numbered sections present
    for (const title of [
      "Intellectual Property",
      "Ownership of the Work",
      "Existence, Power and Authority",
      "Confidentiality",
      "Warranty",
      "Indemnification",
      "Purchaser's Obligation to Pay",
      "Force Majeure",
      "Future Pandemic",
      "Miscellaneous",
    ]) {
      expect(body).toContain(`**${title}.**`);
    }
  });

  it("Ravens Parts exhibit body is verbatim (hotline + parts email)", () => {
    const body = RAVENS_TEMPLATE.exhibits.find((e) => e.id === "parts")!.bodyMarkdown;
    expect(body).toContain("(888) 875-2125");
    expect(body).toContain("parts@anc.com");
    expect(body).toContain("Parts Repair/Replacement");
  });

  it("Ravens signature block text is verbatim", () => {
    expect(RAVENS_TEMPLATE.signatureBlockText).toContain("AGREED TO AND ACCEPTED:");
    expect(RAVENS_TEMPLATE.signatureBlockText).toContain("ANC SPORTS ENTERPRISES, LLC");
  });

  it("resolveExhibits returns template defaults when no overrides are given", () => {
    const resolved = resolveExhibits(RAVENS_TEMPLATE, {});
    const general = resolved.find((e) => e.id === "general-terms");
    expect(general?.enabled).toBe(true);
    expect(general?.bodyMarkdown).toBe(RAVENS_TEMPLATE.exhibits[0].bodyMarkdown);
    // parts is defaultOn
    const parts = resolved.find((e) => e.id === "parts");
    expect(parts?.enabled).toBe(true);
    // live-sync is defaultOff
    const liveSync = resolved.find((e) => e.id === "live-sync");
    expect(liveSync?.enabled).toBe(false);
  });

  it("resolveExhibits honors an enabled=false override", () => {
    const resolved = resolveExhibits(RAVENS_TEMPLATE, { "general-terms": { enabled: false } });
    const general = resolved.find((e) => e.id === "general-terms");
    expect(general?.enabled).toBe(false);
    // other exhibits unaffected
    expect(resolved.find((e) => e.id === "parts")?.enabled).toBe(true);
  });

  it("resolveExhibits honors a bodyMarkdown override", () => {
    const resolved = resolveExhibits(RAVENS_TEMPLATE, {
      "general-terms": { bodyMarkdown: "OVERRIDE BODY" },
    });
    const general = resolved.find((e) => e.id === "general-terms");
    expect(general?.bodyMarkdown).toBe("OVERRIDE BODY");
    // enabled falls back to defaultOn
    expect(general?.enabled).toBe(true);
  });
});

describe("service contract markdown renderer", () => {
  it("renders inline bold", () => {
    const node = renderMarkdown("**Bold** then text");
    const json = JSON.stringify(node);
    expect(json).toContain("Bold");
    expect(json).toContain("then text");
  });

  it("renders ordered lists", () => {
    const node = renderMarkdown("1. One\n2. Two");
    const json = JSON.stringify(node);
    expect(json).toContain("One");
    expect(json).toContain("Two");
  });

  it("renders paragraphs and preserves all-caps verbatim", () => {
    const node = renderMarkdown("THIS WARRANTY IS THE SOLE AND EXCLUSIVE WARRANTY.");
    expect(JSON.stringify(node)).toContain("THIS WARRANTY IS THE SOLE AND EXCLUSIVE WARRANTY.");
  });

  it("returns null for empty input", () => {
    expect(renderMarkdown("")).toBeNull();
    expect(renderMarkdown("   ")).toBeNull();
  });
});

describe("service contract documentMode resolver", () => {
  it("resolves SERVICE_CONTRACT", () => {
    expect(resolveDocumentMode({ documentMode: "SERVICE_CONTRACT" })).toBe("SERVICE_CONTRACT");
  });

  it("maps legacy SERVICE_AGREEMENT to SERVICE_CONTRACT", () => {
    expect(resolveDocumentMode({ documentMode: "SERVICE_AGREEMENT" })).toBe("SERVICE_CONTRACT");
    expect(resolveDocumentMode({ documentType: "Service Agreement" })).toBe("SERVICE_CONTRACT");
  });
});

describe("service contract presets", () => {
  it("seeds the seven project-type presets inferred from the contract analysis", () => {
    const ids = SERVICE_CONTRACT_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      "general-only",
      "general+labor",
      "general+graphics",
      "general+software",
      "general+parts",
      "general+labor+software+parts",
      "general+labor+software+graphics",
    ]);
  });

  it("general-only enables only general-terms", () => {
    expect(getPreset("general-only")?.defaultExhibits).toEqual({ "general-terms": true });
  });

  it("general+labor+software+parts enables general-terms, labor, software, parts (SMU type)", () => {
    expect(getPreset("general+labor+software+parts")?.defaultExhibits).toEqual({
      "general-terms": true,
      labor: true,
      software: true,
      parts: true,
    });
  });
});

describe("variable term exhibits populated verbatim (pass 2)", () => {
  it("Ravens template has a populated Graphics exhibit body", () => {
    const ex = RAVENS_TEMPLATE.exhibits.find((e) => e.id === "graphics");
    expect(ex).toBeTruthy();
    expect(ex!.bodyMarkdown.length).toBeGreaterThan(100);
    expect(ex!.bodyMarkdown).toContain("TERMS & CONDITIONS FOR GRAPHICS PRODUCTION");
    expect(ex!.bodyMarkdown).toContain("Scope of Services");
    expect(ex!.bodyMarkdown).toContain("Ownership of Materials");
    // Uses "Purchaser" throughout — no party-name placeholder
    expect(ex!.bodyMarkdown).not.toContain("{{purchaserName}}");
  });

  it("Ravens template has a populated Software EULA exhibit with templatized preamble", () => {
    const ex = RAVENS_TEMPLATE.exhibits.find((e) => e.id === "software");
    expect(ex).toBeTruthy();
    expect(ex!.bodyMarkdown.length).toBeGreaterThan(1000);
    expect(ex!.bodyMarkdown).toContain("Software End User License Agreement");
    // Preamble licensee name+address templatized
    expect(ex!.bodyMarkdown).toContain("{{purchaserName}}");
    expect(ex!.bodyMarkdown).toContain("{{purchaserAddress}}");
    // No leftover specific party name from the source contract
    expect(ex!.bodyMarkdown).not.toContain("Hub City Spartanburgers");
    expect(ex!.bodyMarkdown).not.toContain("300 West Henry");
  });
});

describe("applyTemplateTokens", () => {
  it("replaces {{token}} placeholders with configured values", async () => {
    const { applyTemplateTokens } = await import("./registry");
    const out = applyTemplateTokens(
      "between ANC and {{purchaserName}}, located at {{purchaserAddress}} (“Licensee”)",
      { purchaserName: "Iona University", purchaserAddress: "New Rochelle, NY" },
    );
    expect(out).toContain("Iona University");
    expect(out).toContain("New Rochelle, NY");
    expect(out).not.toContain("{{purchaserName}}");
  });

  it("leaves unknown tokens in place (visible so the user fills them)", async () => {
    const { applyTemplateTokens } = await import("./registry");
    const out = applyTemplateTokens("{{unknownToken}} stays", { purchaserName: "X" });
    expect(out).toContain("{{unknownToken}}");
  });

  it("is case-insensitive on the token key", async () => {
    const { applyTemplateTokens } = await import("./registry");
    const out = applyTemplateTokens("{{PurchaserName}}", { purchaserName: "Y" });
    expect(out).toBe("Y");
  });
});

describe("CONTRACT General Terms (byte-identical default regression)", () => {
  it("renders every original clause + all-caps limitation with no override", async () => {
    const html = await renderTcToString();
    // Header renamed to "General Terms"
    expect(html).toContain("Exhibit C — General Terms");
    // Every original numbered section title still present (default layout unchanged)
    for (const title of [
      "Intellectual Property",
      "Ownership of the Equipment",
      "Existence, Power and Authority",
      "Warranty",
      "Indemnification",
      "Force Majeure",
      "Miscellaneous",
    ]) {
      expect(html).toContain(title);
    }
    // All-caps limitation clause preserved verbatim
    expect(html).toContain("THE WARRANTY SET FORTH HEREIN IS THE SOLE AND EXCLUSIVE WARRANTY");
    expect(html).toContain("CONSEQUENTIAL, INCIDENTAL, OR SPECIAL DAMAGES");
    // Labor warranty default (5 years) text present
    expect(html).toContain("forty-eight (48) hours");
  });

  it("renders the Markdown override in place of the fixed sections", async () => {
    const html = await renderTcToString("1. **Custom Clause.** OVERRIDE BODY TEXT");
    expect(html).toContain("OVERRIDE BODY TEXT");
    expect(html).toContain("Custom Clause");
    // Default fixed sections are suppressed when override is set
    expect(html).not.toContain("Intellectual Property");
  });
});