/**
 * Twenty CRM Sync — fire-and-forget integration
 *
 * Calls the Twenty serverless function at /s/integration/sync-opportunity
 * to create/update Opportunities in the CRM. Never blocks the main flow.
 */

const TWENTY_SYNC_URL =
  'https://abc-twenty.izcgmb.easypanel.host/s/integration/sync-opportunity';

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

export async function syncToTwenty(payload: TwentySyncPayload) {
  if (process.env.TWENTY_SYNC_ENABLED !== 'true') return null;

  try {
    const res = await fetch(TWENTY_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log('[Twenty CRM Sync]', payload.action, data);
    return data;
  } catch (err) {
    console.error('[Twenty CRM Sync] Failed:', err);
    return null;
  }
}
