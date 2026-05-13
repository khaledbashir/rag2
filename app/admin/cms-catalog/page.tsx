import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Unauthorized from "@/app/components/reusables/Unauthorized";
import type { UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/featureFlags";
import CmsCatalogAdmin from "./CmsCatalogAdmin";

export default async function AdminCmsCatalogPage() {
  if (!FEATURES.CMS_PRICING) redirect("/admin");

  const session = await auth();
  const userRole = (session?.user as { role?: UserRole } | undefined)?.role;

  const allowedRoles: UserRole[] = ["ADMIN", "PRODUCT_EXPERT"];
  const hasAccess = userRole && allowedRoles.includes(userRole);
  if (!hasAccess) {
    return <Unauthorized allowedRoles={allowedRoles} featureName="CMS Catalog" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-normal text-foreground serif-vault">
            CMS Catalog
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Control System equipment, licenses, and soft-cost rates. Add SKUs and adjust
            pricing as the equipment list evolves. Price changes snapshot a new version so
            already-quoted proposals don&apos;t silently re-price.
          </p>
        </div>
        <CmsCatalogAdmin />
      </div>
    </div>
  );
}
