/**
 * Slack alerts for inbound bid / proposal email intake (Jireh ask 2026-08-12).
 *
 * Every email the intake engine reads already produces the facts a bid team
 * needs — venue, project, the bid due date with its verbatim quote, the
 * attachments, and the matched CRM opportunity. This posts that as a Slack
 * message the moment it lands, so a BuildingConnected invitation sitting in a
 * shared estimation inbox stops depending on someone noticing the email.
 *
 * Routing, in order:
 *   1. EMAIL_CRM_SLACK_CHANNEL_MAP — explicit venue keyword → channel id, e.g.
 *      {"bank of america":"C09ABCDEF","levi's stadium":"C09GHIJKL"}
 *   2. The workspace's own naming convention. Sales runs one channel per
 *      pursuit — #sales-bank-of-america-stadium-carolina-panthers — so a venue
 *      of "Bank of America Stadium" finds that channel with no config at all,
 *      and every future pursuit routes itself the day someone opens its channel.
 *   3. EMAIL_CRM_SLACK_CHANNEL — the catch-all.
 *
 * The bot posts to any public channel on chat:write.public, but a PRIVATE
 * project channel has to invite it (/invite @anc) before it is even visible to
 * the lookup — until then that venue's alerts land in the catch-all.
 *
 * Unconfigured (no token or no channel) is a silent no-op, and a Slack failure
 * never fails the intake — the CRM write is the product, the alert is a
 * courtesy on top of it.
 */

import { log } from "@/lib/logger";
import type {
  EmailCrmExtraction,
  EmailCrmInput,
  EmailCrmMatchDecision,
} from "@/services/intake/emailToCrmSync";

const CRM_OPPORTUNITY_URL = "https://crm.ancsports.net/object/opportunity";
const REVIEW_QUEUE_URL = "https://proposals.anc.com/admin/email-to-crm";

export interface BidAlertContext {
  intakeId: string;
  status: string; // applied | pending_review | draft_created | failed
  input: EmailCrmInput;
  extraction: EmailCrmExtraction | null;
  decision: EmailCrmMatchDecision | null;
  /** Set when the intake landed on an opportunity (applied or draft created). */
  opportunityId?: string | null;
  opportunityName?: string | null;
}

export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && process.env.EMAIL_CRM_SLACK_CHANNEL);
}

/**
 * Per-project channel when a keyword matches venue or project name, else the
 * default channel. Keywords are matched case-insensitively; the longest
 * matching keyword wins so "bank of america stadium" beats "bank".
 */
export function resolveChannel(
  extraction: EmailCrmExtraction | null,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const fallback = env.EMAIL_CRM_SLACK_CHANNEL || null;
  const raw = env.EMAIL_CRM_SLACK_CHANNEL_MAP;
  if (!raw || !extraction) return fallback;

  let map: Record<string, string>;
  try {
    map = JSON.parse(raw) as Record<string, string>;
  } catch {
    log.error("[bid-alert] EMAIL_CRM_SLACK_CHANNEL_MAP is not valid JSON; using default channel");
    return fallback;
  }

  const haystack = `${extraction.clientOrVenue} ${extraction.projectName}`.toLowerCase();
  let best: { keyword: string; channel: string } | null = null;
  for (const [keyword, channel] of Object.entries(map)) {
    const needle = keyword.toLowerCase().trim();
    if (!needle || !haystack.includes(needle)) continue;
    if (!best || needle.length > best.keyword.length) best = { keyword: needle, channel };
  }
  return best?.channel || fallback;
}

export interface SlackChannelSummary {
  id: string;
  name: string;
  is_member?: boolean;
}

/** Words that carry no venue identity and would match half the workspace. */
const VENUE_STOPWORDS = new Set([
  "the", "at", "of", "and", "stadium", "arena", "center", "centre", "field",
  "park", "ballpark", "coliseum", "llc", "inc", "university", "college",
]);

export function venueTokens(venue: string): string[] {
  return venue
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !VENUE_STOPWORDS.has(word));
}

/**
 * Finds the pursuit channel for a venue by name — every identifying word of the
 * venue has to appear in the channel name, so "Bank of America Stadium" matches
 * #sales-bank-of-america-stadium-carolina-panthers but never #sales-america-first-field.
 * The most specific name wins, and a channel the bot has already joined beats
 * one it has not.
 */
export function matchChannelByVenue(
  venue: string,
  channels: SlackChannelSummary[],
): SlackChannelSummary | null {
  const tokens = venueTokens(venue);
  if (!tokens.length) return null;

  const hits = channels.filter((channel) => {
    const name = channel.name.toLowerCase();
    return tokens.every((token) => name.includes(token));
  });
  if (!hits.length) return null;

  return hits.sort((a, b) => {
    const member = Number(Boolean(b.is_member)) - Number(Boolean(a.is_member));
    if (member !== 0) return member;
    return a.name.length - b.name.length;
  })[0];
}

/** Channel list is stable minute to minute; one lookup serves a burst of email. */
let channelCache: { at: number; channels: SlackChannelSummary[] } | null = null;
const CHANNEL_CACHE_MS = 5 * 60 * 1000;

export async function listSlackChannels(
  token: string,
  now: number = Date.now(),
): Promise<SlackChannelSummary[]> {
  if (channelCache && now - channelCache.at < CHANNEL_CACHE_MS) return channelCache.channels;

  const channels: SlackChannelSummary[] = [];
  let cursor = "";
  for (let page = 0; page < 12; page += 1) {
    const url =
      "https://slack.com/api/conversations.list?limit=200&exclude_archived=true" +
      `&types=public_channel,private_channel${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      channels?: SlackChannelSummary[];
      response_metadata?: { next_cursor?: string };
    };
    if (!data.ok) {
      log.error("[bid-alert] could not list Slack channels", { error: data.error });
      break;
    }
    channels.push(...(data.channels || []));
    cursor = data.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }

  channelCache = { at: now, channels };
  return channels;
}

/** "August 26, 2026" — the way a bid date is written on the invitation. */
export function formatDueDate(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  if (!year || !month || !day) return dateIso;
  const name = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][month - 1];
  return `${name} ${day}, ${year}`;
}

/** Whole days from `from` to the due date, in UTC. Negative when already past. */
export function daysUntil(dateIso: string, from: Date): number {
  const due = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(due)) return 0;
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((due - start) / 86_400_000);
}

function countdown(days: number): string {
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * The verified proposal-due date, or null. Unverified dates are deliberately
 * dropped: the engine only marks a date verified when its quote is really in
 * the email, and an alert that announces a hallucinated bid date is worse than
 * no alert at all.
 */
export function pickBidDueDate(extraction: EmailCrmExtraction | null) {
  return (
    extraction?.dueDates?.find((d) => d.kind === "proposal_due" && d.verified !== false) || null
  );
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<{ type: string; text: string }>;
}

/**
 * A bid date that MOVED is different news from a bid date that merely exists —
 * Jireh 2026-08-20: "Yes definitely flag due dates". Moving earlier is the
 * expensive direction, so the two are never reported the same way.
 *
 * `previous` arrives as a full ISO datetime off the opportunity (the CRM stores
 * these at 21:00Z by the 5pm-ET convention) and `next` as a plain date, so both
 * are compared on their date portion only. Doing the arithmetic on the
 * YYYY-MM-DD strings in UTC keeps a reader's timezone out of it — the same trap
 * that made award dates render a day early across the whole opportunity corpus.
 */
export function describeDueDateMove(
  previous: string | null | undefined,
  next: string,
): { previousIso: string; days: number; direction: "earlier" | "later" } | null {
  if (!previous) return null;
  const previousIso = previous.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(previousIso) || !/^\d{4}-\d{2}-\d{2}$/.test(next)) return null;
  if (previousIso === next) return null;

  const from = Date.parse(`${previousIso}T00:00:00Z`);
  const to = Date.parse(`${next}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;

  const days = Math.round(Math.abs(to - from) / 86_400_000);
  return { previousIso, days, direction: to < from ? "earlier" : "later" };
}

export function buildBidAlertMessage(
  ctx: BidAlertContext,
  now: Date = new Date(),
): { text: string; blocks: SlackBlock[] } {
  const venue = ctx.extraction?.clientOrVenue?.trim() || ctx.input.subject || "New bid email";
  const project = ctx.extraction?.projectName?.trim() || "";
  const due = pickBidDueDate(ctx.extraction);
  const sender = ctx.input.fromName || ctx.input.fromEmail || "unknown sender";
  const attachments = (ctx.input.attachments || []).map((a) => a.name).filter(Boolean);

  // A date that moved leads with the movement, not with the date.
  const move = due ? describeDueDateMove(ctx.decision?.top?.proposalDueDate, due.dateIso) : null;
  const headline = !due
    ? `New bid email — ${venue}`
    : move
      ? `Bid date moved ${move.days} ${move.days === 1 ? "day" : "days"} ${move.direction} — now ${formatDueDate(due.dateIso)} (${countdown(daysUntil(due.dateIso, now))}) — ${venue}`
      : `Bid due ${formatDueDate(due.dateIso)} (${countdown(daysUntil(due.dateIso, now))}) — ${venue}`;

  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
  ];

  if (project) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${project}*` } });
  }

  const fields: Array<{ type: string; text: string }> = [
    { type: "mrkdwn", text: `*From*\n${sender}` },
  ];
  if (due) {
    fields.push({
      type: "mrkdwn",
      text: move
        ? `*Bid due*\n${formatDueDate(due.dateIso)}\n~${formatDueDate(move.previousIso)}~`
        : `*Bid due*\n${formatDueDate(due.dateIso)}`,
    });
  }
  if (attachments.length) {
    fields.push({
      type: "mrkdwn",
      text: `*Attachments*\n${attachments.slice(0, 5).join("\n")}${
        attachments.length > 5 ? `\n+${attachments.length - 5} more` : ""
      }`,
    });
  }
  blocks.push({ type: "section", fields });

  if (due?.sourceText) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Quoted from the email: “${due.sourceText}”` }],
    });
  }

  // What happened in the CRM — stated plainly, including when nothing did.
  let crmLine: string;
  if (ctx.status === "applied" && ctx.opportunityId) {
    crmLine = `Logged on <${CRM_OPPORTUNITY_URL}/${ctx.opportunityId}|${
      ctx.opportunityName || "the opportunity"
    }> in the CRM.`;
  } else if (ctx.status === "draft_created" && ctx.opportunityId) {
    crmLine = `No existing deal matched — a draft opportunity was created: <${CRM_OPPORTUNITY_URL}/${ctx.opportunityId}|${
      ctx.opportunityName || "new draft"
    }>.`;
  } else if (ctx.status === "failed") {
    crmLine = `Could not be read automatically — <${REVIEW_QUEUE_URL}|open it in the review queue>.`;
  } else {
    const close = (ctx.decision?.top?.name || "").trim();
    crmLine = close
      ? `Needs a human to confirm the deal (closest: ${close}) — <${REVIEW_QUEUE_URL}|review and apply>.`
      : `No matching deal found — <${REVIEW_QUEUE_URL}|review and apply>.`;
  }
  blocks.push({ type: "section", text: { type: "mrkdwn", text: crmLine } });

  return { text: headline, blocks };
}

/**
 * Explicit map → pursuit channel by name → catch-all. Never throws; a lookup
 * failure just falls through to the configured default.
 */
export async function resolveDestination(
  extraction: EmailCrmExtraction | null,
  token: string,
): Promise<string | null> {
  const fallback = process.env.EMAIL_CRM_SLACK_CHANNEL || null;
  const mapped = resolveChannel(extraction);
  if (mapped && mapped !== fallback) return mapped;

  const venue = extraction?.clientOrVenue?.trim();
  if (venue) {
    try {
      const match = matchChannelByVenue(venue, await listSlackChannels(token));
      if (match) return match.id;
    } catch (error) {
      log.error("[bid-alert] channel lookup failed; using default channel", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return fallback;
}

/** Posts the alert. Never throws — logs and returns false on any failure. */
export async function postBidAlert(ctx: BidAlertContext, now: Date = new Date()): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return false;
  const channel = await resolveDestination(ctx.extraction, token);
  if (!channel) return false;

  try {
    const message = buildBidAlertMessage(ctx, now);
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, ...message, unfurl_links: false }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!data.ok) {
      log.error("[bid-alert] Slack rejected the message", {
        intakeId: ctx.intakeId,
        channel,
        error: data.error,
      });
      return false;
    }
    return true;
  } catch (error) {
    log.error("[bid-alert] Slack post failed", {
      intakeId: ctx.intakeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
