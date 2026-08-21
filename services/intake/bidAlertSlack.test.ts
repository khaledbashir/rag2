import { describe, expect, it } from "vitest";
import {
  buildBidAlertMessage,
  coreVenueName,
  daysUntil,
  describeDueDateMove,
  formatDueDate,
  looksBidRelated,
  clearChannelCache,
  isPursuitChannel,
  listSlackChannels,
  matchChannelByVenue,
  matchChannelForBid,
  pickBidDueDate,
  safeFallbackChannel,
  resolveChannel,
  venueCandidates,
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

// Jireh 2026-08-20, after seeing the first live alert: "Yes definitely flag
// due dates". A date that MOVED is the signal; a date that merely exists is
// already covered above.
describe("due date moves", () => {
  const movedContext = (previous: string | null, next: string): BidAlertContext => ({
    ...ERP3_CONTEXT,
    extraction: {
      ...ERP3_EXTRACTION,
      dueDates: [
        {
          label: "Bid Due",
          dateIso: next,
          kind: "proposal_due",
          sourceText: `Bid Due: ${next}`,
          verified: true,
        },
      ],
    },
    decision: {
      ...ERP3_CONTEXT.decision!,
      top: { ...ERP3_CONTEXT.decision!.top!, proposalDueDate: previous },
    },
  });

  it("says nothing about a move when the opportunity had no date", () => {
    expect(describeDueDateMove(null, "2026-08-27")).toBeNull();
    expect(describeDueDateMove(undefined, "2026-08-27")).toBeNull();
  });

  it("says nothing when the date is unchanged, even across the stored 21:00Z time", () => {
    expect(describeDueDateMove("2026-08-27T21:00:00.000Z", "2026-08-27")).toBeNull();
  });

  it("reports a date pulled forward as earlier", () => {
    expect(describeDueDateMove("2026-09-04T21:00:00.000Z", "2026-08-27")).toEqual({
      previousIso: "2026-09-04",
      days: 8,
      direction: "earlier",
    });
  });

  it("reports a date pushed back as later", () => {
    expect(describeDueDateMove("2026-08-20T21:00:00.000Z", "2026-08-27")).toEqual({
      previousIso: "2026-08-20",
      days: 7,
      direction: "later",
    });
  });

  it("counts whole days across a month boundary without drifting", () => {
    expect(describeDueDateMove("2026-07-31T21:00:00.000Z", "2026-08-01")?.days).toBe(1);
  });

  it("ignores a previous value that is not a date", () => {
    expect(describeDueDateMove("not-a-date", "2026-08-27")).toBeNull();
  });

  it("leads the headline with the movement, not the date", () => {
    const { text } = buildBidAlertMessage(movedContext("2026-09-04T21:00:00.000Z", "2026-08-27"), new Date("2026-08-20T00:00:00Z"));
    expect(text).toContain("Bid date moved 8 days earlier");
    expect(text).toContain("now August 27, 2026");
  });

  it("uses the singular for a one-day move", () => {
    const { text } = buildBidAlertMessage(movedContext("2026-08-26T21:00:00.000Z", "2026-08-27"), new Date("2026-08-20T00:00:00Z"));
    expect(text).toContain("moved 1 day later");
  });

  it("strikes through the old date beside the new one", () => {
    const { blocks } = buildBidAlertMessage(movedContext("2026-09-04T21:00:00.000Z", "2026-08-27"), new Date("2026-08-20T00:00:00Z"));
    const fields = blocks.flatMap((b: any) => b.fields || []);
    const dueField = fields.find((f: any) => f.text.startsWith("*Bid due*"));
    expect(dueField.text).toContain("August 27, 2026");
    expect(dueField.text).toContain("~September 4, 2026~");
  });

  it("keeps the plain headline when there is no previous date", () => {
    const { text } = buildBidAlertMessage(movedContext(null, "2026-08-27"), new Date("2026-08-20T00:00:00Z"));
    expect(text).toContain("Bid due August 27, 2026");
    expect(text).not.toContain("moved");
  });
});

// Jireh 2026-08-20: "for new opportunities that have new Slack channels, how do
// we go about that cadence?" — the answer is only "name it after the venue and
// add the bot" if the venue we route on is actually the venue.
describe("venue used for routing", () => {
  const OKC_CHANNELS = [
    { id: "C_OKC", name: "sales-oklahoma-city-thunder-new-arena-rfp", is_member: true },
    { id: "C_BOFA", name: "sales-bank-of-america-stadium-carolina-panthers", is_member: true },
  ];
  const OKC_RAW =
    "Oklahoma City New Arena (Owner: City of Oklahoma City / Oklahoma City Public Property Authority; CM: Flintco/Mortenson)";

  it("separates the venue from the ownership chain", () => {
    expect(coreVenueName(OKC_RAW)).toBe("Oklahoma City New Arena");
  });

  it("leaves a clean venue untouched", () => {
    expect(coreVenueName("Bank of America Stadium")).toBe("Bank of America Stadium");
  });

  it("handles the un-bracketed form", () => {
    expect(coreVenueName("Levi's Stadium - CM: Turner Construction")).toBe("Levi's Stadium");
  });

  it("never returns empty, however odd the input", () => {
    expect(coreVenueName("(Owner: someone)")).toBe("(Owner: someone)");
  });

  it("the raw venue misses its own channel — this is the bug", () => {
    expect(matchChannelByVenue(OKC_RAW, OKC_CHANNELS)).toBeNull();
  });

  it("the cleaned venue reaches it", () => {
    expect(matchChannelByVenue(coreVenueName(OKC_RAW), OKC_CHANNELS)?.id).toBe("C_OKC");
  });

  it("and still cannot stray into another venue's channel", () => {
    expect(matchChannelByVenue(coreVenueName(OKC_RAW), [OKC_CHANNELS[1]])).toBeNull();
  });

  it("the headline reads as the venue, not the paperwork", () => {
    const { text } = buildBidAlertMessage(
      { ...ERP3_CONTEXT, extraction: { ...ERP3_EXTRACTION, clientOrVenue: OKC_RAW } },
      new Date("2026-08-20T00:00:00Z"),
    );
    expect(text).toContain("Oklahoma City New Arena");
    expect(text).not.toContain("Flintco");
  });
});

// Jireh flagged this one in Slack (2026-08-20) with "This looks like an error":
// a Dyson & Womack invoice posted as a bid against a URI courtside deal.
const INVOICE_EXTRACTION: EmailCrmExtraction = {
  clientOrVenue: "Dyson & Womack",
  projectName: "OBM",
  summary:
    "Dyson & Womack billing confirms payment received for invoice #1587 ($11,600) from ANC for the OBM project.",
  dueDates: [
    {
      label: "Invoice #1587 payment due",
      dateIso: "2026-07-30",
      kind: "other",
      sourceText: "the remittance for invoice #1587 in the amount of $11,600, which was due on July 30th",
      verified: true,
    },
  ],
  keyFacts: [],
  people: [],
  confidence: 0.9,
};

describe("bid-relatedness gate", () => {
  it("stays silent on the Dyson & Womack invoice Jireh flagged", () => {
    expect(
      looksBidRelated({
        input: { subject: "Re: Invoice #1587 for OBM", body: "..." },
        extraction: INVOICE_EXTRACTION,
      }),
    ).toBe(false);
  });

  it("still alerts a real bid email", () => {
    expect(looksBidRelated(ERP3_CONTEXT)).toBe(true);
  });

  it("alerts on a proposal_due date even when the subject says nothing", () => {
    expect(
      looksBidRelated({
        input: { subject: "Re: following up", body: "..." },
        extraction: ERP3_EXTRACTION,
      }),
    ).toBe(true);
  });

  it("alerts on an addendum that quotes no new date", () => {
    expect(
      looksBidRelated({
        input: { subject: "ERP4 addendum 2", body: "..." },
        extraction: { ...INVOICE_EXTRACTION, dueDates: [] },
      }),
    ).toBe(true);
  });

  it("falls back to the subject when the email could not be read", () => {
    expect(looksBidRelated({ input: { subject: "ERP4 addendum", body: "" }, extraction: null })).toBe(
      true,
    );
    expect(
      looksBidRelated({ input: { subject: "Re: Invoice #1587 for OBM", body: "" }, extraction: null }),
    ).toBe(false);
  });

  it("does not match bid words hiding inside other words", () => {
    for (const subject of ["Forbidden resource on the portal", "Wilson field walkthrough"]) {
      expect(looksBidRelated({ input: { subject, body: "" }, extraction: null })).toBe(false);
    }
  });
});

// The three defects behind Jireh's 2026-08-21 report — "we need to get these
// alerts fixed so they aren't going to the incorrect channels". All three are
// keyed to the two records that were actually in the intake table, quoted
// verbatim, not to an invented shape of them.
describe("the Oklahoma City misroute", () => {
  // EmailCrmIntake cmt3b0ng4003q2spgns2armfe, 2026-08-21 18:50 UTC. Note the
  // shape: the owning authority leads and the venue is the parenthetical — the
  // exact inverse of the example the previous fix was written against.
  const OKC: EmailCrmExtraction = {
    clientOrVenue:
      "City of Oklahoma City / Oklahoma City Public Property Authority (Oklahoma City New Arena)",
    projectName: "Oklahoma City New Arena: Bid Package #5: Scoreboards and LED Boards (OKCNBA)",
    summary: "Mortenson issued the RFC log for Bid Package #5.",
    dueDates: [
      {
        label: "Bid Due",
        dateIso: "2026-08-27",
        kind: "proposal_due",
        sourceText: "Bid Due: August 27, 2026",
        verified: true,
      },
    ],
    keyFacts: [],
    people: [],
    confidence: 0.9,
  };

  // The live ANC workspace, trimmed to the channels that can plausibly collide.
  const WORKSPACE = [
    { id: "C_OKC", name: "sales-oklahoma-city-thunder-new-arena-rfp", is_member: true },
    { id: "C_BOFA", name: "sales-bank-of-america-stadium-carolina-panthers", is_member: true },
    { id: "C_TEMPLE", name: "account-temple", is_member: true },
    { id: "C_NY", name: "anc-nyoffice", is_member: true },
    { id: "C_CELEB", name: "anc-celebrate-success", is_member: true },
    { id: "C_ANNOUNCE", name: "announcements", is_member: true },
  ];

  it("keeps the venue when the parentheses are where the venue is", () => {
    expect(coreVenueName(OKC.clientOrVenue)).toBe("Oklahoma City New Arena");
  });

  it("still drops the parentheses when they hold the paperwork", () => {
    expect(
      coreVenueName("Oklahoma City New Arena (Owner: City of Oklahoma City; CM: Mortenson)"),
    ).toBe("Oklahoma City New Arena");
  });

  it("keeps the outer name when the parenthetical is a team, not a place", () => {
    expect(coreVenueName("Bank of America Stadium (Carolina Panthers)")).toBe(
      "Bank of America Stadium",
    );
  });

  it("tries the owner chain too, and carries on past it", () => {
    const candidates = venueCandidates(OKC);
    const ownerChain = candidates.find((c) => c.includes("authority"));
    expect(ownerChain).toBeDefined();
    expect(matchChannelByVenue(ownerChain!, WORKSPACE)).toBeNull();

    // Most identifying words first, and the arena is still on the list.
    expect(candidates).toContain("oklahoma city new");
    expect(candidates.map((c) => c.split(" ").length)).toEqual(
      [...candidates.map((c) => c.split(" ").length)].sort((a, b) => b - a),
    );
  });

  it("reaches the Thunder arena channel — the alert Jireh saw in the wrong room", () => {
    expect(matchChannelForBid(OKC, WORKSPACE)?.id).toBe("C_OKC");
  });

  it("does not stray into another pursuit when its own channel does not exist", () => {
    const withoutOkc = WORKSPACE.filter((c) => c.id !== "C_OKC");
    expect(matchChannelForBid(OKC, withoutOkc)).toBeNull();
  });

  it("reads the venue out of the project name when the venue field has only the owner", () => {
    const ownerOnly: EmailCrmExtraction = {
      ...OKC,
      clientOrVenue: "City of Oklahoma City / Oklahoma City Public Property Authority",
    };
    expect(matchChannelForBid(ownerOnly, WORKSPACE)?.id).toBe("C_OKC");
  });

  it("the headline names the arena, not the property authority", () => {
    const { text } = buildBidAlertMessage(
      { ...ERP3_CONTEXT, extraction: OKC },
      new Date("2026-08-21T18:50:00Z"),
    );
    expect(text).toContain("Oklahoma City New Arena");
    expect(text).not.toContain("Property Authority");
  });
});

describe("a single-word venue only routes when the word names one channel", () => {
  const WORKSPACE = [
    { id: "C_TEMPLE", name: "account-temple", is_member: true },
    { id: "C_NY", name: "anc-nyoffice", is_member: true },
    { id: "C_CELEB", name: "anc-celebrate-success", is_member: true },
    { id: "C_GTOWN", name: "sales-georgetown", is_member: true },
  ];

  it("routes Temple, because exactly one channel is named for it", () => {
    expect(matchChannelByVenue("Temple", WORKSPACE)?.id).toBe("C_TEMPLE");
  });

  it("routes Georgetown the same way", () => {
    expect(matchChannelByVenue("Georgetown University", WORKSPACE)?.id).toBe("C_GTOWN");
  });

  it("refuses ANC rather than posting a bid into the office channel", () => {
    expect(matchChannelByVenue("ANC", WORKSPACE)).toBeNull();
  });

  it("still allows two identifying words to pick between several channels", () => {
    const both = [
      { id: "C_OLD", name: "sales-boston-redsox-archive", is_member: false },
      { id: "C_LIVE", name: "sales-boston-redsox-2026", is_member: true },
    ];
    expect(matchChannelByVenue("Boston Redsox", both)?.id).toBe("C_LIVE");
  });
});

describe("the catch-all has to be venue-neutral", () => {
  const CHANNELS = [
    { id: "C_BOFA", name: "sales-bank-of-america-stadium-carolina-panthers", is_member: true },
    { id: "C_ALERTS", name: "anc-bid-alerts", is_member: true },
  ];

  it("recognises the pursuit-channel convention", () => {
    expect(isPursuitChannel("sales-bank-of-america-stadium-carolina-panthers")).toBe(true);
    expect(isPursuitChannel("account-temple")).toBe(false);
    expect(isPursuitChannel("anc-bid-alerts")).toBe(false);
  });

  it("refuses to use one pursuit's channel as the home for every other bid", () => {
    expect(safeFallbackChannel("C_BOFA", CHANNELS)).toBeNull();
  });

  it("accepts a neutral channel", () => {
    expect(safeFallbackChannel("C_ALERTS", CHANNELS)).toBe("C_ALERTS");
  });

  it("leaves an unconfigured catch-all alone", () => {
    expect(safeFallbackChannel(null, CHANNELS)).toBeNull();
  });
});

// Slack applies the `types` filter after paging, so asking for both kinds at
// once returns pages of about five instead of two hundred. Against the live
// workspace the combined query had not finished after 40 pages while
// public-only completed in 3 — so the old 12-page cap saw ~46 channels and not
// one of the 21 sales-* pursuit channels was among them.
describe("listing every channel, not the first page of a filtered stream", () => {
  const page = (channels: Array<{ id: string; name: string }>, cursor = "") => ({
    ok: true,
    channels,
    response_metadata: { next_cursor: cursor },
  });

  it("pages each type separately and merges them", async () => {
    const asked: string[] = [];
    const responses: Record<string, unknown[]> = {
      public_channel: [
        page([{ id: "C1", name: "sales-a" }], "cur1"),
        page([{ id: "C2", name: "sales-oklahoma-city-thunder-new-arena-rfp" }]),
      ],
      private_channel: [page([{ id: "C3", name: "sales-private" }])],
    };
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      const type = url.includes("types=private_channel") ? "private_channel" : "public_channel";
      asked.push(url);
      return { json: async () => (responses[type] as unknown[]).shift() };
    }) as unknown as typeof fetch;

    try {
      clearChannelCache();
      const channels = await listSlackChannels("xoxb-test", 1_000_000);
      expect(channels.map((c) => c.id)).toEqual(["C1", "C2", "C3"]);
    } finally {
      globalThis.fetch = original;
      clearChannelCache();
    }

    // Never the combined query that truncated the list.
    expect(asked.every((u) => !u.includes("public_channel,private_channel"))).toBe(true);
    expect(asked.filter((u) => u.includes("types=public_channel")).length).toBe(2);
    expect(asked.some((u) => u.includes("cursor=cur1"))).toBe(true);
  });

  it("keeps what one type returned when the other errors", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) =>
      url.includes("types=private_channel")
        ? { json: async () => ({ ok: false, error: "missing_scope" }) }
        : { json: async () => page([{ id: "C1", name: "sales-a" }]) }) as unknown as typeof fetch;

    try {
      clearChannelCache();
      expect((await listSlackChannels("xoxb-test", 2_000_000)).map((c) => c.id)).toEqual(["C1"]);
    } finally {
      globalThis.fetch = original;
      clearChannelCache();
    }
  });
});
