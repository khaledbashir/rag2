import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPIENTS,
  briefingRecipients,
  computeWeekWindow,
  findWaitingOnReply,
  isInSendWindow,
  isRealBriefingDocument,
  summarizeThreads,
  type WeekMessage,
} from "@/services/briefing/weeklyBriefing";
import { renderBriefingEmail } from "@/services/briefing/briefingTemplate";

function msg(partial: Partial<WeekMessage>): WeekMessage {
  return {
    subject: "Re: Test",
    counterpart: "someone@anc.com",
    direction: "in",
    at: "2026-07-24T12:00:00Z",
    conversationId: "c1",
    preview: "",
    hasAttachments: false,
    ...partial,
  };
}

describe("briefingRecipients", () => {
  const original = process.env.WEEKLY_BRIEFING_RECIPIENTS;
  afterEach(() => {
    if (original === undefined) delete process.env.WEEKLY_BRIEFING_RECIPIENTS;
    else process.env.WEEKLY_BRIEFING_RECIPIENTS = original;
  });

  it("falls back to the opted-in execs when the env var is unset", () => {
    delete process.env.WEEKLY_BRIEFING_RECIPIENTS;
    expect(briefingRecipients()).toEqual(DEFAULT_RECIPIENTS);
  });

  it("falls back when the env var is set but empty or junk", () => {
    process.env.WEEKLY_BRIEFING_RECIPIENTS = " , ";
    expect(briefingRecipients()).toEqual(DEFAULT_RECIPIENTS);
  });

  it("lets an explicit env list win, normalized", () => {
    process.env.WEEKLY_BRIEFING_RECIPIENTS = " Jireh@ANC.com , joeo@anc.com ";
    expect(briefingRecipients()).toEqual(["jireh@anc.com", "joeo@anc.com"]);
  });
});

describe("isInSendWindow", () => {
  // July = EDT (UTC-4): Sunday 20:xx UTC is 16:xx New York.
  it("passes Sunday 20:30 UTC in July (4:30 PM EDT)", () => {
    expect(isInSendWindow(new Date("2026-08-02T20:30:00Z"))).toBe(true);
  });
  it("rejects Sunday 21:30 UTC in July (5:30 PM EDT — the double-fire twin)", () => {
    expect(isInSendWindow(new Date("2026-08-02T21:30:00Z"))).toBe(false);
  });
  // January = EST (UTC-5): the 21:xx UTC firing is the one that lands at 4 PM.
  it("passes Sunday 21:30 UTC in January (4:30 PM EST)", () => {
    expect(isInSendWindow(new Date("2027-01-03T21:30:00Z"))).toBe(true);
  });
  it("rejects Sunday 20:30 UTC in January (3:30 PM EST)", () => {
    expect(isInSendWindow(new Date("2027-01-03T20:30:00Z"))).toBe(false);
  });
  it("rejects a Monday even at 4 PM ET", () => {
    expect(isInSendWindow(new Date("2026-08-03T20:30:00Z"))).toBe(false);
  });
});

describe("computeWeekWindow", () => {
  it("starts on the most recent Monday (NY) and labels the week", () => {
    const { startIso, label } = computeWeekWindow(new Date("2026-07-26T20:30:00Z"));
    expect(startIso).toBe("2026-07-20T04:00:00Z");
    expect(label).toContain("July 20");
  });
  it("a Sunday-evening run covers Monday through that Sunday", () => {
    const { startIso, endIso } = computeWeekWindow(new Date("2026-08-02T20:30:00Z"));
    expect(startIso).toBe("2026-07-27T04:00:00Z");
    expect(endIso).toBe("2026-08-02T20:30:00.000Z");
  });
});

describe("summarizeThreads", () => {
  it("groups by conversation and sorts by volume", () => {
    const threads = summarizeThreads([
      msg({ conversationId: "a", subject: "Big Deal", at: "2026-07-21T10:00:00Z" }),
      msg({ conversationId: "a", direction: "out", at: "2026-07-21T11:00:00Z" }),
      msg({ conversationId: "a", at: "2026-07-22T09:00:00Z", counterpart: "client@x.com" }),
      msg({ conversationId: "b", subject: "Small" }),
    ]);
    expect(threads[0].subject).toBe("Big Deal");
    expect(threads[0].messages).toBe(3);
    expect(threads[0].lastDirection).toBe("in");
    expect(threads[0].lastFrom).toBe("client@x.com");
    expect(threads[1].messages).toBe(1);
  });
});

describe("findWaitingOnReply", () => {
  it("keeps inbound-last threads, drops answered and noise threads", () => {
    const threads = summarizeThreads([
      msg({ conversationId: "w", subject: "Contract question", counterpart: "joe@anc.com" }),
      msg({ conversationId: "answered", direction: "out", at: "2026-07-25T10:00:00Z" }),
      msg({ conversationId: "auto", subject: "Automatic reply: OOO" }),
      msg({ conversationId: "bot", counterpart: "noreply@vendor.com" }),
      msg({ conversationId: "sign", counterpart: "dse_NA4@docusign.net" }),
    ]);
    const waiting = findWaitingOnReply(threads);
    expect(waiting.map((t) => t.subject)).toEqual(["Contract question"]);
  });
});

describe("isRealBriefingDocument", () => {
  it("drops images, calendar files, and tiny attachments", () => {
    expect(isRealBriefingDocument("logo.png", 500_000)).toBe(false);
    expect(isRealBriefingDocument("invite.ics", 40_000)).toBe(false);
    expect(isRealBriefingDocument("sig.pdf", 8_000)).toBe(false);
    expect(isRealBriefingDocument("Proposal.pdf", 400_000)).toBe(true);
    expect(isRealBriefingDocument("Costs.xlsx", 60_000)).toBe(true);
  });
});

describe("renderBriefingEmail", () => {
  it("renders all sections, escapes HTML, uses no flex/grid", () => {
    const html = renderBriefingEmail({
      recipientName: "jbillings",
      weekLabel: "Week of July 20–26, 2026",
      content: {
        stats: [
          { value: "147", label: "Emails · 80 sent" },
          { value: "46", label: "CRM updates" },
          { value: "$85M", label: "Pipeline touched" },
          { value: "1", label: "Win" },
        ],
        top10: [
          {
            title: "Panthers <LED> RFP",
            amount: "$25.0M",
            tag: "Business Development",
            extraTags: ["Won"],
            bullets: ["Marked WON Friday", "Due date moved to Jul 31"],
          },
        ],
        documents: [{ file: "Scope & Sheet.xlsx", note: "two revisions Fri" }],
        onDeck: [{ item: "Camping World BAFO", when: "TODAY" }],
        waiting: [{ who: "Jeremy", what: "scope sheet (Fri)" }],
      },
    });
    expect(html).toContain("Your Week in Focus");
    expect(html).toContain("Week of July 20–26, 2026");
    expect(html).toContain("Panthers &lt;LED&gt; RFP");
    expect(html).toContain("Scope &amp; Sheet.xlsx");
    expect(html).toContain("Camping World BAFO");
    expect(html).toContain("Jeremy");
    expect(html).toContain("$25.0M");
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html).toContain("Delivered automatically every Sunday at 4:00 PM ET");
  });
});
