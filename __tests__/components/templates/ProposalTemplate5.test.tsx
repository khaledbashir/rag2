/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

// ============================================================================
// MOCKS — stub out heavy/server-only dependencies
// ============================================================================

// ProposalLayout — just render children
vi.mock("@/app/components", () => ({
  ProposalLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="proposal-layout">{children}</div>
  ),
}));

// LogoSelectorServer — render a simple placeholder
vi.mock("@/app/components/reusables/LogoSelectorServer", () => ({
  default: (props: any) => <div data-testid="logo" />,
}));

// ExhibitA_TechnicalSpecs — render a stub
vi.mock("@/app/components/templates/proposal-pdf/exhibits/ExhibitA_TechnicalSpecs", () => ({
  default: (props: any) => <div data-testid="exhibit-a">ExhibitA Specs</div>,
}));

// PageBreak — render a marker div
vi.mock("@/app/components/templates/proposal-pdf/PageBreak", () => ({
  default: () => <div data-testid="page-break" />,
}));

// Sentry — not available in test
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// Suppress console noise
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ============================================================================
// IMPORT UNDER TEST
// ============================================================================
import ProposalTemplate5 from "@/app/components/templates/proposal-pdf/ProposalTemplate5";

// ============================================================================
// MOCK DATA BUILDERS
// ============================================================================

function baseProps(overrides: Record<string, any> = {}) {
  return {
    sender: {
      name: "ANC Sports Enterprises",
      email: "info@anc.com",
      address: "2 Manhattanville Road",
      city: "Purchase",
      zipCode: "10577",
    },
    receiver: {
      name: "Test Client Corp",
      email: "client@test.com",
      address: "123 Main St",
      city: "New York",
      zipCode: "10001",
    },
    details: {
      proposalName: "Test Stadium LED Project",
      documentMode: "BUDGET",
      showNotes: false,
      showScopeOfWork: false,
      showSignatureBlock: false,
      showPaymentTerms: false,
      showSpecifications: false,
      showPricingTables: true,
      showIntroText: true,
      showCompanyFooter: false,
      showExhibitA: false,
      ...overrides,
    },
  } as any;
}

function buildPricingDocument(tables: any[], currency = "USD" as "CAD" | "USD") {
  return {
    tables,
    mode: "MIRROR",
    sourceSheet: "Margin Analysis",
    currency,
    documentTotal: tables.reduce((s: number, t: any) => s + (t.grandTotal || 0), 0),
    metadata: { importedAt: new Date().toISOString(), fileName: "test.xlsx", tablesCount: tables.length, itemsCount: 0, alternatesCount: 0 },
  };
}

function buildPricingTable(name: string, items: Array<{ description: string; sellingPrice: number }>, grandTotal: number, id?: string) {
  return {
    id: id || `table-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    currency: "USD",
    items: items.map((i) => ({ ...i, isIncluded: i.sellingPrice === 0 })),
    subtotal: items.reduce((s, i) => s + i.sellingPrice, 0),
    tax: null,
    bond: 0,
    tariff: 0,
    grandTotal,
    alternates: [],
    sourceStartRow: 0,
    sourceEndRow: 10,
  };
}

function buildRespMatrix(categories: Array<{ name: string; items: Array<{ description: string; anc: string; purchaser: string }> }>) {
  return {
    projectName: "Test Project",
    date: "2026-02-15",
    format: "long" as const,
    categories,
  };
}

// ============================================================================
// 1. DOCUMENT MODES (3 tests)
// ============================================================================

describe("Document Modes", () => {
  it("renders BUDGET mode with correct header label", () => {
    const props = baseProps({ documentMode: "BUDGET" });
    const { container } = render(<ProposalTemplate5 {...props} />);
    // Budget mode shows "BUDGET ESTIMATE" header
    expect(container.textContent).toContain("BUDGET ESTIMATE");
  });

  it("renders PROPOSAL mode with correct header label", () => {
    const props = baseProps({ documentMode: "PROPOSAL" });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("PROPOSAL");
  });

  it("renders LOI mode with correct header label", () => {
    const props = baseProps({
      documentMode: "LOI",
      showSignatureBlock: true,
      showPaymentTerms: true,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("LETTER OF INTENT");
  });
});

// ============================================================================
// 2. MIRROR vs INTELLIGENCE MODE (2 tests)
// ============================================================================

describe("Mirror vs Intelligence mode", () => {
  it("Mirror mode renders pricing tables from pricingDocument", () => {
    const table1 = buildPricingTable("LED Display", [
      { description: "LG 1.2mm Panel", sellingPrice: 30000 },
      { description: "Controller", sellingPrice: 5000 },
    ], 35000);
    const pricingDocument = buildPricingDocument([table1]);

    const props = baseProps({
      documentMode: "BUDGET",
      pricingDocument,
      mirrorMode: true,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("LG 1.2mm Panel");
    expect(container.textContent).toContain("Controller");
    expect(container.textContent).toContain("GRAND TOTAL");
  });

  // Natalia 2026-07-09: her San Jose - CPA sheet keeps the tax RATE in its own
  // cell and the AMOUNT in the selling-price column, so the PDF used to print a
  // bare "TAX" and she typed "10.25%" in by hand on every export.
  it("Mirror mode prints the sheet's tax rate in the tax row label", () => {
    const table1 = buildPricingTable("San Jose - CPA", [
      { description: "Generator Rental (One Month)", sellingPrice: 9900 },
      { description: "Project Management", sellingPrice: 2000 },
    ], 29443);
    (table1 as any).subtotal = 26706;
    (table1 as any).tax = { rate: 0.1025, label: "TAX", amount: 2737 };
    const pricingDocument = buildPricingDocument([table1]);

    const props = baseProps({
      documentMode: "BUDGET",
      pricingDocument,
      mirrorMode: true,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("TAX (10.25%)");
  });

  it("Intelligence mode renders line items from screens/quoteItems", () => {
    const props = baseProps({
      documentMode: "PROPOSAL",
      quoteItems: [
        { id: "q1", locationName: "Main Scoreboard", description: "4mm LED", price: 50000 },
        { id: "q2", locationName: "Ribbon Board", description: "10mm LED", price: 25000 },
      ],
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("MAIN SCOREBOARD");
    expect(container.textContent).toContain("RIBBON BOARD");
  });
});

// ============================================================================
// 3. SPECS DISPLAY MODES (2 tests)
// ============================================================================

describe("Specs display modes", () => {
  it("shows ExhibitA when showSpecifications is true and screens exist", () => {
    const props = baseProps({
      documentMode: "BUDGET",
      showSpecifications: true,
      showExhibitA: true,
    });
    // Need screens for specs to render
    (props as any).screens = [
      { id: "s1", name: "Main Display", heightFt: 10, widthFt: 20, pitchMm: 4 },
    ];
    const { queryByTestId } = render(<ProposalTemplate5 {...props} />);
    expect(queryByTestId("exhibit-a")).toBeInTheDocument();
  });

  it("hides specs section when showSpecifications is false", () => {
    const props = baseProps({
      documentMode: "BUDGET",
      showSpecifications: false,
      showExhibitA: false,
    });
    (props as any).screens = [
      { id: "s1", name: "Main Display", heightFt: 10, widthFt: 20, pitchMm: 4 },
    ];
    const { queryByTestId } = render(<ProposalTemplate5 {...props} />);
    expect(queryByTestId("exhibit-a")).not.toBeInTheDocument();
  });
});

// ============================================================================
// 4. RESPONSIBILITY MATRIX (2 tests)
// ============================================================================

describe("Responsibility Matrix", () => {
  it("renders when pricingDocument includes respMatrix", () => {
    const table1 = buildPricingTable("LED Display", [
      { description: "Panel", sellingPrice: 10000 },
    ], 10000);
    const pricingDocument = buildPricingDocument([table1]);
    (pricingDocument as any).respMatrix = buildRespMatrix([
      {
        name: "PHYSICAL INSTALLATION",
        items: [
          { description: "Provide structural steel", anc: "X", purchaser: "" },
          { description: "Provide electrical conduit", anc: "", purchaser: "X" },
        ],
      },
    ]);

    const props = baseProps({
      documentMode: "BUDGET",
      pricingDocument,
      mirrorMode: true,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("Exhibit B — Statement of Work");
    expect(container.textContent).toContain("PHYSICAL INSTALLATION");
    expect(container.textContent).toContain("Provide structural steel");
  });

  // feb2c2b2 baked the ANC master matrix into every proposal PDF, so it now
  // auto-appears with no Excel sheet and no wizard opt-in — mirroring how the
  // Exhibit A specs page is auto-generated. includeResponsibilityMatrix only
  // governs the Intelligence Mode wizard's own matrix, not this fallback.
  it("falls back to the ANC master matrix when the sheet has none and the wizard opted out", () => {
    const table1 = buildPricingTable("LED Display", [
      { description: "Panel", sellingPrice: 10000 },
    ], 10000);
    const pricingDocument = buildPricingDocument([table1]);
    // No respMatrix on pricingDocument

    const props = baseProps({
      documentMode: "BUDGET",
      pricingDocument,
      mirrorMode: true,
      includeResponsibilityMatrix: false,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("Exhibit B — Statement of Work");
  });

  // showResponsibilityMatrix is the author-facing kill switch — the one that has
  // to work, since it's what keeps an unwanted Exhibit B out of a client PDF.
  it("hidden when the author turns showResponsibilityMatrix off", () => {
    const table1 = buildPricingTable("LED Display", [
      { description: "Panel", sellingPrice: 10000 },
    ], 10000);
    const pricingDocument = buildPricingDocument([table1]);

    const props = baseProps({
      documentMode: "BUDGET",
      pricingDocument,
      mirrorMode: true,
      showResponsibilityMatrix: false,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).not.toContain("Exhibit B — Statement of Work");
  });
});

// ============================================================================
// 5. SIGNATURE BLOCK (1 test)
// ============================================================================

describe("Signature Block", () => {
  it("LOI mode includes signature block with agreement text", () => {
    const props = baseProps({
      documentMode: "LOI",
      showSignatureBlock: true,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("Agreed To And Accepted");
    expect(container.textContent).toContain("ANC Sports Enterprises, LLC");
    expect(container.textContent).toContain("Purchaser");
    // Default signature block text (Natalia 2026-07-09)
    expect(container.textContent).toContain("agreement to purchase the Display System as described herein");
    expect(container.textContent).toContain("Payment is due within thirty (30) days");
  });

  it("CHANGE_ORDER mode includes signature block and agreement text by default", () => {
    const props = baseProps({
      documentMode: "CHANGE_ORDER",
      showSignatureBlock: true,
      showPaymentTerms: false,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("Agreed To And Accepted");
    expect(container.textContent).toContain("agreement to purchase the Display System as described herein");
  });

  // Natalia 2026-07-09: "CO has to have option to tuggle signature block on off".
  // The field and the template already supported it; the Step4Export toggle only
  // existed on the LOI tab, which a Change Order never lands on.
  it("CHANGE_ORDER honors showSignatureBlock=false", () => {
    const props = baseProps({
      documentMode: "CHANGE_ORDER",
      showSignatureBlock: false,
      showPaymentTerms: false,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).not.toContain("Agreed To And Accepted");
  });
});

// ============================================================================
// CHANGE ORDER INTRO (Natalia 2026-07-09 — "new intro for CO")
// ============================================================================

describe("Change Order intro", () => {
  it("renders Natalia's opening, filling the blanks from project data", () => {
    const props = baseProps({
      documentMode: "CHANGE_ORDER",
      showIntroText: true,
      additionalNotes: "",
      changeOrderNumber: "CO-02",
      changeOrderOriginalAgreementDate: "2026-03-04",
      purchaserLegalName: "Baltimore Ravens LP",
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    const text = container.textContent || "";
    expect(text).toContain("This Change Order No. CO-02 modifies Agreement dated");
    expect(text).toContain("shall be incorporated into and become part of the Original Agreement");
    expect(text).toContain("remain in full force and effect");
    // The pre-2026-07-09 wording must be gone.
    expect(text).not.toContain("amends the existing agreement between");
  });

  it("shows fill-in rules rather than 'undefined' when CO fields are blank", () => {
    const props = baseProps({
      documentMode: "CHANGE_ORDER",
      showIntroText: true,
      additionalNotes: "",
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    const text = container.textContent || "";
    expect(text).toContain("This Change Order No. ___ modifies Agreement dated ________");
    expect(text).not.toMatch(/undefined|NaN/);
  });

  it("a per-deal changeOrderIntroText override still wins", () => {
    const props = baseProps({
      documentMode: "CHANGE_ORDER",
      showIntroText: true,
      additionalNotes: "",
      changeOrderIntroText: "Bespoke opening for this deal.",
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("Bespoke opening for this deal.");
    expect(container.textContent).not.toContain("modifies Agreement dated");
  });
});

describe("Change Order Totals", () => {
  it("renders revised contract totals with tax, optional overhead, previous CO total, and new contract amount", () => {
    const props = baseProps({
      documentMode: "CHANGE_ORDER",
      showSignatureBlock: false,
      showPaymentTerms: false,
      showChangeOrderTotals: true,
      changeOrderOriginalContractAmount: 2000,
      changeOrderPreviousTotalAmount: 500,
      changeOrderOverheadPct: 3.25,
      taxRateOverride: 0.075,
      items: [
        { name: "Added display work", quantity: 2, unitPrice: 500 },
      ],
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("Total Change Order Amount");
    expect(container.textContent).toContain("Original Contract Amount");
    expect(container.textContent).toContain("Previous change order total amount");
    expect(container.textContent).toContain("New Contract Amount");
    expect(container.textContent).toContain("Tax (7.5%)");
    expect(container.textContent).toContain("ANC Overhead (3.25%)");
    expect(container.textContent).toContain("$3,608");
  });

  it("hides the revised totals box when the toggle is off and omits zero overhead", () => {
    const hiddenProps = baseProps({
      documentMode: "CHANGE_ORDER",
      showSignatureBlock: false,
      showPaymentTerms: false,
      showChangeOrderTotals: false,
      items: [{ name: "Added display work", quantity: 1, unitPrice: 100 }],
    });
    const hidden = render(<ProposalTemplate5 {...hiddenProps} />);
    expect(hidden.container.textContent).not.toContain("Revised Contract Totals");

    const zeroOverheadProps = baseProps({
      documentMode: "CHANGE_ORDER",
      showSignatureBlock: false,
      showPaymentTerms: false,
      showChangeOrderTotals: true,
      changeOrderOverheadPct: 0,
      items: [{ name: "Added display work", quantity: 1, unitPrice: 100 }],
    });
    const zeroOverhead = render(<ProposalTemplate5 {...zeroOverheadProps} />);
    expect(zeroOverhead.container.textContent).not.toContain("ANC Overhead");
  });
});

// ============================================================================
// 6. PROJECT SUMMARY (1 test)
// ============================================================================

describe("Project Summary", () => {
  it("shows master table summary when masterTableIndex is set", () => {
    const summaryTable = buildPricingTable(
      "Project Grand Total",
      [
        { description: "LED Display", sellingPrice: 35000 },
        { description: "Installation", sellingPrice: 20000 },
      ],
      55000,
      "table-0-project-grand-total"
    );
    const detailTable = buildPricingTable("LED Display", [
      { description: "LG Panel", sellingPrice: 35000 },
    ], 35000, "table-1-led-display");

    const pricingDocument = buildPricingDocument([summaryTable, detailTable]);

    const props = baseProps({
      documentMode: "LOI",
      pricingDocument,
      mirrorMode: true,
      masterTableIndex: 0,
      showSignatureBlock: false,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    // Master table summary renders "Project Pricing" label
    expect(container.textContent).toContain("Project Pricing");
  });
});

// ============================================================================
// 7. PRICING TABLES COUNT (1 test)
// ============================================================================

describe("Pricing Tables", () => {
  it("renders correct number of pricing table sections from mock data", () => {
    const table1 = buildPricingTable("LED Display", [
      { description: "LG Panel", sellingPrice: 30000 },
    ], 30000, "table-0-led");
    const table2 = buildPricingTable("Installation", [
      { description: "Steel Work", sellingPrice: 12000 },
    ], 12000, "table-1-install");
    const table3 = buildPricingTable("Electrical", [
      { description: "Conduit", sellingPrice: 8000 },
    ], 8000, "table-2-electrical");
    const pricingDocument = buildPricingDocument([table1, table2, table3]);

    const props = baseProps({
      documentMode: "BUDGET",
      pricingDocument,
      mirrorMode: true,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    // All 3 table names should appear as section headers (uppercase)
    expect(container.textContent).toContain("LED DISPLAY");
    expect(container.textContent).toContain("INSTALLATION");
    expect(container.textContent).toContain("ELECTRICAL");
  });
});

// ============================================================================
// 8. ADDITIONAL REGRESSION TESTS (4 tests)
// ============================================================================

describe("Additional Regression", () => {
  it("renders intro text for BUDGET mode with client name", () => {
    const props = baseProps({
      documentMode: "BUDGET",
      showIntroText: true,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("Test Client Corp");
    expect(container.textContent).toContain("budget");
  });

  it("renders LOI legal intro with purchaser name when includeLegalIntro is true", () => {
    const props = baseProps({
      documentMode: "LOI",
      showIntroText: true,
      showSignatureBlock: false,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    // LOI legal intro references both parties
    expect(container.textContent).toContain("Purchaser");
    expect(container.textContent).toContain("ANC Sports Enterprises, LLC");
  });

  it("renders payment terms section when showPaymentTerms is true in LOI", () => {
    const props = baseProps({
      documentMode: "LOI",
      showPaymentTerms: true,
      showSignatureBlock: false,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("Payment Terms");
    // Default terms
    expect(container.textContent).toContain("50% on Deposit");
  });

  it("renders notes section when showNotes is true and additionalNotes provided", () => {
    const props = baseProps({
      documentMode: "BUDGET",
      showNotes: true,
      customProposalNotes: "All prices are valid for 30 days from date of proposal.",
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("Notes");
    expect(container.textContent).toContain("All prices are valid for 30 days");
  });
});

// ============================================================================
// 11. SERVICE CONTRACT (Priority 1) — term-exhibit system
// ============================================================================
describe("Service Contract mode", () => {
  it("renders the verbatim Ravens contract body + General Terms + Parts exhibits", () => {
    const props = baseProps({
      documentMode: "SERVICE_CONTRACT",
      serviceContractTemplateId: "ravens",
      mirrorMode: false,
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    const text = container.textContent || "";
    // Header label
    expect(text).toContain("SERVICE CONTRACT");
    // Verbatim contract body
    expect(text).toContain("AGREEMENT");
    expect(text).toContain("ANC SPORTS ENTERPRISES, LLC");
    expect(text).toContain("ANC’s Responsibilities");
    expect(text).toContain("Purchaser’s Responsibilities");
    expect(text).toContain("Compensation");
    // General Terms exhibit (verbatim, all-caps limitation preserved)
    expect(text).toContain("General Terms");
    expect(text).toContain("THE PROVISIONS OF THE FOREGOING WARRANTIES ARE IN LIEU OF ANY OTHER WARRANTY");
    expect(text).toContain("Intellectual Property");
    expect(text).toContain("Force Majeure");
    // Parts / Exhibit C exhibit (verbatim)
    expect(text).toContain("Parts Replacement Procedures");
    expect(text).toContain("(888) 875-2125");
  });

  it("hides a term exhibit when toggled off via override", () => {
    const props = baseProps({
      documentMode: "SERVICE_CONTRACT",
      serviceContractTemplateId: "ravens",
      mirrorMode: false,
      termExhibitOverrides: { parts: { enabled: false } },
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    const text = container.textContent || "";
    // Parts exhibit hidden
    expect(text).not.toContain("Parts Replacement Procedures");
    expect(text).not.toContain("(888) 875-2125");
    // General Terms still present
    expect(text).toContain("General Terms");
  });

  it("renders a per-instance signature override in place of the template default", () => {
    const props = baseProps({
      documentMode: "SERVICE_CONTRACT",
      serviceContractTemplateId: "ravens",
      mirrorMode: false,
      serviceContractSignatureText: "CUSTOM SIGNATURE OVERRIDE MARKER",
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent).toContain("CUSTOM SIGNATURE OVERRIDE MARKER");
  });
});

// ============================================================================
// 12. FREE-FORM TABLES (Priority 1-tied) — builder-from-scratch pricing
// ============================================================================
describe("Free-form tables", () => {
  it("renders user-built tables in the pricing section", () => {
    const props = baseProps({
      documentMode: "BUDGET",
      mirrorMode: false,
      showFreeformTables: true,
      freeformTables: [
        {
          id: "t1",
          name: "Service Pricing",
          columns: [
            { id: "c1", label: "Item", type: "text" },
            { id: "c2", label: "Price", type: "number" },
          ],
          rows: [
            { id: "r1", cells: { c1: "Labor", c2: "2000" } },
            { id: "r2", cells: { c1: "Parts", c2: "800" } },
          ],
          showTotalsRow: true,
        },
      ],
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    const text = container.textContent || "";
    expect(text).toContain("Service Pricing");
    expect(text).toContain("Labor");
    expect(text).toContain("Parts");
    expect(text).toContain("$2,000.00");
    expect(text).toContain("$800.00");
    expect(text).toContain("Total");
    expect(text).toContain("$2,800.00");
  });

  it("hides free-form tables when showFreeformTables is false", () => {
    const props = baseProps({
      documentMode: "BUDGET",
      mirrorMode: false,
      showFreeformTables: false,
      freeformTables: [
        {
          id: "t1", name: "Hidden", columns: [{ id: "c1", label: "X", type: "text" }],
          rows: [{ id: "r1", cells: { c1: "secret" } }], showTotalsRow: false,
        },
      ],
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    expect(container.textContent || "").not.toContain("Hidden");
    expect(container.textContent || "").not.toContain("secret");
  });
});

// ============================================================================
// 13. SERVICE CONTRACT + FREE-FORM PRICING (the from-scratch loop)
// ============================================================================
describe("Service Contract from-scratch loop", () => {
  it("renders user-built pricing in a Service Contract", () => {
    const props = baseProps({
      documentMode: "SERVICE_CONTRACT",
      serviceContractTemplateId: "ravens",
      mirrorMode: false,
      showFreeformTables: true,
      freeformTables: [
        {
          id: "t1", name: "Annual Service Fee",
          columns: [
            { id: "c1", label: "Year", type: "text" },
            { id: "c2", label: "Fee", type: "number" },
          ],
          rows: [
            { id: "r1", cells: { c1: "2026–2027", c2: "45000" } },
            { id: "r2", cells: { c1: "2027–2028", c2: "51439.33" } },
          ],
          showTotalsRow: false,
        },
      ],
    });
    const { container } = render(<ProposalTemplate5 {...props} />);
    const text = container.textContent || "";
    // Service Contract header + verbatim body still render
    expect(text).toContain("SERVICE CONTRACT");
    expect(text).toContain("ANC SPORTS ENTERPRISES, LLC");
    expect(text).toContain("General Terms");
    // User-built pricing table renders in the contract
    expect(text).toContain("Annual Service Fee");
    expect(text).toContain("2026–2027");
    expect(text).toContain("$45,000.00");
    expect(text).toContain("$51,439.33");
  });
});
