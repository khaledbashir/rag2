# ANC Proposal Engine (rag2) — Memory Index

## CORE RULE: Use Semantic Search First (MANDATORY)
- The codebase is indexed at `/root/rag2` via `mcp__claude-context__search_code`
- Before building ANY feature, ALWAYS search the index first — find what already exists, what can be reused, what patterns to follow
- Search with natural language: "margin calculation logic", "PDF generation flow", "product matching"
- Come back to Ahmad with: "found X, can reuse Y, only need to build Z" — never start coding blind
- Slack + email context is indexed in `/root/rag2/docs/slack/` and `/root/rag2/docs/emails/`
- Re-index when we accumulate enough new docs: `mcp__claude-context__index_codebase` with `force: true`
- **Next re-index: use `splitter: "langchain"`** — better for larger, uniform chunks especially on markdown/docs. Current index used `ast` (too granular for small files). Compare search quality after switch.

## CORE RULE: Post-Task Report (MANDATORY)
- After EVERY completed task, end with: **What We Did** (1-3 sentences) + **What Users Can Now Do** (bullets)
- Never skip. Standing user rule.

## CORE RULE: Ready-to-Send Message (MANDATORY)
- When Ahmad pastes stakeholder messages/screenshots (Natalia, Jireh, Matt, etc.) and I fix the issue:
- After the technical summary, add a **--- Message for [Name] ---** section
- This must be a clean, copy-paste-ready message Ahmad can send directly to that person
- Keep it human, short, non-technical. Written as Ahmad talking to them, not as a dev.
- **NO exclamation marks** — they sound weird. Keep tone chill and natural.
- Never skip when the task originated from a stakeholder request.

## CORE RULE: Triple-Verify Before Stakeholder Messages (MANDATORY)
- NEVER tell Natalia/team "it's fixed" until the fix is **verified 3 ways**:
  1. **Build passes** — `npx next build` clean, no errors
  2. **Logic tested** — run the actual code path locally (script, curl, unit test)
  3. **Production confirmed** — hit the real production URL and verify the endpoint/feature works
- If ANY of the 3 checks fail, DO NOT draft the stakeholder message. Fix first.
- If production can't be tested (still building), tell Ahmad "build is deploying, test these URLs when it's up" — never assume it works.
- This rule exists because we shipped a "fix" with an uncommitted file. Never again.

## CORE RULE: The Bar — Build Products, Not Code
- The standard is "would Matt walk into a meeting with this and close a deal" — not "does it compile"
- Every feature needs BUSINESS VALUE baked in (ROI, pricing, revenue projections)
- Architecture-first: data model → UI → rendering. Never code-first.
- Think like the end user (Natalia, Matt, Jeremy), not like a developer
- Go full-send on the first pass. Don't build incremental MVP garbage and iterate — design the whole product, then build it
- Data-driven > hardcoded. Separate data (venueZones.ts pattern) from rendering
- If building a demo/sales tool: package tiers, live pricing, export/screenshot, before/after — these are table stakes, not nice-to-haves
- Don't fight technical fires for 3 rounds when you could step back, rethink, and build it right in one pass

## CORE RULE: Scope Gate — Flag Big New Features (MANDATORY)
- When a stakeholder drops a request, quickly assess size:
  - **Small/easy** (label change, sort order, add a column, formatting tweak) → just do it, "I got you" attitude
  - **Medium** (new section, new export option, new toggle) → do it but mention to Ahmad it's extra
  - **Big** (new system, new workflow, multi-day build like CMS/Scoring/Warranty sections, live Excel formulas, discrepancy detection engine) → FLAG before Ahmad responds
- Only flag things that are genuinely heavy lifts — don't nickel-and-dime on small stuff
- Ahmad wants to be generous and easy to work with. The scope gate is for when 8 big features stack up in one Slack thread, not for every little tweak
- **ALWAYS update [scope-tracker.md] immediately** when anything gets built or requested from stakeholders — never let it go stale. This is Ahmad's change order ammo.

## CORE RULE: No Fake Shit
- NEVER add fake/simulated functionality (fake thinking animations, placeholder responses)
- NEVER use fallback messages that hide real errors — show the actual error
- NEVER use placeholders that pretend to be real features
- NEVER sweep problems under the rug with quick fixes
- NEVER do lazy hacks — if it needs to be built, build it properly
- If a feature isn't ready, don't fake it. Build it or don't show it.
- Everything the user sees must be REAL — real AI responses, real data, real functionality

## User
- **Ahmad Basheer** — MD at Assisted.VIP (Saudi Arabia), bilingual AR/EN
- Direct, fast-paced. Don't over-explain.
- **Message style for stakeholders:** No filler, no "once the build deploys" type caveats. Remove "going forward" — redundant. Don't repeat the same point twice. Short punchy sentences. State the fix, tell them what to do, done. Ahmad trims anything that sounds like a developer wrote it.
- NEVER local dev. Code → commit → push → EasyPanel auto-builds. Just push.
- **Git worktree = clean repo check.** Ahmad uses `git worktree list` / `git status` to confirm everything is pushed. No dangling worktrees, no uncommitted files. Always clean up before saying "done."
- GitHub: khaledbashir/rag2 | VPS: 138.201.126.110

## What ANC Does
- LED display integration for stadiums (NFL, NBA, MLS, NCAA)
- Partners: LG, Yaham | $4K platform + $500-800/mo maintenance
- Primary user: **Natalia** (Proposal Lead, 70-75% usage)

## Stack
- Next.js 15.3, React 18, TypeScript, Prisma + PostgreSQL
- shadcn/ui, Tailwind, AG Grid, Framer Motion
- AnythingLLM RAG, Browserless PDF, Kimi K2.5 via Puter.js
- Production App: https://proposals.anc.com
- AnythingLLM: https://basheer-anything-llm.prd42b.easypanel.host
- Branch: phase2/product-database

## Two Modes
- **Mirror** (Natalia): Excel → exact reproduction. Parser: `pricingTableParser.ts`. NO MATH.
- **Intelligence** (Matt/Jeremy): Build from scratch. Parser: `excelImportService.ts`. Recalculates.
- 6 Golden Rules: No math, exact order, trust grand total → [mirror-mode-rules.md]

## Key Patterns
- Context API: ProposalContext (119KB), ChargesContext, SignatureContext
- React Hook Form + Zod | shadcn/ui components
- Auto-save: useDebouncedSave (2000ms)
- Work Sans font, French Blue (#0A52EF)
- Margin formula: `sellingPrice = cost / (1 - marginPercent)`

## Payment & Delivery Status
- **Phase 1: 50% UNPAID** — delivery complete, still owed 50%
- **Phase 2: 50% paid** — all 39 prompts complete
- **$500/month** managed maintenance/hosting — ongoing, needs to be collected
- RFP Analyzer hidden from navbar intentionally (Phase 2 feature, not yet billable)
- Don't proactively surface Phase 2 features to stakeholders until Ahmad says so
- Natalia advised: share hourly rate starting month 3, formalize the relationship

## Phase 2: ALL 39 PROMPTS COMPLETE
- A (Mirror Polish P40-48): 9/9
- B (Product Catalog P49-55): 7/7
- C (Intelligence P56-62): 7/7
- D (AI Copilot P63-70): 8/8
- E (RFP Extraction P71-78): 8/8

## Key Services
| Service | Purpose |
|---------|---------|
| pricingTableParser.ts | Mirror Mode parser (exact fidelity) |
| excelImportService.ts | Intelligence Mode import |
| generateProposalPdfService.ts | PDF via Browserless |
| intelligenceMathEngine.ts | Margin/pricing calculations |
| kimiService.ts | AI chat (Kimi K2.5 + AnythingLLM fallback) |
| intentParser.ts + actionExecutor.ts | Copilot NLP → form actions |
| rfpExtractor.ts | RFP PDF text extraction |
| productMatcher.ts | Product catalog matching engine |
| currencyService.ts | USD/CAD/EUR/GBP formatting |

## File Locations
- API routes: app/api/ (36+ endpoints)
- Components: app/components/ (modals/, layout/, proposal/, reusables/, templates/)
- Contexts: contexts/
- Services: services/ (pricing/, chat/, rfp/, sow/, catalog/, dashboard/)
- Prisma schema: prisma/schema.prisma

## Infrastructure
- EasyPanel on VPS, Docker, port 3000→80
- Auth: NextAuth v5, JWT, explicit `secret: process.env.AUTH_SECRET` required
- Browserless: internal Docker URL first, WSS external fallback
- DB: PostgreSQL, `npx prisma db push --accept-data-loss` in entrypoint
- Sentry for errors | No staging/CI/CD/tests yet

## Known Gotchas
- Auth.js v5 Docker: explicit `secret` in auth.ts AND auth-middleware.ts
- Container restart → stale JS chunks → hard refresh fixes it
- No .env in Docker — all vars from EasyPanel config

## Unified Excel Build (CO Approved March 6, 2026)
- **Excel = internal only.** Client NEVER sees the workbook. Client sees PDF via Mirror Mode.
- **One master template** — Budget and RFP produce identical Excel. "Many budgets turn into RFPs."
- **Two pricing views:** Margin Analysis (per-screen) + Budget Summary (per-category). Grand totals must match.
- **MA = basis for Mirror Mode PDF** — strips cost/margin, PDF shows the rest.
- **Base bid gets grand total. Alts do NOT.** Alts are add-ons under their corresponding base screen.
- **Per-screen costs:** Labor, structural, electrical, PM — ALL per screen, not per project.
- **RFP mode:** MA order + names match bid form exactly. Bid form > RFP PDF if both exist.
- **No-RFP mode:** Base screens with subtotals, alts as +/- delta underneath, toggleable grand total.
- **Round-trip:** Engine → Excel → edit → re-upload Mirror Mode → instant PDF
- **Project Overview tab** (from Budget) goes into both templates
- **FINAL Tab Order:** Overview, MA, Budget Summary, LED, Tech Specs, Install (per screen), Processor, Bundle, Travel, CMS, Scoring, Resp Matrix, P&L, Cash Flow
- Full plan: [unified-excel-plan.md] | Checklist: [unified-excel-checklist.md]
- **Claimed pixel pitch = N/A always** (pushed March 6)
- **3.9mm Mesh env:** Sent to Eric, pending answer
- **Matt's SOW templates:** Received March 6 (Bilt HQ + Union Station). Jeremy's pending.
- **4 export engines to unify:** exportEstimatorExcel.ts (Budget), generateScopingWorkbook.ts (RFP, most complete at 2031 lines), exportFormulaicExcel.ts (Intelligence), exportMirrorUglySheetExcel.ts (Mirror)

## Linked Files (read on demand)
- [prompt-tracker.md] — All 39 prompts, status + commit hashes
- [architecture.md] — System diagram, services, auth, PDF flow
- [mirror-mode-rules.md] — Natalia's 6 golden rules
- [phase2-roadmap.md] — 5 phases, prompt ranges
- [engineering-excellence.md] — Infra checklist, 4 layers
- [deployment-workflow.md] — Deploy process, env vars, common issues
- [current-status.md] — Live features, hotfixes
- [pricing-logic-database.md] — Decision tree schema, LED example
- [stakeholders.md] — Natalia, Matt, Jeremy, Eric, Alison
- [anythingllm-api-reference.md] — Full API endpoints
- [anythingllm-skills.md] — Custom agent skill format
- [ux-learnings.md] — Ahmad messaging style, scope discussion patterns, common bugs
