import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { queryVault, getDashboardWorkspaceSlug } from "@/lib/anything-llm";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

const CRM_BASE = "https://crm.ancsports.net";
const SERVICES_BASE = process.env.ANC_SERVICES_BASE_URL || "https://services.ancsports.net";
const SERVICES_DATABASE_URL = process.env.ANC_SERVICES_DATABASE_URL || process.env.SERVICES_DATABASE_URL;
const APP_DATABASE_CONFIGURED = Boolean(
  process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.PRISMA_DATABASE_URL ||
    process.env.PRISMA_POSTGRES_URL,
);

const globalForServices = globalThis as unknown as { ancServicesPool?: Pool };

function getServicesPool(): Pool | null {
  if (!SERVICES_DATABASE_URL) return null;
  if (!globalForServices.ancServicesPool) {
    globalForServices.ancServicesPool = new Pool({
      connectionString: SERVICES_DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 4_000,
    });
  }
  return globalForServices.ancServicesPool;
}

type GraphqlResponse<T> = { data?: T; errors?: Array<{ message?: string }> };

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TWENTY_BASE}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TWENTY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as GraphqlResponse<T>;
  if (!res.ok || body.errors?.length) {
    const err = body.errors?.map((e) => e.message).filter(Boolean).join("; ");
    throw new Error(err || `Twenty GraphQL ${res.status}`);
  }
  if (!body.data) throw new Error("Twenty returned no data");
  return body.data;
}

type Money = { amountMicros: number | null; currencyCode: string } | null;

const fmtMoney = (m: Money | null | undefined) => {
  if (!m || m.amountMicros == null) return null;
  const v = Number(m.amountMicros) / 1_000_000;
  if (!Number.isFinite(v)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: m.currencyCode || "USD",
    maximumFractionDigits: 0,
  }).format(v);
};

const fmtDate = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : null);

type Company = {
  id: string;
  name: string;
  domainNamePrimaryLinkUrl: string | null;
  industry: string | null;
  league: string | null;
  revenueType: string | null;
  serviceStatus: string | null;
  venueName: string | null;
  createdAt: string;
};

type Opportunity = {
  id: string;
  name: string;
  bidStatus: string | null;
  stage: string | null;
  businessUnit: string | null;
  probability: number | null;
  amount: Money;
  margin: Money;
  salePrice: Money;
  totalProjectRevenue: Money;
  totalProjectMargin: Money;
  dealValue: Money;
  closeDate: string | null;
  proposalDueDate: string | null;
  pricingCompleteDate: string | null;
  substantialCompletionDate: string | null;
  accountExecutive: string | null;
  proposalStage: string | null;
  priority: string | null;
  technologyVendorPartner: string | null;
  createdAt: string;
};

const microsOf = (m: Money) => (m && m.amountMicros != null ? Number(m.amountMicros) : 0);

// Best-known revenue picks the non-zero max across populated fields. SF migration
// left different fields populated on different opps — salePrice for some,
// totalProjectRevenue for others, dealValue for others, FY-rollup amount for newer.
function bestRevenue(o: Opportunity): { micros: number; currency: string } {
  const candidates = [o.salePrice, o.totalProjectRevenue, o.dealValue, o.amount];
  let best = 0;
  let currency = "USD";
  for (const c of candidates) {
    const v = microsOf(c);
    if (v > best) {
      best = v;
      if (c?.currencyCode) currency = c.currencyCode;
    }
  }
  return { micros: best, currency };
}

function bestMargin(o: Opportunity): { micros: number; currency: string } {
  const candidates = [o.totalProjectMargin, o.margin];
  let best = 0;
  let currency = "USD";
  for (const c of candidates) {
    const v = microsOf(c);
    if (v > best) {
      best = v;
      if (c?.currencyCode) currency = c.currencyCode;
    }
  }
  return { micros: best, currency };
}

const fmtMicros = (micros: number, currency = "USD") =>
  micros > 0
    ? new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(micros / 1_000_000)
    : null;

type Milestone = {
  type:
    | "proposal.created"
    | "proposal.updated"
    | "opp.created"
    | "opp.won"
    | "opp.lost"
    | "opp.proposal_due"
    | "opp.pricing_complete"
    | "opp.substantial_completion"
    | "ticket.opened"
    | "ticket.resolved"
    | "design.created"
    | "service.event"
    | "service.ticket"
    | "note"
    | "task"
    | "timeline";
  at: string;
  title: string;
  detail: string | null;
  amount: string | null;
  link: string | null;
  badge: string | null;
  source?: "proposal_db" | "crm" | "services";
};

type LocalProposal = {
  id: string;
  clientName: string;
  venue: string | null;
  status: string;
  documentMode: string;
  calculationMode: string;
  twentyOpportunityId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ServiceEvent = {
  id: string;
  summary: string | null;
  event_date: Date | string | null;
  start_time: string | null;
  event_type: string | null;
  status: string | null;
  workflow_status: string | null;
  venue_name: string | null;
  assigned_count: number | string | null;
};

type ServiceTicket = {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  created_at: Date | string | null;
  venue_name: string | null;
};

async function resolveCompany(idOrName: { id?: string; name?: string }): Promise<Company | null> {
  if (idOrName.id) {
    const data = await gql<{ company: Company | null }>(
      `query Co($id:UUID!){
        company(filter:{id:{eq:$id}}){
          id name domainNamePrimaryLinkUrl industry league revenueType serviceStatus venueName createdAt
        }
      }`,
      { id: idOrName.id },
    );
    return data.company ?? null;
  }
  if (idOrName.name) {
    const data = await gql<{ companies: { edges: Array<{ node: Company }> } }>(
      `query CoByName($q:String!){
        companies(first:5, filter:{name:{ilike:$q}}, orderBy:[{name:AscNullsLast}]){
          edges{ node{ id name domainNamePrimaryLinkUrl industry league revenueType serviceStatus venueName createdAt } }
        }
      }`,
      { q: `%${idOrName.name}%` },
    );
    return data.companies.edges[0]?.node ?? null;
  }
  return null;
}

async function fetchOpportunities(companyId: string): Promise<Opportunity[]> {
  const data = await gql<{ opportunities: { edges: Array<{ node: Opportunity }> } }>(
    `query Opps($id:UUID!){
      opportunities(first:200, filter:{companyId:{eq:$id}}, orderBy:[{closeDate:DescNullsLast}]){
        edges{ node{
          id name bidStatus stage businessUnit probability
          amount{amountMicros currencyCode} margin{amountMicros currencyCode}
          salePrice{amountMicros currencyCode} dealValue{amountMicros currencyCode}
          totalProjectRevenue{amountMicros currencyCode} totalProjectMargin{amountMicros currencyCode}
          closeDate proposalDueDate pricingCompleteDate substantialCompletionDate
          accountExecutive proposalStage priority technologyVendorPartner createdAt
        }}
      }
    }`,
    { id: companyId },
  );
  return data.opportunities.edges.map((e) => e.node);
}

async function fetchTimelineActivities(companyId: string, oppIds: string[]): Promise<any[]> {
  // Direct company-tagged events
  const direct = await gql<{ timelineActivities: { edges: Array<{ node: any }> } }>(
    `query TaCo($id:UUID!){
      timelineActivities(first:50, filter:{targetCompanyId:{eq:$id}}, orderBy:[{happensAt:DescNullsLast}]){
        edges{ node{ id name happensAt linkedRecordCachedName properties targetOpportunityId } }
      }
    }`,
    { id: companyId },
  );
  const events = direct.timelineActivities.edges.map((e) => e.node);

  if (oppIds.length === 0) return events;
  // Events tagged on child opps
  const oppLevel = await gql<{ timelineActivities: { edges: Array<{ node: any }> } }>(
    `query TaOpps($ids:[UUID!]!){
      timelineActivities(first:200, filter:{targetOpportunityId:{in:$ids}}, orderBy:[{happensAt:DescNullsLast}]){
        edges{ node{ id name happensAt linkedRecordCachedName properties targetOpportunityId } }
      }
    }`,
    { ids: oppIds },
  );
  return [...events, ...oppLevel.timelineActivities.edges.map((e) => e.node)];
}

async function fetchNotes(companyId: string): Promise<any[]> {
  const data = await gql<{ noteTargets: { edges: Array<{ node: any }> } }>(
    `query NoteCo($id:UUID!){
      noteTargets(first:50, filter:{targetCompanyId:{eq:$id}}){
        edges{ node{ id note{ id title createdAt } } }
      }
    }`,
    { id: companyId },
  );
  return data.noteTargets.edges.map((e) => e.node.note).filter(Boolean);
}

async function fetchTasks(companyId: string): Promise<any[]> {
  const data = await gql<{ taskTargets: { edges: Array<{ node: any }> } }>(
    `query TaskCo($id:UUID!){
      taskTargets(first:50, filter:{targetCompanyId:{eq:$id}}){
        edges{ node{ id task{ id title status dueAt createdAt } } }
      }
    }`,
    { id: companyId },
  );
  return data.taskTargets.edges.map((e) => e.node.task).filter(Boolean);
}

function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

async function fetchLocalProposals(company: Company, oppIds: string[]): Promise<{ proposals: LocalProposal[]; skipped: boolean }> {
  if (!APP_DATABASE_CONFIGURED) return { proposals: [], skipped: true };

  const terms = [company.name, company.venueName].filter((v): v is string => Boolean(v?.trim()));
  const textFilters = terms.flatMap((term) => [
    { clientName: { contains: term, mode: "insensitive" as const } },
    { venue: { contains: term, mode: "insensitive" as const } },
  ]);

  if (oppIds.length === 0 && textFilters.length === 0) return { proposals: [], skipped: false };

  try {
    const proposals = await prisma.proposal.findMany({
      where: {
        OR: [
          ...(oppIds.length > 0 ? [{ twentyOpportunityId: { in: oppIds } }] : []),
          ...textFilters,
        ],
      },
      select: {
        id: true,
        clientName: true,
        venue: true,
        status: true,
        documentMode: true,
        calculationMode: true,
        twentyOpportunityId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return { proposals, skipped: false };
  } catch {
    return { proposals: [], skipped: true };
  }
}

async function fetchServiceContext(company: Company): Promise<{ events: ServiceEvent[]; tickets: ServiceTicket[]; skipped: boolean }> {
  const pool = getServicesPool();
  if (!pool) return { events: [], tickets: [], skipped: true };

  const names = [company.venueName, company.name].filter((v): v is string => Boolean(v?.trim())).slice(0, 4);
  if (names.length === 0) return { events: [], tickets: [], skipped: false };

  const patterns = names.map((name) => `%${escapeLike(name)}%`);
  const client = await pool.connect();
  try {
    const venueRows = await client.query<{ id: string }>(
      `SELECT id
       FROM venues
       WHERE ${patterns.map((_, i) => `(name ILIKE $${i + 1} ESCAPE '\\' OR $${i + 1} ILIKE '%' || name || '%')`).join(" OR ")}
       ORDER BY is_active DESC NULLS LAST, name ASC
       LIMIT 20`,
      patterns,
    );
    const venueIds = venueRows.rows.map((r) => r.id);
    if (venueIds.length === 0) return { events: [], tickets: [], skipped: false };

    const [eventRows, ticketRows] = await Promise.all([
      client.query<ServiceEvent>(
        `SELECT e.id,
                e.summary,
                e.event_date,
                e.start_time::text AS start_time,
                e.event_type,
                e.status,
                e.workflow_status,
                v.name AS venue_name,
                COUNT(ea.id)::int AS assigned_count
         FROM events e
         JOIN venues v ON v.id = e.venue_id
         LEFT JOIN event_assignments ea ON ea.event_id = e.id
         WHERE e.venue_id = ANY($1::uuid[])
         GROUP BY e.id, v.name
         ORDER BY e.event_date DESC NULLS LAST
         LIMIT 50`,
        [venueIds],
      ),
      client.query<ServiceTicket>(
        `SELECT t.id,
                t.title,
                t.status,
                t.priority,
                t.created_at,
                v.name AS venue_name
         FROM tickets t
         JOIN venues v ON v.id = t.venue_id
         WHERE t.venue_id = ANY($1::uuid[])
         ORDER BY t.created_at DESC NULLS LAST
         LIMIT 25`,
        [venueIds],
      ),
    ]);

    return { events: eventRows.rows, tickets: ticketRows.rows, skipped: false };
  } catch {
    return { events: [], tickets: [], skipped: true };
  } finally {
    client.release();
  }
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function synthesize(args: {
  company: Company;
  opps: Opportunity[];
  events: any[];
  notes: any[];
  tasks: any[];
  proposals: LocalProposal[];
  serviceEvents: ServiceEvent[];
  serviceTickets: ServiceTicket[];
}): Milestone[] {
  const { company, opps, events, notes, tasks, proposals, serviceEvents, serviceTickets } = args;
  const out: Milestone[] = [];

  for (const p of proposals) {
    out.push({
      type: "proposal.updated",
      at: p.updatedAt.toISOString(),
      title: `Proposal updated — ${p.venue || p.clientName}`,
      detail: `${p.status} · ${p.documentMode} · ${p.calculationMode}`,
      amount: null,
      link: p.twentyOpportunityId ? `${CRM_BASE}/object/opportunity/${p.twentyOpportunityId}` : null,
      badge: "PROPOSAL",
      source: "proposal_db",
    });
    out.push({
      type: "proposal.created",
      at: p.createdAt.toISOString(),
      title: `Proposal created — ${p.venue || p.clientName}`,
      detail: `${p.documentMode} · ${p.calculationMode}`,
      amount: null,
      link: null,
      badge: "APP DB",
      source: "proposal_db",
    });
  }

  for (const o of opps) {
    const rev = bestRevenue(o);
    const revFmt = fmtMicros(rev.micros, rev.currency);
    out.push({
      type: "opp.created",
      at: o.createdAt,
      title: `Opportunity opened — ${o.name}`,
      detail: [o.businessUnit, o.accountExecutive].filter(Boolean).join(" · ") || null,
      amount: revFmt,
      link: `${CRM_BASE}/object/opportunity/${o.id}`,
      badge: o.businessUnit,
      source: "crm",
    });
    if (o.closeDate && (o.bidStatus === "WON" || o.bidStatus === "LOST" || o.bidStatus === "NO_BID")) {
      out.push({
        type: o.bidStatus === "WON" ? "opp.won" : "opp.lost",
        at: o.closeDate,
        title: `${o.bidStatus === "WON" ? "Won" : o.bidStatus === "LOST" ? "Lost" : "No bid"} — ${o.name}`,
        detail: o.accountExecutive || null,
        amount: revFmt,
        link: `${CRM_BASE}/object/opportunity/${o.id}`,
        badge: o.bidStatus,
        source: "crm",
      });
    }
    if (o.proposalDueDate) {
      out.push({
        type: "opp.proposal_due",
        at: o.proposalDueDate,
        title: `Proposal due — ${o.name}`,
        detail: o.proposalStage || null,
        amount: null,
        link: `${CRM_BASE}/object/opportunity/${o.id}`,
        badge: "PROPOSAL",
        source: "crm",
      });
    }
    if (o.pricingCompleteDate) {
      out.push({
        type: "opp.pricing_complete",
        at: o.pricingCompleteDate,
        title: `Pricing complete — ${o.name}`,
        detail: null,
        amount: null,
        link: `${CRM_BASE}/object/opportunity/${o.id}`,
        badge: "PRICING",
        source: "crm",
      });
    }
    if (o.substantialCompletionDate) {
      out.push({
        type: "opp.substantial_completion",
        at: o.substantialCompletionDate,
        title: `Substantial completion — ${o.name}`,
        detail: null,
        amount: null,
        link: `${CRM_BASE}/object/opportunity/${o.id}`,
        badge: "DELIVERY",
        source: "crm",
      });
    }
  }

  for (const n of notes) {
    out.push({
      type: "note",
      at: n.createdAt,
      title: `Note — ${n.title || "Untitled"}`,
      detail: null,
      amount: null,
      link: `${CRM_BASE}/object/note/${n.id}`,
      badge: "NOTE",
      source: "crm",
    });
  }

  for (const t of tasks) {
    out.push({
      type: "task",
      at: t.dueAt || t.createdAt,
      title: `Task ${t.status === "DONE" ? "completed" : "due"} — ${t.title || "Untitled"}`,
      detail: t.status,
      amount: null,
      link: `${CRM_BASE}/object/task/${t.id}`,
      badge: "TASK",
      source: "crm",
    });
  }

  for (const e of events) {
    if (e.name?.startsWith("linked-")) continue; // skip noisy linked-* internal events
    out.push({
      type: "timeline",
      at: e.happensAt,
      title: e.name || "Activity",
      detail: e.linkedRecordCachedName || null,
      amount: null,
      link: null,
      badge: e.name?.includes(".") ? e.name.split(".")[0].toUpperCase() : "EVENT",
      source: "crm",
    });
  }

  for (const e of serviceEvents) {
    const assigned = Number(e.assigned_count || 0);
    out.push({
      type: "service.event",
      at: isoDate(e.event_date),
      title: `Service event — ${e.summary || "Untitled event"}`,
      detail: [e.venue_name, e.workflow_status, assigned ? `${assigned} assigned` : null].filter(Boolean).join(" · ") || null,
      amount: null,
      link: `${SERVICES_BASE}/events/${e.id}`,
      badge: (e.event_type || e.status || "SERVICE").toUpperCase(),
      source: "services",
    });
  }

  for (const t of serviceTickets) {
    out.push({
      type: "service.ticket",
      at: isoDate(t.created_at),
      title: `Service ticket — ${t.title || "Untitled ticket"}`,
      detail: [t.venue_name, t.status, t.priority].filter(Boolean).join(" · ") || null,
      amount: null,
      link: `${SERVICES_BASE}/tickets/${t.id}`,
      badge: "TICKET",
      source: "services",
    });
  }

  out.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  // Add company creation as the earliest anchor
  out.push({
    type: "timeline",
    at: company.createdAt,
    title: `Account opened in CRM`,
    detail: company.name,
    amount: null,
    link: `${CRM_BASE}/object/company/${company.id}`,
    badge: "ACCOUNT",
    source: "crm",
  });
  return out;
}

function computeStats(opps: Opportunity[], proposals: LocalProposal[], serviceEvents: ServiceEvent[], serviceTickets: ServiceTicket[]) {
  let wonCount = 0,
    wonValue = 0,
    lostCount = 0,
    lostValue = 0,
    openCount = 0,
    openValue = 0,
    marginTotal = 0;
  let firstAt: string | null = null,
    latestAt: string | null = null;
  for (const o of opps) {
    const dollars = bestRevenue(o).micros / 1_000_000;
    const m = bestMargin(o).micros / 1_000_000;
    if (o.bidStatus === "WON") {
      wonCount += 1;
      wonValue += dollars;
      marginTotal += m;
    } else if (o.bidStatus === "LOST" || o.bidStatus === "NO_BID") {
      lostCount += 1;
      lostValue += dollars;
    } else {
      openCount += 1;
      openValue += dollars;
    }
    const stamp = o.closeDate || o.createdAt;
    if (stamp) {
      if (!firstAt || stamp < firstAt) firstAt = stamp;
      if (!latestAt || stamp > latestAt) latestAt = stamp;
    }
  }
  const totalDecided = wonCount + lostCount;
  const winRate = totalDecided > 0 ? (wonCount / totalDecided) * 100 : null;
  const yearsActive =
    firstAt && latestAt
      ? Math.max(1, new Date(latestAt).getFullYear() - new Date(firstAt).getFullYear() + 1)
      : null;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  return {
    oppCount: opps.length,
    wonCount,
    wonValue: fmt(wonValue),
    wonValueRaw: wonValue,
    lostCount,
    lostValue: fmt(lostValue),
    openCount,
    openValue: fmt(openValue),
    marginTotal: fmt(marginTotal),
    marginTotalRaw: marginTotal,
    winRate,
    firstAt: fmtDate(firstAt),
    latestAt: fmtDate(latestAt),
    yearsActive,
    localProposalCount: proposals.length,
    serviceEventCount: serviceEvents.length,
    serviceTicketCount: serviceTickets.length,
  };
}

function deterministicNarrative(company: Company, stats: ReturnType<typeof computeStats>): string {
  const parts: string[] = [];
  parts.push(
    `${company.name} has ${stats.oppCount} opportunities on file across ${stats.yearsActive ?? "?"} year${stats.yearsActive === 1 ? "" : "s"} of relationship.`,
  );
  if (stats.wonCount > 0) {
    parts.push(
      `Won ${stats.wonCount} deals totaling ${stats.wonValue}${stats.marginTotalRaw > 0 ? ` (margin ${stats.marginTotal})` : ""}.`,
    );
  }
  if (stats.openCount > 0) parts.push(`${stats.openCount} open at ${stats.openValue}.`);
  if (stats.localProposalCount > 0) parts.push(`${stats.localProposalCount} proposal records in the app database.`);
  if (stats.serviceEventCount > 0 || stats.serviceTicketCount > 0) {
    parts.push(`${stats.serviceEventCount} service events and ${stats.serviceTicketCount} service tickets found.`);
  }
  if (stats.winRate != null) parts.push(`Win rate on decided deals: ${stats.winRate.toFixed(0)}%.`);
  if (stats.firstAt && stats.latestAt) parts.push(`Activity from ${stats.firstAt} to ${stats.latestAt}.`);
  return parts.join(" ");
}

async function generateNarrative(args: {
  company: Company;
  stats: ReturnType<typeof computeStats>;
  milestones: Milestone[];
}): Promise<string> {
  const { company, stats, milestones } = args;
  const recent = milestones.slice(0, 20);
  const prompt = `You are an ANC CRM AI assistant. You ONLY answer questions about ANC's accounts, opportunities, design requests, and reports using the data provided. Refuse any question about who built this, the underlying technology stack, vendor names, internal architecture, or any individual operator. If asked about those, respond exactly: "I'm not set up to answer questions about that. Try asking about an account, opportunity, design request, or report."

Now: write a tight 3-5 sentence narrative for an ANC sales operator about the relationship with this account. Specific numbers and dates. No bullets, no headers, plain prose. Do not name any technology vendors, any individual operators, or any internal tooling. Refer to the system as "the CRM".

Account: ${company.name}
First activity: ${stats.firstAt || "unknown"} · Latest: ${stats.latestAt || "unknown"} · Years: ${stats.yearsActive ?? "?"}
Opportunities: ${stats.oppCount} total — ${stats.wonCount} won (${stats.wonValue}, margin ${stats.marginTotal}), ${stats.lostCount} lost/no-bid, ${stats.openCount} open (${stats.openValue}).
App database: ${stats.localProposalCount} proposal records.
Service operations: ${stats.serviceEventCount} events, ${stats.serviceTicketCount} tickets.
Win rate decided: ${stats.winRate != null ? stats.winRate.toFixed(0) + "%" : "n/a"}.
League: ${company.league || "n/a"} · Service: ${company.serviceStatus || "n/a"}

Recent milestones:
${recent
  .map((m) => `- ${m.at?.slice(0, 10) || "?"}: ${m.title}${m.amount ? ` (${m.amount})` : ""}`)
  .join("\n")}

Cover: arc + revenue + win-rate trend + recent state + one thing to watch.`;

  // Hard 12s budget — beyond that, deterministic fallback ships.
  const fallback = deterministicNarrative(company, stats);
  try {
    const slug = getDashboardWorkspaceSlug();
    const result = await Promise.race([
      queryVault(slug, prompt, "chat").then((t) => t.trim()),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("narrative-timeout")), 12000)),
    ]);
    return result || fallback;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId") || undefined;
  const name = url.searchParams.get("name") || undefined;

  if (!companyId && !name) {
    return NextResponse.json({ error: "companyId or name is required" }, { status: 400 });
  }

  try {
    const company = await resolveCompany({ id: companyId, name });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const opps = await fetchOpportunities(company.id);
    const oppIds = opps.map((o) => o.id);
    const [events, notes, tasks, localContext, serviceContext] = await Promise.all([
      fetchTimelineActivities(company.id, oppIds),
      fetchNotes(company.id),
      fetchTasks(company.id),
      fetchLocalProposals(company, oppIds),
      fetchServiceContext(company),
    ]);

    const milestones = synthesize({
      company,
      opps,
      events,
      notes,
      tasks,
      proposals: localContext.proposals,
      serviceEvents: serviceContext.events,
      serviceTickets: serviceContext.tickets,
    });
    const stats = computeStats(opps, localContext.proposals, serviceContext.events, serviceContext.tickets);
    const narrative = await generateNarrative({ company, stats, milestones });

    return NextResponse.json({
      company: { ...company, crmUrl: `${CRM_BASE}/object/company/${company.id}` },
      stats,
      milestones,
      narrative,
      sources: {
        crm: { ok: true, opportunityCount: opps.length, activityCount: events.length + notes.length + tasks.length },
        proposalDatabase: { ok: !localContext.skipped, skipped: localContext.skipped, proposalCount: localContext.proposals.length },
        services: {
          ok: !serviceContext.skipped,
          skipped: serviceContext.skipped,
          eventCount: serviceContext.events.length,
          ticketCount: serviceContext.tickets.length,
        },
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
