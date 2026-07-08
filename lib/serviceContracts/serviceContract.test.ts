import { describe, expect, it } from "vitest";
import { getDefaultTemplate, getTemplate, listTemplates, resolveExhibits } from "./registry";
import { renderMarkdown } from "./renderMarkdown";
import { resolveDocumentMode } from "../documentMode";
import { RAVENS_TEMPLATE } from "./templates/ravens";
import { SERVICE_CONTRACT_PRESETS, getPreset } from "./presets";

describe("service contract registry", () => {
  it("exposes the Ravens template as the default", () => {
    expect(getDefaultTemplate().id).toBe("ravens");
    expect(getTemplate("ravens")?.id).toBe("ravens");
    expect(listTemplates().length).toBeGreaterThanOrEqual(1);
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
  it("seeds the four named project-type presets", () => {
    const ids = SERVICE_CONTRACT_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      "general-only",
      "general+live-sync",
      "general+parts",
      "general+parts&labor",
    ]);
  });

  it("general-only enables only general-terms", () => {
    expect(getPreset("general-only")?.defaultExhibits).toEqual({ "general-terms": true });
  });

  it("general+parts&labor enables general-terms, parts, labor", () => {
    expect(getPreset("general+parts&labor")?.defaultExhibits).toEqual({
      "general-terms": true,
      parts: true,
      labor: true,
    });
  });
});