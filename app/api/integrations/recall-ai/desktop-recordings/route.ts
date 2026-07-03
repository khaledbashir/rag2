import { NextRequest, NextResponse } from "next/server";
import { handleMeetingCaptureIntake } from "@/services/integrations/recall-ai/meetingCaptureIntake";

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "Meeting capture desktop/manual intake",
    accepts: ["POST"],
    pageUrl: "https://proposals.anc.com/meeting-capture",
    required: "POST JSON with opportunityId or proposalId, plus notes/sourceUrl/transcriptUrl/videoUrl/audioUrl.",
    note: "Use the Meeting Capture page for browser entry. This endpoint is for saving desktop/manual recording artifacts.",
  });
}

export async function POST(req: NextRequest) {
  return handleMeetingCaptureIntake(req);
}
