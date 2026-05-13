/**
 * Additive banner shown above the LED estimate. Reads the CMS subtotal for
 * this proposal and surfaces it as a single "Control System" line that
 * click-throughs to the CMS picker. Does NOT modify any LED estimator code.
 *
 * Hidden when FEATURES.CMS_PRICING is off.
 */
import { prisma } from "@/lib/prisma";
import { FEATURES } from "@/lib/featureFlags";
import Link from "next/link";
import { Cpu, ArrowRight } from "lucide-react";

export default async function CmsSummaryBanner({ projectId }: { projectId: string }) {
  if (!FEATURES.CMS_PRICING) return null;

  const bom = await prisma.cmsProjectBom.findUnique({
    where: { proposalId: projectId },
    select: {
      grandSubtotal: true,
      hardwareSubtotal: true,
      licenseSubtotal: true,
      softCostSubtotal: true,
      acCapacityFlag: true,
      lineItems: { select: { id: true }, take: 1 },
    },
  });

  const total = Number(bom?.grandSubtotal ?? 0);
  const hasAny = (bom?.lineItems ?? []).length > 0;

  return (
    <Link
      href={`/estimator/${projectId}/cms`}
      className="mx-4 sm:mx-6 my-2 px-4 py-3 rounded-lg border border-border hover:border-primary/40 bg-muted/30 flex items-center justify-between gap-3 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10 text-primary">
          <Cpu className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Control System</p>
          {hasAny ? (
            <p className="text-sm font-medium">
              ${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              {FEATURES.CMS_PRICING_STRATEGIC && bom?.acCapacityFlag && (
                <span className="ml-2 text-xs text-orange-500 font-normal">
                  · AC capacity flagged
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No CMS line items yet — click to price</p>
          )}
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground" />
    </Link>
  );
}
