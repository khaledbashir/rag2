import { NextRequest, NextResponse } from "next/server";
import { handleMeetingCaptureIntake } from "@/services/integrations/recall-ai/meetingCaptureIntake";

function isAuthorized(req: NextRequest) {
  const expected = process.env.MEETING_CAPTURE_INTAKE_SECRET?.trim();
  if (!expected) return false;
  const provided =
    req.headers.get("x-meeting-capture-secret") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  return provided === expected;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "Meeting capture external intake",
    accepts: ["POST"],
    pageUrl: "https://proposals.anc.com/meeting-capture",
    auth: "POST requests require x-meeting-capture-secret or ?secret=...",
    note: "Use this endpoint for Read.ai/Otter/Zapier/manual handoffs. Use the Meeting Capture page for browser entry.",
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized meeting capture intake." }, { status: 401 });
  }
  return handleMeetingCaptureIntake(req);
}
