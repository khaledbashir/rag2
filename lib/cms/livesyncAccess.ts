/**
 * Who can reach the Control System (LiveSync) estimating tool.
 *
 * One list, imported by the page, the sidebar entry, and every /api/cms/
 * livesync-auto-bom route — the gate used to be copy-pasted into five places
 * and drifted: it allowed PRODUCT_EXPERT but not ESTIMATOR, even though
 * ESTIMATOR holds a strict superset of PRODUCT_EXPERT's permissions
 * (lib/rbac.ts). The people who actually run the sheets were locked out of
 * the tool built for them.
 */
import type { UserRole } from "@/lib/rbac";

export const LIVESYNC_TOOL_ROLES: UserRole[] = [
  "ADMIN",
  "ESTIMATOR",
  "PROPOSAL_LEAD",
  "PRODUCT_EXPERT",
];
