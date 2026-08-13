/**
 * Orchestration for email → CRM intake: persists each inbound email as an
 * EmailCrmIntake row, runs extraction + opportunity matching, and applies
 * decisive matches automatically. Ambiguous or low-confidence results stay
 * pending_review for the /admin/email-to-crm queue.
 */

import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { FEATURES } from "@/lib/featureFlags";
import {
  applyEmailCrmToOpportunity,
  buildProposedChanges,
  decideMatch,
  extractEmailCrmFacts,
  findOpportunityCandidates,
  looksLikeNewRfp,
  type EmailCrmExtraction,
  type EmailCrmInput,
  type OpportunityCandidate,
} from "@/services/intake/emailToCrmSync";
import { createDraftOpportunityForRfpIntake } from "@/services/integrations/twenty/crmAutomation";
import { postBidAlert } from "@/services/intake/bidAlertSlack";
import type { Prisma } from "@prisma/client";

export interface ProcessOptions {
  /** When false, never auto-apply — everything lands in the review queue. */
  autoApply?: boolean;
  appliedBy?: string;
}

export async function processEmailCrmIntake(input: EmailCrmInput, options?: ProcessOptions) {
  const intake = await prisma.emailCrmIntake.create({
    data: {
      source: input.source || "manual",
      fromEmail: input.fromEmail,
      fromName: input.fromName,
      subject: input.subject,
      receivedAt: input.receivedAt ? new Date(input.receivedAt) : null,
      rawBody: input.body,
      attachments: (input.attachments || []) as unknown as Prisma.InputJsonValue,
    },
  });

  return runIntakePipeline(intake.id, input, options);
}

/**
 * Re-run extraction + matching for an intake already on file, in place.
 *
 * Extraction talks to an AI provider, so it fails for reasons that have nothing
 * to do with the email — a provider rate limit is the one that actually bit us.
 * Those rows landed on status "failed" with no extraction, which meant no
 * candidates to apply and nothing to do but dismiss: a real proposal email
 * dropped on the floor because an upstream API was busy for a minute. The body
 * was stored all along, so the work is recoverable — this re-runs it against
 * the same row rather than asking anyone to find and paste the email again.
 */
export async function reprocessStoredIntake(intakeId: string, options?: ProcessOptions) {
  const intake = await prisma.emailCrmIntake.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error("Intake not found.");
  return runIntakePipeline(intakeId, storedIntakeToInput(intake), options);
}

/** The stored row, back in the shape the extraction pipeline expects. */
function storedIntakeToInput(intake: {
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  receivedAt: Date | null;
  rawBody: string;
  attachments: unknown;
  source: string;
}): EmailCrmInput {
  return {
    subject: intake.subject || undefined,
    fromEmail: intake.fromEmail || undefined,
    fromName: intake.fromName || undefined,
    receivedAt: intake.receivedAt?.toISOString(),
    body: intake.rawBody,
    attachments: (intake.attachments as EmailCrmInput["attachments"]) || [],
    source: intake.source,
  };
}

/** Extraction → matching → auto-apply or queue, writing results onto an existing row. */
async function runIntakePipeline(
  intakeId: string,
  input: EmailCrmInput,
  options?: ProcessOptions,
) {
  try {
    const extraction = await extractEmailCrmFacts(input);
    const candidates = await findOpportunityCandidates(extraction);
    const decision = decideMatch(candidates);

    const baseUpdate = {
      extraction: extraction as unknown as Prisma.InputJsonValue,
      candidates: candidates as unknown as Prisma.InputJsonValue,
      matchedOpportunityId: decision.top?.id ?? null,
      matchedOpportunityName: decision.top?.name ?? null,
      matchReason: decision.reason,
      // A successful re-run clears the previous failure.
      error: null,
    };

    const shouldAutoApply = options?.autoApply !== false && decision.autoApply && decision.top;
    if (!shouldAutoApply) {
      // Draft-opportunity creation for new RFPs that match NO existing deal.
      // Flag-gated (default OFF → production stays review-only). Only fires
      // when there is no top match (never duplicates an existing opp) AND the
      // email looks like a genuine new RFP. Failures fall through to
      // pending_review — the email is never lost.
      if (
        FEATURES.EMAIL_TO_CRM_DRAFT_OPP &&
        decision.top == null &&
        looksLikeNewRfp(extraction, input)
      ) {
        try {
          const draft = await createDraftOpportunityForRfpIntake({
            extraction,
            emailInput: {
              subject: input.subject,
              fromEmail: input.fromEmail,
              fromName: input.fromName,
              receivedAt: input.receivedAt,
              attachments: input.attachments,
            },
          });
          const updated = await prisma.emailCrmIntake.update({
            where: { id: intakeId },
            data: {
              ...baseUpdate,
              status: "draft_created",
              matchedOpportunityId: draft.opportunityId,
            },
          });
          await postBidAlert({
            intakeId,
            status: updated.status,
            input,
            extraction,
            decision,
            opportunityId: draft.opportunityId,
            opportunityName: extraction.projectName,
          });
          return {
            intake: updated,
            extraction,
            candidates,
            decision,
            applied: null,
            draftOpportunityId: draft.opportunityId,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log.error("[email-to-crm] draft opp creation failed; falling back to review", {
            intakeId,
            error: message,
          });
        }
      }
      const updated = await prisma.emailCrmIntake.update({
        where: { id: intakeId },
        data: { ...baseUpdate, status: "pending_review" },
      });
      await postBidAlert({
        intakeId,
        status: updated.status,
        input,
        extraction,
        decision,
        opportunityId: null,
        opportunityName: null,
      });
      return { intake: updated, extraction, candidates, decision, applied: null };
    }

    const applied = await applyEmailCrmToOpportunity(input, extraction, decision.top!.id);
    const updated = await prisma.emailCrmIntake.update({
      where: { id: intakeId },
      data: {
        ...baseUpdate,
        status: "applied",
        appliedChanges: applied as unknown as Prisma.InputJsonValue,
        appliedAt: new Date(),
        appliedBy: options?.appliedBy || "auto",
      },
    });
    await postBidAlert({
      intakeId,
      status: updated.status,
      input,
      extraction,
      decision,
      opportunityId: decision.top!.id,
      opportunityName: decision.top!.name,
    });
    return { intake: updated, extraction, candidates, decision, applied };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[email-to-crm] processing failed", { intakeId, error: message });
    const updated = await prisma.emailCrmIntake.update({
      where: { id: intakeId },
      data: { status: "failed", error: message },
    });
    // A failed read is the case that most needs a human, so it alerts too —
    // with no extraction there is no venue to route on, so it lands in the
    // default channel.
    await postBidAlert({
      intakeId,
      status: updated.status,
      input,
      extraction: null,
      decision: null,
    });
    return { intake: updated, extraction: null, candidates: [], decision: null, applied: null };
  }
}

/** Re-runs proposed changes for a stored intake against a chosen opportunity, then applies. */
export async function applyStoredIntake(
  intakeId: string,
  opportunityId: string,
  options?: { applyProposalDueDate?: boolean; appliedBy?: string },
) {
  const intake = await prisma.emailCrmIntake.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error("Intake not found.");
  if (!intake.extraction) throw new Error("Intake has no extraction to apply.");

  const input = storedIntakeToInput(intake);
  const extraction = intake.extraction as unknown as EmailCrmExtraction;

  const applied = await applyEmailCrmToOpportunity(input, extraction, opportunityId, {
    applyProposalDueDate: options?.applyProposalDueDate,
  });

  const candidates = (intake.candidates as unknown as OpportunityCandidate[]) || [];
  const chosen = candidates.find((c) => c.id === opportunityId);

  return prisma.emailCrmIntake.update({
    where: { id: intakeId },
    data: {
      status: "applied",
      matchedOpportunityId: opportunityId,
      matchedOpportunityName: chosen?.name ?? intake.matchedOpportunityName,
      appliedChanges: applied as unknown as Prisma.InputJsonValue,
      appliedAt: new Date(),
      appliedBy: options?.appliedBy || "manual",
    },
  });
}

/** Preview of what an apply would change, without writing to the CRM. */
export function previewChanges(input: EmailCrmInput, extraction: EmailCrmExtraction) {
  return buildProposedChanges(input, extraction, null);
}
