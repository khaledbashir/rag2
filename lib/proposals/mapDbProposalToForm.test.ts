import { describe, expect, it } from "vitest";

import { mapDbProposalToFormSchema } from "./mapDbProposalToForm";

/**
 * Change Order fields have no columns on Project — they round-trip through the
 * documentConfig JSON blob. useAutoSave writes them in; this mapper reads them
 * back. Until 2026-07-09 the write half was missing entirely, so every CO field
 * was silently dropped on reload. These tests pin the read half of that contract.
 */
describe("mapDbProposalToFormSchema — Change Order round-trip via documentConfig", () => {
  const dbProject = {
    id: "cmpoadhm700am1i9xhhwx6qkz",
    clientName: "Baltimore Ravens LP",
    documentMode: "CHANGE_ORDER",
    documentConfig: {
      changeOrderNumber: "CO-02",
      changeOrderRequestedBy: "Krissy",
      changeOrderDate: "2026-07-09",
      changeOrderOriginalContractNumber: "ANC-2026-114",
      changeOrderOriginalAgreementDate: "2026-03-04",
      changeOrderOriginalContractAmount: 250000,
      changeOrderPreviousTotalAmount: 12000,
      changeOrderOverheadPct: 10,
      changeOrderIntroText: "Bespoke opening.",
      showChangeOrderTotals: true,
    },
  };

  it("restores every Change Order field that useAutoSave persists", () => {
    const { details } = mapDbProposalToFormSchema(dbProject) as any;

    expect(details.changeOrderNumber).toBe("CO-02");
    expect(details.changeOrderRequestedBy).toBe("Krissy");
    expect(details.changeOrderDate).toBe("2026-07-09");
    expect(details.changeOrderOriginalContractNumber).toBe("ANC-2026-114");
    expect(details.changeOrderOriginalAgreementDate).toBe("2026-03-04");
    expect(details.changeOrderOriginalContractAmount).toBe(250000);
    expect(details.changeOrderPreviousTotalAmount).toBe(12000);
    expect(details.changeOrderOverheadPct).toBe(10);
    expect(details.changeOrderIntroText).toBe("Bespoke opening.");
    expect(details.showChangeOrderTotals).toBe(true);
  });

  it("yields empty values rather than undefined for a project with no documentConfig", () => {
    const { details } = mapDbProposalToFormSchema({ id: "cmpoadhm700am1i9xhhwx6qkz", clientName: "X", documentMode: "CHANGE_ORDER" }) as any;

    expect(details.changeOrderNumber).toBe("");
    expect(details.changeOrderOriginalAgreementDate).toBe("");
    expect(details.changeOrderOriginalContractAmount).toBe(0);
  });
});

describe("mapDbProposalToFormSchema — manual table workflow", () => {
  it("restores manual tables and keeps calculator sections disabled", () => {
    const result = mapDbProposalToFormSchema({
      id: "manual-project-1",
      clientName: "Manual Proposal",
      mirrorMode: false,
      calculationMode: "INTELLIGENCE",
      documentConfig: {
        manualTableMode: true,
        showPricingTables: true,
        showSpecifications: true,
        showScopeOfWork: true,
        showFreeformTables: true,
        freeformTables: [{
          id: "t1",
          name: "DESCRIPTION OF WORK",
          columns: [{ id: "c1", label: "Description", align: "left" }],
          rows: [{ id: "r1", style: "grand-total", cells: { c1: "GRAND TOTAL £13,920" } }],
        }],
      },
    }) as any;

    expect(result.details.manualTableMode).toBe(true);
    expect(result.details.showPricingTables).toBe(false);
    expect(result.details.showSpecifications).toBe(false);
    expect(result.details.showScopeOfWork).toBe(false);
    expect(result.details.showResponsibilityMatrix).toBe(false);
    expect(result.details.freeformTables[0].rows[0].cells.c1).toBe("GRAND TOTAL £13,920");
  });

  it("migrates a legacy non-mirror proposal into the manual table workflow", () => {
    const result = mapDbProposalToFormSchema({
      id: "legacy-manual-1",
      clientName: "Legacy Manual",
      mirrorMode: false,
      calculationMode: "INTELLIGENCE",
      documentConfig: {},
    }) as any;

    expect(result.details.manualTableMode).toBe(true);
    expect(result.details.showPricingTables).toBe(false);
    expect(result.details.showSpecifications).toBe(false);
    expect(result.details.showResponsibilityMatrix).toBe(false);
  });
});
