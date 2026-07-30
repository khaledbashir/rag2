import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PdfHeader from "@/app/components/templates/proposal-pdf/sections/PdfHeader";
import type { PdfColors } from "@/app/components/templates/proposal-pdf/sections/shared";
import { resolveDocumentLabel } from "@/lib/documentMode";

/**
 * The blue word Natalia asked to control (2026-07-30) is rendered by PdfHeader in
 * colors.primary. This asserts the end of the chain: whatever resolveDocumentLabel
 * returns for a set of details is what lands in the blue element of the markup.
 */
const colors = {
  primary: "#0A52EF",
  primaryDark: "#002C73",
  primaryLight: "#0385DD",
  accent: "#FFB703",
  text: "#111827",
  textMuted: "#6B7280",
  textLight: "#9CA3AF",
  white: "#FFFFFF",
  surface: "#F9FAFB",
  border: "#D1D5DB",
  borderLight: "#E5E7EB",
} as PdfColors;

const renderHeader = (details: any) =>
  renderToStaticMarkup(
    <PdfHeader
      colors={colors}
      contentPaddingX={24}
      headerToIntroGap={12}
      docLabel={resolveDocumentLabel(details)}
      proposalName="M&T Bank Stadium LED Upgrade"
      clientName="Baltimore Ravens LP"
      date="July 30, 2026"
    />,
  );

describe("blue document label in the PDF header", () => {
  it("prints the mode label when no override is set", () => {
    const html = renderHeader({ documentMode: "SERVICE_CONTRACT" });
    expect(html).toContain(`color:${colors.primary}`);
    expect(html).toContain(">SERVICE CONTRACT</div>");
  });

  it("prints the override instead, with the mode untouched", () => {
    const html = renderHeader({ documentMode: "SERVICE_CONTRACT", documentLabelOverride: "Amendment" });
    expect(html).toContain(`color:${colors.primary}`);
    expect(html).toContain(">Amendment</div>");
    expect(html).not.toContain("SERVICE CONTRACT");
  });

  it("still renders the proposal name and date around it", () => {
    const html = renderHeader({ documentMode: "PROPOSAL", documentLabelOverride: "Addendum" });
    expect(html).toContain(">Addendum</div>");
    expect(html).toContain("M&amp;T Bank Stadium LED Upgrade");
    expect(html).toContain("July 30, 2026");
  });
});
