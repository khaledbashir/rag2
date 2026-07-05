import { describe, expect, it } from "vitest";
import {
  buildProposedChanges,
  decideMatch,
  isSourceTextInBody,
  scoreOpportunities,
  significantTokens,
  verifyExtraction,
  type EmailCrmExtraction,
  type EmailCrmInput,
  type OpportunitySearchRow,
} from "./emailToCrmSync";

// Jeremy Riley's actual Camping World Stadium email (2026-07-04) — the
// acceptance case this feature was built around.
const JEREMY_BODY = `Jackson – Attached is the broadcast specification and the bid forms for the CMS / Broadcast upgrades that were added as an addendum to Camping World Stadium. I copied you on the LED request so you can pull any LED specs off that email to Curie. Proposals are due on Monday, July 13th so we would need the quotes by EOB next Friday.

Please review and let me know how I can help get this piece ready for submission.

Thanks!

Jeremy Riley
Vice President | Venue Solutions
M: (682) 203-6463
Jeremy.Riley@anc.com`;

const JEREMY_INPUT: EmailCrmInput = {
  subject: "Camping World Stadium - CMS / Broadcast Pricing",
  fromEmail: "jeremy.riley@anc.com",
  fromName: "Jeremy Riley",
  receivedAt: "2026-07-04T10:32:00.000Z",
  body: JEREMY_BODY,
  attachments: [
    { name: "Attachment_B_-_CWS_Cameras_&_LED_Upgrades_Bid_Form.xlsx" },
    { name: "Exhibit_2_-_CWS_Broadcast_Specifications.pdf" },
    { name: "Exhibit_3_-_CWS25-1541-Broadcast_Single_Lines.pdf" },
  ],
};

const JEREMY_EXTRACTION: EmailCrmExtraction = {
  clientOrVenue: "Camping World Stadium",
  projectName: "CMS / Broadcast Upgrades Addendum",
  summary:
    "CMS/Broadcast upgrade addendum for Camping World Stadium. Broadcast spec and bid forms attached; proposals due July 13, quotes needed internally by EOB Friday July 10.",
  dueDates: [
    {
      label: "Proposal due to client",
      dateIso: "2026-07-13",
      kind: "proposal_due",
      sourceText: "Proposals are due on Monday, July 13th",
    },
    {
      label: "Internal quotes deadline",
      dateIso: "2026-07-10",
      kind: "internal_deadline",
      sourceText: "we would need the quotes by EOB next Friday",
    },
  ],
  keyFacts: [
    {
      fact: "CMS/Broadcast upgrades added as an addendum to Camping World Stadium",
      sourceText: "CMS / Broadcast upgrades that were added as an addendum to Camping World Stadium",
    },
  ],
  people: [{ name: "Jeremy Riley", role: "Vice President | Venue Solutions", email: "jeremy.riley@anc.com" }],
  confidence: 0.9,
};

describe("isSourceTextInBody", () => {
  it("accepts verbatim quotes ignoring case and whitespace", () => {
    expect(isSourceTextInBody("proposals are due on monday, july 13th", JEREMY_BODY)).toBe(true);
  });

  it("rejects paraphrased quotes", () => {
    expect(isSourceTextInBody("The proposal deadline is July 13", JEREMY_BODY)).toBe(false);
  });

  it("rejects trivially short quotes", () => {
    expect(isSourceTextInBody("July", JEREMY_BODY)).toBe(false);
  });
});

describe("verifyExtraction", () => {
  it("marks corroborated dates verified and fabricated ones unverified", () => {
    const withFake: EmailCrmExtraction = {
      ...JEREMY_EXTRACTION,
      dueDates: [
        ...JEREMY_EXTRACTION.dueDates,
        {
          label: "Made-up milestone",
          dateIso: "2026-08-01",
          kind: "other",
          sourceText: "installation begins August 1st",
        },
      ],
    };
    const verified = verifyExtraction(withFake, JEREMY_BODY);
    expect(verified.dueDates[0].verified).toBe(true);
    expect(verified.dueDates[1].verified).toBe(true);
    expect(verified.dueDates[2].verified).toBe(false);
  });

  it("rejects malformed dateIso even with a real quote", () => {
    const bad: EmailCrmExtraction = {
      ...JEREMY_EXTRACTION,
      dueDates: [
        {
          label: "Proposal due",
          dateIso: "July 13th",
          kind: "proposal_due",
          sourceText: "Proposals are due on Monday, July 13th",
        },
      ],
    };
    expect(verifyExtraction(bad, JEREMY_BODY).dueDates[0].verified).toBe(false);
  });
});

describe("significantTokens", () => {
  it("keeps distinctive words and drops stop words", () => {
    expect(significantTokens("Camping World Stadium")).toEqual(["camping", "world"]);
  });
});

const CRM_ROWS: OpportunitySearchRow[] = [
  { id: "a", name: "Camping World Stadium LED Display Upgrades - AJP RFP", stage: "EXISTING_CUSTOMER", proposalDueDate: "2026-07-09T21:00:00.000Z" },
  { id: "b", name: "Camping World INV0008258 Bad Debt", stage: "EXISTING_CUSTOMER" },
  { id: "c", name: "Camping World -- Service Contract 2027-2030", stage: "SALES_LEAD_FORMAL_PROPOSAL" },
  { id: "d", name: "Rocket Arena Ribbon Refresh", stage: "EXISTING_CUSTOMER" },
];

describe("scoreOpportunities + decideMatch", () => {
  it("ranks the Camping World opportunities above unrelated venues", () => {
    const ranked = scoreOpportunities(JEREMY_EXTRACTION, CRM_ROWS);
    expect(ranked.map((r) => r.id)).not.toContain("d");
    expect(ranked[0].score).toBeGreaterThanOrEqual(0.6);
    expect(ranked[0].name).toMatch(/Camping World/);
  });

  it("does not auto-apply when several same-venue opportunities tie", () => {
    const ranked = scoreOpportunities(JEREMY_EXTRACTION, CRM_ROWS);
    const decision = decideMatch(ranked);
    // Multiple Camping World opps score identically on venue tokens —
    // this MUST go to human review, not guess.
    expect(decision.autoApply).toBe(false);
    expect(decision.reason).toMatch(/Ambiguous|below/);
  });

  it("auto-applies when one opportunity is decisively ahead", () => {
    const extraction: EmailCrmExtraction = {
      ...JEREMY_EXTRACTION,
      projectName: "LED Display Upgrades AJP RFP",
    };
    const ranked = scoreOpportunities(extraction, CRM_ROWS);
    expect(ranked[0].id).toBe("a");
    const decision = decideMatch(ranked);
    expect(decision.autoApply).toBe(true);
  });

  it("never auto-applies with zero candidates", () => {
    expect(decideMatch([]).autoApply).toBe(false);
  });
});

describe("buildProposedChanges", () => {
  const verified = verifyExtraction(JEREMY_EXTRACTION, JEREMY_BODY);

  it("proposes the verified proposal-due date with previous value recorded", () => {
    const changes = buildProposedChanges(JEREMY_INPUT, verified, {
      proposalDueDate: "2026-07-09T21:00:00.000Z",
    });
    expect(changes.proposalDueDate).not.toBeNull();
    expect(changes.proposalDueDate!.newValue).toBe("2026-07-13T21:00:00.000Z");
    expect(changes.proposalDueDate!.previousValue).toBe("2026-07-09T21:00:00.000Z");
  });

  it("skips the field update when the CRM already has the same day", () => {
    const changes = buildProposedChanges(JEREMY_INPUT, verified, {
      proposalDueDate: "2026-07-13T21:00:00.000Z",
    });
    expect(changes.proposalDueDate).toBeNull();
  });

  it("never proposes a date update from an unverified extraction", () => {
    const unverified: EmailCrmExtraction = {
      ...JEREMY_EXTRACTION,
      dueDates: JEREMY_EXTRACTION.dueDates.map((d) => ({ ...d, verified: false })),
    };
    const changes = buildProposedChanges(JEREMY_INPUT, unverified, { proposalDueDate: null });
    expect(changes.proposalDueDate).toBeNull();
    expect(changes.noteMarkdown).toContain("Needs confirmation");
  });

  it("writes deadlines, key info, and attachments into the note", () => {
    const changes = buildProposedChanges(JEREMY_INPUT, verified, null);
    expect(changes.noteMarkdown).toContain("July 13, 2026");
    expect(changes.noteMarkdown).toContain("July 10, 2026");
    expect(changes.noteMarkdown).toContain("Attachment_B_-_CWS_Cameras_&_LED_Upgrades_Bid_Form.xlsx");
    expect(changes.noteMarkdown).toContain("Jeremy Riley");
    expect(changes.noteTitle).toContain("Camping World Stadium - CMS / Broadcast Pricing");
  });
});
