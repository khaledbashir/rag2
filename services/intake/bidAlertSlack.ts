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
 * Is this inbound email actually about a bid at all?
 *
 * The intake reads every message that reaches the estimation inbox, and that
 * inbox carries ordinary business mail too — vendor invoices, remittance
 * chasers, scheduling notes. Those still extract cleanly and still score a
 * weak match against some open deal, so before this gate every one of them
 * was announced as a "New bid email" asking a human to confirm a deal.
 * Jireh flagged the case that proved it: a Dyson & Womack invoice for OBM
 * (subject "Re: Invoice #1587 for OBM") posted as a bid against "University of
 * Rhode Island Courtside and Stanchion 2025" at a 0.7 score.
 *
 * The extraction already carries the right signal and had been ignored: it
 * classifies each date it finds, and an invoice's date comes back kind="other"
 * while a genuine bid comes back kind="proposal_due". So a proposal-due date is
 * the primary test, and an explicit bid word in the subject is the fallback
 * for the addendum that quotes no new date. Word-bounded on purpose — an
 * unanchored /bid/ matches "forbidden" and /sow/ matches "Wilson".
 *
 * Deliberately looser than `looksLikeNewRfp`: that one gates CREATING a deal
 * and so demands venue + project + date, while a bid date moving on a deal that
 * already exists is exactly the alert the bid team wants. Pure + unit-tested.
 */
const BID_SUBJECT_INTENT =
  /\b(rfp|rfq|bid|bids|bidding|proposal|quote|quotation|pricing|sow|spec|specs|addendum|itb|invitation to bid|scope of work)\b/i;

export function looksBidRelated(ctx: Pick<BidAlertContext, "input" | "extraction">): boolean {
  const subjectSaysBid = BID_SUBJECT_INTENT.test(ctx.input?.subject || "");

  // A failed read has no extraction to judge, so the subject is all there is.
  // Keep alerting there — a bid we could not parse is the case most needing a
  // human — but stay silent on mail that never claimed to be a bid.
  if (!ctx.extraction) return subjectSaysBid;

  const hasProposalDue = ctx.extraction.dueDates.some(
    (d) => d.kind === "proposal_due" && d.verified !== false,
  );

  return hasProposalDue || subjectSaysBid;
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

/** The words that make a phrase read as a place rather than an organisation. */
const VENUE_TYPE_WORDS =
  /\b(stadium|arena|center|centre|field|park|ballpark|coliseum|dome|garden|bowl|forum|pavilion|complex|court|rink|track|raceway)\b/i;

/** How the paperwork labels the parties that are not the venue. */
const PARTY_LABEL =
  /\b(?:owner|cm|gc|architect|engineer|developer|construction manager|general contractor)\s*:/i;

/**
 * Pulls the venue out of the string the extractor produced for `clientOrVenue`.
 *
 * That string arrives in two opposite shapes and the difference decides which
 * half to keep. Sometimes the venue leads and the parentheses hold the
 * paperwork — "Oklahoma City New Arena (Owner: City of Oklahoma City; CM:
 * Flintco/Mortenson)". Sometimes the owning authority leads and the
 * parentheses hold the venue — and that is what the real Mortenson email
 * produced: "City of Oklahoma City / Oklahoma City Public Property Authority
 * (Oklahoma City New Arena)". Stripping parentheses unconditionally, which is
 * what this did before, threw the venue away in the second case and left the
 * bid announcing itself as "City of Oklahoma City / Oklahoma City Public
 * Property Authority" — matching no channel, reading like nothing.
 *
 * So a parenthetical wins only when it reads like a place (carries a
 * venue-type word) and is not labelled as a party. Otherwise the outer text
 * wins, minus any party label chain.
 */
export function coreVenueName(venue: string): string {
  const parentheticals = Array.from(venue.matchAll(/\(([^)]*)\)/g)).map((m) => m[1].trim());
  const venueLike = parentheticals.find(
    (inner) => inner && !PARTY_LABEL.test(inner) && VENUE_TYPE_WORDS.test(inner),
  );
  if (venueLike) return venueLike;

  const outer = venue.replace(/\([^)]*\)/g, " ").split(PARTY_LABEL)[0];
  const cleaned = outer.replace(/\s+/g, " ").replace(/[\s\-–—,;/]+$/, "").trim();
  return cleaned || venue.trim();
}

export function venueTokens(venue: string): string[] {
  const seen = new Set<string>();
  return venue
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !VENUE_STOPWORDS.has(word))
    .filter((word) => (seen.has(word) ? false : (seen.add(word), true)));
}

/**
 * Every name the email gives us that a channel might be named after, most
 * specific first.
 *
 * One cleaned venue string is not enough. The Oklahoma City bid carried the
 * venue in three places — inside the parentheses of `clientOrVenue`, at the
 * head of `projectName` ("Oklahoma City New Arena: Bid Package #5..."), and
 * nowhere in the owner chain that led the field — and the routing only ever
 * looked at the one place it was missing. Trying each in turn costs nothing:
 * a candidate that names no channel simply falls through to the next.
 */
export function venueCandidates(extraction: EmailCrmExtraction | null): string[] {
  if (!extraction) return [];
  const raw: string[] = [];

  const venue = extraction.clientOrVenue?.trim();
  if (venue) {
    raw.push(coreVenueName(venue));
    for (const m of venue.matchAll(/\(([^)]*)\)/g)) {
      if (m[1] && !PARTY_LABEL.test(m[1])) raw.push(m[1].trim());
    }
    raw.push(venue.replace(/\([^)]*\)/g, " ").split(PARTY_LABEL)[0].trim());
  }

  const project = extraction.projectName?.trim();
  if (project) {
    raw.push(project.split(":")[0].trim());
    raw.push(project);
  }

  const byTokens = new Map<string, string[]>();
  for (const name of raw) {
    const tokens = venueTokens(name);
    if (!tokens.length) continue;
    const key = tokens.join(" ");
    if (!byTokens.has(key)) byTokens.set(key, tokens);
  }

  // Most identifying words first — a long, specific phrase either names its own
  // channel or names none, and either way the shorter phrases follow it.
  return Array.from(byTokens.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key]) => key);
}

/**
 * Finds the pursuit channel for a venue by name — every identifying word of the
 * venue has to appear in the channel name, so "Bank of America Stadium" matches
 * #sales-bank-of-america-stadium-carolina-panthers but never #sales-america-first-field.
 * The most specific name wins, and a channel the bot has already joined beats
 * one it has not.
 *
 * A name that survives tokenization as a SINGLE word is accepted only when it
 * names exactly one channel in the workspace. "Georgetown" and "Temple" are
 * that word and route correctly; "ANC" is also that word and touches a dozen
 * channels, and posting a stadium bid into #anc-nyoffice because they share
 * three letters is worse than posting nothing.
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
  if (tokens.length === 1 && hits.length > 1) return null;

  return hits.sort((a, b) => {
    const member = Number(Boolean(b.is_member)) - Number(Boolean(a.is_member));
    if (member !== 0) return member;
    return a.name.length - b.name.length;
  })[0];
}

/** The first candidate name that names a channel. */
export function matchChannelForBid(
  extraction: EmailCrmExtraction | null,
  channels: SlackChannelSummary[],
): SlackChannelSummary | null {
  for (const candidate of venueCandidates(extraction)) {
    const hit = matchChannelByVenue(candidate, channels);
    if (hit) return hit;
  }
  return null;
}

/**
 * A catch-all has to be venue-neutral. `#sales-<venue>-<team>` is the
 * workspace's convention for a SINGLE pursuit, so a channel named that way can
 * never be the home for bids belonging to everything else.
 *
 * This is not hypothetical tidiness. `EMAIL_CRM_SLACK_CHANNEL` was left
 * pointing at #sales-bank-of-america-stadium-carolina-panthers after the
 * 2026-08-12 launch test, and with channel matching broken every bid the
 * intake read was announced in the Panthers' deal room — an Oklahoma City
 * arena package, Temple's LED pricing, all of it. Jireh: "we need to get these
 * alerts fixed so they aren't going to the incorrect channels."
 */
export function isPursuitChannel(name: string): boolean {
  return /^sales-/i.test(name.trim());
}

/** Channel list is stable minute to minute; one lookup serves a burst of email. */
let channelCache: { at: number; channels: SlackChannelSummary[] } | null = null;
const CHANNEL_CACHE_MS = 5 * 60 * 1000;

/** Reset between tests; also lets an operator force a re-read after inviting the bot. */
export function clearChannelCache(): void {
  channelCache = null;
}

async function listChannelsOfType(
  token: string,
  type: "public_channel" | "private_channel",
): Promise<SlackChannelSummary[]> {
  const channels: SlackChannelSummary[] = [];
  let cursor = "";
  for (let page = 0; page < 40; page += 1) {
    const url =
      "https://slack.com/api/conversations.list?limit=200&exclude_archived=true" +
      `&types=${type}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      channels?: SlackChannelSummary[];
      response_metadata?: { next_cursor?: string };
    };
    if (!data.ok) {
      log.error("[bid-alert] could not list Slack channels", { type, error: data.error });
      break;
    }
    channels.push(...(data.channels || []));
    cursor = data.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  return channels;
}

/**
 * Every channel the bot can see, fetched one type at a time.
 *
 * Asking `conversations.list` for `public_channel,private_channel` together
 * looks like one efficient call and is the reason venue routing had never once
 * matched. Slack applies the type filter after paging, so the combined query
 * comes back in pages of about five instead of two hundred — measured on the
 * ANC workspace, the same 325 public channels take 3 pages alone and had not
 * finished after 40 pages combined. The old 12-page cap therefore saw the
 * first ~46 channels and stopped, and not one of the 21 `sales-*` pursuit
 * channels was inside that window. Per type, per pass, merged.
 */
export async function listSlackChannels(
  token: string,
  now: number = Date.now(),
): Promise<SlackChannelSummary[]> {
  if (channelCache && now - channelCache.at < CHANNEL_CACHE_MS) return channelCache.channels;

  const byId = new Map<string, SlackChannelSummary>();
  for (const type of ["public_channel", "private_channel"] as const) {
    for (const channel of await listChannelsOfType(token, type)) {
      if (channel?.id && !byId.has(channel.id)) byId.set(channel.id, channel);
    }
  }

  const channels = Array.from(byId.values());
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
  const rawVenue = ctx.extraction?.clientOrVenue?.trim();
  const venue = rawVenue ? coreVenueName(rawVenue) : ctx.input.subject || "New bid email";
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
 * The catch-all, or null when the configured one is a single pursuit's channel.
 * Separated out so the invariant is testable without a Slack round trip.
 */
export function safeFallbackChannel(
  fallbackId: string | null,
  channels: SlackChannelSummary[],
): string | null {
  if (!fallbackId) return null;
  const configured = channels.find((c) => c.id === fallbackId);
  if (configured && isPursuitChannel(configured.name)) {
    log.error("[bid-alert] EMAIL_CRM_SLACK_CHANNEL is a single pursuit's channel; not posting", {
      channel: fallbackId,
      name: configured.name,
    });
    return null;
  }
  return fallbackId;
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

  try {
    const channels = await listSlackChannels(token);
    const match = matchChannelForBid(extraction, channels);
    if (match) return match.id;
    return safeFallbackChannel(fallback, channels);
  } catch (error) {
    log.error("[bid-alert] channel lookup failed; using default channel", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

/** Posts the alert. Never throws — logs and returns false on any failure. */
export async function postBidAlert(ctx: BidAlertContext, now: Date = new Date()): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return false;

  // Gated here rather than at the four call sites so no future branch can post
  // an invoice or a scheduling note to a pursuit channel by forgetting to ask.
  if (!looksBidRelated(ctx)) {
    log.info("[bid-alert] not bid-related; no Slack post", {
      intakeId: ctx.intakeId,
      subject: ctx.input?.subject,
    });
    return false;
  }

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
