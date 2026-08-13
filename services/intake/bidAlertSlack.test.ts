import { describe, expect, it } from "vitest";
import {
  buildBidAlertMessage,
  daysUntil,
  formatDueDate,
  matchChannelByVenue,
  pickBidDueDate,
  resolveChannel,
  venueTokens,
  type BidAlertContext,
} from "./bidAlertSlack";
import type { EmailCrmExtraction } from "./emailToCrmSync";

// Clark Construction's actual BuildingConnected message (2026-08-11), the one
// Jireh forwarded asking for exactly this alert.
const ERP3_EXTRACTION: EmailCrmExtraction = {
  clientOrVenue: "Bank of America Stadium",
  projectName: "Bank of America Stadium Renovation - ERP#3 & ERP#4: LED Videoboards",
  summary: "Clark Construction sent an ERP3 site utilization plan.",
  dueDates: [
    {
      label: "Bid Due",
      dateIso: "2026-08-26",
      kind: "proposal_due",
      sourceText: "Bid Due: August 26, 2026",
      verified: true,
    },
    {
      label: "Drawing distribution",
      dateIso: "2026-08-01",
      kind: "other",
      sourceText: "This drawing will be distributed on 8/1/26.",
      verified: true,
    },
  ],
  keyFacts: [],
  people: [],
  confidence: 0.9,
};

const ERP3_CONTEXT: BidAlertContext = {
  intakeId: "intake_1",
  status: "pending_review",
  input: {
    subject: "ERP3 - Site Utilization Plan - Bank of America Stadium Re...",
    fromEmail: "team@buildingconnected.com",
    fromName: "Matthew Hopkins (Clark Construction Group LLC)",
    body: "Bid Due: August 26, 2026",
    attachments: [{ name: "ERP3 - Site Utilization Plan.pdf" }],
  },
  extraction: ERP3_EXTRACTION,
  decision: {
    autoApply: false,
    reason: "two close matches",
    top: {
      id: "c9a80c91-bbe5-48ec-bdba-c6f2ec19d139",
      name: "Panthers Stadium - Bank of America Stadium LED",
      score: 0.77,
      reasons: [],
    },
  },
};

const AUG_13 = new Date("2026-08-13T12:00:00Z");

describe("bid due date selection", () => {
  it("takes the proposal_due date, not the other dates in the email", () => {
    expect(pickBidDueDate(ERP3_EXTRACTION)?.dateIso).toBe("2026-08-26");
  });

  it("drops a due date whose quote was not found in the email", () => {
    const unverified: EmailCrmExtraction = {
      ...ERP3_EXTRACTION,
      dueDates: [{ ...ERP3_EXTRACTION.dueDates[0], verified: false }],
    };
    expect(pickBidDueDate(unverified)).toBeNull();
  });

  it("returns null when there is no extraction at all", () => {
    expect(pickBidDueDate(null)).toBeNull();
  });
});

describe("date presentation", () => {
  it("writes the date the way the invitation writes it", () => {
    expect(formatDueDate("2026-08-26")).toBe("August 26, 2026");
  });

  it("counts whole days to the due date", () => {
    expect(daysUntil("2026-08-26", AUG_13)).toBe(13);
    expect(daysUntil("2026-08-13", AUG_13)).toBe(0);
    expect(daysUntil("2026-08-11", AUG_13)).toBe(-2);
  });
});

describe("channel routing", () => {
  it("uses the default channel when no map is set", () => {
    expect(
      resolveChannel(ERP3_EXTRACTION, { EMAIL_CRM_SLACK_CHANNEL: "C_DEFAULT" } as NodeJS.ProcessEnv),
    ).toBe("C_DEFAULT");
  });

  it("routes to a project channel when a keyword matches the venue", () => {
    expect(
      resolveChannel(ERP3_EXTRACTION, {
        EMAIL_CRM_SLACK_CHANNEL: "C_DEFAULT",
        EMAIL_CRM_SLACK_CHANNEL_MAP: '{"bank of america":"C_BOFA"}',
      } as NodeJS.ProcessEnv),
    ).toBe("C_BOFA");
  });

  it("prefers the most specific matching keyword", () => {
    expect(
      resolveChannel(ERP3_EXTRACTION, {
        EMAIL_CRM_SLACK_CHANNEL: "C_DEFAULT",
        EMAIL_CRM_SLACK_CHANNEL_MAP:
          '{"bank":"C_BROAD","bank of america stadium":"C_EXACT"}',
      } as NodeJS.ProcessEnv),
    ).toBe("C_EXACT");
  });

  it("falls back to the default channel when the map is unparseable", () => {
    expect(
      resolveChannel(ERP3_EXTRACTION, {
        EMAIL_CRM_SLACK_CHANNEL: "C_DEFAULT",
        EMAIL_CRM_SLACK_CHANNEL_MAP: "{not json",
      } as NodeJS.ProcessEnv),
    ).toBe("C_DEFAULT");
  });

  it("returns null when nothing is configured, so posting is a no-op", () => {
    expect(resolveChannel(ERP3_EXTRACTION, {} as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("pursuit-channel matching", () => {
  // Real names from the ANC workspace, plus near-misses that must not match.
  const CHANNELS = [
    { id: "C_BOFA", name: "sales-bank-of-america-stadium-carolina-panthers", is_member: false },
    { id: "C_REDSOX", name: "account-boston-redsox", is_member: true },
    { id: "C_AMERICA_FIRST", name: "sales-america-first-field", is_member: true },
    { id: "C_ANNOUNCE", name: "announcements", is_member: true },
  ];

  it("finds the pursuit channel from the venue name alone", () => {
    expect(matchChannelByVenue("Bank of America Stadium", CHANNELS)?.id).toBe("C_BOFA");
  });

  it("does not match a channel that only shares a generic word", () => {
    expect(matchChannelByVenue("Gillette Stadium", CHANNELS)).toBeNull();
  });

  it("requires every identifying word, so America First is not Bank of America", () => {
    expect(matchChannelByVenue("America First Field", CHANNELS)?.id).toBe("C_AMERICA_FIRST");
  });

  it("drops stadium-type words that would match half the workspace", () => {
    expect(venueTokens("Bank of America Stadium")).toEqual(["bank", "america"]);
  });

  it("prefers a channel the bot has already joined", () => {
    const both = [
      { id: "C_OLD", name: "sales-boston-redsox-archive", is_member: false },
      { id: "C_LIVE", name: "sales-boston-redsox-2026", is_member: true },
    ];
    expect(matchChannelByVenue("Boston Redsox", both)?.id).toBe("C_LIVE");
  });

  it("returns nothing when the venue has no identifying words left", () => {
    expect(matchChannelByVenue("The Stadium", CHANNELS)).toBeNull();
  });
});

describe("message content", () => {
  const flat = (ctx: BidAlertContext) =>
    JSON.stringify(buildBidAlertMessage(ctx, AUG_13).blocks);

  it("leads with the bid date and the countdown", () => {
    const { text } = buildBidAlertMessage(ERP3_CONTEXT, AUG_13);
    expect(text).toBe("Bid due August 26, 2026 (in 13 days) — Bank of America Stadium");
  });

  it("carries project, sender, attachment and the verbatim quote", () => {
    const body = flat(ERP3_CONTEXT);
    expect(body).toContain("ERP#3 & ERP#4: LED Videoboards");
    expect(body).toContain("Matthew Hopkins");
    expect(body).toContain("ERP3 - Site Utilization Plan.pdf");
    expect(body).toContain("Bid Due: August 26, 2026");
  });

  it("says a human has to confirm the deal when the match was ambiguous", () => {
    const body = flat(ERP3_CONTEXT);
    expect(body).toContain("Panthers Stadium - Bank of America Stadium LED");
    expect(body).toContain("/admin/email-to-crm");
    expect(body).not.toContain("/object/opportunity/");
  });

  it("links the opportunity once the intake applied to it", () => {
    const body = flat({
      ...ERP3_CONTEXT,
      status: "applied",
      opportunityId: "c9a80c91-bbe5-48ec-bdba-c6f2ec19d139",
      opportunityName: "Panthers Stadium - Bank of America Stadium LED",
    });
    expect(body).toContain(
      "https://crm.ancsports.net/object/opportunity/c9a80c91-bbe5-48ec-bdba-c6f2ec19d139",
    );
  });

  it("still alerts when the email could not be read", () => {
    const { text, blocks } = buildBidAlertMessage(
      {
        intakeId: "intake_2",
        status: "failed",
        input: { subject: "ERP4 addendum", body: "..." },
        extraction: null,
        decision: null,
      },
      AUG_13,
    );
    expect(text).toContain("New bid email");
    expect(JSON.stringify(blocks)).toContain("review queue");
  });

  it("marks a date that has already passed rather than counting up", () => {
    const past: BidAlertContext = {
      ...ERP3_CONTEXT,
      extraction: {
        ...ERP3_EXTRACTION,
        dueDates: [{ ...ERP3_EXTRACTION.dueDates[0], dateIso: "2026-08-11" }],
      },
    };
    expect(buildBidAlertMessage(past, AUG_13).text).toContain("(2 days ago)");
  });
});
