import { prisma } from "@/lib/prisma";
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

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
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
    // No existing opportunity — create Company + Opportunity in Twenty
    try {
      opportunityId = await ensureOpportunityForProposal(proposal);
      if (opportunityId) {
        // Persist on the Proposal row so next call is instant
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: { twentyOpportunityId: opportunityId },
        });
      }
    } catch (err) {
      console.error("[universalCrmPush] Failed to create Company/Opportunity:", err);
      return; // Can't proceed without an opportunity
    }
  }

  if (!opportunityId) return;

  // ── 3. Build note body ──────────────────────────────────────────────
  const workspaceUrl = buildWorkspaceUrl(proposal.id);
  const artifacts = input.artifacts || [];

  const noteLines: string[] = [
    `**Action:** ${input.actionType.replace(/_/g, " ")}`,
    `**Client:** ${proposal.clientName}`,
    proposal.venue ? `**Venue:** ${proposal.venue}` : null,
    `**Time:** ${new Date().toISOString()}`,
    "",
  ];
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

/**
 * Creates a Company + Opportunity in Twenty for a proposal that has none.
 * Uses clientName as the Company name. Deduplicates by exact name match.
 */
async function ensureOpportunityForProposal(proposal: {
  id: string;
  clientName: string;
  venue?: string | null;
}): Promise<string | null> {
  const companyName = proposal.clientName?.trim();
  if (!companyName) return null;

  // ── Find or create Company ──────────────────────────────────────────
  const existingCompany = await twentyGraphql<{
    companies: { edges: Array<{ node: { id: string } }> };
  }>(
    `query FindCompany($filter: CompanyFilterInput) {
      companies(filter: $filter, first: 1) {
        edges { node { id } }
      }
    }`,
    { filter: { name: { eq: companyName } } },
  );

  const companyId = existingCompany.companies.edges[0]?.node.id || await createCompany(companyName);
  if (!companyId) return null;

  // ── Create Opportunity linked to that Company ───────────────────────
  const oppName = proposal.venue
    ? `${companyName} — ${proposal.venue}`
    : companyName;

  const opp = await twentyGraphql<{ createOpportunity: { id: string } }>(
    `mutation CreateOpp($data: OpportunityCreateInput!) {
      createOpportunity(data: $data) { id }
    }`,
    {
      data: {
        name: oppName,
        companyId,
        // Twenty's OpportunityStageEnum was changed away from the old
        // {NEW,SCREENING,MEETING,PROPOSAL,CUSTOMER} set. Sending "PROPOSAL"
        // here was the silent-fail root cause: the GraphQL mutation rejected
        // the value, the wrapping try/catch swallowed it, and the Note +
        // Activity steps never ran. Current valid values:
        //   EXISTING_CUSTOMER, NEW_OPPORTUNITY, MEETING_SALES_PROCESS,
        //   SALES_LEAD_FORMAL_PROPOSAL, SALES_LEAD_BUDGET_PROPOSAL, RFP,
        //   BAFO_NEGOTIATION
        // SALES_LEAD_FORMAL_PROPOSAL is the closest match for a freshly
        // created proposal-engine opportunity.
        stage: "SALES_LEAD_FORMAL_PROPOSAL",
        bidStatus: "SCOPING",
      },
    },
  );

  return opp.createOpportunity.id;
}

async function createCompany(name: string): Promise<string | null> {
  try {
    const result = await twentyGraphql<{ createCompany: { id: string } }>(
      `mutation CreateCompany($data: CompanyCreateInput!) {
        createCompany(data: $data) { id }
      }`,
      { data: { name } },
    );
    return result.createCompany.id;
  } catch (err) {
    console.error("[ensureOpportunityForProposal] createCompany failed:", err);
    return null;
  }
}
