import { NextRequest, NextResponse } from "next/server";
import { handleMeetingCaptureIntake } from "@/app/api/integrations/recall-ai/desktop-recordings/route";

function isAuthorized(req: NextRequest) {
  const expected = process.env.MEETING_CAPTURE_INTAKE_SECRET?.trim();
  if (!expected) return false;
  const provided =
    req.headers.get("x-meeting-capture-secret") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  return provided === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized meeting capture intake." }, { status: 401 });
  }
  return handleMeetingCaptureIntake(req);
}
