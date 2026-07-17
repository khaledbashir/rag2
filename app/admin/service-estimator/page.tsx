import { auth } from "@/auth";
import Unauthorized from "@/app/components/reusables/Unauthorized";
import type { UserRole } from "@/lib/rbac";

import ServiceEstimatorClient from "./ServiceEstimatorClient";

const ALLOWED_ROLES: UserRole[] = [
  "ADMIN",
  "PRODUCT_EXPERT",
  "PROPOSAL_LEAD",
  "ESTIMATOR",
];

export default async function ServiceEstimatorPage() {
  const session = await auth();
  const userRole = (session?.user as { role?: UserRole } | undefined)?.role;
  const hasAccess = userRole && ALLOWED_ROLES.includes(userRole);

  if (!hasAccess) {
    return <Unauthorized allowedRoles={ALLOWED_ROLES} featureName="Service Estimator" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-background p-6 sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Venue Services
          </div>
          <h1 className="serif-vault mt-2 text-3xl font-normal text-foreground sm:text-4xl">
            Service Estimator
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Build multi-year service pricing from event days, technician staffing, rates,
            break/fix coverage, and capital costs. Export a live-formula workbook that feeds
            directly into the Service Proposal and Service Contract flow.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            {["1  Project", "2  Event coverage", "3  Pricing controls", "4  Export workbook"].map(
              (step) => (
                <span
                  key={step}
                  className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-muted-foreground"
                >
                  {step}
                </span>
              ),
            )}
          </div>
        </div>
        <ServiceEstimatorClient />
      </div>
    </div>
  );
}
