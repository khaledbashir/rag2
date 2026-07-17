import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/apiAuth";
import { log } from "@/lib/logger";
import type { UserRole } from "@/lib/rbac";
import { ServiceEstimatorInputSchema } from "@/lib/serviceEstimator/schema";
import {
  buildServiceEstimatorWorkbook,
  serviceEstimatorFileName,
} from "@/lib/serviceEstimator/workbook";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_ROLES: UserRole[] = [
  "ADMIN",
  "PRODUCT_EXPERT",
  "PROPOSAL_LEAD",
  "ESTIMATOR",
];

export async function POST(request: NextRequest) {
  try {
    const [session, authError] = await requireAuth();
    if (authError) return authError;
    const role = (session as unknown as { user?: { role?: UserRole } } | null)?.user?.role;
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = ServiceEstimatorInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Check the service-estimator inputs.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const workbook = buildServiceEstimatorWorkbook(parsed.data);
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = serviceEstimatorFileName(parsed.data);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log.error("[service-estimator/export.xlsx] error:", error);
    return NextResponse.json(
      { error: "Failed to generate the service-estimator workbook." },
      { status: 500 },
    );
  }
}
