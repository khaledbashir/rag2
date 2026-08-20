import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Unauthorized from "@/app/components/reusables/Unauthorized";
import type { UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/featureFlags";
import { LIVESYNC_TOOL_ROLES } from "@/lib/cms/livesyncAccess";
import LivesyncCalculatorClient from "./LivesyncCalculatorClient";

export default async function LivesyncCalculatorPage() {
  if (!FEATURES.LIVESYNC_AUTO_BOM) redirect("/admin");

  const session = await auth();
  const userRole = (session?.user as { role?: UserRole } | undefined)?.role;

  const allowedRoles: UserRole[] = LIVESYNC_TOOL_ROLES;
  const hasAccess = userRole && allowedRoles.includes(userRole);
  if (!hasAccess) {
    return <Unauthorized allowedRoles={allowedRoles} featureName="Control System Calculator" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-background p-6 sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">LiveSync Estimation</div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-normal text-foreground serif-vault">Control System Builder</h1>
          <p className="mt-3 max-w-3xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Build a grounded Control System estimate from the screens on the job. Review the package, adjust quantities or pricing, and export the final working BOM.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            {["1  Add screens", "2  Build package", "3  Review and edit", "4  Export"].map((step) => (
              <span key={step} className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-muted-foreground">{step}</span>
            ))}
          </div>
        </div>
        <LivesyncCalculatorClient />
      </div>
    </div>
  );
}
