import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRecallBot } from "@/services/integrations/recall-ai/client";
import { postRecallMeetingNote } from "@/services/integrations/twenty/crmAutomation";

const createBotSchema = z.object({
  meetingUrl: z.string().url(),
  meetingTitle: z.string().trim().optional(),
  botName: z.string().trim().min(1).max(100).optional(),
  joinAt: z.string().datetime().optional().nullable(),
  opportunityId: z.string().uuid().optional(),
  proposalId: z.string().optional(),
  companyName: z.string().trim().optional(),
  dealName: z.string().trim().optional(),
  scheduledBy: z.string().trim().optional(),
  recordVideo: z.boolean().optional(),
  transcribe: z.boolean().optional(),
  transcriptionProvider: z.enum(["meeting_captions", "recallai_streaming"]).optional(),
  realtimeEndpointUrl: z.string().url().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const body = createBotSchema.parse(await req.json());

    const bot = await createRecallBot({
      meetingUrl: body.meetingUrl,
      botName: body.botName || "ANC Meeting Recorder",
      joinAt: body.joinAt || null,
      recordVideo: body.recordVideo,
      transcribe: body.transcribe,
      transcriptionProvider: body.transcriptionProvider,
      realtimeEndpointUrl: body.realtimeEndpointUrl,
      metadata: {
        source: "anc-crm",
        opportunityId: body.opportunityId,
        proposalId: body.proposalId,
        companyName: body.companyName,
        dealName: body.dealName || body.meetingTitle,
        scheduledBy: body.scheduledBy,
      },
    });

    const crmSync = await postRecallMeetingNote({
      opportunityId: body.opportunityId,
      proposalId: body.proposalId,
      status: "scheduled",
      botId: bot.id,
      meetingUrl: body.meetingUrl,
      meetingTitle: body.meetingTitle || body.dealName,
      joinAt: body.joinAt || bot.join_at || null,
      scheduledBy: body.scheduledBy,
    });

    return NextResponse.json({
      ok: true,
      bot,
      crmSync,
      next: "Configure Recall status webhooks to POST to /api/integrations/recall-ai/webhook so completed transcripts attach automatically.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to create Recall bot" },
      { status: 400 },
    );
  }
}
