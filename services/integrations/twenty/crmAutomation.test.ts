import { describe, expect, it } from "vitest";
import {
  buildArtifactNoteMarkdown,
  buildClientChangeRequestNoteMarkdown,
  buildProposalCreatedNoteMarkdown,
  buildProposalStatusNoteMarkdown,
  buildRfpAnalyzedNoteMarkdown,
} from "./crmAutomation";

describe("Twenty CRM automation note builders", () => {
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
});
