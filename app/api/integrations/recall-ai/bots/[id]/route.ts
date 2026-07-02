import { NextRequest, NextResponse } from "next/server";
import {
  extractRecallMedia,
  latestRecallStatus,
  retrieveRecallBot,
} from "@/services/integrations/recall-ai/client";
import { postRecallMeetingNote } from "@/services/integrations/twenty/crmAutomation";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const syncToCrm = req.nextUrl.searchParams.get("sync") === "true";
    const bot = await retrieveRecallBot(params.id);
    const media = extractRecallMedia(bot);
    const status = latestRecallStatus(bot);
    const metadata = (bot.metadata || {}) as Record<string, unknown>;

    let crmSync = null;
    if (syncToCrm) {
      const isDone = status.code === "done";
      const isFailed = status.code === "fatal" || status.code === "call_ended_not_recorded";

      crmSync = await postRecallMeetingNote({
        opportunityId: typeof metadata.opportunityId === "string" ? metadata.opportunityId : undefined,
        proposalId: typeof metadata.proposalId === "string" ? metadata.proposalId : undefined,
        status: isDone ? "done" : isFailed ? "failed" : "review_required",
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
        failureCode: isFailed ? status.subCode || status.code : undefined,
        failureMessage: status.message || undefined,
      });
    }

    return NextResponse.json({
      ok: true,
      bot,
      status,
      media,
      crmSync,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to retrieve Recall bot" },
      { status: 400 },
    );
  }
}
