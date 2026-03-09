---
name: anc-bible
description: Complete ANC Proposal Engine project bible. Use at the START of every conversation about this project. Contains architecture, patterns, file locations, stakeholder rules, deployment workflow, known bugs, and lessons learned. This is the single source of truth.
---

# ANC Proposal Engine — Project Bible

> Last Updated: February 11, 2026 | 272 commits since last major update (Feb 5)
> All 39 Phase 2 prompts COMPLETE. RFP Pipeline (Phase 3) in progress.

## What This App Does
Converts Excel cost analysis spreadsheets into branded PDF proposals for **ANC Sports Enterprises** (LED display integration for NFL, NBA, MLS, NCAA stadiums). Partners: LG, Yaham. Business model: $4K platform + $500-800/mo maintenance.

## The Team
- **Ahmad Basheer** — MD at Assisted.VIP (Saudi Arabia). Developer/owner. Bilingual AR/EN. Direct, fast-paced. Don't over-explain. NEVER local dev — code → push → EasyPanel auto-builds.
- **Natalia Kovaleva** — Director of Proposals, 70-75% usage. Mirror Mode. Her rules are LAW.
- **Matt/Jeremy** — Estimators. Intelligence Mode (build quotes from scratch).
- **Eric** — Product Expert. Catalog data source.
- **Alison** — QA/testing.

## Stack
- Next.js 15.3 App Router, React 18, TypeScript
- shadcn/ui + Radix UI + Tailwind CSS, AG Grid, Framer Motion
- Prisma + PostgreSQL, Auth.js v5 (JWT, `secret` + `trustHost` required)
- Browserless (headless Chrome for PDF), AnythingLLM (RAG), Sentry
- Kimi K2.5 via Puter.js (client-side vision), html2canvas (screenshots)
- @dnd-kit (drag-and-drop), pdfjs-dist + pdf-lib (PDF manipulation)
- Font: Work Sans. Brand color: French Blue `#0A52EF`
- GitHub: `khaledbashir/rag2` | VPS: `138.201.126.110`

## Two Operating Modes

### Mirror Mode (Natalia — 70-75% usage)
- Upload Excel → exact PDF reproduction. **NO MATH. EVER.**
- Parser: `services/pricing/pricingTableParser.ts`
- If Excel says 2+2=5, the PDF shows 5
- 6 Golden Rules: No math, exact section order, exact row order, show alternates, show tax/bond even if $0, trust Excel's grand total
- Supports: inline typo editing, section header renames, price overrides, description overrides
- Conditional UI hides all Intelligence Mode controls

### Intelligence Mode (Matt/Jeremy — 25-30%)
- Build quotes from scratch OR import from RFP, recalculates everything
- Parser: `services/proposal/server/excelImportService.ts`
- Math engine: `services/pricing/intelligenceMathEngine.ts`
- Margin formula: `sellingPrice = cost / (1 - marginPercent)`
- Features: ROM estimator, product catalog matching, schedule generator, SOW templates

## Stakeholder Rules & Client Requirements

> This section is business context the AI coder does NOT have from code alone.
> These rules come directly from stakeholder conversations and must be preserved.

### Natalia Kovaleva — HER RULES ARE LAW
**Primary Quote:** *"The task is to mirror whatever is here exactly... No calculation, no thinking."*

**Workflow:** Upload Excel (Margin Analysis sheet) → Select doc type → Add custom intro if needed → Preview PDF → Download

**Critical Requirements (her exact words):**
- *"We don't look at [Cost/Margin columns]... whatever is here is what your engine will show"*
- *"Fix some typos if estimator makes any typo"*
- *"We will feed the program already calculated file and will just need the nice PDF"*

**The Six Mirror Rules (Non-Negotiable):**
1. **NO MATH** — Use Excel totals exactly, never recalculate
2. **Exact section order** — First section in Excel = first in PDF
3. **Exact row order** — Preserve line item sequence within sections
4. **Show alternates** — Don't filter rows containing "alternate"
5. **Show tax/bond even if zero** — Display all financial rows
6. **Trust Excel's grand total** — Use "SUB TOTAL (BID FORM)" value

**Mirror Mode Column Visibility:**
| Show | Hide |
|------|------|
| Description | Cost |
| Selling Price (as "PRICING" or "AMOUNT") | Margin $ |
| | Margin % |

### Matt (Senior Estimator)
Needs: Build quotes from scratch for non-RFP work with AI-generated SOW

### Jeremy (Estimator)
Needs: Parse 2,500+ page RFPs, extract Division 11 specs, auto-populate pricing table

### Eric (Product Expert)
Needs: Module-based math (LG/Yaham LED modules, not fixed sizes)

### LOI Legal Header Template
```
This Sales Quotation will set forth the terms by which [Purchaser Name] ("Purchaser")
located at [Purchaser Address] and ANC Sports Enterprises, LLC ("ANC") located at
2 Manhattanville Road, Suite 402, Purchase, NY 10577 (collectively, the "Parties")
agree that ANC will provide following LED Display and services (the "Display System")
described below for the [Project Name].
```

## Three Entry Points
1. **Upload Excel** → Mirror Mode (Natalia's primary flow)
2. **Start Manually** → Intelligence Mode (Matt/Jeremy build from scratch)
3. **I Have an RFP** → PDF Filter → create project → Intelligence Mode (IN PROGRESS)

## Wizard Steps
- **Mirror Mode**: 3 steps — Setup → Configure → Review (skips Math)
- **Intelligence Mode**: 4 steps — Setup → Configure → Math → Review
- **RFP Flow**: Skips to Step 2 (detected from `proposal.source === "rfp_filter"` DB field)

## Three Document Modes
| Mode | Header | Payment Terms | Signatures |
|------|--------|---------------|------------|
| Budget | "BUDGET ESTIMATE" | No | No |
| Proposal | "SALES QUOTATION" | No | No |
| LOI | Full legal paragraph with addresses | Yes (50/40/10) | Yes (dual) |

## PDF Template: ProposalTemplate5 (Hybrid)
- **THE template** — used for ALL modes (Budget, Proposal, LOI)
- ANC logo top-left, blue diagonal lines top-right
- Blue vertical bar accents on section headers
- Column headers: **WORK** | **PRICING** (not Description/Amount)
- Alternating white/light gray rows
- Page layouts: Portrait Letter (default), Landscape Letter, Portrait A4, Landscape A4, Legal
- File: `app/components/templates/proposal-pdf/ProposalTemplate5.tsx`

## AI Copilot (Dual-Brain Architecture)
- **Kimi K2.5** (client-side via Puter.js): Takes screenshot → sees what user sees → generates form actions
- **AnythingLLM** (server-side RAG): Project-scoped workspace, Division 11 extraction, business knowledge
- **Intent Parser** (`services/chat/intentParser.ts`): NLP → structured actions (compound commands, field aliases)
- **Action Executor** (`services/chat/actionExecutor.ts`): Executes parsed intents via form setValue
- **Quick Actions** (`services/chat/quickActions.ts`): Pre-built shortcuts
- **Voice Input**: Mic button in CopilotPanel
- Panel: `app/components/chat/CopilotPanel.tsx` — side panel, not overlay

## RFP Pipeline (IN PROGRESS — Phase 3)
```
PDF Filter → Kimi classifies drawings → user triages pages →
confirmation card → create project (source: "rfp_filter") →
async embed in AnythingLLM → AI extraction (Division 11 priority) →
user lands on Step 2 Intelligence
```
- **PDF Filter Tool**: `app/tools/pdf-filter/` — client-side, 170+ keywords, drawing classification
- **Async Pipeline**: `create-from-filter/route.ts` — tracks `embeddingStatus` (pending → embedding → extracting → complete | failed)
- **Polling**: `GET /api/rfp/status/[proposalId]` — client polls every 4s
- **Meta Extraction**: Currently regex (`meta-extraction.ts`), Phase 1b replaces with Kimi K2.5

### Phase Status
| Phase | Status | Description |
|-------|--------|-------------|
| 1a | DONE | Bridge (source DB field, component extraction, polling endpoint) |
| 1b | NEXT | AI meta extraction (Kimi K2.5 replaces regex) |
| 1c | Pending | Client polling hook + Step 2 progress UI |
| 2 | Pending | Copilot gap-fill |
| 3 | Pending | Kill old RFP systems |

## Product Catalog
- **Admin UI**: `app/admin/products/` — CRUD + import
- **API**: `/api/products/` — full REST
- **Matcher**: `services/catalog/productMatcher.ts` — match by environment + pitch + size
- **Product Types**: LED panels with manufacturer, pitch, brightness, weight, power density constants
- **Validated**: 488.3 W/m² (4mm), 298.0 W/m² (10mm), 390.6 W/m² (2.5mm)

## Pricing Logic Database
- **Admin UI**: `app/admin/pricing-logic/` — decision tree editor + viewer
- **API**: `/api/pricing-logic/` — nodes, categories, options, tree
- **Schema**: `PricingLogicNode`, `PricingLogicCategory`, `PricingLogicOption`

## Critical File Locations

### Parsers
- `services/pricing/pricingTableParser.ts` — Mirror Mode parser (THE critical file)
- `services/proposal/server/excelImportService.ts` — Intelligence Mode parser
- `services/pricing/intelligenceMathEngine.ts` — Margin/pricing calculations
- `services/pricing/respMatrixParser.ts` — Responsibility Matrix (LOI)
- `services/pricing/currencyService.ts` — USD/CAD/EUR/GBP formatting
- `lib/sheetDetection.ts` — Finds "Margin Analysis" sheet in workbook

### Contexts (State Management)
- `contexts/ProposalContext.tsx` — Master state (4409 lines! Has PDF gen, download, save)
- `contexts/ChargesContext.tsx` — Charges, taxes, bonds
- `contexts/SignatureContext.tsx` — Digital signatures
- `contexts/Providers.tsx` — Provider wrapper

### Wizard
- `app/components/proposal/form/wizard/ModeSelector.tsx` — Mirror vs Intelligence vs RFP
- `app/components/proposal/form/wizard/WizardProgress.tsx` — Step indicator
- `app/components/proposal/form/wizard/WizardNavigation.tsx` — Step navigation + skip logic
- `app/components/proposal/form/wizard/steps/Step1Ingestion.tsx` — Upload + setup
- `app/components/proposal/form/wizard/steps/Step2Intelligence.tsx` — Configure
- `app/components/proposal/form/wizard/steps/Step3Math.tsx` — Math (Intelligence only)
- `app/components/proposal/form/wizard/steps/Step4Export.tsx` — Review + download

### PDF Templates
- `app/components/templates/proposal-pdf/ProposalTemplate5.tsx` — Hybrid (ACTIVE)
- `app/components/templates/proposal-pdf/NataliaMirrorTemplate.tsx` — Mirror-specific rendering
- `app/components/templates/proposal-pdf/ProposalLayout.tsx` — Shared layout wrapper
- `app/components/templates/proposal-pdf/exhibits/ExhibitA_TechnicalSpecs.tsx` — Specs table
- `app/components/templates/proposal-pdf/exhibits/ExhibitA_SOW.tsx` — Statement of Work
- `app/components/templates/proposal-pdf/exhibits/ExhibitB_CostSchedule.tsx` — Cost Schedule

### Services
- `services/proposal/server/generateProposalPdfService.ts` — PDF gen via Browserless
- `services/proposal/server/activityLogService.ts` — Activity tracking
- `services/AnythingLLMService.ts` — RAG backend
- `services/chat/kimiVisionService.ts` — Kimi K2.5 vision (client-side)
- `services/chat/intentParser.ts` — Copilot NLP → structured intents
- `services/chat/actionExecutor.ts` — Copilot intent → form actions
- `services/chat/copilotRouter.ts` — Routes chat to correct backend
- `services/chat/screenContext.ts` — Copilot screen awareness
- `services/sow/sowGenerator.ts` + `sowTemplates.ts` — SOW generation
- `services/catalog/productMatcher.ts` — Product catalog matching
- `services/rfp/rfpExtractor.ts` — PDF text extraction (unpdf)
- `services/rfp/pdfProcessor.ts` — Text scoring + section classification
- `services/rfp/rfpAnalyzer.ts` — AnythingLLM extraction pipeline
- `services/rfp/scheduleGenerator.ts` — Gantt/NTP schedule generation
- `services/rfp/productCatalog.ts` — Product specs + density constants
- `services/rfp/proposalAutoFill.ts` — Exhibit G auto-fill
- `services/dashboard/dashboardIntelligence.ts` — Dashboard AI insights

### PDF Filter Tool
- `app/tools/pdf-filter/PdfFilterClient.tsx` — Main filter UI (1446 lines)
- `app/tools/pdf-filter/ExportView.tsx` — Confirmation card + download + manifest
- `app/tools/pdf-filter/lib/scoring.ts` — Page classification + scoring
- `app/tools/pdf-filter/lib/pdf-utils.ts` — Text extraction, thumbnail rendering, PDF building
- `app/tools/pdf-filter/lib/pdf-vision.ts` — Kimi K2.5 drawing analysis
- `app/tools/pdf-filter/lib/keyword-presets.ts` — 170+ keyword categories
- `app/tools/pdf-filter/lib/drawing-categories.ts` — Drawing classification taxonomy
- `app/tools/pdf-filter/lib/meta-extraction.ts` — Cover page extraction (regex, to be replaced)

### Layout
- `app/components/layout/StudioLayout.tsx` — 3-panel workspace (form + AI + PDF)
- `app/components/layout/StudioHeader.tsx` — Header with stepper + actions
- `app/components/layout/DashboardSidebar.tsx` — Main nav sidebar

### Dashboard
- `app/components/dashboard/DashboardBriefMe.tsx` — Dashboard AI brief panel
- `app/components/dashboard/PromptLibrary.tsx` — AI prompt library
- `app/components/dashboard/RfpFullAnalysis.tsx` — RFP analysis UI

### Admin Pages
- `app/admin/products/` — Product catalog CRUD
- `app/admin/pricing-logic/` — Pricing decision tree editor
- `app/admin/users/` — User management

### Share System
- `app/share/[hash]/` — 8 files: annotations, voice recorder, change requests

### Other Key Files
- `app/components/ProposalPage.tsx` — Main workspace wrapper
- `app/components/chat/CopilotPanel.tsx` — AI Copilot side panel
- `app/components/proposal/intelligence/BriefMePanel.tsx` — Brief Me slide-out
- `app/components/proposal/ActivityLog.tsx` — Activity tracking UI
- `app/components/proposal/AuditTable.tsx` — P&L audit table
- `app/components/reusables/KimiVision.tsx` — Kimi vision component
- `middleware.ts` — Edge auth middleware
- `lib/auth.ts` + `lib/auth-middleware.ts` — Auth config
- `prisma/schema.prisma` — Database schema
- `lib/variables.ts` — Constants (API URLs, defaults)
- `lib/schemas.ts` — Zod validation schemas

### API Routes (67 endpoints across 26 groups)

**Core:**
- `projects/` — CRUD, PDF export, share, clone, sign, activities, change-requests
- `proposals/` — create, import-excel, export, verify, reconcile, auto-fix, audit export
- `proposal/` — generate PDF, send email, export

**AI/Copilot:**
- `copilot/` — chat, stream, upload, scrape, prompt, propose, dashboard
- `agent/` — intelligence-brief, enrich, analytics
- `agent-skill/` — create-proposal (AnythingLLM skill bridge)
- `dashboard/chat` — Dashboard AI chat

**RFP:**
- `rfp/` — upload, process, extract, extract-specs, extract-schedule, extract-pricing, ingest, create-from-filter, status

**Catalog/Pricing:**
- `products/` — CRUD + import
- `pricing-logic/` — nodes, categories, options, tree

**Other:**
- `rag/sync` — RAG document sync
- `sow/generate` — SOW generation
- `spec/query` — Spec database query
- `vision/analyze` — Vision analysis
- `tools/pdf-vision` — PDF vision processing
- `health/` — Health check
- `workspaces/create` — AnythingLLM workspace provisioning
- `auth/[...nextauth]` — Authentication
- `share/[hash]/request` — Share change requests

## Deployment
- **VPS**: 138.201.126.110, EasyPanel, Docker
- **Production**: https://proposals.anc.com
- **AnythingLLM**: https://basheer-anything-llm.prd42b.easypanel.host
- **Deploy branch**: `phase2/product-database` (EasyPanel watches this)
- **Flow**: Code on VPS → git push → EasyPanel auto-builds Docker → port 3000→80
- **DB**: `npx prisma db push --accept-data-loss` in Docker entrypoint
- **No .env in Docker** — all vars from EasyPanel config
- **NEVER merge branches** without explicit command (3 confirmations required)

## Key Patterns
- Context API for state (ProposalContext is the big one — 4409 lines)
- React Hook Form + Zod for forms
- Toast via `useToast()` hook
- Auto-save with `useDebouncedSave` (2000ms debounce)
- shadcn/ui components in `/components/ui/`
- Single hydration authority: `ProposalPage.tsx` WizardWrapper (Prompt 56)
- Margin formula: `sellingPrice = cost / (1 - marginPercent)`

## Parser Architecture (pricingTableParser.ts)

### How It Works
1. `findMarginAnalysisSheet()` — fuzzy-finds the sheet
2. `findColumnHeaders()` — locates Cost, Selling Price, Margin columns
3. `findHeaderRowIndex()` — finds the column header row
4. `parseAllRows()` — parses every row after header with metadata flags
5. `findTableBoundaries()` — groups rows into table sections
6. `extractTable()` — builds PricingTable objects from boundaries
7. `findGlobalDocumentTotal()` — finds project grand total
8. `prependSyntheticRollupTable()` — adds summary table if none exists

### Excel Structure (Margin Analysis sheet)
```
ZONE 1 — Project Roll-Up:
  Row N:   TOTAL: | Cost | Selling Price | Margin $ | Margin %  ← header row
  Row N+1: Section 1 Name | cost | sell | margin | %
  ...
  Row N+K+3: SUB TOTAL (BID FORM) | | grand_total_sell      ← grand total

ZONE 2 — Detail Sections (repeats for each section):
  Row M:   Section Name | Cost | Selling Price | Margin $ | Margin %
  Row M+1: Line item 1  | cost | sell | margin | %
  ...
  Row M+J+2: SUB TOTAL (BID FORM) | | section_total
  Row M+J+3: Alternates - Add to Cost Above | Cost | Selling Price
```

### Known Parser Pitfalls
1. **Orphaned summary rows**: "TOTAL:" row doubles as column header. Fix: `findTableBoundaries` creates summary boundary.
2. **Grand total in wrong boundary**: After summary becomes first boundary, `findGlobalDocumentTotal` looks INSIDE it.
3. **Column misalignment**: `deriveBestShiftedColumnMap` fallback handles shifted columns.
4. **isGrandTotal detection**: Matches "grand total", "sub total (bid form)", "total" (exact), "project total".
5. **Ghost sections from summary labels** (Feb 2026): labels like "LG Rebate" can look like section headers. Fix: structural section viability gate (`isViableSectionStart`) requires at least one real numeric line item after header.
6. **Alternate deduct rendered as $0** (Feb 2026): rows like "9C Alternate - Deduct Cost Above" were misclassified. Fix: explicit `isAlternateDeduct` detection + alternate capture.
7. **CMS totals inflated by summary leakage** (Feb 2026): summary rows after section grand total were leaking into CMS. Fix: preserve grand-total boundary; do not overwrite `endRow` when next header appears.
8. **Mirror precision vs display formatting** (Feb 2026): parser must preserve raw Excel numbers; rounding is presentation-only in UI/PDF formatting.

### Bug Tracker (Recent)
| Date | Bug | Impact | Fix |
|------|-----|--------|-----|
| Feb 11, 2026 | CMS section included `Total Project Value` / summary rows | Inflated subtotals, tax, grand total | Boundary fix in `pricingTableParser.ts` + structural header viability gate |
| Feb 11, 2026 | `9C Alternate - Deduct Cost Above` showed `$0` | Alternate deduct lost in output | Added `isAlternateDeduct` detection and alternate extraction |
| Feb 11, 2026 | Ghost `LG Rebate` pricing section | Confusing extra table in LOI | Prevent non-viable headers from starting sections |
| Feb 11, 2026 | Long decimal values in editor display | Poor UX, trust issues | Keep raw parse precision; format input display to 2 decimals |

### Regression Commands (Required Before Shipping Parser Changes)
1. Synthetic suite (deterministic edge cases):  
   `pnpm run test:pricing-parser`
2. Real workbook suite (fixtures on disk):  
   `pnpm run test:pricing-parser:real`

## Bundle Download
- 4 separate sequential downloads (NOT a zip):
  1. `ANC_[Client]_Audit_[M-D-YYYY].xlsx`
  2. `ANC_[Client]_Budget_Estimate_[M-D-YYYY].pdf`
  3. `ANC_[Client]_Proposal_[M-D-YYYY].pdf`
  4. `ANC_[Client]_LOI_[M-D-YYYY].pdf`
- 800ms delay between downloads
- Logic in `ProposalContext.tsx` → `downloadBundlePdfs()`

## Auth Gotchas (Docker/EasyPanel)
- MUST set `secret: process.env.AUTH_SECRET` explicitly in both `auth.ts` and `auth-middleware.ts`
- MUST set `trustHost: true` in both files
- MUST set `AUTH_URL` env var to the production URL
- Edge middleware must allow `/_next` and static assets through

## Phase 2: ALL 39 PROMPTS COMPLETE
| Phase | Prompts | Status |
|-------|---------|--------|
| A: Mirror Polish | P40-48 | 9/9 DONE |
| B: Product Catalog | P49-55 | 7/7 DONE |
| C: Intelligence Mode | P56-62 | 7/7 DONE |
| D: AI Copilot Chat | P63-70 | 8/8 DONE |
| E: RFP Extraction | P71-78 | 8/8 DONE |

## Test Files (Gold Standard)
| File | Expected Tables | Expected Total | Tests |
|------|----------------|----------------|-------|
| Indiana LOI (`ANC_Indiana Fever...xlsx`) | 8+ (1 summary + 7 detail) | $2,237,067.64 | Full LOI flow |
| Indiana Audit (`Cost-Analysis---Indiana-Fever...xlsx`) | 1 | $507,262.53 | Fallback parser |
| Scotia CAD (`Copy of Cost Analysis - SBA PH4...xlsx`) | 7 | CAD currency, 13% tax | CAD + tax |

## Test Cases for Verification

**Test A: ScotiaBank Budget (CAD)**
File: `Copy_of_Cost_Analysis_-_SBA_PH4_-_2026-01-28.xlsx`
1. Set Budget mode, add custom intro: "Exchange rate: 1 CAD = 0.71 USD"
2. Verify: Header, intro, multiple sections, alternates per section, 13% tax, CAD currency, no signatures

**Test B: Indiana Fever LOI (Gold Standard)**
File: `ANC_Indiana_Fever_LED_Displays_LOI_1_26_2026.xlsx`
1. Set LOI mode, edit payment terms
2. Verify: Legal header with addresses, PROJECT TOTAL = $2,237,069, payment terms, signatures, detailed pricing, specs

**Test C: PDF Export Critical Path**
1. Upload Excel → Set mode → Click Download
2. Verify: Correct template, has data, all sections, alternates, totals match Excel

**Test D: Field Persistence**
1. Edit custom intro, payment terms, signature text → Save draft → Refresh
2. Verify: All fields still there

**Test E: Mode Switching**
1. Create in Budget → Switch to Proposal → Switch to LOI
2. Verify: Budget (ESTIMATE, no sigs), Proposal (QUOTATION, no sigs), LOI (legal header, sigs)

## Key Decision Log
| Date | Decision | Rationale |
|------|----------|-----------|
| Feb 5 | Share link PDF is LOW priority | Natalia never requested it |
| Feb 5 | MATH step hidden in Mirror Mode | Natalia: "No calculation, no thinking" |
| Feb 5 | P&L Audit hidden in Mirror Mode | Natalia: "We don't look at this" |
| Feb 5 | Screen name edits override pricing headers | User should be able to tweak, default = Excel |
| Feb 5 | One-off formats deferred to Phase 2 | Low frequency, non-standard |
| Feb 5 | LOI needs purchaser address in header | Natalia's spec requires full legal paragraph |

## Things That Will Bite You
1. `ProposalContext.tsx` is **4409 lines**. Read it carefully before changing it.
2. The PDF template renders whatever data it receives. If the PDF looks wrong, the **BUG IS IN THE PARSER**, not the template (usually).
3. Mirror Mode and Intelligence Mode use **DIFFERENT parsers**. Changes to one don't affect the other.
4. EasyPanel auto-deploys from `phase2/product-database`. Never force-push without thinking.
5. Browserless connects via internal Docker URL first, falls back to external WSS.
6. The "TOTAL:" header row in Excel is BOTH a section label AND the column header.
7. Container restart → stale JS chunks → hard refresh fixes it.
8. Kimi K2.5 vision is **client-side only** (Puter.js) — no server-side Kimi service.
9. `useSearchParams()` in client components requires Suspense boundary for Next.js 15 static generation.
10. AnythingLLM workspace slugs must be lowercase, no spaces.

## How I'll Use This

When you mention ANC Proposal Engine, Mirror Mode, PDF generation, Excel parsing, Intelligence Mode, RFP pipeline, or any related topic, I will:
- Remember Natalia's exact requirements (*"mirror exactly, no thinking"*)
- Know which features belong in Mirror Mode vs Intelligence Mode
- Reference the correct template files and database schema
- Know the full file map (67 API endpoints, all parsers, all services)
- Suggest appropriate test cases with gold standard files
- Avoid suggesting changes that conflict with the golden rules
- Know the deployment flow (code → push → EasyPanel auto-builds)
- Track Phase 3 RFP pipeline progress
- Understand the WHY behind architectural decisions, not just the code
