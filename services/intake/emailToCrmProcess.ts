/**
 * Orchestration for email → CRM intake: persists each inbound email as an
 * EmailCrmIntake row, runs extraction + opportunity matching, and applies
 * decisive matches automatically. Ambiguous or low-confidence results stay
 * pending_review for the /admin/email-to-crm queue.
 */

import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import {
  applyEmailCrmToOpportunity,
  buildProposedChanges,
  decideMatch,
  extractEmailCrmFacts,
  findOpportunityCandidates,
  type EmailCrmExtraction,
  type EmailCrmInput,
  type OpportunityCandidate,
} from "@/services/intake/emailToCrmSync";
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
    };

    const shouldAutoApply = options?.autoApply !== false && decision.autoApply && decision.top;
    if (!shouldAutoApply) {
      const updated = await prisma.emailCrmIntake.update({
        where: { id: intake.id },
        data: { ...baseUpdate, status: "pending_review" },
      });
      return { intake: updated, extraction, candidates, decision, applied: null };
    }

    const applied = await applyEmailCrmToOpportunity(input, extraction, decision.top!.id);
    const updated = await prisma.emailCrmIntake.update({
      where: { id: intake.id },
      data: {
        ...baseUpdate,
        status: "applied",
        appliedChanges: applied as unknown as Prisma.InputJsonValue,
        appliedAt: new Date(),
        appliedBy: options?.appliedBy || "auto",
      },
    });
    return { intake: updated, extraction, candidates, decision, applied };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[email-to-crm] processing failed", { intakeId: intake.id, error: message });
    const updated = await prisma.emailCrmIntake.update({
      where: { id: intake.id },
      data: { status: "failed", error: message },
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

  const input: EmailCrmInput = {
    subject: intake.subject || undefined,
    fromEmail: intake.fromEmail || undefined,
    fromName: intake.fromName || undefined,
    receivedAt: intake.receivedAt?.toISOString(),
    body: intake.rawBody,
    attachments: (intake.attachments as EmailCrmInput["attachments"]) || [],
    source: intake.source,
  };
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
