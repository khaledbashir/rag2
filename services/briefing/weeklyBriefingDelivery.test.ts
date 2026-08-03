import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMicrosoftGraphMail } = vi.hoisted(() => ({
  sendMicrosoftGraphMail: vi.fn(),
}));

vi.mock("@/services/email/microsoftGraphMailer", () => ({
  sendMicrosoftGraphMail,
}));

import { deliverBriefing } from "@/services/briefing/weeklyBriefing";

describe("deliverBriefing", () => {
  beforeEach(() => {
    sendMicrosoftGraphMail.mockReset();
    sendMicrosoftGraphMail.mockResolvedValue({
      id: "support@anc.com:1",
      provider: "microsoft-graph",
      from: "support@anc.com",
    });
  });

  it("uses normal Microsoft mail transport for the recipient", async () => {
    await deliverBriefing(
      "joeo@anc.com",
      "Your Week in Focus — Week of July 27 – August 2, 2026",
      "<p>Top 10</p>",
    );

    expect(sendMicrosoftGraphMail).toHaveBeenCalledOnce();
    expect(sendMicrosoftGraphMail).toHaveBeenCalledWith({
      subject: "Your Week in Focus — Week of July 27 – August 2, 2026",
      html: "<p>Top 10</p>",
      recipients: ["joeo@anc.com"],
      bccRecipients: ["ahmad.basheer@anc.com"],
    });
  });
});
