import { NextRequest, NextResponse } from "next/server";
import {
  extractRecallBotFromWebhook,
  extractRecallMedia,
  latestRecallStatus,
  verifyRecallWebhookSignature,
  type RecallWebhookPayload,
} from "@/services/integrations/recall-ai/client";
import { postRecallMeetingNote } from "@/services/integrations/twenty/crmAutomation";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const secret = process.env.RECALL_WORKSPACE_VERIFICATION_SECRET;

    if (secret) {
      verifyRecallWebhookSignature({
        secret,
        headers: req.headers,
        payload: rawBody,
      });
    }

    const payload = JSON.parse(rawBody) as RecallWebhookPayload;
    const bot = extractRecallBotFromWebhook(payload);
    if (!bot?.id) {
      return NextResponse.json({ ok: true, ignored: true, reason: "No bot in webhook payload" });
    }

    const status = latestRecallStatus(bot);
    const statusCode = status.code;
    const shouldSyncDone = statusCode === "done";
    const shouldSyncFailed = statusCode === "fatal" || statusCode === "call_ended_not_recorded";

    if (!shouldSyncDone && !shouldSyncFailed) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        botId: bot.id,
        status,
      });
    }

    const media = extractRecallMedia(bot);
    const metadata = (bot.metadata || {}) as Record<string, unknown>;
    const crmSync = await postRecallMeetingNote({
      opportunityId: typeof metadata.opportunityId === "string" ? metadata.opportunityId : undefined,
      proposalId: typeof metadata.proposalId === "string" ? metadata.proposalId : undefined,
      status: shouldSyncDone ? "done" : "failed",
      botId: bot.id,
      meetingUrl: bot.meeting_url,
      meetingTitle: typeof metadata.dealName === "string" ? metadata.dealName : undefined,
      joinAt: bot.join_at || undefined,
      scheduledBy: typeof metadata.scheduledBy === "string" ? metadata.scheduledBy : undefined,
      transcriptUrl: media.transcriptUrl,
      videoUrl: media.videoUrl,
      audioUrl: media.audioUrl,
      participantEventsUrl: media.participantEventsUrl,
      meetingMetadataUrl: media.meetingMetadataUrl,
      recordingId: media.recordingId,
      failureCode: shouldSyncFailed ? status.subCode || status.code : undefined,
      failureMessage: status.message || undefined,
    });

    return NextResponse.json({
      ok: true,
      botId: bot.id,
      status,
      media,
      crmSync,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to handle Recall webhook" },
      { status: 400 },
    );
  }
}
