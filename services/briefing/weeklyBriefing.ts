/**
 * Weekly "Your Week in Focus" briefing (Jireh ask 2026-07-27, Joe opted in).
 *
 * Per-recipient personal digest of the prior week — Outlook mail + documents
 * in motion + CRM activity — ranked into a Top 10 (Business Development vs
 * Department/Org) by the AI provider chain, rendered as an email-safe HTML
 * message and delivered through ANC's connected Microsoft mailbox. Real
 * Mail.Send transport is required: direct Mail.ReadWrite inbox injection was
 * automatically moved to Deleted Items by Joe's mailbox on 2026-08-03.
 *
 * Schedule: Sundays 4:00 PM America/New_York. The host cron checks this route
 * hourly; briefingDue() is the authoritative gate so delivery does not depend
 * on the host timezone or EST/EDT changes.
 *
 * A missed Sunday is recovered rather than lost. On 2026-08-09 the 4 PM ET
 * firing executed nothing — a crontab escaping defect ate the command — and the
 * week simply vanished, which is how Jireh found out. The schedule is therefore
 * expressed as a weekly ANCHOR (that week's Sunday 4 PM ET instant) plus a
 * catch-up grace: any hourly check inside the grace window still delivers that
 * anchor's edition. Because the edition is built from the anchor and not from
 * the wall clock, a late send is byte-identical to the on-time one instead of
 * being a thinner digest that happens to arrive on Monday.
 *
 * Env:
 *   MSGRAPH_TENANT_ID / MSGRAPH_CLIENT_ID / MSGRAPH_CLIENT_SECRET  (existing)
 *   TWENTY_CORE_DATABASE_URL                                        (existing)
 *   WEEKLY_BRIEFING_RECIPIENTS   comma-separated mailboxes — OPTIONAL override.
 *                                Unset falls back to DEFAULT_RECIPIENTS below,
 *                                so the schedule never depends on an env var
 *                                being remembered at deploy time.
 *   WEEKLY_BRIEFING_OBSERVERS    comma-separated mailboxes BCC'd on every
 *                                recipient's edition. Defaults to Ahmad.
 */

import { Pool } from "pg";
import { log } from "@/lib/logger";
import { resolveAncWorkspaceSchema } from "@/services/twenty/workspaceSchema";
import { getGraphToken, graphFetch } from "@/services/intake/emailCrmGraphSource";
import { extractJsonWithProviderChain } from "@/services/briefing/briefingRank";
import { humanizeEnums, renderBriefingEmail } from "@/services/briefing/briefingTemplate";
import { sendMicrosoftGraphMail } from "@/services/email/microsoftGraphMailer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeekMessage {
  subject: string;
  counterpart: string; // from-address (received) or first to-address (sent)
  direction: "in" | "out";
  at: string; // ISO
  conversationId: string;
  preview: string;
  hasAttachments: boolean;
}

export interface WeekDocument {
  file: string;
  direction: "in" | "out";
  date: string;
  subject: string;
}

export interface CrmChange {
  event: string; // opportunity.updated etc.
  day: string; // "Mon 07-20"
  record: string;
  bidStatus: string | null;
  amountMillions: number | null;
  diff: string;
}

export interface CrmDueItem {
  name: string;
  bidStatus: string;
  due: string; // "Jul 30"
  amountMillions: number | null;
  accountExecutive: string | null;
}

export interface ThreadSummary {
  subject: string;
  messages: number;
  lastDirection: "in" | "out";
  lastAt: string;
  lastFrom: string;
}

export interface WeekData {
  mailbox: string;
  weekLabel: string;
  weekStartIso: string;
  weekEndIso: string;
  received: number;
  sent: number;
  threads: ThreadSummary[];
  waitingOnReply: ThreadSummary[];
  documents: WeekDocument[];
  crmChanges: CrmChange[];
  crmDueSoon: CrmDueItem[];
}

export interface BriefingItem {
  title: string;
  amount?: string;
  tag: "Business Development" | "Department / Org" | "Service Ops";
  extraTags?: string[];
  bullets: string[];
}

export interface BriefingContent {
  stats: Array<{ value: string; label: string }>;
  top10: BriefingItem[];
  documents: Array<{ file: string; note: string }>;
  onDeck: Array<{ item: string; when: string }>;
  waiting: Array<{ who: string; what: string }>;
}

// ---------------------------------------------------------------------------
// Week window — most recent Monday 00:00 New York → now
// ---------------------------------------------------------------------------

const NY_TZ = "America/New_York";

function nyParts(date: Date): { weekday: string; hour: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short",
    hour: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    weekday: parts.weekday,
    hour: Number(parts.hour),
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

const HOUR_MS = 60 * 60 * 1000;

/** The hour, in New York terms, the briefing is promised for. */
const SEND_HOUR_NY = 16;

/** How long after the anchor a missed edition may still be delivered. Two days
 *  covers an overnight outage or a broken scheduler discovered the next morning
 *  while staying far away from the following Sunday, so a catch-up can never
 *  collide with the next week's send. */
const CATCH_UP_GRACE_HOURS = 48;

/** True only during the Sunday 4 PM hour in New York — the on-time slot. */
export function isInSendWindow(now: Date = new Date()): boolean {
  const p = nyParts(now);
  return p.weekday === "Sun" && p.hour === SEND_HOUR_NY;
}

/** The most recent Sunday 4:00 PM America/New_York instant at or before `now`.
 *
 *  Found by walking back hour by hour and asking New York what time it is,
 *  rather than by computing a UTC offset. New York is UTC-4 or UTC-5 depending
 *  on the date, and hard-coding either one is exactly the class of bug this
 *  schedule keeps hitting. Whole-hour offsets mean a UTC hour boundary is also
 *  a New York hour boundary, so the returned instant is the top of the hour. */
export function scheduledAnchor(now: Date = new Date()): Date {
  const topOfHour = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
  for (let back = 0; back < 24 * 8; back++) {
    const candidate = new Date(topOfHour.getTime() - back * HOUR_MS);
    const p = nyParts(candidate);
    if (p.weekday === "Sun" && p.hour === SEND_HOUR_NY) return candidate;
  }
  // Unreachable: any 8-day span contains a Sunday 4 PM.
  throw new Error("Could not locate a Sunday 4 PM America/New_York anchor.");
}

export interface BriefingDue {
  /** The Sunday 4 PM ET instant this edition belongs to. */
  anchor: Date;
  /** Whole hours between the anchor and now. 0 is the on-time firing. */
  lateHours: number;
  /** True when this run is recovering a firing that was missed earlier. */
  isCatchUp: boolean;
}

/** Whether a briefing is owed right now, and for which week.
 *
 *  Returns null once the grace window has closed — a week that old is stale
 *  news, and sending it would only confuse the next Sunday's edition. */
export function briefingDue(now: Date = new Date()): BriefingDue | null {
  const anchor = scheduledAnchor(now);
  const lateHours = Math.floor((now.getTime() - anchor.getTime()) / HOUR_MS);
  if (lateHours >= CATCH_UP_GRACE_HOURS) return null;
  return { anchor, lateHours, isCatchUp: lateHours >= 1 };
}

/** Subject line for an edition. Derived from the anchor, so the on-time send
 *  and any catch-up for the same week produce the identical string — which is
 *  what makes the "did they already get it?" check below trustworthy. */
export function briefingSubject(weekLabel: string): string {
  return `Your Week in Focus — ${weekLabel}`;
}

export function computeWeekWindow(now: Date = new Date()): {
  startIso: string;
  endIso: string;
  label: string;
} {
  // Walk back to the most recent Monday in NY terms.
  const dayMs = 24 * 60 * 60 * 1000;
  let cursor = new Date(now.getTime());
  while (nyParts(cursor).weekday !== "Mon") cursor = new Date(cursor.getTime() - dayMs);
  const startYmd = nyParts(cursor).ymd;
  // NY midnight ≤ UTC-4/5 — use 04:00Z as a safe "start of NY day" boundary.
  const startIso = `${startYmd}T04:00:00Z`;
  const endIso = now.toISOString();
  // "Week of July 27 – August 2, 2026" — the end day repeats its month whenever
  // the week straddles one, so the subject line never reads "July 27–2".
  const monthDay = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    month: "long",
    day: "numeric",
  });
  const dayOnly = new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, day: "numeric" });
  const monthOnly = new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, month: "long" });
  const start = new Date(startIso);
  const sameMonth = monthOnly.format(start) === monthOnly.format(now);
  const end = sameMonth ? dayOnly.format(now) : monthDay.format(now);
  const label = `Week of ${monthDay.format(start)} – ${end}, ${startYmd.slice(0, 4)}`;
  return { startIso, endIso, label };
}

// ---------------------------------------------------------------------------
// Aggregation (pure — unit tested)
// ---------------------------------------------------------------------------

const NOISE_SUBJECT = /^(automatic reply|accepted:|declined:|tentative:|statement -)/i;
const NOISE_SENDER = /(noreply|no-reply|donotreply|receipts@|@docusign\.net|@yardi\.com)/i;

export function summarizeThreads(messages: WeekMessage[]): ThreadSummary[] {
  const byConv = new Map<string, WeekMessage[]>();
  for (const m of messages) {
    const list = byConv.get(m.conversationId) || [];
    list.push(m);
    byConv.set(m.conversationId, list);
  }
  const threads: ThreadSummary[] = [];
  for (const list of byConv.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    const last = list[list.length - 1];
    threads.push({
      subject: list[0].subject || "(no subject)",
      messages: list.length,
      lastDirection: last.direction,
      lastAt: last.at,
      lastFrom: last.direction === "in" ? last.counterpart : "",
    });
  }
  return threads.sort((a, b) => b.messages - a.messages);
}

export function findWaitingOnReply(threads: ThreadSummary[]): ThreadSummary[] {
  return threads
    .filter(
      (t) =>
        t.lastDirection === "in" &&
        !NOISE_SUBJECT.test(t.subject) &&
        !NOISE_SENDER.test(t.lastFrom),
    )
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function isRealBriefingDocument(name: string, sizeBytes: number): boolean {
  if (/\.(png|jpe?g|gif|bmp|svg|ics)$/i.test(name)) return false;
  return sizeBytes >= 20_000;
}

// ---------------------------------------------------------------------------
// Graph mail pull
// ---------------------------------------------------------------------------

interface GraphListMessage {
  subject?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  bodyPreview?: string;
  conversationId?: string;
  hasAttachments?: boolean;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
}

async function pageMessages(
  token: string,
  firstPath: string,
  cap = 400,
): Promise<GraphListMessage[]> {
  const out: GraphListMessage[] = [];
  let path: string | null = firstPath;
  while (path && out.length < cap) {
    const page: { value?: GraphListMessage[]; "@odata.nextLink"?: string } = await graphFetch(
      token,
      path,
    );
    out.push(...(page.value || []));
    path = page["@odata.nextLink"]
      ? page["@odata.nextLink"].replace("https://graph.microsoft.com/v1.0", "")
      : null;
  }
  return out;
}

async function pullMailbox(
  token: string,
  mailbox: string,
  startIso: string,
  endIso: string,
): Promise<{ messages: WeekMessage[]; documents: WeekDocument[] }> {
  const sel =
    "$select=subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,conversationId,hasAttachments";
  const enc = encodeURIComponent(mailbox);
  const inbox = await pageMessages(
    token,
    `/users/${enc}/mailFolders/inbox/messages?$filter=receivedDateTime ge ${startIso} and receivedDateTime lt ${endIso}&${sel}&$top=100&$orderby=receivedDateTime desc`,
  );
  const sent = await pageMessages(
    token,
    `/users/${enc}/mailFolders/sentitems/messages?$filter=sentDateTime ge ${startIso} and sentDateTime lt ${endIso}&${sel}&$top=100&$orderby=sentDateTime desc`,
  );

  const messages: WeekMessage[] = [
    ...inbox.map(
      (m): WeekMessage => ({
        subject: m.subject || "",
        counterpart: m.from?.emailAddress?.address || "",
        direction: "in",
        at: m.receivedDateTime || "",
        conversationId: m.conversationId || "",
        preview: (m.bodyPreview || "").slice(0, 200),
        hasAttachments: Boolean(m.hasAttachments),
      }),
    ),
    ...sent.map(
      (m): WeekMessage => ({
        subject: m.subject || "",
        counterpart: m.toRecipients?.[0]?.emailAddress?.address || "",
        direction: "out",
        at: m.sentDateTime || "",
        conversationId: m.conversationId || "",
        preview: (m.bodyPreview || "").slice(0, 200),
        hasAttachments: Boolean(m.hasAttachments),
      }),
    ),
  ];

  // Documents in motion — attachment names on the week's messages.
  const documents: WeekDocument[] = [];
  for (const [folder, dateField] of [
    ["inbox", "receivedDateTime"],
    ["sentitems", "sentDateTime"],
  ] as const) {
    const withAtt = await pageMessages(
      token,
      `/users/${enc}/mailFolders/${folder}/messages?$filter=${dateField} ge ${startIso} and ${dateField} lt ${endIso} and hasAttachments eq true&$select=subject,${dateField}&$expand=attachments($select=name,size)&$top=50`,
      200,
    );
    for (const m of withAtt) {
      const atts =
        (m as unknown as { attachments?: Array<{ name?: string; size?: number }> }).attachments ||
        [];
      for (const a of atts) {
        if (!a.name || !isRealBriefingDocument(a.name, a.size ?? 0)) continue;
        documents.push({
          file: a.name,
          direction: folder === "inbox" ? "in" : "out",
          date: ((m as Record<string, unknown>)[dateField] as string | undefined)?.slice(0, 10) || "",
          subject: m.subject || "",
        });
      }
    }
  }

  return { messages, documents };
}

/** Has this mailbox already got the edition with this exact subject?
 *
 *  The recipient's own mailbox is the source of truth for "did this arrive",
 *  rather than a flag written on our side: a flag records that we believed we
 *  sent something, which is precisely the belief that was wrong twice. Searched
 *  across all folders so an edition filed away by a mailbox rule still counts.
 *
 *  Only consulted on catch-up runs. The on-time Sunday firing happens exactly
 *  once per week by construction and never needs it, so the promised path takes
 *  on no new dependency that could fail. */
async function hasReceivedEdition(
  token: string,
  mailbox: string,
  subject: string,
  sinceIso: string,
): Promise<boolean> {
  const odataSubject = subject.replace(/'/g, "''");
  const filter = `receivedDateTime ge ${sinceIso} and subject eq '${odataSubject}'`;
  const path =
    `/users/${encodeURIComponent(mailbox)}/messages` +
    `?$filter=${encodeURIComponent(filter)}&$select=id&$top=1`;
  const page: { value?: Array<{ id?: string }> } = await graphFetch(token, path);
  return (page.value?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// CRM pull (Twenty workspace schema — timeline + due dates)
// ---------------------------------------------------------------------------

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.TWENTY_CORE_DATABASE_URL?.trim();
    if (!url) throw new Error("TWENTY_CORE_DATABASE_URL is not configured");
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

async function getWorkspaceSchema(): Promise<string> {
  return resolveAncWorkspaceSchema(getPool());
}

async function pullCrmActivity(
  mailbox: string,
  startIso: string,
  endIso: string,
): Promise<{ changes: CrmChange[]; dueSoon: CrmDueItem[] }> {
  const schema = await getWorkspaceSchema();
  const db = getPool();

  const member = await db.query<{ id: string }>(
    `select id from ${JSON.stringify(schema).slice(1, -1)}."workspaceMember" where lower("userEmail") = lower($1) limit 1`,
    [mailbox],
  );
  const memberId = member.rows[0]?.id || null;

  let changes: CrmChange[] = [];
  if (memberId) {
    const rows = await db.query<{
      name: string;
      day: string;
      record: string | null;
      bidStatus: string | null;
      amt: string | null;
      props: string | null;
    }>(
      `select ta."name",
              to_char(ta."createdAt", 'Dy MM-DD') as day,
              coalesce(o."name", ta."linkedRecordCachedName") as record,
              o."bidStatus" as "bidStatus",
              round(o."amountAmountMicros" / 1e12::numeric, 3)::text as amt,
              left(ta."properties"::text, 400) as props
         from ${JSON.stringify(schema).slice(1, -1)}."timelineActivity" ta
         left join ${JSON.stringify(schema).slice(1, -1)}."opportunity" o on o.id = ta."targetOpportunityId"
        where ta."workspaceMemberId" = $1
          and ta."createdAt" >= $2 and ta."createdAt" < $3
        order by ta."createdAt"`,
      [memberId, startIso, endIso],
    );
    changes = rows.rows.map((r) => ({
      event: r.name,
      day: r.day,
      record: r.record || "",
      bidStatus: r.bidStatus ? humanizeEnums(r.bidStatus) : null,
      amountMillions: r.amt ? Number(r.amt) : null,
      diff: humanizeEnums(r.props || ""),
    }));
  }

  const due = await db.query<{
    name: string;
    bidStatus: string;
    due: string;
    amt: string | null;
    ae: string | null;
  }>(
    `select o."name", o."bidStatus", to_char(o."proposalDueDate", 'Mon DD') as due,
            round(o."amountAmountMicros" / 1e12::numeric, 2)::text as amt,
            o."accountExecutive" as ae
       from ${JSON.stringify(schema).slice(1, -1)}."opportunity" o
      where o."proposalDueDate" >= now() and o."proposalDueDate" < now() + interval '14 days'
        and o."deletedAt" is null and o."bidStatus" not in ('LOST', 'WON')
      order by o."proposalDueDate" limit 12`,
  );
  const dueSoon: CrmDueItem[] = due.rows.map((r) => ({
    name: r.name,
    bidStatus: r.bidStatus,
    due: r.due,
    amountMillions: r.amt ? Number(r.amt) : null,
    accountExecutive: r.ae,
  }));

  return { changes, dueSoon };
}

// ---------------------------------------------------------------------------
// Collect + rank + render + deliver
// ---------------------------------------------------------------------------

export async function collectWeekData(mailbox: string, now: Date = new Date()): Promise<WeekData> {
  const { startIso, endIso, label } = computeWeekWindow(now);
  const token = await getGraphToken();
  const { messages, documents } = await pullMailbox(token, mailbox, startIso, endIso);
  const { changes, dueSoon } = await pullCrmActivity(mailbox, startIso, endIso);

  const threads = summarizeThreads(messages);
  return {
    mailbox,
    weekLabel: label,
    weekStartIso: startIso,
    weekEndIso: endIso,
    received: messages.filter((m) => m.direction === "in").length,
    sent: messages.filter((m) => m.direction === "out").length,
    threads: threads.slice(0, 25),
    waitingOnReply: findWaitingOnReply(threads).slice(0, 12),
    documents: documents.slice(0, 60),
    crmChanges: changes,
    crmDueSoon: dueSoon,
  };
}

const RANK_SYSTEM_PROMPT =
  "You are the editorial engine for a private weekly executive briefing at ANC, an LED display and venue-services company. " +
  "From the aggregated week data (email threads, documents, CRM changes, upcoming due dates) produce STRICT JSON only, matching: " +
  '{"stats":[{"value":string,"label":string}] /* exactly 4, first is always the email count */, ' +
  '"top10":[{"title":string,"amount":string?,"tag":"Business Development"|"Department / Org"|"Service Ops","extraTags":[string]?,"bullets":[string]}], ' +
  '"documents":[{"file":string,"note":string}] /* 6-9 most consequential documents */, ' +
  '"onDeck":[{"item":string,"when":string}] /* what carries into next week: due dates, scheduled visits, open contracts */, ' +
  '"waiting":[{"who":string,"what":string}] /* people whose last message is unanswered, grouped by person */}. ' +
  "Rules: exactly 10 top10 items ranked by real weight (deal size, thread volume, decisions). 2-4 bullets each, every bullet a concrete fact from the data — never invent. " +
  "Use first names for colleagues. amount only when a deal value is in the data (e.g. \"$25.0M\"). " +
  "Business Development = deals/RFPs/partnerships/renewals; Service Ops = field/venue/repair work; Department / Org = internal, legal, finance, admin. " +
  "Never mention software brand names. Keep bullets under 110 characters.";

export async function rankWeek(data: WeekData): Promise<BriefingContent> {
  const payload = {
    weekLabel: data.weekLabel,
    emailCounts: { received: data.received, sent: data.sent },
    topThreads: data.threads,
    waitingOnReply: data.waitingOnReply,
    documents: data.documents,
    crmChanges: data.crmChanges,
    upcomingDue: data.crmDueSoon,
  };
  const content = await extractJsonWithProviderChain<BriefingContent>(
    RANK_SYSTEM_PROMPT,
    JSON.stringify(payload),
  );
  if (!Array.isArray(content.top10) || content.top10.length === 0) {
    throw new Error("Briefing ranking returned no top10 items.");
  }
  return content;
}

/** Sends through ANC's connected Microsoft mailbox using normal Mail.Send
 *  transport so mailbox delivery rules and message trace work as expected. */
export async function deliverBriefing(
  mailbox: string,
  subject: string,
  html: string,
  bccRecipients: string[] = briefingObservers(),
): Promise<void> {
  await sendMicrosoftGraphMail({
    subject,
    html,
    recipients: [mailbox],
    bccRecipients,
  });
}

/** Execs who have opted in to the weekly digest. Kept in the repo rather than
 *  env-only: on 2026-08-02 the first scheduled send produced nothing because
 *  WEEKLY_BRIEFING_RECIPIENTS had never been set on the deployed service.
 *  WEEKLY_BRIEFING_RECIPIENTS still wins when present, for rollout waves. */
export const DEFAULT_RECIPIENTS = ["jbillings@anc.com", "joeo@anc.com"];

/** Observers are BCC'd on every recipient's edition. They are not recipients:
 *  an observer never has a personal edition generated for their own mailbox. */
export const DEFAULT_OBSERVERS = ["ahmad.basheer@anc.com"];

function parseMailboxList(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

export function briefingRecipients(): string[] {
  const configured = parseMailboxList(process.env.WEEKLY_BRIEFING_RECIPIENTS);
  return configured.length > 0 ? configured : [...DEFAULT_RECIPIENTS];
}

export function briefingObservers(): string[] {
  const configured = parseMailboxList(process.env.WEEKLY_BRIEFING_OBSERVERS);
  return Array.from(new Set([...DEFAULT_OBSERVERS, ...configured]));
}

export interface RunResult {
  recipient: string;
  delivered: boolean;
  error?: string;
  htmlBytes?: number;
  /** Observer mailboxes BCC'd on this edition. */
  copiedTo?: string[];
  /** Set when the recipient already held this week's edition, so nothing was
   *  sent. Distinct from an error: the promise was already kept. */
  skipped?: "already-delivered";
  /** Populated on dry runs so the edition can be inspected before it ships. */
  html?: string;
}

export async function runWeeklyBriefing(options: {
  recipients?: string[];
  observers?: string[];
  dryRun?: boolean;
  /** The instant the edition is built for. Pass the weekly anchor so a catch-up
   *  reproduces the on-time edition rather than a partial week. */
  now?: Date;
  /** Catch-up runs must not re-send to anyone who already has this edition. */
  skipAlreadyDelivered?: boolean;
}): Promise<RunResult[]> {
  const recipients = options.recipients?.length ? options.recipients : briefingRecipients();
  if (recipients.length === 0) {
    throw new Error("No briefing recipients configured (WEEKLY_BRIEFING_RECIPIENTS).");
  }
  const observers = options.observers ?? briefingObservers();
  const results: RunResult[] = [];
  for (const recipient of recipients) {
    try {
      // Cheapest possible exit: the week label is pure arithmetic on the
      // anchor, so a recipient who already holds this edition costs one Graph
      // lookup — no mailbox pull, no AI ranking pass.
      if (options.skipAlreadyDelivered && !options.dryRun) {
        const week = computeWeekWindow(options.now);
        const alreadyHas = await hasReceivedEdition(
          await getGraphToken(),
          recipient,
          briefingSubject(week.label),
          week.startIso,
        );
        if (alreadyHas) {
          results.push({ recipient, delivered: false, skipped: "already-delivered" });
          log.info("[weekly-briefing] already delivered, skipping", {
            recipient,
            week: week.label,
          });
          continue;
        }
      }

      const data = await collectWeekData(recipient, options.now);
      const content = await rankWeek(data);
      const displayName = recipient.split("@")[0];
      const html = renderBriefingEmail({
        recipientName: displayName,
        weekLabel: data.weekLabel,
        content,
      });
      const subject = briefingSubject(data.weekLabel);
      const observerBcc = observers.filter(
        (observer) => observer.toLowerCase() !== recipient.toLowerCase(),
      );
      const copiedTo: string[] = [];
      if (!options.dryRun) {
        await deliverBriefing(recipient, subject, html, observerBcc);
        copiedTo.push(...observerBcc);
      }
      results.push({
        recipient,
        delivered: !options.dryRun,
        htmlBytes: html.length,
        ...(copiedTo.length ? { copiedTo } : {}),
        ...(options.dryRun ? { html } : {}),
      });
      log.info("[weekly-briefing] generated", {
        recipient,
        dryRun: Boolean(options.dryRun),
        items: content.top10.length,
        copiedTo: copiedTo.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("[weekly-briefing] failed for recipient", { recipient, error: message });
      results.push({ recipient, delivered: false, error: message });
    }
  }
  return results;
}
