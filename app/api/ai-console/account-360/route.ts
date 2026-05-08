import { NextRequest, NextResponse } from "next/server";
import { queryVault, getDashboardWorkspaceSlug } from "@/lib/anything-llm";

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

const CRM_BASE = "https://crm.ancsports.net";

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

type Milestone = {
  type:
    | "opp.created"
    | "opp.won"
    | "opp.lost"
    | "opp.proposal_due"
    | "opp.pricing_complete"
    | "opp.substantial_completion"
    | "ticket.opened"
    | "ticket.resolved"
    | "design.created"
    | "note"
    | "task"
    | "timeline";
  at: string;
  title: string;
  detail: string | null;
  amount: string | null;
  link: string | null;
  badge: string | null;
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

function synthesize(args: {
  company: Company;
  opps: Opportunity[];
  events: any[];
  notes: any[];
  tasks: any[];
}): Milestone[] {
  const { company, opps, events, notes, tasks } = args;
  const out: Milestone[] = [];

  for (const o of opps) {
    out.push({
      type: "opp.created",
      at: o.createdAt,
      title: `Opportunity opened — ${o.name}`,
      detail: [o.businessUnit, o.accountExecutive].filter(Boolean).join(" · ") || null,
      amount: fmtMoney(o.amount),
      link: `${CRM_BASE}/object/opportunity/${o.id}`,
      badge: o.businessUnit,
    });
    if (o.closeDate && (o.bidStatus === "WON" || o.bidStatus === "LOST" || o.bidStatus === "NO_BID")) {
      out.push({
        type: o.bidStatus === "WON" ? "opp.won" : "opp.lost",
        at: o.closeDate,
        title: `${o.bidStatus === "WON" ? "Won" : o.bidStatus === "LOST" ? "Lost" : "No bid"} — ${o.name}`,
        detail: o.accountExecutive || null,
        amount: fmtMoney(o.amount),
        link: `${CRM_BASE}/object/opportunity/${o.id}`,
        badge: o.bidStatus,
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
  });
  return out;
}

function computeStats(opps: Opportunity[]) {
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
    const dollars = o.amount?.amountMicros ? Number(o.amount.amountMicros) / 1_000_000 : 0;
    const m = o.margin?.amountMicros ? Number(o.margin.amountMicros) / 1_000_000 : 0;
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
  };
}

async function generateNarrative(args: {
  company: Company;
  stats: ReturnType<typeof computeStats>;
  milestones: Milestone[];
}): Promise<string> {
  const { company, stats, milestones } = args;
  const recent = milestones.slice(0, 30);
  const prompt = `You are summarizing the relationship between ANC (LED display + venue services for stadiums) and one of our accounts. Write a tight 3-5 sentence narrative for an internal sales operator. Be specific with numbers and dates from the data. No fluff. No bullet points. No headers. Plain prose only.

Account: ${company.name}
First activity: ${stats.firstAt || "unknown"} · Latest activity: ${stats.latestAt || "unknown"} · Years active: ${stats.yearsActive ?? "?"}
Opportunities: ${stats.oppCount} total — ${stats.wonCount} won (${stats.wonValue}, margin ${stats.marginTotal}), ${stats.lostCount} lost/no-bid, ${stats.openCount} open (${stats.openValue}).
Win rate on decided deals: ${stats.winRate != null ? stats.winRate.toFixed(0) + "%" : "n/a"}.
League: ${company.league || "n/a"} · Service status: ${company.serviceStatus || "n/a"} · Venue: ${company.venueName || "n/a"}

Most recent milestones (newest first):
${recent
  .slice(0, 20)
  .map((m) => `- ${m.at?.slice(0, 10) || "?"}: ${m.title}${m.amount ? ` (${m.amount})` : ""}${m.detail ? ` — ${m.detail}` : ""}`)
  .join("\n")}

Cover: relationship arc + total revenue + win-rate trend + recent state (active/quiet/at-risk) + one specific thing the operator should pay attention to next. Reference real dollar amounts and dates from the data.`;

  try {
    const slug = getDashboardWorkspaceSlug();
    const text = await queryVault(slug, prompt, "chat");
    return text.trim();
  } catch (err) {
    return `${company.name} has ${stats.oppCount} opportunities on file (${stats.wonCount} won at ${stats.wonValue}, ${stats.openCount} open at ${stats.openValue}). Active from ${stats.firstAt || "?"} to ${stats.latestAt || "?"}. Narrative generator unavailable: ${(err as Error).message}.`;
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
    const [events, notes, tasks] = await Promise.all([
      fetchTimelineActivities(company.id, oppIds),
      fetchNotes(company.id),
      fetchTasks(company.id),
    ]);

    const milestones = synthesize({ company, opps, events, notes, tasks });
    const stats = computeStats(opps);
    const narrative = await generateNarrative({ company, stats, milestones });

    return NextResponse.json({
      company: { ...company, crmUrl: `${CRM_BASE}/object/company/${company.id}` },
      stats,
      milestones,
      narrative,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
