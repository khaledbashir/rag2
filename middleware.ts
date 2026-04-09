import { NextResponse } from "next/server";
import { auth } from "@/auth-middleware";

// Route protection rules
const ROUTE_RULES: Array<{
  pattern: RegExp;
  roles: string[]; // allowed roles
  /**
   * Restrict only these HTTP methods. When omitted, ALL methods are restricted.
   * Use this to allow read-only GET access to routes whose mutations are
   * admin-only. Example: `/api/products` catalog — wizards/estimator UI need
   * to read it, but only admins should create/update/delete.
   */
  methods?: string[];
}> = [
    // Performance — accessible to more roles
    { pattern: /^\/admin\/performance/, roles: ["ADMIN", "ESTIMATOR", "PROPOSAL_LEAD"] },
    // Admin-only routes
    { pattern: /^\/admin/, roles: ["ADMIN"] },
    { pattern: /^\/api\/admin\//, roles: ["ADMIN"] },
    { pattern: /^\/api\/rate-card/, roles: ["ADMIN"] },
    // Product catalog: GET is open to any authed user (estimator courtside/
    // stanchion wizard, product dropdowns, etc. all read it). Mutations stay
    // admin-only. Before this rule was method-aware, any user with a stale
    // JWT role would get a 403 on the wizard's product fetch and see a
    // "Failed to fetch product" error.
    { pattern: /^\/api\/products/, roles: ["ADMIN", "PRODUCT_EXPERT"], methods: ["POST", "PUT", "PATCH", "DELETE"] },
    { pattern: /^\/api\/pricing-logic/, roles: ["ADMIN"] },

    // Workspace creation
    { pattern: /^\/api\/workspaces\/create/, roles: ["ADMIN", "ESTIMATOR", "PROPOSAL_LEAD"] },

    // Proposal mutations (create/edit/delete)
    { pattern: /^\/api\/proposals\/create/, roles: ["ADMIN", "ESTIMATOR", "PROPOSAL_LEAD"] },
    { pattern: /^\/api\/proposals\/import-excel/, roles: ["ADMIN", "ESTIMATOR", "PROPOSAL_LEAD"] },
    { pattern: /^\/api\/proposals\/export$/, roles: ["ADMIN", "ESTIMATOR", "PROPOSAL_LEAD", "PRODUCT_EXPERT"] },
    { pattern: /^\/api\/proposals\/export\/audit/, roles: ["ADMIN", "ESTIMATOR", "FINANCE", "PROPOSAL_LEAD"] },

    // PDF generation
    { pattern: /^\/api\/projects\/[^/]+\/pdf/, roles: ["ADMIN", "ESTIMATOR", "PROPOSAL_LEAD"] },
  ];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Canonicalize malformed paths like //demo/virtual-venue-v2 -> /demo/virtual-venue-v2
  // to avoid client-side history.replaceState cross-origin parsing issues.
  const normalizedPath = pathname.replace(/\/{2,}/g, "/");
  if (normalizedPath !== pathname) {
    const normalizedUrl = req.nextUrl.clone();
    normalizedUrl.pathname = normalizedPath;
    return NextResponse.redirect(normalizedUrl);
  }

  // Public routes — no auth needed
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/bot") ||
    pathname.startsWith("/api/share") ||
    pathname.startsWith("/api/agent-skill") ||
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/api/performance/seed") ||
    // Twenty CRM bridge — Twenty AI skills link users here with a narrow,
    // read-only view (estimate → xlsx export). The inbound request carries
    // only a Twenty estimate UUID, which we validate against Twenty's REST
    // API before returning anything.
    pathname.startsWith("/api/twenty-bridge") ||
    pathname.startsWith("/share/performance/") ||
    pathname.startsWith("/auth/")
  ) {
    return NextResponse.next();
  }

  // Get user from session
  const user = (req as any).auth?.user;

  // No session = redirect to login (for pages) or 401 (for API)
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const userRole = user.role || "VIEWER"; // Default to most restrictive

  // ADMIN bypasses all checks
  if (userRole === "ADMIN") {
    return NextResponse.next();
  }

  // Check route rules
  for (const rule of ROUTE_RULES) {
    if (rule.pattern.test(pathname)) {
      // Method-scoped rule: if the incoming method isn't in the rule's list,
      // skip the role check (still matched the pattern, so no fall-through).
      if (rule.methods && !rule.methods.includes(req.method)) {
        break;
      }
      if (!rule.roles.includes(userRole)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Forbidden", message: `Role '${userRole}' cannot access this resource` },
            { status: 403 }
          );
        }
        return NextResponse.redirect(new URL("/projects", req.url));
      }
      break; // First match wins
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/pdf-triage|api/rfp/analyze|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html|css)$).*)",
  ],
};
