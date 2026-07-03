import { auth } from "@/auth";
import Unauthorized from "@/app/components/reusables/Unauthorized";
import type { UserRole } from "@/lib/rbac";
import MeetingCaptureClient from "./MeetingCaptureClient";

export default async function MeetingCapturePage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role as UserRole | undefined;
  const allowedRoles: UserRole[] = ["ADMIN", "PROPOSAL_LEAD"];
  const hasAccess = userRole && allowedRoles.includes(userRole);

  if (!hasAccess) {
    return <Unauthorized allowedRoles={allowedRoles} featureName="Meeting Capture" />;
  }

  return <MeetingCaptureClient userEmail={session?.user?.email || ""} />;
}
