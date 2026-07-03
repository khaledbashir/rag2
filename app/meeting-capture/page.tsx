import { auth } from "@/auth";
import Unauthorized from "@/app/components/reusables/Unauthorized";
import MeetingCaptureClient from "@/app/admin/meeting-capture/MeetingCaptureClient";
import { isPlatformOwner } from "@/lib/platformOwner";
import type { UserRole } from "@/lib/rbac";

export default async function MeetingCapturePage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role as UserRole | undefined;
  const allowedRoles: UserRole[] = ["ADMIN", "ESTIMATOR", "PROPOSAL_LEAD"];
  const hasAccess = Boolean((userRole && allowedRoles.includes(userRole)) || isPlatformOwner(session?.user?.email));

  if (!hasAccess) {
    return <Unauthorized allowedRoles={allowedRoles} featureName="Meeting Capture" />;
  }

  return <MeetingCaptureClient userEmail={session?.user?.email || ""} />;
}
