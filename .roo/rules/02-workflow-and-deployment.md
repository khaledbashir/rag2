# Workflow & Deployment

## CRITICAL: No Local Dev
Ahmad NEVER runs the app locally. The workflow is:
1. Write code
2. `git add` + `git commit` + `git push`
3. EasyPanel auto-builds from the push (Docker)
4. Done. No local dev server, no `npm run dev`, no localhost testing.

## Git
- **Repo:** https://github.com/khaledbashir/rag2
- **Branch:** `phase2/product-database` (this is the MAIN working branch, push here)
- **Main branch:** `main` (don't push directly)
- Always commit with clear messages. Push after every meaningful change.

## Infrastructure
- **VPS:** Hetzner at 138.201.126.110
- **Hosting:** EasyPanel (Docker containers)
- **Port:** 3000 internally → 80 externally
- **Production URL:** https://proposals.anc.com
- **AnythingLLM:** https://basheer-anything-llm.prd42b.easypanel.host
- **No .env file in Docker** — all environment variables configured in EasyPanel dashboard
- **DB:** PostgreSQL (via Prisma). Schema push in entrypoint: `npx prisma db push --accept-data-loss`
- **PDF Generation:** Browserless (internal Docker URL first, WSS external fallback)
- **Error Tracking:** Sentry
- **No CI/CD, no staging, no tests** — ship direct to production

## After Container Restart
Users may see stale JS chunks → hard refresh (Ctrl+Shift+R) fixes it. This is expected.

## Auth
- NextAuth v5 with JWT strategy
- CRITICAL: Must have explicit `secret: process.env.AUTH_SECRET` in BOTH `auth.ts` AND `auth-middleware.ts`
- Without this, auth breaks silently in Docker
