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
    expect(proposal).not.toContain("AGREED TO AND ACCEPTED");
    expect(contract).toContain("Contract-only intro");
    expect(contract).toContain("$45,000.00");
    expect(contract).toContain("AGREED TO AND ACCEPTED");
  });

  it("renders the signature block as preamble + two-column BY/TITLE/DATE (Natalia 2026-07-27)", () => {
    const contract = renderToStaticMarkup(
      <PdfServiceContract
        colors={colors}
        details={{}}
        config={{
          purchaserName: "Forty Niners Stadium Management Company LLC",
          purchaserAddress: "4900 Marie P. DeBartolo Way, Santa Clara 95054",
          venueName: "Levi's Stadium",
        }}
      />,
    );

    // Sign-here preamble sits with the signature block, Services wording.
    expect(contract).toContain("purchase the Services as described herein");
    expect(contract).not.toContain("purchase the Work as described herein");
    expect(contract).toContain("AGREED TO AND ACCEPTED:");
    // Both parties, each with stacked BY / TITLE / DATE fields.
    expect(contract).toContain("Forty Niners Stadium Management Company LLC (&quot;Purchaser&quot;)");
    expect(contract).toContain("ANC Sports Enterprises, LLC (&quot;ANC&quot;)");
    expect(contract.match(/BY:/g)?.length).toBe(2);
    expect(contract.match(/TITLE:/g)?.length).toBe(2);
    expect(contract.match(/DATE:/g)?.length).toBe(2);
  });

  it("renders manual (Build from Scratch) tables in BOTH service document types", () => {
    const details = {
      freeformTables: [
        {
          id: "t1",
          name: "Service Fees",
          columns: [{ id: "c1", label: "Item" }, { id: "c2", label: "26/27" }],
          rows: [{ id: "r1", cells: { c1: "Game Day Support", c2: "$70,000" } }],
        },
      ],
    };

    const proposal = renderToStaticMarkup(
      <PdfServiceProposal colors={colors} intro={intro} details={details} />,
    );
    const contract = renderToStaticMarkup(
      <PdfServiceContract colors={colors} details={details} config={{ purchaserName: intro.purchaserName }} />,
    );

    for (const html of [proposal, contract]) {
      expect(html).toContain("Game Day Support");
      expect(html).toContain("$70,000");
    }
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

/**
 * Natalia 2026-07-30: "service PROPOSAL need sow, notes". Scope is derived from
 * the priced service lines (Alexis on the same call: "scope of work is just
 * based on what these line items are"); notes are ANC-authored.
 */
describe("service proposal — scope of services and notes", () => {
  const svcDoc = {
    sourceSheet: "Option 1",
    fileName: "Fifth Third Park 2026-2028 Service (1).xlsx",
    clientName: "Fifth Third Park",
    yearLabels: ["2026", "2027", "2028"],
    rows: [
      { label: "Preseason Check", cells: [{ raw: "Included", display: "Included" }], kind: "line", sourceRow: 9 },
      { label: "VSB License Fee", cells: [{ raw: 13500, display: "$13,500.00" }], kind: "line", sourceRow: 11 },
      { label: "*20% Bundle Discount Added", cells: [{ raw: null, display: "" }], kind: "note", sourceRow: 15 },
    ],
    totalRow: null,
    termYears: 3,
    termStartYear: 2026,
    termEndYear: 2028,
    currency: "USD" as const,
    metadata: { importedAt: "2026-07-30T00:00:00.000Z", warnings: [] },
  };

  it("derives the scope from the priced service lines", () => {
    const html = renderToStaticMarkup(
      <PdfServiceProposal colors={colors} intro={intro} details={{ servicePricingDocument: svcDoc }} />,
    );
    expect(html).toContain("Scope of Services");
    expect(html).toContain("ANC will provide the following services at Bank of America Stadium");
    expect(html).toContain("<li>Preseason Check</li>");
    expect(html).toContain("<li>VSB License Fee</li>");
    // Sheet footnotes belong under the fee table, never in the scope list.
    expect(html).not.toContain("<li>*20% Bundle Discount Added</li>");
  });

  it("never restates pricing inside the scope section", () => {
    const html = renderToStaticMarkup(
      <PdfServiceProposal colors={colors} intro={intro} details={{ servicePricingDocument: svcDoc }} />,
    );
    const scope = html.split("Scope of Services")[1].split("Compensation")[0];
    expect(scope).not.toContain("$13,500.00");
  });

  it("hides the scope section when nothing is priced yet", () => {
    const html = renderToStaticMarkup(
      <PdfServiceProposal colors={colors} intro={intro} details={{}} />,
    );
    expect(html).not.toContain("Scope of Services");
  });

  it("lets a typed scope win over the derived one", () => {
    const html = renderToStaticMarkup(
      <PdfServiceProposal
        colors={colors}
        intro={intro}
        details={{
          servicePricingDocument: svcDoc,
          serviceSectionOverrides: { "SERVICE_PROPOSAL:sow": { bodyText: "Full-time on-site technician, 40 hours per week." } },
        }}
      />,
    );
    expect(html).toContain("Full-time on-site technician, 40 hours per week.");
    expect(html).not.toContain("<li>Preseason Check</li>");
  });

  it("renders ANC notes and hides the section when there are none", () => {
    const withNotes = renderToStaticMarkup(
      <PdfServiceProposal
        colors={colors}
        intro={intro}
        details={{ servicePricingDocument: svcDoc, customProposalNotes: "Parts warranty carries over from the project." }}
      />,
    );
    expect(withNotes).toContain("Notes");
    expect(withNotes).toContain("Parts warranty carries over from the project.");

    const without = renderToStaticMarkup(
      <PdfServiceProposal colors={colors} intro={intro} details={{ servicePricingDocument: svcDoc }} />,
    );
    expect(without).not.toContain("service-section-notes");
  });

  it("keeps both new sections independently toggleable", () => {
    const html = renderToStaticMarkup(
      <PdfServiceProposal
        colors={colors}
        intro={intro}
        details={{
          servicePricingDocument: svcDoc,
          customProposalNotes: "Parts warranty carries over from the project.",
          serviceSectionOverrides: {
            "SERVICE_PROPOSAL:sow": { enabled: false },
            "SERVICE_PROPOSAL:notes": { enabled: false },
          },
        }}
      />,
    );
    expect(html).not.toContain("Scope of Services");
    expect(html).not.toContain("service-section-notes");
    // The rest of the document is untouched.
    expect(html).toContain("Compensation");
  });
});
