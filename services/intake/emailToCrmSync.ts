/**
 * Email → CRM sync engine (Jireh ask, 2026-07-04).
 *
 * Inbound proposal emails (like Jeremy Riley's Camping World Stadium
 * CMS/Broadcast addendum) are parsed into structured facts — due dates,
 * key info, people — matched against live CRM opportunities, and applied
 * as field updates + a timeline note.
 *
 * Design rules:
 *  - Flag, don't guess. Every extracted date must be corroborated by a
 *    verbatim source quote from the email body or it is marked unverified
 *    and held for human review.
 *  - The AI extracts; deterministic code decides. Auto-apply only happens
 *    when the opportunity match is decisive AND the date is verified.
 *  - Everything applied is recorded on the intake row and in the CRM note,
 *    so any automated write is visible and reversible.
 */

import {
  twentyGraphql,
  createOpportunityNote,
  twentyRestFetch,
} from "@/services/integrations/twenty/crmAutomation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailCrmAttachment {
  name: string;
  sizeBytes?: number;
}

export interface EmailCrmInput {
  subject?: string;
  fromEmail?: string;
  fromName?: string;
  receivedAt?: string; // ISO
  body: string;
  attachments?: EmailCrmAttachment[];
  source?: string; // manual | graph-mailbox
}

export type EmailCrmDateKind = "proposal_due" | "internal_deadline" | "event" | "other";

export interface EmailCrmExtractedDate {
  label: string;
  dateIso: string; // YYYY-MM-DD
  kind: EmailCrmDateKind;
  sourceText: string;
  /** Set by verifyExtraction — true when sourceText is really in the email. */
  verified?: boolean;
}

export interface EmailCrmExtraction {
  clientOrVenue: string;
  projectName: string;
  summary: string;
  dueDates: EmailCrmExtractedDate[];
  keyFacts: Array<{ fact: string; sourceText: string }>;
  people: Array<{ name: string; role?: string; email?: string }>;
  confidence: number; // 0..1 from the model
}

export interface OpportunityCandidate {
  id: string;
  name: string;
  stage?: string;
  proposalDueDate?: string | null;
  score: number;
  reasons: string[];
}

export interface EmailCrmProposedChanges {
  /** null when no verified proposal-due date was found */
  proposalDueDate: {
    newValue: string; // ISO datetime for Twenty
    previousValue: string | null;
    sourceText: string;
  } | null;
  noteTitle: string;
  noteMarkdown: string;
}

export interface EmailCrmMatchDecision {
  autoApply: boolean;
  reason: string;
  top: OpportunityCandidate | null;
}

// ---------------------------------------------------------------------------
// Extraction verification (flag, don't guess)
// ---------------------------------------------------------------------------

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[ \s]+/g, " ").replace(/[’‘]/g, "'").trim();
}

/**
 * A claimed source quote counts as verified when its normalized text appears
 * in the normalized email body. Quotes the model paraphrased do not pass.
 */
export function isSourceTextInBody(sourceText: string, body: string): boolean {
  const quote = normalizeForMatch(sourceText);
  if (quote.length < 8) return false;
  return normalizeForMatch(body).includes(quote);
}

/** Marks each extracted date verified/unverified against the raw email. */
export function verifyExtraction(extraction: EmailCrmExtraction, body: string): EmailCrmExtraction {
  return {
    ...extraction,
    dueDates: extraction.dueDates.map((d) => ({
      ...d,
      verified: isSourceTextInBody(d.sourceText, body) && /^\d{4}-\d{2}-\d{2}$/.test(d.dateIso),
    })),
  };
}

// ---------------------------------------------------------------------------
// Opportunity matching
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "stadium", "arena", "center", "centre", "field",
  "park", "upgrade", "upgrades", "project", "proposal", "rfp", "bid", "quote",
  "pricing", "new", "llc", "inc",
]);

export function significantTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[^A-Za-z0-9]+/)
        .map((t) => t.toLowerCase())
        .filter((t) => t.length >= 3 && !STOP_WORDS.has(t)),
    ),
  );
}

export interface OpportunitySearchRow {
  id: string;
  name: string;
  stage?: string;
  proposalDueDate?: string | null;
  createdAt?: string;
}

/**
 * Scores CRM opportunities against the extraction. Pure — callers fetch rows.
 * Score = fraction of venue/client tokens present in the opportunity name,
 * with bonuses for project-name tokens and open pipeline stages.
 */
export function scoreOpportunities(
  extraction: EmailCrmExtraction,
  rows: OpportunitySearchRow[],
): OpportunityCandidate[] {
  const venueTokens = significantTokens(extraction.clientOrVenue);
  const projectTokens = significantTokens(extraction.projectName).filter(
    (t) => !venueTokens.includes(t),
  );

  const candidates = rows.map((row) => {
    const nameNorm = normalizeForMatch(row.name);
    const reasons: string[] = [];
    let score = 0;

    if (venueTokens.length > 0) {
      const hit = venueTokens.filter((t) => nameNorm.includes(t));
      score += (hit.length / venueTokens.length) * 0.6;
      if (hit.length > 0) reasons.push(`venue match: ${hit.join(", ")}`);
    }
    if (projectTokens.length > 0) {
      const hit = projectTokens.filter((t) => nameNorm.includes(t));
      score += (hit.length / projectTokens.length) * 0.3;
      if (hit.length > 0) reasons.push(`project match: ${hit.join(", ")}`);
    }
    if (row.stage && !/^EXISTING_CUSTOMER$/i.test(row.stage)) {
      score += 0.1;
      reasons.push("open pipeline stage");
    }

    return {
      id: row.id,
      name: row.name,
      stage: row.stage,
      proposalDueDate: row.proposalDueDate ?? null,
      score: Math.round(score * 100) / 100,
      reasons,
    };
  });

  return candidates.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * Auto-apply only when the top candidate is decisive: strong absolute score
 * AND clearly ahead of the runner-up. Anything murkier waits for a human.
 */
export function decideMatch(candidates: OpportunityCandidate[]): EmailCrmMatchDecision {
  const top = candidates[0] ?? null;
  if (!top) return { autoApply: false, reason: "No matching opportunity found.", top: null };
  const second = candidates[1];
  if (top.score < 0.75) {
    return { autoApply: false, reason: `Top match score ${top.score} below 0.75 threshold.`, top };
  }
  // Same-venue opportunities all share the venue-token base score, so require
  // an absolute gap: the winner must be ahead on project-specific evidence.
  if (second && top.score - second.score < 0.15) {
    return {
      autoApply: false,
      reason: `Ambiguous: "${top.name}" (${top.score}) vs "${second.name}" (${second.score}).`,
      top,
    };
  }
  return { autoApply: true, reason: `Decisive match: "${top.name}" (${top.score}).`, top };
}

/**
 * Classifier: does this inbound email look like a NEW RFP (no existing deal)?
 * Called only on the no-match branch, so addenda on known deals never reach here.
 * Strict by design — we only auto-create a draft opportunity when there is a
 * real client/venue, a project name, and at least one verified due date, so a
 * casual "hey Jackson" email never spawns a deal. Pure + unit-tested.
 */
export function looksLikeNewRfp(
  extraction: EmailCrmExtraction,
  input?: Pick<EmailCrmInput, "subject">,
): boolean {
  const venue = significantTokens(extraction.clientOrVenue);
  if (venue.length === 0) return false;
  if (!extraction.projectName || extraction.projectName.trim().length < 3) return false;

  // At least one verified proposal-due or internal-deadline date. RFPs have due
  // dates; an inbound note without one isn't worth a draft opp.
  const hasDue = extraction.dueDates.some(
    (d) =>
      (d.kind === "proposal_due" || d.kind === "internal_deadline") &&
      (d.verified !== false) &&
      /^\d{4}-\d{2}-\d{2}$/.test(d.dateIso),
  );
  if (!hasDue) return false;

  // Intent signal in subject or body — avoid creating opps for purely
  // conversational threads. The body already drove extraction; the subject
  // adds a cheap positive signal.
  const subj = (input?.subject || "").toLowerCase();
  const intent = /rfp|bid|proposal|quote|pricing|scope of work|sow|spec/i.test(subj);
  // If no subject intent, still allow when the extraction itself flagged a
  // proposal-due date (the strongest RFP signal) — but require it explicitly.
  return intent || extraction.dueDates.some((d) => d.kind === "proposal_due");
}

// ---------------------------------------------------------------------------
// Proposed changes + CRM note
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function buildProposedChanges(
  input: EmailCrmInput,
  extraction: EmailCrmExtraction,
  opportunity: { proposalDueDate?: string | null } | null,
): EmailCrmProposedChanges {
  const proposalDue = extraction.dueDates.find((d) => d.kind === "proposal_due" && d.verified);

  const lines: string[] = [];
  lines.push(`**From:** ${input.fromName || input.fromEmail || "Unknown sender"}${input.fromEmail && input.fromName ? ` (${input.fromEmail})` : ""}`);
  if (input.subject) lines.push(`**Subject:** ${input.subject}`);
  if (input.receivedAt) lines.push(`**Received:** ${new Date(input.receivedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`);
  lines.push("");
  lines.push(extraction.summary);
  lines.push("");

  const verifiedDates = extraction.dueDates.filter((d) => d.verified);
  const unverifiedDates = extraction.dueDates.filter((d) => !d.verified);
  if (verifiedDates.length) {
    lines.push("**Deadlines**");
    for (const d of verifiedDates) {
      lines.push(`- ${d.label}: ${fmtDate(d.dateIso)} — "${d.sourceText}"`);
    }
    lines.push("");
  }
  if (unverifiedDates.length) {
    lines.push("**Needs confirmation** (could not verify against email text)");
    for (const d of unverifiedDates) {
      lines.push(`- ${d.label}: ${d.dateIso}`);
    }
    lines.push("");
  }
  if (extraction.keyFacts.length) {
    lines.push("**Key info**");
    for (const f of extraction.keyFacts) lines.push(`- ${f.fact}`);
    lines.push("");
  }
  if (input.attachments?.length) {
    lines.push("**Attachments on the email**");
    for (const a of input.attachments) lines.push(`- ${a.name}`);
    lines.push("");
  }
  lines.push("_Logged automatically from email intake._");

  let proposalDueDate: EmailCrmProposedChanges["proposalDueDate"] = null;
  if (proposalDue) {
    const newValue = `${proposalDue.dateIso}T21:00:00.000Z`; // matches existing 5pm-ET convention on due dates
    const previousValue = opportunity?.proposalDueDate ?? null;
    const sameDay = previousValue ? previousValue.slice(0, 10) === proposalDue.dateIso : false;
    if (!sameDay) {
      proposalDueDate = { newValue, previousValue, sourceText: proposalDue.sourceText };
    }
  }

  return {
    proposalDueDate,
    noteTitle: `Email intake — ${input.subject || extraction.projectName || "inbound email"}`,
    noteMarkdown: lines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// AI extraction — provider CHAIN, config-only:
// EMAIL_CRM_AI_* → Z.AI → OpenRouter → OpenAI → Mercury → MiMo → Ollama Cloud.
// Every configured provider is tried in order; a 429/5xx/network failure on
// one falls through to the next. Z.AI's coding plan throttles with fair-usage
// 429s (error code 1313), which used to kill the whole intake — never depend
// on a single provider here.
// ---------------------------------------------------------------------------

type Provider = { name: string; baseUrl: string; apiKey: string; model: string };

function providerChain(): Provider[] {
  const chain: Provider[] = [];
  if (process.env.EMAIL_CRM_AI_API_KEY && process.env.EMAIL_CRM_AI_BASE_URL) {
    chain.push({
      name: "custom",
      baseUrl: process.env.EMAIL_CRM_AI_BASE_URL,
      apiKey: process.env.EMAIL_CRM_AI_API_KEY,
      model: process.env.EMAIL_CRM_AI_MODEL || "glm-5.2",
    });
  }
  if (process.env.Z_AI_API_KEY) {
    chain.push({
      name: "z-ai",
      baseUrl: process.env.Z_AI_BASE_URL || "https://api.z.ai/api/coding/paas/v4",
      apiKey: process.env.Z_AI_API_KEY,
      model: process.env.EMAIL_CRM_AI_MODEL || "glm-5.2",
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    chain.push({
      name: "openrouter",
      baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.EMAIL_CRM_AI_FALLBACK_MODEL || "google/gemini-3-flash-preview",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    chain.push({
      name: "openai",
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_EXTRACTION_MODEL || "gpt-5.4-mini",
    });
  }
  if (process.env.MERCURY_API_KEY) {
    chain.push({
      name: "mercury",
      baseUrl: process.env.MERCURY_API_BASE || "https://api.inceptionlabs.ai/v1",
      apiKey: process.env.MERCURY_API_KEY,
      model: process.env.MERCURY_MODEL || "mercury-2",
    });
  }
  if (process.env.MIMO_API_KEY) {
    chain.push({
      name: "mimo",
      baseUrl: process.env.MIMO_API_BASE || "https://api.xiaomimimo.com/v1",
      apiKey: process.env.MIMO_API_KEY,
      model: process.env.MIMO_MODEL || "mimo-v2-pro",
    });
  }
  if (process.env.OLLAMA_API_KEY) {
    chain.push({
      name: "ollama-cloud",
      baseUrl: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
      apiKey: process.env.OLLAMA_API_KEY,
      model: process.env.EMAIL_CRM_AI_MODEL || "glm-5.2",
    });
  }
  return chain;
}

const EXTRACTION_SYSTEM_PROMPT =
  "You extract CRM-ready facts from inbound sales/proposal emails at an LED display integrator. " +
  "Return STRICT JSON only, no prose, matching this shape: " +
  '{"clientOrVenue": string, "projectName": string, "summary": string, ' +
  '"dueDates": [{"label": string, "dateIso": "YYYY-MM-DD", "kind": "proposal_due"|"internal_deadline"|"event"|"other", "sourceText": string}], ' +
  '"keyFacts": [{"fact": string, "sourceText": string}], ' +
  '"people": [{"name": string, "role": string, "email": string}], ' +
  '"confidence": number}. ' +
  "Rules: sourceText MUST be a verbatim quote copied character-for-character from the email. " +
  "Resolve relative dates (\"next Friday\", \"EOB Monday\") against the email's sent date, which is provided. " +
  "kind=proposal_due is the date the proposal/bid is due to the client; internal team deadlines are internal_deadline. " +
  "If a date is ambiguous, still include it with your best dateIso and a lower confidence. Never invent dates.";

async function extractWithProvider(
  provider: Provider,
  input: EmailCrmInput,
): Promise<EmailCrmExtraction> {
  const sentContext = input.receivedAt
    ? `Email sent date: ${new Date(input.receivedAt).toDateString()}`
    : "Email sent date: unknown";
  const attachmentList = input.attachments?.length
    ? `Attachments: ${input.attachments.map((a) => a.name).join(", ")}`
    : "Attachments: none listed";

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      // GLM models truncate JSON mid-object at low limits (glm-5.1 needed 4000
      // in the leadership autobrief) — don't lower this. Newer OpenAI models
      // reject `max_tokens` (want max_completion_tokens) and any non-default
      // temperature, so shape params per provider.
      ...(provider.name === "openai"
        ? { max_completion_tokens: 4000 }
        : { temperature: 0.1, max_tokens: 4000 }),
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${sentContext}\n${attachmentList}\nSubject: ${input.subject || "(none)"}\nFrom: ${input.fromName || ""} <${input.fromEmail || ""}>\n\nEMAIL BODY:\n${input.body}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI extraction failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content || "";
  const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(jsonText) as EmailCrmExtraction;
  } catch {
    throw new Error(`AI extraction returned non-JSON output: ${content.slice(0, 200)}`);
  }
}

export async function extractEmailCrmFacts(input: EmailCrmInput): Promise<EmailCrmExtraction> {
  const chain = providerChain();
  if (chain.length === 0) {
    throw new Error("No AI provider configured for email extraction.");
  }

  let parsed: EmailCrmExtraction | null = null;
  const failures: string[] = [];
  for (const provider of chain) {
    try {
      parsed = await extractWithProvider(provider, input);
      if (failures.length > 0) {
        console.warn(
          `[email-to-crm] extraction succeeded on fallback provider ${provider.name} after: ${failures.join(" | ")}`,
        );
      }
      break;
    } catch (err: any) {
      failures.push(`${provider.name}: ${String(err?.message || err).slice(0, 160)}`);
    }
  }
  if (!parsed) {
    throw new Error(`AI extraction failed on all providers — ${failures.join(" | ")}`);
  }

  const extraction: EmailCrmExtraction = {
    clientOrVenue: String(parsed.clientOrVenue || ""),
    projectName: String(parsed.projectName || ""),
    summary: String(parsed.summary || ""),
    dueDates: Array.isArray(parsed.dueDates)
      ? parsed.dueDates.map((d) => ({
          label: String(d.label || "Deadline"),
          dateIso: String(d.dateIso || ""),
          kind: (["proposal_due", "internal_deadline", "event", "other"] as const).includes(
            d.kind as EmailCrmDateKind,
          )
            ? (d.kind as EmailCrmDateKind)
            : "other",
          sourceText: String(d.sourceText || ""),
        }))
      : [],
    keyFacts: Array.isArray(parsed.keyFacts)
      ? parsed.keyFacts.map((f) => ({ fact: String(f.fact || ""), sourceText: String(f.sourceText || "") }))
      : [],
    people: Array.isArray(parsed.people)
      ? parsed.people.map((p) => ({
          name: String(p.name || ""),
          role: p.role ? String(p.role) : undefined,
          email: p.email ? String(p.email) : undefined,
        }))
      : [],
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
  };

  return verifyExtraction(extraction, input.body);
}

// ---------------------------------------------------------------------------
// CRM lookups + writes
// ---------------------------------------------------------------------------

export async function findOpportunityCandidates(
  extraction: EmailCrmExtraction,
): Promise<OpportunityCandidate[]> {
  const tokens = Array.from(
    new Set([
      ...significantTokens(extraction.clientOrVenue),
      ...significantTokens(extraction.projectName),
    ]),
  ).slice(0, 5);
  if (tokens.length === 0) return [];

  const rowsById = new Map<string, OpportunitySearchRow>();
  for (const token of tokens) {
    const data = await twentyRestFetch<{
      data?: { opportunities?: OpportunitySearchRow[] };
    }>(`/rest/opportunities?filter=name[ilike]:%25${encodeURIComponent(token)}%25&limit=30`);
    for (const row of data.data?.opportunities || []) {
      rowsById.set(row.id, row);
    }
  }

  return scoreOpportunities(extraction, Array.from(rowsById.values())).slice(0, 8);
}

export interface ApplyResult {
  opportunityId: string;
  updatedProposalDueDate: boolean;
  noteCreated: boolean;
  changes: EmailCrmProposedChanges;
}

export async function applyEmailCrmToOpportunity(
  input: EmailCrmInput,
  extraction: EmailCrmExtraction,
  opportunityId: string,
  options?: { applyProposalDueDate?: boolean },
): Promise<ApplyResult> {
  const oppData = await twentyRestFetch<{
    data?: { opportunity?: { id: string; name: string; proposalDueDate?: string | null } };
  }>(`/rest/opportunities/${opportunityId}`);
  const opportunity = oppData.data?.opportunity;
  if (!opportunity) throw new Error(`Opportunity ${opportunityId} not found in CRM.`);

  const changes = buildProposedChanges(input, extraction, opportunity);

  let updatedProposalDueDate = false;
  const applyDate = options?.applyProposalDueDate !== false;
  if (changes.proposalDueDate && applyDate) {
    await twentyGraphql(
      `
        mutation UpdateOpportunityDueDate($id: UUID!, $data: OpportunityUpdateInput!) {
          updateOpportunity(id: $id, data: $data) {
            id
            proposalDueDate
          }
        }
      `,
      { id: opportunityId, data: { proposalDueDate: changes.proposalDueDate.newValue } },
    );
    updatedProposalDueDate = true;
  }

  await createOpportunityNote(opportunityId, changes.noteTitle, changes.noteMarkdown);

  return { opportunityId, updatedProposalDueDate, noteCreated: true, changes };
}
