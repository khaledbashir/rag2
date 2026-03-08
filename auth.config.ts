import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname.startsWith("/auth/");
      const isPublic =
        nextUrl.pathname === "/api/health" ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/uploadthing") ||
        nextUrl.pathname.startsWith("/api/pricing-logic") ||
        nextUrl.pathname.startsWith("/api/agent-skill") ||
        nextUrl.pathname.startsWith("/api/intelligence/") ||
        nextUrl.pathname.startsWith("/api/performance/seed") ||
        nextUrl.pathname.startsWith("/share/performance/") ||
        nextUrl.pathname.startsWith("/_next") ||
        nextUrl.pathname.startsWith("/favicon") ||
        nextUrl.pathname.includes(".");
      if (isAuthPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl.origin));
        return true;
      }
      if (isPublic) return true;
      if (!isLoggedIn)
        return Response.redirect(new URL("/auth/login", nextUrl.origin));
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.role = (user as { role?: string }).role;
        token.authRole = (user as { authRole?: string }).authRole;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        (session.user as { role?: string }).role = (token.role as string) ?? "VIEWER";
        (session.user as { authRole?: string }).authRole = (token.authRole as string) ?? "";
      }
      return session;
    },
  },
  providers: [], // Added in auth.ts
} satisfies NextAuthConfig;
