import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PdfServiceAgreement from "@/app/components/templates/proposal-pdf/sections/PdfServiceAgreement";
import type { PdfColors } from "@/app/components/templates/proposal-pdf/sections/shared";

const colors: PdfColors = {
  primary: "#0A52EF",
  primaryDark: "#002C73",
  primaryLight: "#0385DD",
  accent: "#FFB703",
  text: "#111827",
  textMuted: "#6B7280",
  border: "#D1D5DB",
  background: "#FFFFFF",
  lightBg: "#F9FAFB",
};

describe("PdfServiceAgreement", () => {
  it("keeps the service agreement aligned to the provided source PDF", () => {
    const html = renderToStaticMarkup(<PdfServiceAgreement colors={colors} />);

    expect(html).toContain("AGREEMENT");
    expect(html).toContain("Monthly Service Fee");
    expect(html).toContain("Exhibit A");
    expect(html).toContain("Exhibit B");
    expect(html).toContain("Exhibit C");
    expect(html).toContain("Parts Replacement Procedures");
    expect(html).toContain("parts@anc.com");

    expect(html).not.toContain("Ravens Gameday Support - ANC Displays");
    expect(html).not.toContain("YEARLY TOTAL");
    expect(html).not.toContain("1 Full Time Regional Field Operations Manager");
  });
});
