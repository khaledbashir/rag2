import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { EmailQuoteIntake } from "@/services/intake/emailToQuoteIntake";
import { logActivity } from "@/services/proposal/server/activityLogService";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";
const EXPORT_DIR = "/tmp/anc-exports";
const TWENTY_ACTIVITY_DASHBOARD_ID =
  process.env.TWENTY_ACTIVITY_DASHBOARD_ID ||
  "ab58ff29-9eb6-4d83-bfe2-ded28ea030ee";
const TWENTY_ACTIVITY_OBJECT_ENABLED =
  (process.env.TWENTY_ACTIVITY_OBJECT_ENABLED || "true").toLowerCase() !== "false";
const CRM_PUBLIC_BASE = "https://crm.ancsports.net";

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export type CrmSyncPayloadLike = {
  action: "rfp_analyzed" | "proposal_generated" | "deal_won";
  companyName: string;
  venueName?: string;
  dealName: string;
  amount?: number;
  ledSqFt?: number;
  manufacturer?: string;
  proposalUrl?: string;
  estimatorName?: string;
};

export type ExistingCrmOpportunityResolution =
  | {
      status: "matched";
      opportunityId: string;
      companyId: string;
      opportunityName: string;
      companyName: string;
      match: "exact_opportunity";
    }
  | {
      status: "review_required";
      reason: string;
      companyId?: string;
      companyName?: string;
      candidates?: Array<{ id: string; name: string }>;
    };

function getBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (raw && !raw.includes("localhost")) {
    return raw.replace(/\/+$/, "");
  }
  return "https://proposals.anc.com";
}

async function twentyGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TWENTY_BASE}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await res.json().catch(() => ({}))) as GraphqlResponse<T>;
  if (!res.ok || body.errors?.length) {
    const err = body.errors?.map((entry) => entry.message).filter(Boolean).join(", ");
    throw new Error(err || `Twenty GraphQL ${res.status}`);
  }
  if (!body.data) {
    throw new Error("Twenty GraphQL returned no data");
  }
  return body.data;
}

async function createOpportunityNote(opportunityId: string, title: string, markdown: string) {
  const note = await twentyGraphql<{ createNote: { id: string } }>(
    `
      mutation CreateNote($data: NoteCreateInput!) {
        createNote(data: $data) {
          id
        }
      }
    `,
    {
      data: {
        title,
        bodyV2: { markdown },
      },
    },
  );

  await twentyGraphql(
    `
      mutation CreateNoteTarget($data: NoteTargetCreateInput!) {
        createNoteTarget(data: $data) {
          id
        }
      }
    `,
    {
      data: {
        noteId: note.createNote.id,
        targetOpportunityId: opportunityId,
      },
    },
  );
}

async function findWorkspaceMemberIdByEmail(email?: string | null): Promise<string | null> {
  if (!email) return null;

  const response = await twentyGraphql<{
    workspaceMembers: { edges: Array<{ node: { id: string } }> };
  }>(
    `
      query FindWorkspaceMember($filter: WorkspaceMemberFilterInput) {
        workspaceMembers(filter: $filter) {
          edges {
            node {
              id
            }
          }
        }
      }
    `,
    {
      filter: {
        userEmail: { eq: email.trim() },
      },
    },
  );

  return response.workspaceMembers.edges[0]?.node.id || null;
}

async function postDashboardActivity(input: {
  name: string;
  message: string;
  workspaceMemberEmail?: string | null;
  targetOpportunityId?: string | null;
  properties?: Record<string, unknown>;
}) {
  const workspaceMemberId = await findWorkspaceMemberIdByEmail(input.workspaceMemberEmail);

  await twentyGraphql(
    `
      mutation CreateTimelineActivity($data: TimelineActivityCreateInput!) {
        createTimelineActivity(data: $data) {
          id
        }
      }
    `,
    {
      data: {
        name: input.name,
        targetDashboardId: TWENTY_ACTIVITY_DASHBOARD_ID,
        targetOpportunityId: input.targetOpportunityId || undefined,
        workspaceMemberId: workspaceMemberId || undefined,
        properties: {
          message: input.message,
          ...(input.properties || {}),
        },
      },
    },
  );
}

function cleanObjectPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function truncate(value: string, max = 255) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function normalizeCrmName(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

async function createProposalEngineActivityRecord(input: {
  name: string;
  eventType: string;
  eventAt?: string;
  actorEmail?: string | null;
  actorName?: string | null;
  proposalId?: string | null;
  opportunityId?: string | null;
  workspaceUrl?: string | null;
  details?: Record<string, unknown>;
}) {
  if (!TWENTY_ACTIVITY_OBJECT_ENABLED) {
    return;
  }

  await twentyGraphql(
    `
      mutation CreateProposalEngineActivity($data: ProposalEngineActivityCreateInput!) {
        createProposalEngineActivity(data: $data) {
          id
        }
      }
    `,
    {
      data: cleanObjectPayload({
        name: truncate(input.name),
        eventType: input.eventType,
        eventAt: input.eventAt || new Date().toISOString(),
        actorEmail: input.actorEmail || undefined,
        actorName: input.actorName || undefined,
        proposalId: input.proposalId || undefined,
        opportunityId: input.opportunityId || undefined,
        workspaceUrl: input.workspaceUrl || undefined,
        details: input.details || {},
      }),
    },
  );
}

function safeFilenamePart(value: string) {
  return value
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function formatTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(".000Z", "Z");
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildWorkspaceUrl(proposalId?: string | null) {
  return proposalId ? `${getBaseUrl()}/projects/${proposalId}` : null;
}

function buildEstimatorUrl(proposalId?: string | null) {
  return proposalId ? `${getBaseUrl()}/estimator/${proposalId}` : null;
}

async function findExactCompany(companyName: string): Promise<{ id: string; name: string } | null> {
  const normalized = normalizeCrmName(companyName);
  if (!normalized) return null;

  const result = await twentyGraphql<{
    companies: { edges: Array<{ node: { id: string; name: string } }> };
  }>(
    `query FindCompany($filter: CompanyFilterInput) {
      companies(filter: $filter, first: 10) {
        edges { node { id name } }
      }
    }`,
    { filter: { name: { ilike: `%${companyName.trim()}%` } } },
  );

  return (
    result.companies.edges
      .map((edge) => edge.node)
      .find((company) => normalizeCrmName(company.name) === normalized) || null
  );
}

async function createCompanyForHandoff(input: {
  name: string;
  venueName?: string | null;
}): Promise<{ id: string; name: string }> {
  const result = await twentyGraphql<{ createCompany: { id: string; name: string } }>(
    `
      mutation CreateCompany($data: CompanyCreateInput!) {
        createCompany(data: $data) {
          id
          name
        }
      }
    `,
    {
      data: cleanObjectPayload({
        name: truncate(input.name),
        venueName: input.venueName || undefined,
      }),
    },
  );

  return result.createCompany;
}

async function findExactOpportunityForCompany(
  companyId: string,
  possibleNames: string[],
): Promise<ExistingCrmOpportunityResolution> {
  const names = uniqueNonEmpty(possibleNames);
  const normalizedNames = new Set(names.map(normalizeCrmName));
  const candidateMap = new Map<string, { id: string; name: string }>();

  for (const name of names) {
    const result = await twentyGraphql<{
      opportunities: {
        edges: Array<{ node: { id: string; name: string | null; companyId?: string | null } }>;
      };
    }>(
      `query FindOpportunity($filter: OpportunityFilterInput) {
        opportunities(filter: $filter, first: 10) {
          edges { node { id name companyId } }
        }
      }`,
      {
        filter: {
          companyId: { eq: companyId },
          name: { ilike: `%${name}%` },
        },
      },
    );

    for (const edge of result.opportunities.edges) {
      const candidateName = edge.node.name || "";
      candidateMap.set(edge.node.id, { id: edge.node.id, name: candidateName });
      if (normalizedNames.has(normalizeCrmName(candidateName))) {
        return {
          status: "matched",
          opportunityId: edge.node.id,
          companyId,
          opportunityName: candidateName,
          companyName: "",
          match: "exact_opportunity",
        };
      }
    }
  }

  return {
    status: "review_required",
    reason: "No exact opportunity match found for the existing account.",
    companyId,
    candidates: Array.from(candidateMap.values()).slice(0, 5),
  };
}

async function createOpportunityForHandoff(input: {
  name: string;
  companyId: string;
  ledSqFt?: number | null;
  proposalUrl?: string | null;
  statusUpdate?: string | null;
}) {
  const result = await twentyGraphql<{
    createOpportunity: {
      id: string;
      name: string | null;
      companyId: string | null;
      bidStatus: string | null;
      ledSqFt: number | null;
      proposalUrl: string | null;
    };
  }>(
    `
      mutation CreateOpportunity($data: OpportunityCreateInput!) {
        createOpportunity(data: $data) {
          id
          name
          companyId
          bidStatus
          ledSqFt
          proposalUrl
        }
      }
    `,
    {
      data: cleanObjectPayload({
        name: truncate(input.name),
        companyId: input.companyId,
        bidStatus: "SCOPING",
        ledSqFt: input.ledSqFt || undefined,
        proposalUrl: input.proposalUrl || undefined,
        statusUpdate: input.statusUpdate ? truncate(input.statusUpdate, 500) : undefined,
      }),
    },
  );

  return result.createOpportunity;
}

async function updateOpportunityForHandoff(input: {
  opportunityId: string;
  ledSqFt?: number | null;
  proposalUrl?: string | null;
  statusUpdate?: string | null;
}) {
  const result = await twentyGraphql<{
    updateOpportunity: {
      id: string;
      name: string | null;
      companyId: string | null;
      bidStatus: string | null;
      ledSqFt: number | null;
      proposalUrl: string | null;
    };
  }>(
    `
      mutation UpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
        updateOpportunity(id: $id, data: $data) {
          id
          name
          companyId
          bidStatus
          ledSqFt
          proposalUrl
        }
      }
    `,
    {
      id: input.opportunityId,
      data: cleanObjectPayload({
        bidStatus: "SCOPING",
        ledSqFt: input.ledSqFt || undefined,
        proposalUrl: input.proposalUrl || undefined,
        statusUpdate: input.statusUpdate ? truncate(input.statusUpdate, 500) : undefined,
      }),
    },
  );

  return result.updateOpportunity;
}

export async function resolveExistingOpportunityForCrmSync(
  payload: CrmSyncPayloadLike,
): Promise<ExistingCrmOpportunityResolution> {
  const companyName = payload.companyName?.trim();
  const dealName = payload.dealName?.trim();
  if (!companyName) {
    return { status: "review_required", reason: "Missing account name." };
  }
  if (!dealName) {
    return { status: "review_required", reason: "Missing opportunity name." };
  }

  const company = await findExactCompany(companyName);
  if (!company) {
    return {
      status: "review_required",
      reason: `No exact account match found for "${companyName}".`,
    };
  }

  const possibleNames = uniqueNonEmpty([
    dealName,
    payload.venueName ? `${companyName} - ${payload.venueName}` : null,
    payload.venueName ? `${companyName} — ${payload.venueName}` : null,
    companyName,
  ]);
  const resolution = await findExactOpportunityForCompany(company.id, possibleNames);
  if (resolution.status === "matched") {
    return { ...resolution, companyName: company.name };
  }
  return { ...resolution, companyId: company.id, companyName: company.name };
}

export function buildCrmReviewRequiredMessage(
  resolution: ExistingCrmOpportunityResolution,
  context: { companyName?: string | null; dealName?: string | null; action?: string } = {},
) {
  const parts = [
    "CRM review required",
    context.action ? `action=${context.action}` : null,
    context.companyName ? `account=${context.companyName}` : null,
    context.dealName ? `opportunity=${context.dealName}` : null,
    resolution.status === "review_required" ? resolution.reason : null,
  ];
  return parts.filter(Boolean).join(" | ");
}

export function buildRfpAnalyzedNoteMarkdown(input: {
  projectName?: string | null;
  clientName?: string | null;
  venue?: string | null;
  filename: string;
  screensCount: number;
  relevantPages?: number;
  processingTimeMs?: number;
  ledSqFt?: number | null;
  analysisId: string;
  createdAt?: Date | string;
}) {
  const lines = [
    `RFP analysis completed in Proposal Engine.`,
    `Project: ${input.projectName || input.clientName || "Untitled project"}`,
    `Client: ${input.clientName || "Unknown"}`,
    input.venue ? `Venue: ${input.venue}` : null,
    `File: ${input.filename}`,
    `Displays identified: ${input.screensCount}`,
    input.ledSqFt ? `Estimated LED area: ${Math.round(input.ledSqFt).toLocaleString()} sq ft` : null,
    input.relevantPages ? `Pages processed: ${input.relevantPages}` : null,
    input.processingTimeMs ? `Processing time: ${Math.round(input.processingTimeMs / 1000)}s` : null,
    input.createdAt ? `Completed at: ${formatTimestamp(input.createdAt)}` : null,
    `Analysis: ${getBaseUrl()}/tools/rfp-analyzer/history/${input.analysisId}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildProposalCreatedNoteMarkdown(input: {
  proposalId: string;
  clientName: string;
  venue?: string | null;
  screenCount: number;
  analysisId?: string | null;
}) {
  const lines = [
    `Proposal workspace created in Proposal Engine.`,
    `Client: ${input.clientName}`,
    input.venue ? `Venue: ${input.venue}` : null,
    `Scope: ${pluralize(input.screenCount, "display")}`,
    input.analysisId ? `Source analysis: ${getBaseUrl()}/tools/rfp-analyzer/history/${input.analysisId}` : null,
    `Workspace: ${getBaseUrl()}/projects/${input.proposalId}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function formatDisplayDimension(display: { widthFt?: number; heightFt?: number }) {
  if (!display.widthFt || !display.heightFt) return "dimensions needed";
  const fmt = (value: number) => Number.isInteger(value) ? `${value}'` : `${Number(value.toFixed(2))}'`;
  return `${fmt(display.heightFt)} x ${fmt(display.widthFt)}`;
}

function countIntakeDisplays(intake: EmailQuoteIntake) {
  return intake.estimatorAnswers.displays.length;
}

function totalIntakeLedSqFt(intake: EmailQuoteIntake) {
  return intake.estimatorAnswers.displays.reduce((sum, display) => {
    const width = Number(display.widthFt || display.rfpWidthFt || 0);
    const height = Number(display.heightFt || display.rfpHeightFt || 0);
    const quantity = Number(display.quantity || 1);
    return sum + width * height * quantity;
  }, 0);
}

function buildMissingInfoFollowUp(intake: EmailQuoteIntake) {
  const name = intake.requesterName?.split(/\s+/)[0] || "";
  const questions = intake.aiReview?.questions?.length
    ? intake.aiReview.questions.map((item) => item.question)
    : intake.missingAssumptions.map((item) => {
        if (/display dimensions/i.test(item)) return "Can you confirm the missing display dimensions?";
        if (/pixel pitch/i.test(item)) return "Do you have a preferred pixel pitch, or should we assume a standard outdoor option?";
        if (/vendor/i.test(item)) return "Is there a preferred product or vendor for this rough estimate?";
        if (/indoor|outdoor/i.test(item)) return "Can you confirm whether each display location is indoor or outdoor?";
        return `Can you confirm the ${item}?`;
      });

  const uniqueQuestions = Array.from(new Set(questions)).slice(0, 6);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const lines = [
    greeting,
    "",
    "Thanks for sending this over. We can start putting together the rough estimate from the scope below.",
    "",
    "To tighten up the estimate, can you confirm the following?",
    ...uniqueQuestions.map((question) => `- ${question}`),
    "",
    "Once we have those details, we can firm up the hardware, installation, and related cost buckets by project.",
  ];

  return lines.join("\n");
}

export function buildEmailIntakeNoteMarkdown(input: {
  proposalId: string;
  intake: EmailQuoteIntake;
  followUpEmail: string;
}) {
  const intake = input.intake;
  const displayLines = intake.estimatorAnswers.displays.map((display) => {
    const qty = Number(display.quantity || 1);
    return `- ${display.displayName || "Display"}: qty ${qty}, ${formatDisplayDimension(display)}`;
  });
  const questions = (intake.aiReview?.questions || []).slice(0, 6);
  const risks = (intake.aiReview?.riskFlags || []).slice(0, 6);

  const lines = [
    "Inbound email intake reviewed and converted into a quote draft.",
    `Project: ${intake.title}`,
    `Client: ${intake.clientName}`,
    intake.venueName ? `Venue: ${intake.venueName}` : null,
    `Scope: ${countIntakeDisplays(intake)} display/option${countIntakeDisplays(intake) === 1 ? "" : "s"}`,
    totalIntakeLedSqFt(intake) ? `Estimated LED area: ${Math.round(totalIntakeLedSqFt(intake)).toLocaleString()} sq ft` : null,
    `Workspace: ${buildEstimatorUrl(input.proposalId)}`,
    "",
    "Displays/options:",
    ...displayLines,
    "",
    intake.aiReview?.summary ? `Review summary: ${intake.aiReview.summary}` : intake.summary,
    questions.length ? "" : null,
    questions.length ? "Questions to resolve:" : null,
    ...questions.map((item) => `- ${item.question}${item.why ? ` (${item.why})` : ""}`),
    risks.length ? "" : null,
    risks.length ? "Risk flags:" : null,
    ...risks.map((item) => `- ${item}`),
    "",
    "Suggested client follow-up:",
    input.followUpEmail,
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

export async function createEmailIntakeCrmHandoff(input: {
  proposalId: string;
  intake: EmailQuoteIntake;
  originalEmailBody: string;
  workspaceMemberEmail?: string | null;
  actorName?: string | null;
}) {
  const companyName = input.intake.clientName?.trim() || "Client";
  const dealName = input.intake.title?.trim() || `${companyName} - Email Intake`;
  const company = await findExactCompany(companyName) || await createCompanyForHandoff({
    name: companyName,
    venueName: input.intake.venueName,
  });
  const ledSqFt = totalIntakeLedSqFt(input.intake);
  const estimatorUrl = buildEstimatorUrl(input.proposalId);
  const statusUpdate = `${countIntakeDisplays(input.intake)} display/option intake converted from inbound email.`;
  const resolution = await findExactOpportunityForCompany(company.id, [
    dealName,
    input.intake.venueName ? `${companyName} - ${input.intake.venueName}` : null,
    input.intake.venueName ? `${companyName} — ${input.intake.venueName}` : null,
  ].filter(Boolean) as string[]);

  let action: "created" | "updated" = "created";
  let opportunity: {
    id: string;
    name: string | null;
    companyId: string | null;
    bidStatus: string | null;
    ledSqFt: number | null;
    proposalUrl: string | null;
  };

  if (resolution.status === "matched") {
    action = "updated";
    opportunity = await updateOpportunityForHandoff({
      opportunityId: resolution.opportunityId,
      ledSqFt: ledSqFt || undefined,
      proposalUrl: estimatorUrl,
      statusUpdate,
    });
  } else {
    opportunity = await createOpportunityForHandoff({
      name: dealName,
      companyId: company.id,
      ledSqFt: ledSqFt || undefined,
      proposalUrl: estimatorUrl,
      statusUpdate,
    });
  }

  await prisma.proposal.update({
    where: { id: input.proposalId },
    data: { twentyOpportunityId: opportunity.id },
  });

  const followUpEmail = buildMissingInfoFollowUp(input.intake);
  const markdown = buildEmailIntakeNoteMarkdown({
    proposalId: input.proposalId,
    intake: input.intake,
    followUpEmail,
  });

  await createOpportunityNote(opportunity.id, "Email intake: quote draft started", markdown);
  await postProposalEngineActivity({
    name: `Email intake handoff - ${dealName}`,
    eventType: "proposalEngine.emailIntakeHandoff",
    message: `Inbound email converted into CRM opportunity and quote draft for ${dealName}.`,
    workspaceMemberEmail: input.workspaceMemberEmail,
    actorName: input.actorName,
    targetOpportunityId: opportunity.id,
    proposalId: input.proposalId,
    workspaceUrl: estimatorUrl,
    properties: {
      proposalId: input.proposalId,
      displayCount: countIntakeDisplays(input.intake),
      ledSqFt,
      action,
      source: "email-to-quote-intake",
    },
  }).catch((err) => {
    console.warn("[email-intake CRM handoff] activity mirror failed:", err?.message || err);
  });

  await logActivity(
    input.proposalId,
    "crm_handoff_created",
    action === "created"
      ? "CRM opportunity created from email intake"
      : "CRM opportunity updated from email intake",
    input.actorName || input.workspaceMemberEmail || "Proposal Engine",
    {
      source: "email-to-quote-intake",
      opportunityId: opportunity.id,
      companyId: company.id,
      action,
      followUpEmail,
    },
  );

  return {
    action,
    company: {
      id: company.id,
      name: company.name,
      url: `${CRM_PUBLIC_BASE}/object/company/${company.id}`,
    },
    opportunity: {
      id: opportunity.id,
      name: opportunity.name || dealName,
      url: `${CRM_PUBLIC_BASE}/object/opportunity/${opportunity.id}`,
      bidStatus: opportunity.bidStatus,
      ledSqFt: opportunity.ledSqFt,
    },
    estimatorUrl,
    followUpEmail,
  };
}

export function buildClientChangeRequestNoteMarkdown(input: {
  proposalId: string;
  requesterName: string;
  requesterEmail?: string | null;
  count?: number;
  message?: string | null;
}) {
  const lines = [
    input.count && input.count > 1
      ? `Client submitted ${pluralize(input.count, "change request")} through the share link.`
      : `Client submitted a change request through the share link.`,
    `Requester: ${input.requesterName}${input.requesterEmail ? ` (${input.requesterEmail})` : ""}`,
    input.message ? `Request: ${input.message.slice(0, 500)}` : null,
    `Workspace: ${getBaseUrl()}/projects/${input.proposalId}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildProposalStatusNoteMarkdown(input: {
  proposalId: string;
  clientName: string;
  status: "SIGNED" | "CLOSED";
  venue?: string | null;
}) {
  const lines = [
    input.status === "SIGNED"
      ? `Proposal signed in Proposal Engine.`
      : `Proposal marked closed in Proposal Engine.`,
    `Client: ${input.clientName}`,
    input.venue ? `Venue: ${input.venue}` : null,
    `Workspace: ${getBaseUrl()}/projects/${input.proposalId}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildArtifactNoteMarkdown(input: {
  summary: string;
  artifacts: Array<{ label: string; url: string; filename?: string | null }>;
  workspaceUrl?: string | null;
}) {
  const lines = [input.summary];
  for (const artifact of input.artifacts) {
    const suffix = artifact.filename ? ` (${artifact.filename})` : "";
    lines.push(`- ${artifact.label}: ${artifact.url}${suffix}`);
  }
  if (input.workspaceUrl) {
    lines.push(`Workspace: ${input.workspaceUrl}`);
  }
  return lines.join("\n");
}

export function buildRecallMeetingNoteMarkdown(input: {
  status: "scheduled" | "done" | "failed" | "review_required";
  botId?: string | null;
  meetingUrl?: string | null;
  meetingTitle?: string | null;
  joinAt?: string | null;
  scheduledBy?: string | null;
  transcriptUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  participantEventsUrl?: string | null;
  meetingMetadataUrl?: string | null;
  recordingId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  proposalId?: string | null;
}) {
  const statusLabel =
    input.status === "scheduled"
      ? "Meeting recorder scheduled."
      : input.status === "done"
        ? "Meeting recording completed."
        : input.status === "failed"
          ? "Meeting recorder failed."
          : "Meeting recording needs review.";

  const lines = [
    statusLabel,
    input.meetingTitle ? `Meeting: ${input.meetingTitle}` : null,
    input.botId ? `Recorder ID: ${input.botId}` : null,
    input.recordingId ? `Recording ID: ${input.recordingId}` : null,
    input.joinAt ? `Scheduled join: ${formatTimestamp(input.joinAt)}` : null,
    input.scheduledBy ? `Scheduled by: ${input.scheduledBy}` : null,
    input.meetingUrl ? `Meeting URL: ${input.meetingUrl}` : null,
    input.proposalId ? `Workspace: ${buildWorkspaceUrl(input.proposalId)}` : null,
    input.failureCode ? `Failure code: ${input.failureCode}` : null,
    input.failureMessage ? `Failure detail: ${input.failureMessage}` : null,
  ];

  const artifacts = [
    input.transcriptUrl ? `- Transcript: ${input.transcriptUrl}` : null,
    input.videoUrl ? `- Video recording: ${input.videoUrl}` : null,
    input.audioUrl ? `- Audio recording: ${input.audioUrl}` : null,
    input.participantEventsUrl ? `- Participant events: ${input.participantEventsUrl}` : null,
    input.meetingMetadataUrl ? `- Meeting metadata: ${input.meetingMetadataUrl}` : null,
  ].filter(Boolean);

  if (artifacts.length) {
    lines.push("", "Artifacts:", ...artifacts);
  }

  return lines.filter(Boolean).join("\n");
}

async function postProposalEngineActivity(input: {
  name: string;
  eventType: string;
  message: string;
  workspaceMemberEmail?: string | null;
  actorName?: string | null;
  targetOpportunityId?: string | null;
  proposalId?: string | null;
  workspaceUrl?: string | null;
  eventAt?: string;
  properties?: Record<string, unknown>;
}) {
  await postDashboardActivity({
    name: input.eventType,
    message: input.message,
    workspaceMemberEmail: input.workspaceMemberEmail,
    targetOpportunityId: input.targetOpportunityId,
    properties: input.properties,
  });

  await createProposalEngineActivityRecord({
    name: input.name,
    eventType: input.eventType,
    eventAt: input.eventAt,
    actorEmail: input.workspaceMemberEmail,
    actorName: input.actorName,
    proposalId: input.proposalId,
    opportunityId: input.targetOpportunityId,
    workspaceUrl: input.workspaceUrl,
    details: {
      message: input.message,
      ...(input.properties || {}),
    },
  });
}

async function resolveOpportunityIdForProposal(proposalId: string): Promise<string | null> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      activityLogs: {
        where: { action: "created" },
        orderBy: { createdAt: "asc" },
        select: { metadata: true },
        take: 5,
      },
    },
  });

  const analysisId = proposal?.activityLogs
    .map((entry) => entry.metadata as Record<string, unknown> | null)
    .find((metadata) => metadata?.source === "rfp_analysis" && typeof metadata.analysisId === "string")
    ?.analysisId;

  if (typeof analysisId !== "string") {
    return null;
  }

  const analysis = await prisma.rfpAnalysis.findUnique({
    where: { id: analysisId },
    select: { twentyOpportunityId: true },
  });

  return analysis?.twentyOpportunityId || null;
}

export async function postRfpAnalyzedNote(analysisId: string, opportunityId?: string | null) {
  const analysis = await prisma.rfpAnalysis.findUnique({
    where: { id: analysisId },
    select: {
      id: true,
      projectName: true,
      clientName: true,
      venue: true,
      filename: true,
      screens: true,
      relevantPages: true,
      processingTimeMs: true,
      createdAt: true,
      createdBy: true,
      twentyOpportunityId: true,
    },
  });

  const targetOpportunityId = opportunityId || analysis?.twentyOpportunityId;
  if (!analysis || !targetOpportunityId) {
    return;
  }

  const screens = Array.isArray(analysis.screens) ? (analysis.screens as Array<Record<string, any>>) : [];
  const ledSqFt = screens.reduce((sum, screen) => {
    const width = Number(screen.widthFt || 0);
    const height = Number(screen.heightFt || 0);
    const quantity = Number(screen.quantity || 1);
    return sum + width * height * quantity;
  }, 0);

  await createOpportunityNote(
    targetOpportunityId,
    "Proposal Engine: RFP analyzed",
    buildRfpAnalyzedNoteMarkdown({
      analysisId: analysis.id,
      projectName: analysis.projectName,
      clientName: analysis.clientName,
      venue: analysis.venue,
      filename: analysis.filename,
      screensCount: screens.length,
      relevantPages: analysis.relevantPages,
      processingTimeMs: analysis.processingTimeMs,
      ledSqFt,
      createdAt: analysis.createdAt,
    }),
  );

  await postProposalEngineActivity({
    name: `RFP analyzed - ${analysis.projectName || analysis.clientName || "Untitled project"}`,
    eventType: "proposalEngine.rfpAnalyzed",
    message: `RFP analyzed for ${analysis.projectName || analysis.clientName || "Untitled project"} (${screens.length} displays).`,
    workspaceMemberEmail: analysis.createdBy,
    targetOpportunityId,
    eventAt: analysis.createdAt.toISOString(),
    properties: {
      analysisId: analysis.id,
      screensCount: screens.length,
      filename: analysis.filename,
    },
  });
}

export async function postProposalCreatedNote(input: {
  proposalId: string;
  analysisId?: string | null;
  workspaceMemberEmail?: string | null;
}) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: input.proposalId },
    select: {
      id: true,
      clientName: true,
      venue: true,
      _count: { select: { screens: true } },
    },
  });

  if (!proposal) {
    return;
  }

  const opportunityId = input.analysisId
    ? (
        await prisma.rfpAnalysis.findUnique({
          where: { id: input.analysisId },
          select: { twentyOpportunityId: true },
        })
      )?.twentyOpportunityId || null
    : await resolveOpportunityIdForProposal(input.proposalId);

  if (!opportunityId) {
    return;
  }

  await createOpportunityNote(
    opportunityId,
    "Proposal Engine: proposal workspace created",
    buildProposalCreatedNoteMarkdown({
      proposalId: proposal.id,
      clientName: proposal.clientName,
      venue: proposal.venue,
      screenCount: proposal._count.screens,
      analysisId: input.analysisId,
    }),
  );

  await postProposalEngineActivity({
    name: `Proposal workspace created - ${proposal.clientName}`,
    eventType: "proposalEngine.proposalCreated",
    message: `Proposal workspace created for ${proposal.clientName}.`,
    workspaceMemberEmail: input.workspaceMemberEmail,
    targetOpportunityId: opportunityId,
    proposalId: proposal.id,
    workspaceUrl: buildWorkspaceUrl(proposal.id),
    properties: {
      proposalId: proposal.id,
      analysisId: input.analysisId || undefined,
      screenCount: proposal._count.screens,
    },
  });
}

export async function postClientChangeRequestNote(input: {
  proposalId: string;
  requesterName: string;
  requesterEmail?: string | null;
  count?: number;
  message?: string | null;
}) {
  const opportunityId = await resolveOpportunityIdForProposal(input.proposalId);
  if (!opportunityId) {
    return;
  }

  await createOpportunityNote(
    opportunityId,
    "Proposal Engine: client revision requested",
    buildClientChangeRequestNoteMarkdown(input),
  );

  await postProposalEngineActivity({
    name: `Client revision requested - ${input.requesterName}`,
    eventType: "proposalEngine.clientRevisionRequested",
    message: input.count && input.count > 1
      ? `Client submitted ${input.count} change requests.`
      : `Client submitted a change request.`,
    targetOpportunityId: opportunityId,
    proposalId: input.proposalId,
    workspaceUrl: buildWorkspaceUrl(input.proposalId),
    actorName: input.requesterName,
    workspaceMemberEmail: input.requesterEmail,
    properties: {
      proposalId: input.proposalId,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail || undefined,
      count: input.count || 1,
    },
  });
}

export async function postProposalStatusNote(input: {
  proposalId: string;
  status: "SIGNED" | "CLOSED";
  workspaceMemberEmail?: string | null;
}) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: input.proposalId },
    select: {
      id: true,
      clientName: true,
      venue: true,
    },
  });

  if (!proposal) {
    return;
  }

  const opportunityId = await resolveOpportunityIdForProposal(input.proposalId);
  if (!opportunityId) {
    return;
  }

  await createOpportunityNote(
    opportunityId,
    `Proposal Engine: proposal ${input.status === "SIGNED" ? "signed" : "closed"}`,
    buildProposalStatusNoteMarkdown({
      proposalId: proposal.id,
      clientName: proposal.clientName,
      venue: proposal.venue,
      status: input.status,
    }),
  );

  await postProposalEngineActivity({
    name:
      input.status === "SIGNED"
        ? `Proposal signed - ${proposal.clientName}`
        : `Proposal closed - ${proposal.clientName}`,
    eventType:
      input.status === "SIGNED" ? "proposalEngine.proposalSigned" : "proposalEngine.proposalClosed",
    message:
      input.status === "SIGNED"
        ? `Proposal signed for ${proposal.clientName}.`
        : `Proposal closed for ${proposal.clientName}.`,
    workspaceMemberEmail: input.workspaceMemberEmail,
    targetOpportunityId: opportunityId,
    proposalId: proposal.id,
    workspaceUrl: buildWorkspaceUrl(proposal.id),
    properties: {
      proposalId: proposal.id,
      status: input.status,
    },
  });
}

export async function saveCrmArtifact(params: {
  buffer: Buffer | Uint8Array;
  preferredFilename: string;
  contentType: "application/pdf" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}) {
  await mkdir(EXPORT_DIR, { recursive: true });
  const ext = params.contentType === "application/pdf" ? ".pdf" : ".xlsx";
  const storageFilename = `crm-${randomUUID()}${ext}`;
  const filePath = path.join(EXPORT_DIR, storageFilename);
  await writeFile(filePath, Buffer.from(params.buffer));

  const publicBase = getBaseUrl();
  const route =
    params.contentType === "application/pdf"
      ? "/api/agent-skill/download-pdf"
      : "/api/agent-skill/download-excel";

  return {
    filename: safeFilenamePart(params.preferredFilename),
    storageFilename,
    downloadUrl: `${publicBase}${route}?file=${encodeURIComponent(storageFilename)}`,
  };
}

export async function postArtifactNote(input: {
  proposalId: string;
  title: string;
  summary: string;
  artifacts: Array<{ label: string; url: string; filename?: string | null }>;
  workspaceMemberEmail?: string | null;
}) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: input.proposalId },
    select: {
      id: true,
      shareHash: true,
    },
  });

  const opportunityId = await resolveOpportunityIdForProposal(input.proposalId);
  if (!proposal || !opportunityId || input.artifacts.length === 0) {
    return;
  }

  const workspaceUrl = buildWorkspaceUrl(proposal.id);

  await createOpportunityNote(
    opportunityId,
    input.title,
    buildArtifactNoteMarkdown({
      summary: input.summary,
      artifacts: input.artifacts,
      workspaceUrl,
    }),
  );

  await postProposalEngineActivity({
    name: `Artifact exported - ${input.title.replace(/^Proposal Engine:\s*/i, "")}`,
    eventType: "proposalEngine.artifactExported",
    message: input.summary,
    workspaceMemberEmail: input.workspaceMemberEmail,
    targetOpportunityId: opportunityId,
    proposalId: input.proposalId,
    workspaceUrl,
    properties: {
      proposalId: input.proposalId,
      artifacts: input.artifacts,
    },
  });
}

export async function postRecallMeetingNote(input: {
  opportunityId?: string | null;
  proposalId?: string | null;
  title?: string | null;
  status: "scheduled" | "done" | "failed" | "review_required";
  botId?: string | null;
  meetingUrl?: string | null;
  meetingTitle?: string | null;
  joinAt?: string | null;
  scheduledBy?: string | null;
  transcriptUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  participantEventsUrl?: string | null;
  meetingMetadataUrl?: string | null;
  recordingId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}) {
  let opportunityId = input.opportunityId || null;
  if (!opportunityId && input.proposalId) {
    opportunityId = await resolveOpportunityIdForProposal(input.proposalId);
  }

  if (!opportunityId) {
    if (input.proposalId) {
      await logCrmReviewRequiredForProposal(input.proposalId, {
        actionType: "meeting_recording",
        reason: "No linked CRM opportunity for meeting recording.",
        botId: input.botId,
      });
    }
    return { reviewRequired: true, reason: "No linked CRM opportunity." };
  }

  const noteTitle =
    input.title ||
    (input.status === "scheduled"
      ? "Meeting recorder scheduled"
      : input.status === "done"
        ? "Meeting recording completed"
        : input.status === "failed"
          ? "Meeting recorder failed"
          : "Meeting recording needs review");

  await createOpportunityNote(
    opportunityId,
    noteTitle,
    buildRecallMeetingNoteMarkdown(input),
  );

  await postProposalEngineActivity({
    name: `${noteTitle}${input.meetingTitle ? ` - ${input.meetingTitle}` : ""}`,
    eventType: `proposalEngine.meetingRecording.${input.status}`,
    message:
      input.status === "scheduled"
        ? "Meeting recorder scheduled from the CRM workflow."
        : input.status === "done"
          ? "Meeting transcript and recording are ready on the CRM opportunity."
          : input.status === "failed"
            ? "Meeting recorder failed and needs review."
            : "Meeting recording needs CRM review.",
    workspaceMemberEmail: input.scheduledBy,
    targetOpportunityId: opportunityId,
    proposalId: input.proposalId || undefined,
    workspaceUrl: input.proposalId ? buildWorkspaceUrl(input.proposalId) : null,
    properties: {
      source: "recall-ai",
      botId: input.botId,
      recordingId: input.recordingId,
      status: input.status,
      hasTranscript: Boolean(input.transcriptUrl),
      hasVideo: Boolean(input.videoUrl),
      hasAudio: Boolean(input.audioUrl),
    },
  });

  return { opportunityId };
}
/**
 * markPricingCompleteOnMirrorFinalize — flips pricingComplete=YES and stamps
 * pricingCompleteDate on the matching Twenty opportunity when a proposal is
 * finalized in Mirror Mode. Fire-and-forget; failures are logged but never
 * surface to the caller (the proposal export must always succeed even if
 * Twenty is briefly unreachable).
 *
 * Caller passes the proposalId. We resolve the linked twentyOpportunityId
 * directly off the Proposal row (no RFP-analysis indirection needed for the
 * Mirror Mode flow). If the proposal has no linked opportunity, the call is a
 * no-op — Mirror Mode without a linked CRM record just exports as before.
 */
export async function markPricingCompleteOnMirrorFinalize(
  proposalId: string,
): Promise<{ ok: boolean; opportunityId?: string; reason?: string }> {
  try {
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { twentyOpportunityId: true },
    });
    let opportunityId = proposal?.twentyOpportunityId || null;
    if (!opportunityId) {
      opportunityId = await resolveOpportunityIdForProposal(proposalId);
    }
    if (!opportunityId) {
      return { ok: true, reason: "no linked Twenty opportunity for this proposal" };
    }

    const nowIso = new Date().toISOString();
    const res = await fetch(
      `${TWENTY_BASE}/rest/opportunities/${opportunityId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${TWENTY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pricingComplete: "YES",
          pricingCompleteDate: nowIso,
        }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.warn(
        `[markPricingCompleteOnMirrorFinalize] PATCH failed ${res.status} on opp ${opportunityId}:`,
        errText.slice(0, 300),
      );
      return { ok: false, opportunityId, reason: `PATCH ${res.status}` };
    }
    return { ok: true, opportunityId };
  } catch (err) {
    console.warn(
      "[markPricingCompleteOnMirrorFinalize] error:",
      err instanceof Error ? err.message : err,
    );
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Universal CRM Push — the one function every rag2 action calls.
 *
 * 1. Resolves the Twenty opportunity for a proposal (looks at proposal.twentyOpportunityId,
 *    then falls back to RfpAnalysis chain).
 * 2. If NO opportunity exists yet, creates Company + Opportunity in Twenty and saves
 *    the twentyOpportunityId back onto the Proposal row.
 * 3. Posts a Note (with markdown text + artifact links) onto the Opportunity.
 * 4. Fires a ProposalEngineActivity timeline event.
 *
 * Callers just pass their proposalId, a title, and whatever they have.
 * Safe to call from Excel upload, PDF export, SOW generation, RFP analysis — anything.
 */
export async function universalCrmPush(input: {
  proposalId: string;
  actionType: "excel_uploaded" | "pdf_exported" | "sow_generated" | "rfp_analyzed";
  title: string;
  artifacts?: Array<{ label: string; url: string; filename?: string | null }>;
  markdownText?: string;
  workspaceMemberEmail?: string | null;
}) {
  // ── 1. Load proposal ────────────────────────────────────────────────
  const proposal = await prisma.proposal.findUnique({
    where: { id: input.proposalId },
    select: {
      id: true,
      clientName: true,
      venue: true,
      shareHash: true,
      twentyOpportunityId: true,
      activityLogs: {
        where: { action: "created" },
        orderBy: { createdAt: "asc" },
        select: { metadata: true },
        take: 5,
      },
    },
  });
  if (!proposal) return;

  // ── 2. Resolve opportunity (try Proposal field → RfpAnalysis chain → create) ──
  let opportunityId = proposal.twentyOpportunityId || await resolveOpportunityIdForProposal(input.proposalId);

  if (!opportunityId) {
    // No confident existing opportunity — hold for review instead of creating
    // live CRM records. This keeps the CRM clean while preserving a queueable
    // trail for the user to approve/link later.
    try {
      const resolution = await resolveExistingOpportunityForCrmSync({
        action: input.actionType === "rfp_analyzed" ? "rfp_analyzed" : "proposal_generated",
        companyName: proposal.clientName,
        venueName: proposal.venue || undefined,
        dealName: proposal.venue
          ? `${proposal.clientName} — ${proposal.venue}`
          : proposal.clientName,
      });
      if (resolution.status === "matched") {
        opportunityId = resolution.opportunityId;
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: { twentyOpportunityId: opportunityId },
        });
      } else {
        await logCrmReviewRequiredForProposal(proposal.id, {
          actionType: input.actionType,
          clientName: proposal.clientName,
          venue: proposal.venue,
          reason: buildCrmReviewRequiredMessage(resolution, {
            action: input.actionType,
            companyName: proposal.clientName,
            dealName: proposal.venue
              ? `${proposal.clientName} — ${proposal.venue}`
              : proposal.clientName,
          }),
          candidates: resolution.candidates || [],
        });
        return {
          reviewRequired: true,
          reason: resolution.reason,
        };
      }
    } catch (err) {
      console.error("[universalCrmPush] Failed to resolve existing CRM opportunity:", err);
      return; // Can't proceed without an existing opportunity
    }
  }

  if (!opportunityId) return;

  // ── 3. Build note body ──────────────────────────────────────────────
  const workspaceUrl = buildWorkspaceUrl(proposal.id);
  const artifacts = input.artifacts || [];

  const noteLines = [
    `**Action:** ${input.actionType.replace(/_/g, " ")}`,
    `**Client:** ${proposal.clientName}`,
    proposal.venue ? `**Venue:** ${proposal.venue}` : null,
    `**Time:** ${new Date().toISOString()}`,
    "",
  ].filter((line): line is string => typeof line === "string");
  if (input.markdownText) {
    noteLines.push(input.markdownText, "");
  }
  for (const a of artifacts) {
    const suffix = a.filename ? ` (${a.filename})` : "";
    noteLines.push(`- [${a.label}](${a.url})${suffix}`);
  }
  if (workspaceUrl) {
    noteLines.push("", `Workspace: ${workspaceUrl}`);
  }

  // ── 4. Post note + activity ─────────────────────────────────────────
  await createOpportunityNote(opportunityId, input.title, noteLines.filter(Boolean).join("\n"));

  await postProposalEngineActivity({
    name: `${input.title} — ${proposal.clientName}`,
    eventType: `proposalEngine.${input.actionType}`,
    message: `${input.actionType.replace(/_/g, " ")} for ${proposal.clientName}.`,
    workspaceMemberEmail: input.workspaceMemberEmail,
    targetOpportunityId: opportunityId,
    proposalId: proposal.id,
    workspaceUrl,
    properties: {
      proposalId: proposal.id,
      actionType: input.actionType,
      artifactCount: artifacts.length,
    },
  });

  // Workflow #1: PDF/SOW exported → Opportunity.bidStatus = BID_SUBMITTED.
  // Fire-and-forget so any failure here does not affect the existing push.
  applyOpportunityWorkflowAction(opportunityId, input.actionType).catch((err) =>
    console.warn("[universalCrmPush] workflow action failed:", err?.message || err),
  );

  return { opportunityId };
}

async function logCrmReviewRequiredForProposal(
  proposalId: string,
  metadata: Record<string, unknown>,
) {
  const description = "CRM link needs review before creating or attaching records.";
  const existing = await prisma.activityLog.findFirst({
    where: {
      proposalId,
      action: "crm_review_required",
      description,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return;

  await prisma.activityLog.create({
    data: {
      proposalId,
      action: "crm_review_required",
      description,
      actor: "Proposal Engine",
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

/**
 * Workflow side-effect runner — keeps "when X happens in engine → Y in CRM"
 * automations co-located with the push call. Pure additive: any failure here
 * is swallowed (logged) and never affects the user-visible export response.
 *
 * Currently registered:
 *   - pdf_exported  → Opportunity.bidStatus = BID_SUBMITTED
 *   - sow_generated → Opportunity.bidStatus = BID_SUBMITTED
 *
 * Add more actions by extending the switch below.
 */
async function applyOpportunityWorkflowAction(opportunityId: string, actionType: string) {
  switch (actionType) {
    case "pdf_exported":
    case "sow_generated":
      await twentyGraphql(
        `mutation U($id: UUID!, $data: OpportunityUpdateInput!) {
          updateOpportunity(id: $id, data: $data) { id bidStatus }
        }`,
        { id: opportunityId, data: { bidStatus: "BID_SUBMITTED" } },
      );
      console.log(`[universalCrmPush] workflow: ${actionType} → Opp ${opportunityId} bidStatus=BID_SUBMITTED`);
      return;
    default:
      // No workflow registered for this actionType (e.g. excel_uploaded, rfp_analyzed).
      return;
  }
}
