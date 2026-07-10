import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const appHubHosts = new Set([
        "apps.anc.com",
        "app.anc.com",
        "apps.ancsports.net",
        "app.ancsports.net",
      ]);
      const isAppsHost = appHubHosts.has(nextUrl.hostname);
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname.startsWith("/auth/");
      const isPublic =
        nextUrl.pathname === "/api/health" ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/uploadthing") ||
        nextUrl.pathname.startsWith("/api/pricing-logic") ||
        nextUrl.pathname.startsWith("/api/agent-skill") ||
        // Headless bot API. Exempt in middleware.ts but, until now, not here —
        // so the session guard redirected it to /auth/login before its own
        // check could run. Every /api/bot route validates
        // `Authorization: Bearer $BOT_API_TOKEN` itself (app/api/bot/auth.ts),
        // so this exempts the session guard, not authentication.
        // Deliberately NOT extended to /api/mcp: that route has no inbound
        // auth of its own, and exposing it would make create_proposal callable
        // by anyone.
        nextUrl.pathname.startsWith("/api/bot") ||
        nextUrl.pathname.startsWith("/api/twenty-bridge/") ||
        nextUrl.pathname.startsWith("/api/jireh-reports/") ||
        nextUrl.pathname.startsWith("/api/crm-reports/") ||
        nextUrl.pathname.startsWith("/api/intake/") ||
        nextUrl.pathname.startsWith("/api/integrations/meeting-capture/intake") ||
        nextUrl.pathname === "/api/integrations/recall-ai/webhook" ||
        nextUrl.pathname.startsWith("/api/render/") ||
        nextUrl.pathname.startsWith("/api/catalog") ||
        nextUrl.pathname.startsWith("/catalog/") ||
        nextUrl.pathname.startsWith("/m-and-s-sync") ||
        nextUrl.pathname.startsWith("/training-intake") ||
        nextUrl.pathname.startsWith("/api/training-intake") ||
        nextUrl.pathname.startsWith("/api/intelligence/") ||
        nextUrl.pathname.startsWith("/api/performance/seed") ||
        nextUrl.pathname.startsWith("/share/performance/") ||
        nextUrl.pathname.startsWith("/_next") ||
        nextUrl.pathname.startsWith("/favicon") ||
        nextUrl.pathname.includes(".");
      if (isAuthPage) {
        if (isLoggedIn) return Response.redirect(new URL(isAppsHost ? "/hub" : "/", nextUrl.origin));
        return true;
      }
      if (isPublic) return true;
      if (!isLoggedIn) {
        const loginUrl = new URL("/auth/login", nextUrl.origin);
        loginUrl.searchParams.set(
          "callbackUrl",
          isAppsHost && nextUrl.pathname === "/"
            ? "/hub"
            : `${nextUrl.pathname}${nextUrl.search}`,
        );
        return Response.redirect(loginUrl);
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.role = (user as { role?: string }).role;
        token.authRole = (user as { authRole?: string }).authRole;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.name = (token.name as string) ?? "";
        (session.user as { role?: string }).role = (token.role as string) ?? "VIEWER";
        (session.user as { authRole?: string }).authRole = (token.authRole as string) ?? "";
      }
      return session;
    },
  },
  providers: [], // Added in auth.ts
} satisfies NextAuthConfig;
