import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PdfServiceContract from "@/app/components/templates/proposal-pdf/PdfServiceContract";
import PdfServiceProposal from "@/app/components/templates/proposal-pdf/PdfServiceProposal";
import type { PdfColors } from "@/app/components/templates/proposal-pdf/sections/shared";

const colors: PdfColors = {
  primary: "#0A52EF",
  primaryDark: "#07378F",
  primaryLight: "#EAF0FF",
  accent: "#0A52EF",
  text: "#111827",
  textMuted: "#6B7280",
  textLight: "#9CA3AF",
  white: "#FFFFFF",
  surface: "#F8FAFC",
  border: "#D1D5DB",
  borderLight: "#E5E7EB",
};

const intro = {
  purchaserName: "Carolina Panthers",
  purchaserAddress: "800 S Mint St, Charlotte, NC 28202",
  venueName: "Bank of America Stadium",
  venueCityState: "Charlotte, NC",
  teamName: "Carolina Panthers",
  league: "NFL",
  termYears: 2,
  termStart: "August 1, 2026",
  termEnd: "July 31, 2028",
};

describe("service proposal and contract rendering", () => {
  it("keeps proposal and contract section overrides independent", () => {
    const details = {
      serviceManualFeeRows: [{ contractYear: "2026–2027", monthlyFee: "$45,000.00" }],
      serviceSectionOverrides: {
        "SERVICE_PROPOSAL:intro": { enabled: false },
        "SERVICE_CONTRACT:intro": { enabled: true, bodyText: "Contract-only intro" },
      },
    };

    const proposal = renderToStaticMarkup(
      <PdfServiceProposal colors={colors} intro={intro} details={details} />,
    );
    const contract = renderToStaticMarkup(
      <PdfServiceContract
        colors={colors}
        details={details}
        config={{
          purchaserName: intro.purchaserName,
          purchaserAddress: intro.purchaserAddress,
          venueName: intro.venueName,
        }}
      />,
    );

    expect(proposal).not.toContain("Intro / Whereas");
    expect(proposal).toContain("$45,000.00");
    expect(proposal).not.toContain("Signature Block");
    expect(contract).toContain("Contract-only intro");
    expect(contract).toContain("$45,000.00");
    expect(contract).toContain("Signature Block");
  });

  it("renders the imported multi-year pricing table in both service document types", () => {
    const servicePricingDocument = {
      sourceSheet: "Service Fee Schedule",
      fileName: "Carolina Panthers 2026-2028 Service Estimate.xlsx",
      clientName: "Carolina Panthers",
      yearLabels: ["26/27", "27/28"],
      rows: [
        {
          label: "Pre Event Hardware Support",
          cells: [
            { raw: 45050, display: "$45,050.00" },
            { raw: 45050, display: "$45,050.00" },
          ],
          kind: "line" as const,
          sourceRow: 9,
        },
      ],
      totalRow: {
        label: "TOTAL INCOME",
        cells: [
          { raw: 45050, display: "$45,050.00" },
          { raw: 45050, display: "$45,050.00" },
        ],
        sourceRow: 10,
      },
      termYears: 2,
      termStartYear: 2026,
      termEndYear: 2028,
      currency: "USD" as const,
      metadata: { importedAt: "2026-07-17T00:00:00.000Z", warnings: [] },
    };
    const details = { servicePricingDocument };

    const proposal = renderToStaticMarkup(
      <PdfServiceProposal colors={colors} intro={intro} details={details} />,
    );
    const contract = renderToStaticMarkup(
      <PdfServiceContract colors={colors} details={details} config={{ purchaserName: intro.purchaserName }} />,
    );

    for (const html of [proposal, contract]) {
      expect(html).toContain("Pre Event Hardware Support");
      expect(html).toContain("26/27");
      expect(html).toContain("$45,050.00");
      expect(html).toContain("Yearly Total:");
    }
  });
});
