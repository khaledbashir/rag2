import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildArtifactNoteMarkdown,
  buildCrmReviewRequiredMessage,
  buildClientChangeRequestNoteMarkdown,
  buildEmailIntakeNoteMarkdown,
  buildProposalCreatedNoteMarkdown,
  buildProposalStatusNoteMarkdown,
  buildRfpAnalyzedNoteMarkdown,
  resolveExistingOpportunityForCrmSync,
} from "./crmAutomation";

describe("Twenty CRM automation note builders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds an RFP analyzed note with core milestones", () => {
    const note = buildRfpAnalyzedNoteMarkdown({
      analysisId: "analysis_123",
      projectName: "Panthers Indoor",
      clientName: "Panthers",
      venue: "Bank of America Stadium",
      filename: "panthers-rfp.pdf",
      screensCount: 12,
      relevantPages: 38,
      processingTimeMs: 42000,
      ledSqFt: 4321,
      createdAt: "2026-04-13T20:00:00.000Z",
    });

    expect(note).toContain("RFP analysis completed");
    expect(note).toContain("Displays identified: 12");
    expect(note).toContain("Estimated LED area: 4,321 sq ft");
    expect(note).toContain("/tools/rfp-analyzer/history/analysis_123");
  });

  it("builds a proposal created note with workspace link", () => {
    const note = buildProposalCreatedNoteMarkdown({
      proposalId: "proposal_123",
      clientName: "Panthers",
      venue: "Bank of America Stadium",
      screenCount: 3,
      analysisId: "analysis_123",
    });

    expect(note).toContain("Proposal workspace created");
    expect(note).toContain("Scope: 3 displays");
    expect(note).toContain("/projects/proposal_123");
  });

  it("builds a client change request note", () => {
    const note = buildClientChangeRequestNoteMarkdown({
      proposalId: "proposal_123",
      requesterName: "Jeremy Riley",
      requesterEmail: "jeremy@example.com",
      count: 2,
      message: "Please add two more ribbon boards.",
    });

    expect(note).toContain("2 change requests");
    expect(note).toContain("Jeremy Riley");
    expect(note).toContain("Please add two more ribbon boards.");
  });

  it("builds a signed status note", () => {
    const note = buildProposalStatusNoteMarkdown({
      proposalId: "proposal_123",
      clientName: "Panthers",
      venue: "Bank of America Stadium",
      status: "SIGNED",
    });

    expect(note).toContain("Proposal signed");
    expect(note).toContain("/projects/proposal_123");
  });

  it("builds an artifact note with direct download links", () => {
    const note = buildArtifactNoteMarkdown({
      summary: "Latest proposal artifacts exported from Proposal Engine.",
      artifacts: [
        {
          label: "Proposal PDF",
          url: "https://proposals.anc.com/api/agent-skill/download-pdf?file=abc.pdf",
          filename: "ANC_Client_PROPOSAL.pdf",
        },
        {
          label: "Scoping workbook",
          url: "https://proposals.anc.com/api/agent-skill/download-excel?file=abc.xlsx",
          filename: "Client_Unified.xlsx",
        },
      ],
      workspaceUrl: "https://proposals.anc.com/projects/proposal_123",
    });

    expect(note).toContain("Latest proposal artifacts exported");
    expect(note).toContain("Proposal PDF");
    expect(note).toContain("download-pdf");
    expect(note).toContain("download-excel");
    expect(note).toContain("Workspace:");
  });

  it("builds an email intake handoff note with follow-up text", () => {
    const intake: any = {
      title: "49ers New LED Signage - Rough Estimate",
      clientName: "San Francisco 49ers",
      venueName: "Levi's Stadium",
      summary: "Inbound email parsed into 3 project areas.",
      estimatorAnswers: {
        displays: [
          { displayName: "Gate F LEDs", quantity: 2, widthFt: 60, heightFt: 10 },
          { displayName: "Ring of Honor Ribbon", quantity: 1, widthFt: 550, heightFt: 8 },
        ],
      },
      aiReview: {
        questions: [{ question: "Can you confirm pixel pitch?", why: "Needed for product selection." }],
        riskFlags: ["Gate F source dimensions need confirmation."],
      },
    };

    const note = buildEmailIntakeNoteMarkdown({
      proposalId: "proposal_123",
      intake,
      followUpEmail: "Hi Kevin,\n\nCan you confirm pixel pitch?",
    });

    expect(note).toContain("Inbound email intake reviewed");
    expect(note).toContain("San Francisco 49ers");
    expect(note).toContain("Scope: 2 display/options");
    expect(note).toContain("Estimated LED area: 5,600 sq ft");
    expect(note).toContain("Suggested client follow-up");
    expect(note).toContain("Can you confirm pixel pitch?");
  });

  it("holds CRM sync for review when no exact account exists", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { companies: { edges: [] } } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveExistingOpportunityForCrmSync({
      action: "rfp_analyzed",
      companyName: "Codex No Create Smoke 20260601",
      venueName: "Smoke Venue",
      dealName: "Codex No Create Smoke 20260601 - RFP",
    });

    expect(result.status).toBe("review_required");
    expect(buildCrmReviewRequiredMessage(result)).toContain("CRM review required");
    const requestBodies = fetchMock.mock.calls.map((call) => String(((call as any[])[1] as RequestInit)?.body || ""));
    expect(requestBodies.join("\n")).not.toContain("createCompany");
    expect(requestBodies.join("\n")).not.toContain("createOpportunity");
  });

  it("matches an existing exact account and opportunity without creating records", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            companies: {
              edges: [{ node: { id: "company_123", name: "ANC Test Account" } }],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            opportunities: {
              edges: [
                {
                  node: {
                    id: "opp_123",
                    name: "ANC Test Account - Arena",
                    companyId: "company_123",
                  },
                },
              ],
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveExistingOpportunityForCrmSync({
      action: "proposal_generated",
      companyName: "ANC Test Account",
      venueName: "Arena",
      dealName: "ANC Test Account - Arena",
    });

    expect(result).toMatchObject({
      status: "matched",
      opportunityId: "opp_123",
      companyId: "company_123",
    });
    const requestBodies = fetchMock.mock.calls.map((call) => String(((call as any[])[1] as RequestInit)?.body || ""));
    expect(requestBodies.join("\n")).not.toContain("createCompany");
    expect(requestBodies.join("\n")).not.toContain("createOpportunity");
  });
});
