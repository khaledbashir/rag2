# ANC Proposal Engine — Full Codebase Review (2026-06-10)

Four parallel review passes: code quality, UX/UI, architecture + oddities, strengths.
A dedicated hardening pass was deferred (some defensive findings surfaced organically and are included).

**Overall verdict:** a genuinely strong pricing core wearing a trenchcoat of accumulated sprawl. The money math (`lib/pricingMath.ts`) and the parser test suite are excellent — better than most production codebases. The risk lives in (a) untyped data blobs flowing through 2,500–4,800-line files, (b) silent fallbacks that fabricate plausible-but-wrong numbers, and (c) a repo that's really ~8 products sharing one namespace.

---

## Prioritized fix list (synthesis)

### Fix now — money or data-loss risk
1. **`* 0.7` fabricated LED cost + 30% margin fallback in live pricing** — `services/pricing/convert-standard-excel.ts:267-301`. Hardcoded cost guesses producing wrong dollars in stakeholder workbooks. Pull from rate card.
2. **Proposal studio save indicator is frozen** — `lib/useAutoSave.ts:53-56,203-204` stores status in a ref (never re-renders); `ProposalPage.tsx:116-119` never passes `onStatusChange`. A failed save is invisible = silent data loss for Natalia. The estimator's hook does it right — copy that.
3. **`test:pricing:gate` + CI workflow point at deleted scripts** — the repo's best safety-net idea is currently broken (scripts removed in `0636bf30`, `package.json:17-23` still references them). Re-point at the vitest suites.
4. **Empty `catch {}` swallowing DB writes/parses (≥25)** — worst: `app/api/proposals/ai-import/route.ts:181`, `app/api/rfp/analyses/[id]/route.ts:88` (self-heal silently lost). Log + surface.
5. **Deleting a pricing section has no confirmation** — `PricingTableEditor.tsx:651-659`; autosave persists it in 2s, no undo. Route through existing `useConfirm`.

### Fix soon — high-value cleanup
6. **Type `formData.details`** — 626 `as any` casts, 192 occurrences of `(formData.details as any)?.x`. One `ProposalDetails` interface kills ~80% of them. Worst files: ProposalTemplate5 (65 casts), Step4Export (45), share route (41).
7. **Failed projects fetch renders as "No projects found"** — `app/projects/page.tsx:125-127`. Add error state + retry.
8. **Hover-only actions dead on touch/keyboard** — `ProjectCard.tsx:227,293`, `PipelineKanban.tsx:367` (only way to open a project from kanban is hover). Sales people use iPads.
9. **Delete `old.ts`** (3,169-line dead copy of generateScopingWorkbook at repo root, git-tracked) + root scratch scripts (`fix.js`, `compare*.js`, `test-pitch-hack.js`, `revert.patch`, grep-dump txt files).
10. **Finish the LOI→"Short Form" rename** — `Step4Export.tsx:2059` still says "LOI PDF"; `CopilotPanel.tsx:153` says "LOI Header". Also map `CHANGE_ORDER` enum → "Change Order" label (renders raw in kanban/cards, missing from the type filter entirely).

### Backlog — structural
- **190 API routes / ~8 products in one namespace**; six extraction routes, three verify routes, two preview-univer routes, five seed routes shipped as HTTP endpoints.
- **`ProposalContext.tsx` is 4,772 lines** and still writes `savedProposals` to localStorage (parallel store next to Prisma; rule violation).
- **No pluggable AI provider abstraction** — six vendors hardcoded as parallel fetch blocks in `glmExtractor.ts:27-51` + four more extractor files (violates the project's own rule).
- **`Proposal` model = ~20 Json blob columns** incl. unbounded `chatHistory` rewritten on every message.
- **Server routes import from client component dirs** — `api/estimator/export-unified/route.ts:14` imports from `app/components/estimator/questions`.
- **274 console.logs in prod code** (79 in glmExtractor alone) — leveled logger + DEBUG gate.
- **Dead feature flags** — INTELLIGENCE_MODE, DASHBOARD_CHAT, STRATEGIC_MATCH_BADGE, CLIENT_REQUESTS, VERIFICATION_STUDIO all false with no flip condition.
- **2.4 GB `natexcel/` of raw client RFP material in the working tree** + 90 tracked binaries incl. two MP3 music tracks in `components/ui/`.
- **Westfield self-healing oracle** — `healSavedAnalysis.ts:16-35` hardcodes one client's venue shape, fires on every analysis GET. Generalize or retire.
- **Two math modules** — `lib/math.ts` ("ANC Ferrari Platform") vs `lib/pricingMath.ts`. Consolidate.
- **a11y debt** — 8 aria-labels in the whole app; clickable divs without keyboard path; drag-only kanban; three competing error systems (alert() / dialog / unused toast); two brand blues, neither the token (`#0A52EF` hardcoded in 77 files, Copilot uses `#0055B3`).
- **Copilot panel**: 380px min-width overflows small phones, hardcoded light theme over a dark-mode app, "Minimize" and "Close" are the same button.
- **"DEMO FOR PHASE 2" badge + dead pitch buttons** visible to sales staff in the pipeline header.

---

## What's genuinely good (protect these)

- **`lib/pricingMath.ts`** — pure functions, documented invariant (total ≡ Σ displayed parts), round-then-sum discipline, every deviation has a dated WHY comment with stakeholder names ("Natalia's rule"). Best file in the repo.
- **The reconciliation safeguard** (`pricingMath.ts:204-313`) — incident → detector → named test fixture (`eaglesLikeTable`, exact $46,053 gap) → plain-English UI banner. Detector-not-mutator. The pattern to copy for every future incident.
- **Pricing parser test suite** — 754 lines, 79/79 passing, real nasty cases (GBP via cell formatting, `($500)` negatives, `#REF!` ghosts, fuzzy sheet names). Plus real-customer-file fixtures (Indiana Fever, NBCU) locking in totals.
- **`lib/useAutoSave.ts` internals** — debounced hash-diffed saves, `isValidProjectId` guarding against route literals becoming PATCH targets, post-hydration seed. (Just fix the status surfacing.)
- **`lib/security/sanitizeForClient.ts`** — denylist-at-the-boundary for share links (~30 fields like cost/margin/internalNotes that must never reach clients).
- **Feature flags as business documents** — billing-gate flags carry who asked, when, commit refs, kill-switch locations.
- **Prisma discipline** — FKs and hot columns indexed, consistent `onDelete: Cascade`.
- **RFP pipeline mapper layer** — three products funnel through clean unidirectional mappers into one tested generator. Right shape, oversized funnel.
- **Parser evidence trail** — validation report + workbook hash + parser version persisted with each project; full provenance for "why does the PDF say X".

---

## Shared-module danger map (confirms CLAUDE.md's claim)

| Module | Blast radius |
|---|---|
| `services/rfp/pipeline/generateScopingWorkbook.ts` (3,888 lines) | RFP export, Estimator export, CRM export, both live previews — one cell change hits four products |
| `lib/pricingMath.ts` | UI editor, PDF, Excel, audit — client-visible dollars on 4 surfaces |
| `WorkbookShell.tsx` | Frozen RFP tool + active Estimator + spec generator share one render shell |
| `buildEstimatorWorkbook.ts` | The frozen RFP Analyzer imports the *Estimator's* builder — freeze boundary is porous in this direction |
| `scaleWorkbookByFx.ts` | Multiplies every priced cell post-generation; silent coupling between currency flag and every export |

This map is exactly why REGRESSION-PLAN.md (docs/REGRESSION-PLAN.md, parked) exists.

---

## Full agent reports

The four detailed reports (every finding with file:line, snippet, fix) are preserved in the session transcript. Key counts: 1,021 `: any`, 626 `as any`, 274 console.logs, ≥25 empty catches, 9 test files / 657 source files, 0 `@ts-ignore` (clean), 13 TODO markers (mostly false positives).
