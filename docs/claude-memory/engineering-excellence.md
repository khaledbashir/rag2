# Engineering Excellence Playbook

Source: `i18n/ANC_Engineering_Excellence_Playbook.docx.pdf`

## 4 Layers (40 prompts, E1-E14+)

### Layer 1: Foundation (E1-E5) — PARTIALLY DONE
- [x] E1: Local dev environment (pnpm dev, port 3003)
- [x] E2: Git branching strategy (feature branches → main)
- [x] E3: Docker + EasyPanel deployment
- [ ] E4: Staging environment (separate EasyPanel service)
- [ ] E5: Database backups (pg_dump cron or EasyPanel backup)

### Layer 2: Production-Grade (E6-E10) — IN PROGRESS
- [x] E6: Error tracking (Sentry configured in next.config.js)
- [ ] E7: Automated testing (Jest + React Testing Library)
- [ ] E8: CI/CD pipeline (GitHub Actions: lint → test → build → deploy)
- [ ] E9: Performance monitoring (Sentry Performance or Vercel Analytics)
- [ ] E10: Log aggregation (structured logging, EasyPanel log viewer)

### Layer 3: Enterprise-Grade (E11-E14) — PLANNED
- [ ] E11: Role-based access control (admin, estimator, viewer)
- [ ] E12: Audit logging (who changed what, when)
- [ ] E13: Rate limiting + API security
- [ ] E14: Data retention policies + GDPR compliance

### Layer 4: Senior Engineer (E14+) — FUTURE
- [ ] Feature flags (LaunchDarkly or custom)
- [ ] A/B testing infrastructure
- [ ] Canary deployments
- [ ] Disaster recovery runbook
- [ ] Load testing (k6 or Artillery)

## Infrastructure Details
- **VPS IP**: 138.201.126.110
- **EasyPanel**: port 3000 (container) → 80 (proxy)
- **Production URL**: basheer-natalia.prd42b.easypanel.host (also proposals.anc.com)
- **Browserless**: separate EasyPanel service, WSS external + WS internal (Docker network)
- **Database**: PostgreSQL on same VPS via EasyPanel
- **Auth**: NextAuth v5 with Credentials provider, AUTH_SECRET required explicitly in Docker

## Known Issues / Lessons
- Auth.js v5 in Docker: must set `secret: process.env.AUTH_SECRET` explicitly in both auth.ts and auth-middleware.ts
- Container restarts cause `Unexpected token '<'` errors (stale JS chunk hashes) — resolved by hard refresh
- No `.env` in Docker image — all env vars come from EasyPanel container config
- `npx prisma db push --accept-data-loss` in entrypoint for schema sync (no migration history)
