# Recall.ai CRM Integration — 2026-07-02

## Purpose

Wire Recall.ai meeting capture into the ANC CRM workflow so meeting transcripts, recordings, participant events, and failures land on the right CRM opportunity instead of living in a separate recording dashboard.

This is not a replacement CRM UI. Recall.ai is the capture layer. The CRM remains the operator-facing surface for opportunity history.

## Environment

Required:

```bash
RECALL_API_KEY=...
RECALL_REGION=ap-northeast-1
```

Optional but recommended for production webhooks:

```bash
RECALL_WORKSPACE_VERIFICATION_SECRET=whsec_...
```

Supported regions in code:

- `us-west-2`
- `us-east-1`
- `eu-central-1`
- `ap-northeast-1`

Ahmad shared the Japan dashboard URL, so `ap-northeast-1` is the expected production region unless the Recall workspace changes.

## CRM Use Cases Covered

### 1. Schedule a meeting bot from CRM/proposal context

Endpoint:

```http
POST /api/integrations/recall-ai/bots
```

Body:

```json
{
  "meetingUrl": "https://meet.google.com/xxx-xxxx-xxx",
  "meetingTitle": "MetLife Live Sync review",
  "opportunityId": "CRM_OPPORTUNITY_UUID",
  "proposalId": "optional-proposal-id",
  "scheduledBy": "user@ancsports.net",
  "joinAt": "2026-07-02T20:30:00.000Z",
  "botName": "ANC Meeting Recorder"
}
```

Result:

- Creates a Recall bot.
- Stores CRM metadata on the bot.
- Adds a CRM opportunity note: "Meeting recorder scheduled."

Default transcription provider:

```json
{
  "meeting_captions": {}
}
```

Meeting captions use the native Zoom/Google Meet/Teams captions and are the preferred default because they avoid extra transcription cost and preserve platform diarization better than a generic audio stream.

### 2. Retrieve a bot and manually sync artifacts

Endpoint:

```http
GET /api/integrations/recall-ai/bots/{botId}?sync=true
```

Result:

- Retrieves the bot from Recall.
- Extracts media shortcuts:
  - transcript
  - video recording
  - audio recording
  - participant events
  - meeting metadata
- Adds a completed/failed/review-required note to the linked CRM opportunity.

Use this if:

- The webhook was not configured yet.
- The webhook failed.
- A user wants to manually backfill a recording.

### 3. Auto-sync completed bot recordings through Recall webhooks

Endpoint:

```http
POST /api/integrations/recall-ai/webhook
```

Set this in the Recall dashboard webhook settings for bot status events.

Behavior:

- Ignores in-progress lifecycle states.
- Syncs `done` as a completed CRM note.
- Syncs `fatal` / `call_ended_not_recorded` as a failed CRM note.
- Uses Recall bot metadata to find `opportunityId` or `proposalId`.

Security:

- If `RECALL_WORKSPACE_VERIFICATION_SECRET` is present, the route verifies Recall's HMAC headers:
  - `webhook-id`
  - `webhook-timestamp`
  - `webhook-signature`
- If the secret is not present, the endpoint still functions but should not be considered production-hardened.

### 4. Desktop Recording SDK / local meeting ingest

Endpoint:

```http
POST /api/integrations/recall-ai/desktop-recordings
```

Body:

```json
{
  "opportunityId": "CRM_OPPORTUNITY_UUID",
  "meetingTitle": "Local project review",
  "recordingId": "desktop-recording-id",
  "transcriptUrl": "https://...",
  "videoUrl": "https://...",
  "audioUrl": "https://...",
  "scheduledBy": "user@ancsports.net"
}
```

Result:

- Adds a completed desktop meeting recording note to the CRM opportunity.

This path is separate from meeting bots. Use it when the capture comes from Recall's Desktop Recording SDK or another local/non-bot recording flow.

### 5. Failure / review handling

Failed bot states create CRM notes with:

- recorder ID
- failure code
- failure detail
- any available meeting metadata

If no CRM opportunity can be resolved, the proposal gets a local `crm_review_required` activity instead of creating duplicate CRM records.

## Verification Performed

- Recall API auth check against `https://ap-northeast-1.recall.ai/api/v1/bot/` returned `200`.
- Focused tests passed:
  - Recall client helpers
  - default meeting-caption transcription config
  - Recall media extraction
  - Recall webhook signature verification
  - CRM note body for scheduled recordings
  - CRM note body for completed recordings
  - CRM note body for failed recordings

Command:

```bash
pnpm vitest run services/integrations/recall-ai/client.test.ts services/integrations/twenty/crmAutomation.test.ts
```

Result:

```text
18 passed
```

## Production Setup Still Needed

Add environment variables in the production service:

```bash
RECALL_API_KEY=...
RECALL_REGION=ap-northeast-1
RECALL_WORKSPACE_VERIFICATION_SECRET=whsec_...
```

Then configure the Recall dashboard webhook endpoint:

```text
https://proposals.anc.com/api/integrations/recall-ai/webhook
```

After deploy, run one controlled test meeting:

1. Create a test opportunity or use a safe internal opportunity.
2. Call `POST /api/integrations/recall-ai/bots`.
3. Let the bot join and finish.
4. Confirm the CRM opportunity receives:
   - scheduled note
   - completed note
   - transcript link
   - recording link if video was enabled

