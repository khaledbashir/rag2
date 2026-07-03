import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Unauthorized from "@/app/components/reusables/Unauthorized";
import type { UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/featureFlags";
import LivesyncCalculatorClient from "./LivesyncCalculatorClient";

export default async function LivesyncCalculatorPage() {
  if (!FEATURES.LIVESYNC_AUTO_BOM) redirect("/admin");

  const session = await auth();
  const userRole = (session?.user as { role?: UserRole } | undefined)?.role;

  const allowedRoles: UserRole[] = ["ADMIN", "PRODUCT_EXPERT"];
  const hasAccess = userRole && allowedRoles.includes(userRole);
  if (!hasAccess) {
    return <Unauthorized allowedRoles={allowedRoles} featureName="Control System Calculator" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-normal text-foreground serif-vault">
            Control System Calculator
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the screens on the job and the platform builds the full Control System
            bill of materials — servers with primary/backup redundancy, per-server
            accessories, workstations, KVM, matrix sizing, racks, and install labor —
            using the selection rules from the estimation team. Anything uncertain is
            flagged for human review instead of guessed.
          </p>
        </div>
        <LivesyncCalculatorClient />
      </div>
    </div>
  );
}
