import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { postRecallMeetingNote } from "@/services/integrations/twenty/crmAutomation";

const desktopRecordingSchema = z.object({
  opportunityId: z.string().uuid().optional(),
  proposalId: z.string().optional(),
  source: z.enum(["read-ai", "otter-ai", "recall-ai", "desktop-sdk", "manual-upload"]).default("desktop-sdk"),
  sourceUrl: z.string().url().optional(),
  meetingTitle: z.string().trim().optional(),
  scheduledBy: z.string().trim().optional(),
  recordingId: z.string().trim().optional(),
  transcriptUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  audioUrl: z.string().url().optional(),
  participantEventsUrl: z.string().url().optional(),
  meetingMetadataUrl: z.string().url().optional(),
  notes: z.string().trim().optional(),
  notifySlack: z.boolean().optional(),
});

export async function handleMeetingCaptureIntake(req: NextRequest) {
  try {
    const body = desktopRecordingSchema.parse(await req.json());

    if (!body.opportunityId && !body.proposalId) {
      return NextResponse.json(
        { ok: false, error: "Provide opportunityId or proposalId to attach the recording to CRM." },
        { status: 400 },
      );
    }

    if (!body.transcriptUrl && !body.videoUrl && !body.audioUrl && !body.sourceUrl && !body.notes) {
      return NextResponse.json(
        { ok: false, error: "Provide at least one meeting note, source link, transcript, video, or audio URL." },
        { status: 400 },
      );
    }

    const crmSync = await postRecallMeetingNote({
      opportunityId: body.opportunityId,
      proposalId: body.proposalId,
      status: "done",
      title: body.source === "read-ai"
        ? "Read.ai meeting notes attached"
        : body.source === "otter-ai"
          ? "Otter.ai meeting notes attached"
          : body.source === "manual-upload"
            ? "Meeting notes attached"
            : "Desktop meeting recording completed",
      source: body.source,
      sourceUrl: body.sourceUrl,
      meetingTitle: body.meetingTitle,
      scheduledBy: body.scheduledBy,
      transcriptUrl: body.transcriptUrl,
      videoUrl: body.videoUrl,
      audioUrl: body.audioUrl,
      participantEventsUrl: body.participantEventsUrl,
      meetingMetadataUrl: body.meetingMetadataUrl,
      recordingId: body.recordingId,
      notes: body.notes,
      notifySlack: body.notifySlack,
    });

    return NextResponse.json({
      ok: true,
      crmSync,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to sync desktop recording to CRM" },
      { status: 400 },
    );
  }
}


export async function POST(req: NextRequest) {
  return handleMeetingCaptureIntake(req);
}
