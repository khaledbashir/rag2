/**
 * Service Proposal system tests (Natalia 2026-07-14).
 *
 * Covers: intro builder (Ravens/M&T model, visible tokens for unknowns),
 * SERVICE_PROPOSAL document-mode plumbing, and the documentConfig
 * save↔load key alignment that keeps service state (and every other
 * documentConfig-backed field) from being clobbered on save or dropped
 * on reload.
 */
import { describe, it, expect } from "vitest";

import {
  buildServiceProposalIntro,
  cityStateFromAddress,
  numberWord,
} from "@/lib/serviceContracts/serviceProposalIntro";
import {
  resolveDocumentMode,
  getModeConfig,
  getDocumentTypeLabel,
  applyDocumentModeDefaults,
} from "@/lib/documentMode";
import { buildDocumentConfig } from "@/lib/proposals/buildDocumentConfig";
import { mapDbProposalToFormSchema } from "@/lib/proposals/mapDbProposalToForm";
import { matchTeamVenue } from "@/lib/serviceContracts/teamVenues";

describe("buildServiceProposalIntro", () => {
  it("renders the fully-recognized Panthers intro", () => {
    const [p1, p2, p3] = buildServiceProposalIntro({
      purchaserName: "Carolina Panthers",
      purchaserAddress: "800 S Mint St, Charlotte, NC 28202",
      venueName: "Bank of America Stadium",
      venueCity: "Charlotte, North Carolina",
      teamName: "Carolina Panthers",
      league: "NFL",
      termYears: 2,
      termStart: "2026",
      termEnd: "2028",
    });
    expect(p1).toContain("is pleased to submit this service proposal to Carolina Panthers (“Purchaser”)");
    expect(p1).toContain("located at 800 S Mint St, Charlotte, NC 28202");
    expect(p1).toContain("for the Bank of America Stadium LED display network");
    expect(p2).toContain("located in Charlotte, North Carolina");
    expect(p2).toContain("home to the Carolina Panthers NFL franchise");
    expect(p3).toContain("a two (2) year initial term commencing 2026 through 2028");
  });

  it("leaves visible {{tokens}} for unknown values instead of silently wrong prose", () => {
    const [p1, , p3] = buildServiceProposalIntro({});
    expect(p1).toContain("{{purchaserName}}");
    expect(p1).toContain("{{venueName}}");
    expect(p3).toContain("{{termStart}}");
    expect(p3).toContain("{{termYears}}");
  });

  it("omits league prose when the team is unknown", () => {
    const [, p2] = buildServiceProposalIntro({ purchaserName: "Maryland Stadium Authority", venueName: "M&T Bank Stadium" });
    expect(p2).toContain("hosts various professional games and other events");
    expect(p2).not.toContain("franchise");
  });

  it("helpers: cityStateFromAddress + numberWord", () => {
    expect(cityStateFromAddress("800 S Mint St, Charlotte, NC 28202")).toBe("Charlotte, North Carolina");
    expect(cityStateFromAddress("1101 Russell St, Baltimore, MD 21230")).toBe("Baltimore, Maryland");
    expect(cityStateFromAddress(null)).toBeNull();
    expect(numberWord(3)).toBe("three");
    expect(numberWord(10)).toBe("ten");
    expect(numberWord(12)).toBe("12");
  });
});

describe("SERVICE_PROPOSAL document mode", () => {
  it("resolves explicitly and from legacy documentType", () => {
    expect(resolveDocumentMode({ documentMode: "SERVICE_PROPOSAL" })).toBe("SERVICE_PROPOSAL");
    expect(resolveDocumentMode({ documentType: "Service Proposal" })).toBe("SERVICE_PROPOSAL");
  });

  it("has its own header text and filename label", () => {
    expect(getModeConfig("SERVICE_PROPOSAL").headerText).toBe("SERVICE PROPOSAL");
    expect(getDocumentTypeLabel("SERVICE_PROPOSAL")).toBe("Service_Proposal");
  });

  it("defaults: no exhibits, no signatures, no responsibility matrix", () => {
    const base = applyDocumentModeDefaults("SERVICE_PROPOSAL", {});
    expect(base.showSignatureBlock).toBe(false);
    expect(base.showExhibitA).toBe(false);
    expect(base.showResponsibilityMatrix).toBe(false);
    expect(base.showTermsAndConditions).toBe(false);
  });

  it("does not disturb existing mode resolution", () => {
    expect(resolveDocumentMode({ documentMode: "SERVICE_CONTRACT" })).toBe("SERVICE_CONTRACT");
    expect(resolveDocumentMode({ documentMode: "SERVICE_AGREEMENT" })).toBe("SERVICE_CONTRACT");
    expect(resolveDocumentMode({ pricingType: "Hard Quoted" })).toBe("PROPOSAL");
    expect(resolveDocumentMode({})).toBe("BUDGET");
  });
});

describe("documentConfig save ↔ load alignment", () => {
  it("every key buildDocumentConfig writes survives a mapDbProposalToForm round-trip", () => {
    // Simulate a saved details blob with every documentConfig-backed field set.
    const details: Record<string, any> = {
      currency: "USD",
      exchangeRate: 1,
      includePricingBreakdown: true,
      showPricingTables: true,
      showIntroText: true,
      showBaseBidTable: false,
      showSpecifications: false,
      showCompanyFooter: true,
      showPaymentTerms: false,
      showTermsAndConditions: false,
      showSubstantialCompletionDate: false,
      showSignatureBlock: false,
      showExhibitA: false,
      showExhibitB: false,
      showNotes: true,
      showScopeOfWork: false,
      showResponsibilityMatrix: false,
      pageLayout: "portrait-letter",
      manualTableMode: false,
      freeformTables: [{ id: "t1" }],
      showFreeformTables: true,
      changeOrderNumber: "CO-01",
      changeOrderRequestedBy: "N",
      changeOrderDate: "2026-07-14",
      changeOrderOriginalContractNumber: "K-1",
      changeOrderOriginalAgreementDate: "2026-01-01",
      changeOrderOriginalContractAmount: 100,
      changeOrderPreviousTotalAmount: 100,
      changeOrderOverheadPct: 10,
      changeOrderIntroText: "intro",
      showChangeOrderTotals: true,
      serviceContractTemplateId: "ravens",
      serviceContractProjectType: "general-only",
      serviceContractPurchaserName: "Carolina Panthers",
      serviceContractVenueName: "Bank of America Stadium",
      serviceContractPurchaserAddress: "800 S Mint St, Charlotte, NC 28202",
      serviceContractAgreementDate: "July 14, 2026",
      serviceContractTermStart: "2026",
      serviceContractTermEnd: "2028",
      serviceContractSignatureText: "sig",
      termExhibitOverrides: { "general-terms": { enabled: true } },
      serviceProposalIntro: "custom intro",
      servicePricingDocument: { sourceSheet: "26-28 w Break fix", yearLabels: ["26/27"], rows: [], totalRow: null },
    };

    const cfg = buildDocumentConfig(details);
    // Nothing set in details may be dropped by the builder.
    for (const key of Object.keys(details)) {
      expect(cfg, `buildDocumentConfig is missing key "${key}"`).toHaveProperty(key);
      expect((cfg as any)[key]).toEqual(details[key]);
    }

    // And the DB→form mapper must read the service fields back out.
    const form = mapDbProposalToFormSchema({
      id: "cktest1234567890abcdefghi",
      clientName: "Carolina Panthers",
      documentMode: "SERVICE_PROPOSAL",
      documentConfig: cfg,
      screens: [],
    });
    const d = form.details as any;
    expect(d.documentMode).toBe("SERVICE_PROPOSAL");
    expect(d.serviceContractPurchaserName).toBe("Carolina Panthers");
    expect(d.serviceContractVenueName).toBe("Bank of America Stadium");
    expect(d.serviceContractTermStart).toBe("2026");
    expect(d.serviceContractTermEnd).toBe("2028");
    expect(d.serviceContractSignatureText).toBe("sig");
    expect(d.termExhibitOverrides).toEqual({ "general-terms": { enabled: true } });
    expect(d.serviceProposalIntro).toBe("custom intro");
    expect(d.servicePricingDocument?.sourceSheet).toBe("26-28 w Break fix");
    expect(d.freeformTables).toEqual([{ id: "t1" }]);
    expect(d.changeOrderNumber).toBe("CO-01");
  });
});

describe("teamVenues league data", () => {
  it("resolves league for known teams after the per-league restructure", () => {
    expect(matchTeamVenue("Carolina Panthers")?.league).toBe("NFL");
    expect(matchTeamVenue("Boston Celtics")?.league).toBe("NBA");
    expect(matchTeamVenue("New York Yankees")?.league).toBe("MLB");
    expect(matchTeamVenue("Indiana Fever")?.league).toBe("WNBA");
    expect(matchTeamVenue("Some Unknown Org")).toBeNull();
  });
});
