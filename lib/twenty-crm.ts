/**
 * Twenty CRM Sync — background integration with retry + persistence
 *
 * Calls the Twenty serverless function at /s/integration/sync-opportunity
 * to create/update Opportunities in the CRM. Fire-and-forget from the caller's
 * perspective — never blocks the main flow.
 *
 * Retries on transient failures (Twenty cold-start windows, network blips).
 * When an analysisId is supplied, the result — success or final failure — is
 * persisted to the RfpAnalysis row so nothing is ever silently lost and a
 * replay endpoint can pick it up later.
 */

import { prisma } from "@/lib/prisma";

const TWENTY_SYNC_URL =
  'https://abc-twenty.izcgmb.easypanel.host/s/integration/sync-opportunity';

// Retry budget: 4 attempts over ~39 seconds. Chosen to survive a full Twenty
// Nest boot cycle (we've seen ~40 second cold starts during EasyPanel rolling
// deploys). Spacing: 0s, 3s, 9s, 27s.
const RETRY_DELAYS_MS = [0, 3_000, 9_000, 27_000];

export type TwentySyncPayload = {
  action: 'rfp_analyzed' | 'proposal_generated' | 'deal_won';
  companyName: string;
  venueName: string;
  dealName: string;
  amount?: number;
  ledSqFt?: number;
  manufacturer?: string;
  proposalUrl?: string;
  estimatorName?: string;
};

type SyncOptions = {
  /** RfpAnalysis id to persist sync state onto. When omitted, behaves as a pure fire-and-forget sync. */
  analysisId?: string;
};

type SyncOutcome =
  | { ok: true; opportunityId: string | null; attempt: number }
  | { ok: false; error: string; attempts: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postOnce(payload: TwentySyncPayload): Promise<SyncOutcome> {
  try {
    const res = await fetch(TWENTY_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    // Twenty returns a 404-like payload when the route trigger hasn't booted
    // yet ({ code: 'TRIGGER_NOT_FOUND' }). Treat that as retryable.
    if (data?.code === 'TRIGGER_NOT_FOUND' || data?.statusCode === 404) {
      return { ok: false, error: 'TRIGGER_NOT_FOUND', attempts: 1 };
    }
    if (!res.ok || data?.error) {
      const msg = data?.error || data?.messages?.join(', ') || `HTTP ${res.status}`;
      return { ok: false, error: String(msg).slice(0, 500), attempts: 1 };
    }
    return { ok: true, opportunityId: data?.opportunityId ?? null, attempt: 1 };
  } catch (err: any) {
    return { ok: false, error: err?.message?.slice(0, 500) || 'network error', attempts: 1 };
  }
}

/**
 * POST the payload to Twenty with retry + exponential backoff. Returns the
 * final outcome — callers that hand an analysisId will also see it persisted
 * on the RfpAnalysis row.
 */
export async function syncToTwenty(
  payload: TwentySyncPayload,
  options: SyncOptions = {},
): Promise<SyncOutcome> {
  if (process.env.TWENTY_SYNC_ENABLED !== 'true') {
    return { ok: false, error: 'sync disabled', attempts: 0 };
  }

  let lastError = 'unknown';
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (RETRY_DELAYS_MS[i] > 0) await sleep(RETRY_DELAYS_MS[i]);
    const outcome = await postOnce(payload);
    if (outcome.ok) {
      console.log(
        `[Twenty CRM Sync] ${payload.action} OK on attempt ${i + 1} → opp=${outcome.opportunityId ?? '?'}`,
      );
      if (options.analysisId) {
        await persistSuccess(options.analysisId, outcome.opportunityId).catch((e) =>
          console.warn('[Twenty CRM Sync] DB persist success failed:', e?.message),
        );
      }
      return { ok: true, opportunityId: outcome.opportunityId, attempt: i + 1 };
    }
    lastError = outcome.error;
    console.warn(
      `[Twenty CRM Sync] ${payload.action} attempt ${i + 1}/${RETRY_DELAYS_MS.length} failed: ${lastError}`,
    );
  }

  // All retries exhausted — stamp the failure so a replay endpoint can find it
  if (options.analysisId) {
    await persistFailure(options.analysisId, lastError).catch((e) =>
      console.warn('[Twenty CRM Sync] DB persist failure failed:', e?.message),
    );
  }
  console.error(
    `[Twenty CRM Sync] ${payload.action} gave up after ${RETRY_DELAYS_MS.length} attempts: ${lastError}`,
  );
  return { ok: false, error: lastError, attempts: RETRY_DELAYS_MS.length };
}

async function persistSuccess(analysisId: string, opportunityId: string | null): Promise<void> {
  await prisma.rfpAnalysis.update({
    where: { id: analysisId },
    data: {
      twentySyncedAt: new Date(),
      twentyOpportunityId: opportunityId,
      twentySyncError: null,
    },
  });
}

async function persistFailure(analysisId: string, error: string): Promise<void> {
  await prisma.rfpAnalysis.update({
    where: { id: analysisId },
    data: { twentySyncError: error },
  });
}

/**
 * Replay a previously-failed sync for a given analysis. Used by the manual
 * replay endpoint and (eventually) a background retry cron.
 */
export async function replayTwentySync(analysisId: string): Promise<SyncOutcome> {
  const analysis = await prisma.rfpAnalysis.findUnique({
    where: { id: analysisId },
    select: {
      id: true,
      projectName: true,
      clientName: true,
      venue: true,
      screens: true,
      twentySyncedAt: true,
    },
  });
  if (!analysis) return { ok: false, error: 'analysis not found', attempts: 0 };
  if (analysis.twentySyncedAt) {
    return { ok: true, opportunityId: null, attempt: 0 }; // already synced, no-op
  }

  const screens = Array.isArray(analysis.screens) ? (analysis.screens as any[]) : [];
  const ledSqFt = screens.reduce(
    (sum: number, s: any) => sum + ((s.widthFt || 0) * (s.heightFt || 0) * (s.quantity || 1)),
    0,
  );

  return syncToTwenty(
    {
      action: 'rfp_analyzed',
      companyName: analysis.clientName || '',
      venueName: analysis.venue || '',
      dealName: `${analysis.projectName || analysis.clientName || 'Untitled'} - RFP`,
      ledSqFt: ledSqFt > 0 ? ledSqFt : undefined,
    },
    { analysisId },
  );
}
