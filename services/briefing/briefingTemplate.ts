/**
 * Email-safe renderer for the weekly "Your Week in Focus" briefing.
 * Table layout + inline styles only — Outlook desktop renders with the Word
 * engine, so no flex/grid/external CSS. Visual language mirrors the live
 * pilot pages (ANC blue, mono section labels, bulleted items).
 */

import type { BriefingContent } from "@/services/briefing/weeklyBriefing";

const BLUE = "#0A52EF";
const CYAN = "#00AEEF";
const INK = "#0A1020";
const MUTED = "#5A6B86";
const FAINT = "#8D9AB5";
const LINE = "#E4EAF4";
const AMBER = "#B97A0A";
const LOGO_URL = "https://proposals.anc.com/ANC_Logo_2023_blue.png";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CRM_OPPORTUNITY_URL = "https://crm.ancsports.net/object/opportunity";

/** Wraps text in a link when there is somewhere real to go, and leaves it as
 *  plain text when there isn't. Outlook ignores an inherited link colour, so
 *  every anchor carries its own colour and underline. */
function maybeLink(text: string, href: string | undefined, color: string): string {
  const safeText = esc(text);
  if (!href) return safeText;
  return `<a href="${esc(href)}" style="color:${color};text-decoration:underline;">${safeText}</a>`;
}

function opportunityHref(recordId?: string): string | undefined {
  return recordId ? `${CRM_OPPORTUNITY_URL}/${encodeURIComponent(recordId)}` : undefined;
}

function sectionLabel(text: string): string {
  return `<tr><td style="padding:26px 36px 10px;">
    <div style="font-family:Consolas,Menlo,monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${LINE};padding-bottom:10px;">${esc(text)}</div>
  </td></tr>`;
}

/** CRM stage values arrive as raw enum tokens (RFP_RECEIVED, VERBAL_AGREEMENT).
 *  Executives read this email — no internal token shapes reach the page. */
export function humanizeTag(text: string): string {
  if (!/_/.test(text) || text !== text.toUpperCase()) return text;
  return text
    .split("_")
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Same treatment applied inside free text, so raw enums can't reach the AI
 *  ranker and get echoed into a bullet ("Proposal stage moved to
 *  DESIGN_CREATIVE."). Safe on prose — it only touches SCREAMING_SNAKE runs. */
export function humanizeEnums(text: string): string {
  return text.replace(/[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+/g, (m) => humanizeTag(m));
}

function tagPill(raw: string, kind: "bd" | "org" | "extra"): string {
  const text = humanizeTag(raw);
  const styles =
    kind === "bd"
      ? `background:#EAF0FE;border:1px solid #C3D4FB;color:${BLUE};`
      : kind === "org"
        ? `background:#EFF2F7;border:1px solid ${LINE};color:${MUTED};`
        : `background:#FFFFFF;border:1px solid ${LINE};color:${MUTED};`;
  return `<span style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:3px 9px;border-radius:99px;margin-right:5px;${styles}">${esc(text)}</span>`;
}

export function renderBriefingEmail(input: {
  recipientName: string;
  weekLabel: string;
  content: BriefingContent;
}): string {
  const { content } = input;

  const statCells = content.stats
    .slice(0, 4)
    .map(
      (s, i) => `<td width="25%" style="padding:14px 8px;text-align:center;${i < 3 ? `border-right:1px solid ${LINE};` : ""}">
        <div style="font-family:Arial,sans-serif;font-size:21px;font-weight:700;color:${BLUE};">${esc(s.value)}</div>
        <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${FAINT};padding-top:2px;">${esc(s.label)}</div>
      </td>`,
    )
    .join("");

  const items = content.top10
    .map((item, index) => {
      const bullets = item.bullets
        .map(
          (b) => `<tr>
            <td valign="top" style="width:14px;padding:3px 0 0;"><span style="display:inline-block;width:5px;height:5px;border-radius:99px;background:${CYAN};margin-top:6px;"></span></td>
            <td style="font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:${MUTED};padding:2px 0;">${esc(b)}</td>
          </tr>`,
        )
        .join("");
      const amount = item.amount
        ? ` <span style="font-family:Consolas,Menlo,monospace;font-size:12.5px;color:${BLUE};">${esc(item.amount)}</span>`
        : "";
      const tags =
        tagPill(item.tag, item.tag === "Business Development" ? "bd" : "org") +
        (item.extraTags || []).map((t) => tagPill(t, "extra")).join("");
      return `<tr><td style="padding:0 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${LINE};">
          <tr>
            <td valign="top" style="width:26px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:${FAINT};padding:14px 0;">${index + 1}</td>
            <td style="padding:14px 0;">
              <div style="font-family:Arial,sans-serif;font-size:14.5px;font-weight:700;color:${INK};line-height:20px;">${maybeLink(item.title, opportunityHref(item.recordId), INK)}${amount}</div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px;">${bullets}</table>
              <div style="padding-top:8px;">${tags}</div>
            </td>
          </tr>
        </table>
      </td></tr>`;
    })
    .join("");

  const documents = content.documents
    .map(
      (d) => `<tr><td style="padding:0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${LINE};">
        <tr>
          <td style="font-family:Consolas,Menlo,monospace;font-size:12px;color:${INK};padding:9px 0;">${esc(d.file)}</td>
          <td align="right" style="font-family:Arial,sans-serif;font-size:12px;color:${FAINT};padding:9px 0;white-space:nowrap;">${esc(d.note)}</td>
        </tr>
      </table>
    </td></tr>`,
    )
    .join("");

  const onDeck = content.onDeck
    .map(
      (o) => `<tr><td style="padding:0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${LINE};">
        <tr>
          <td style="font-family:Arial,sans-serif;font-size:13.5px;color:${INK};padding:10px 0;">${maybeLink(o.item, opportunityHref(o.recordId), INK)}</td>
          <td align="right" style="font-family:Consolas,Menlo,monospace;font-size:12px;color:${AMBER};padding:10px 0;white-space:nowrap;">${esc(o.when)}</td>
        </tr>
      </table>
    </td></tr>`,
    )
    .join("");

  const waiting = content.waiting
    .map((w) => {
      // The name opens a reply to the person it names — this section is a list
      // of replies owed, so the reply is the obvious destination.
      const who = maybeLink(w.who, w.email ? `mailto:${w.email}` : undefined, INK);
      return `<tr><td style="padding:0 36px;">
      <div style="font-family:Arial,sans-serif;font-size:13px;color:${MUTED};padding:9px 0;border-bottom:1px solid ${LINE};">
        <span style="color:${INK};font-weight:700;">${who}</span> — ${esc(w.what)}
      </div>
    </td></tr>`;
    })
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F4F7FC;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FC;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;">
  <tr><td style="padding:30px 36px 22px;border-bottom:1px solid ${LINE};">
    <img src="${LOGO_URL}" alt="ANC" height="28" style="display:block;height:28px;margin-bottom:18px;" />
    <div style="font-family:Consolas,Menlo,monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${BLUE};padding-bottom:8px;">Weekly Briefing &middot; Private</div>
    <div style="font-family:Arial,sans-serif;font-size:24px;font-weight:700;color:${INK};">Your Week in Focus</div>
    <div style="font-family:Arial,sans-serif;font-size:13px;color:${MUTED};padding-top:6px;">${esc(input.weekLabel)} &middot; built from your email, files &amp; CRM activity</div>
  </td></tr>
  <tr><td style="border-bottom:1px solid ${LINE};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${statCells}</tr></table>
  </td></tr>
  ${sectionLabel("Top 10 — Where Your Week Actually Went")}
  ${items}
  ${sectionLabel("Documents in Motion")}
  ${documents}
  ${sectionLabel("Carries Into This Week")}
  ${onDeck}
  ${sectionLabel("Waiting on Your Reply")}
  ${waiting}
  <tr><td style="padding:22px 36px 28px;">
    <div style="font-family:Arial,sans-serif;font-size:11.5px;color:${FAINT};line-height:17px;border-top:1px solid ${LINE};padding-top:16px;">
      Delivered automatically every Sunday at 4:00 PM ET from your Outlook, files and CRM activity for the week.
      Private to you — nobody else receives this view.
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
