import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Unauthorized from "@/app/components/reusables/Unauthorized";
import type { UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/featureFlags";
import EmailToCrmClient from "./EmailToCrmClient";

export default async function EmailToCrmPage() {
  if (!FEATURES.EMAIL_TO_CRM) redirect("/admin");

  const session = await auth();
  const userRole = (session?.user as { role?: UserRole } | undefined)?.role;

  const allowedRoles: UserRole[] = ["ADMIN", "PRODUCT_EXPERT"];
  const hasAccess = userRole && allowedRoles.includes(userRole);
  if (!hasAccess) {
    return <Unauthorized allowedRoles={allowedRoles} featureName="Email to CRM" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-normal text-foreground serif-vault">Email to CRM</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Inbound proposal emails are read for due dates and key details, matched to the
            right opportunity, and applied as field updates plus a timeline note. Decisive
            matches apply automatically; anything ambiguous waits here for review. Every
            extracted date must be backed by a verbatim quote from the email — unverified
            dates are flagged, never written.
          </p>
        </div>
        <EmailToCrmClient />
      </div>
    </div>
  );
}
