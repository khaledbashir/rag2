import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_OBSERVERS,
  DEFAULT_RECIPIENTS,
  briefingDue,
  briefingObservers,
  briefingRecipients,
  briefingSubject,
  computeWeekWindow,
  findWaitingOnReply,
  isInSendWindow,
  scheduledAnchor,
  isRealBriefingDocument,
  summarizeThreads,
  type WeekMessage,
} from "@/services/briefing/weeklyBriefing";
import { humanizeEnums, humanizeTag, renderBriefingEmail } from "@/services/briefing/briefingTemplate";

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

  it("lets an explicit recipient list win, normalized", () => {
    process.env.WEEKLY_BRIEFING_RECIPIENTS = " Jireh@ANC.com , joeo@anc.com ";
    expect(briefingRecipients()).toEqual(["jireh@anc.com", "joeo@anc.com"]);
  });
});

describe("briefingObservers", () => {
  const original = process.env.WEEKLY_BRIEFING_OBSERVERS;
  afterEach(() => {
    if (original === undefined) delete process.env.WEEKLY_BRIEFING_OBSERVERS;
    else process.env.WEEKLY_BRIEFING_OBSERVERS = original;
  });

  it("defaults to the standing observer when unset", () => {
    delete process.env.WEEKLY_BRIEFING_OBSERVERS;
    expect(briefingObservers()).toEqual(DEFAULT_OBSERVERS);
  });

  it("keeps Ahmad and adds configured observers, normalized", () => {
    process.env.WEEKLY_BRIEFING_OBSERVERS = " Audit@ANC.com , joeo@anc.com ";
    expect(briefingObservers()).toEqual([
      "ahmad.basheer@anc.com",
      "audit@anc.com",
      "joeo@anc.com",
    ]);
  });
});

describe("isInSendWindow", () => {
  // July = EDT (UTC-4): Sunday 20:xx UTC is 16:xx New York.
  it("passes Sunday 20:30 UTC in July (4:30 PM EDT)", () => {
    expect(isInSendWindow(new Date("2026-08-02T20:30:00Z"))).toBe(true);
  });
  it("rejects Sunday 21:30 UTC in July (5:30 PM EDT — neighboring hourly check)", () => {
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

describe("scheduledAnchor", () => {
  it("snaps a Sunday 4 PM EDT firing to itself", () => {
    // 2026-08-09 20:00Z is Sunday 4:00 PM EDT.
    expect(scheduledAnchor(new Date("2026-08-09T20:05:00Z")).toISOString()).toBe(
      "2026-08-09T20:00:00.000Z",
    );
  });
  it("walks a mid-week instant back to that week's Sunday 4 PM", () => {
    expect(scheduledAnchor(new Date("2026-08-10T15:02:00Z")).toISOString()).toBe(
      "2026-08-09T20:00:00.000Z",
    );
  });
  it("uses the 21:00Z firing in January, when New York is on EST", () => {
    expect(scheduledAnchor(new Date("2027-01-04T09:00:00Z")).toISOString()).toBe(
      "2027-01-03T21:00:00.000Z",
    );
  });
  it("never returns an anchor in the future", () => {
    // Sunday 3 PM ET belongs to the PREVIOUS week's anchor, not that evening's.
    expect(scheduledAnchor(new Date("2026-08-09T19:00:00Z")).toISOString()).toBe(
      "2026-08-02T20:00:00.000Z",
    );
  });
});

describe("briefingDue", () => {
  it("is due on time, and does not treat the on-time run as a catch-up", () => {
    const due = briefingDue(new Date("2026-08-09T20:30:00Z"));
    expect(due?.lateHours).toBe(0);
    expect(due?.isCatchUp).toBe(false);
  });

  // The incident: cron executed nothing at Sunday 4 PM ET on 2026-08-09, so
  // Jireh got no briefing. The next morning's hourly check must recover it.
  it("recovers the Monday-morning miss for the SAME week", () => {
    const due = briefingDue(new Date("2026-08-10T15:02:00Z"));
    expect(due).not.toBeNull();
    expect(due?.isCatchUp).toBe(true);
    expect(due?.anchor.toISOString()).toBe("2026-08-09T20:00:00.000Z");
    // Anchored, so the recovered edition covers Mon–Sun, not Monday morning.
    expect(computeWeekWindow(due!.anchor).label).toBe("Week of August 3 – 9, 2026");
  });

  it("stops offering a stale week once the grace window closes", () => {
    // Tuesday 4 PM ET — 48 hours after the anchor.
    expect(briefingDue(new Date("2026-08-11T20:00:00Z"))).toBeNull();
  });

  it("stays closed all week, so hourly checks are silent until Sunday", () => {
    for (const iso of [
      "2026-08-12T12:00:00Z",
      "2026-08-13T12:00:00Z",
      "2026-08-14T12:00:00Z",
      "2026-08-15T12:00:00Z",
      "2026-08-09T19:00:00Z", // Sunday 3 PM ET — before the promised hour
    ]) {
      expect(briefingDue(new Date(iso)), iso).toBeNull();
    }
  });
});

describe("briefingSubject", () => {
  it("is identical for the on-time send and a catch-up of the same week", () => {
    const onTime = computeWeekWindow(new Date("2026-08-09T20:00:00Z"));
    const recovered = computeWeekWindow(briefingDue(new Date("2026-08-10T15:02:00Z"))!.anchor);
    expect(briefingSubject(recovered.label)).toBe(briefingSubject(onTime.label));
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
  it("repeats the month when the week straddles two", () => {
    const { label } = computeWeekWindow(new Date("2026-08-02T20:30:00Z"));
    expect(label).toBe("Week of July 27 – August 2, 2026");
  });
  it("omits the repeated month within a single month", () => {
    const { label } = computeWeekWindow(new Date("2026-07-26T20:30:00Z"));
    expect(label).toBe("Week of July 20 – 26, 2026");
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

describe("humanizeTag", () => {
  it("turns raw CRM stage tokens into reader-facing labels", () => {
    expect(humanizeTag("RFP_RECEIVED")).toBe("RFP Received");
    expect(humanizeTag("VERBAL_AGREEMENT")).toBe("Verbal Agreement");
    expect(humanizeTag("DESIGN_CREATIVE")).toBe("Design Creative");
  });
  it("leaves already-readable tags alone", () => {
    expect(humanizeTag("Business Development")).toBe("Business Development");
    expect(humanizeTag("Service Ops")).toBe("Service Ops");
    expect(humanizeTag("LG")).toBe("LG");
    expect(humanizeTag("Won")).toBe("Won");
  });
});

describe("humanizeEnums", () => {
  it("cleans enum tokens inside free text and CRM diffs", () => {
    expect(humanizeEnums("Proposal stage moved to DESIGN_CREATIVE.")).toBe(
      "Proposal stage moved to Design Creative.",
    );
    expect(humanizeEnums('{"bidStatus":{"after":"VERBAL_AGREEMENT"}}')).toBe(
      '{"bidStatus":{"after":"Verbal Agreement"}}',
    );
  });
  it("leaves ordinary prose and single words untouched", () => {
    expect(humanizeEnums("Due Aug 5; ANC sent the RFP response.")).toBe(
      "Due Aug 5; ANC sent the RFP response.",
    );
  });
});
