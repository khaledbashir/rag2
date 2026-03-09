# Deployment Workflow — ANC Proposal Engine

## The Golden Rule
**We code on the VPS → push to GitHub → EasyPanel auto-builds.** No local dev push, no manual deployments.

## Environment Variables Rule
If your code changes require env vars, **give me the COMPLETE copy-pasteable block.** No `REPLACE_ME`, no placeholders, no security lectures. Just paste the whole block so I can paste it directly into EasyPanel.

## Current Production Environment Variables

```
DATABASE_URL=postgres://postgres:32e4654c47db3b3f2a1e@basheer_natadb:5432/nata?sslmode=disable
AUTH_SECRET=K8mN2pQ7xR4vY9wL3jH6fG1sD0cB5zA
NEXT_PUBLIC_BASE_URL=https://proposals.anc.com
ANYTHING_LLM_URL=https://basheer-anything-llm.prd42b.easypanel.host/api/v1
ANYTHING_LLM_KEY=7YMK7HD-B1KMNBZ-PPQ3DSV-9RGQDT7
ANYTHING_LLM_WORKSPACE=nata-estimator
ANYTHING_LLM_MASTER_CATALOG_URL=https://basheer-invo.c9tnyg.easypanel.host/assets/data/anc_catalog.csv
BROWSERLESS_URL=wss://basheer-browserless.prd42b.easypanel.host?token=604063c6d2a7540689b37278bad92d74
Z_AI_API_KEY=__Z_AI_API_KEY__
Z_AI_BASE_URL=https://api.z.ai/api/coding/paas/v4
Z_AI_MODEL_NAME=glm-4.6v
SERPER_API_KEY=a2ced8aa811681e1036259d341d7093630ab6dae
AUTH_URL=https://proposals.anc.com
```

## Deploy Process

1. Code changes on VPS at `/root/rag2`
2. Test locally (if needed): `pnpm dev` → http://localhost:3003
3. Git commit: `git add . && git commit -m "message"`
4. Git push: `git push origin phase2/product-database` (or current branch)
5. EasyPanel watches GitHub → auto-builds Docker container
6. Container restarts → new version live

## Branch Strategy
- Main development: `phase2/product-database`
- Push ONLY to current branch (never merge rag and phase2/product-database)
- Check branch before push: `git branch`

## EasyPanel Infrastructure

| Service | Type | URL |
|---------|------|-----|
| Proposal Engine | Next.js Docker | https://proposals.anc.com |
| Database | PostgreSQL | basheer_natadb (container) |
| Browserless | Chrome WS | wss://basheer-browserless.prd42b.easypanel.host |
| AnythingLLM | API | https://basheer-anything-llm.prd42b.easypanel.host |

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `Unexpected token '<'` on JS chunks | Container restart, stale cache | Hard refresh browser (Ctrl+Shift+R) |
| `MissingSecret` auth error | AUTH_SECRET not found in Docker | Add `secret: process.env.AUTH_SECRET` to auth.ts + auth-middleware.ts |
| `UntrustedHost` auth error | Docker sees localhost:80, rejects it | Add `trustHost: true` to BOTH auth.ts and auth-middleware.ts |
| Redirect to localhost:80 after login | Auth.js doesn't know real domain | Add `AUTH_URL=https://proposals.anc.com` to EasyPanel env vars |
| Old version still live | EasyPanel hasn't rebuilt yet | Wait 2-3 min, check EasyPanel logs |

## Quick Commands

```bash
# Check EasyPanel logs
tail -f /root/.cursor/projects/root-rag2/terminals/[id].txt

# Restart container (if stuck)
# Via EasyPanel UI only

# Verify branch
git branch
git push origin $(git branch --show-current)

# Test locally
pnpm dev
# Open http://localhost:3003

# Seed Pricing Logic Database
npx tsx prisma/seed-pricing-logic.ts

# Test Pricing Logic API
curl "http://localhost:3003/api/pricing-logic/tree?categoryId=<LED_ID>"
```