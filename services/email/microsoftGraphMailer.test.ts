import { afterEach, describe, expect, it } from "vitest";
import {
  buildMicrosoftSendMailPayload,
  DEFAULT_MICROSOFT_MAIL_BCC,
  microsoftMailBccRecipients,
} from "@/services/email/microsoftGraphMailer";

describe("buildMicrosoftSendMailPayload", () => {
  it("normalizes recipients and builds a real sendMail payload", () => {
    expect(
      buildMicrosoftSendMailPayload({
        subject: "Your Week in Focus",
        html: "<strong>Top 10</strong>",
        recipients: [" JoeO@ANC.com ", "joeo@anc.com", "not-an-address"],
      }),
    ).toEqual({
      message: {
        subject: "Your Week in Focus",
        body: { contentType: "HTML", content: "<strong>Top 10</strong>" },
        toRecipients: [{ emailAddress: { address: "joeo@anc.com" } }],
        bccRecipients: [{ emailAddress: { address: "ahmad.basheer@anc.com" } }],
      },
      saveToSentItems: true,
    });
  });

  it("refuses to send without a valid recipient", () => {
    expect(() =>
      buildMicrosoftSendMailPayload({ subject: "Subject", html: "Body", recipients: [" "] }),
    ).toThrow("No email recipients configured");
  });

  it("keeps the audit recipient hidden and deduplicated", () => {
    const payload = buildMicrosoftSendMailPayload({
      subject: "Subject",
      html: "Body",
      recipients: ["ahmad.basheer@anc.com"],
      bccRecipients: ["ahmad.basheer@anc.com"],
    });

    expect(payload.message.toRecipients).toEqual([
      { emailAddress: { address: "ahmad.basheer@anc.com" } },
    ]);
    expect(payload.message.bccRecipients).toEqual([]);
  });
});

describe("microsoftMailBccRecipients", () => {
  const original = process.env.MICROSOFT_MAILER_BCC;

  afterEach(() => {
    if (original === undefined) delete process.env.MICROSOFT_MAILER_BCC;
    else process.env.MICROSOFT_MAILER_BCC = original;
  });

  it("always includes Ahmad and can add configured audit recipients", () => {
    process.env.MICROSOFT_MAILER_BCC = "audit@anc.com, Ahmad.Basheer@ANC.com";
    expect(microsoftMailBccRecipients()).toEqual([
      ...DEFAULT_MICROSOFT_MAIL_BCC,
      "audit@anc.com",
    ]);
  });
});
