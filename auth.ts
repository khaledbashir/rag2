import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { ensureAnythingLlmUser } from "@/services/anythingllm/userProvisioner";

function microsoftAllowedDomains(): string[] {
  return (process.env.AUTH_MICROSOFT_ALLOWED_DOMAINS || "anc.com")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function microsoftEmailFromProfile(profile: Record<string, unknown>): string {
  const raw =
    profile.email ||
    profile.preferred_username ||
    profile.upn ||
    profile.unique_name;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

const microsoftProvider =
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
          allowDangerousEmailAccountLinking: true,
          profile(profile) {
            const email = microsoftEmailFromProfile(profile as Record<string, unknown>);
            return {
              id: String(profile.sub),
              name: typeof profile.name === "string" ? profile.name : email,
              email,
              image: null,
            };
          },
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile, user }) {
      if (account?.provider !== "microsoft-entra-id") return true;

      const email = (user.email || microsoftEmailFromProfile((profile || {}) as Record<string, unknown>)).toLowerCase();
      const domain = email.split("@")[1] || "";
      const allowedDomains = microsoftAllowedDomains();

      return Boolean(email && allowedDomains.includes(domain));
    },
  },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [
    ...microsoftProvider,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email ? String(credentials.email).trim().toLowerCase() : "";
        console.log(`[Auth] Login attempt: "${email}"`);

        if (!email || typeof credentials?.password !== "string") {
          console.warn(`[Auth] REJECTED — missing email or password`);
          return null;
        }

        let user;
        try {
          user = await prisma.user.findUnique({ where: { email } });
        } catch (dbErr: any) {
          console.error(`[Auth] DATABASE ERROR during user lookup:`, dbErr.message);
          throw new Error("Database connection failed");
        }

        if (!user) {
          console.warn(`[Auth] REJECTED — no user found for "${email}"`);
          return null;
        }
        if (!user.passwordHash) {
          console.warn(`[Auth] REJECTED — user "${email}" has no passwordHash (OAuth-only account?)`);
          return null;
        }

        let ok: boolean;
        try {
          ok = await bcrypt.compare(credentials.password as string, user.passwordHash);
        } catch (bcryptErr: any) {
          console.error(`[Auth] BCRYPT ERROR for "${email}":`, bcryptErr.message);
          return null;
        }

        if (!ok) {
          console.warn(`[Auth] REJECTED — wrong password for "${email}"`);
          return null;
        }

        console.log(`[Auth] SUCCESS — "${email}" logged in (role: ${user.role})`);

        // Track last login + auto-provision AnythingLLM (non-blocking)
        prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((e) => console.error("[Auth] lastLoginAt update failed:", e));
        ensureAnythingLlmUser(user.id, user.email).catch((e) =>
          console.error("[Auth] ALM user provision failed:", e),
        );

        return {
          id: user.id,
          name: user.name ?? undefined,
          email: user.email,
          image: user.image ?? undefined,
          role: user.role,
          authRole: user.authRole,
        };
      },
    }),
  ],
});
