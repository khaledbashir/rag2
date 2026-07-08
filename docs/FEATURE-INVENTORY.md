# ANC Proposal Engine — Feature Inventory

## Date: 2026-04-17 (updated)
## Commit: 90c0177d
## Branch: phase2/product-database
## Production: https://proposals.anc.com

## Recently added (2026-05-13) — CMS / Control System Pricing Module (Option 3)

**Status:** Built, gated behind `FEATURES.CMS_PRICING` (default OFF). Flip to true to expose to users.

Stakeholder ask: Natalia/Jireh — pull control system pricing into the engine so it stops being a fudge percentage and lives in the same project file as the LED estimate.

**Data model** (`prisma/schema.prisma`, migration `20260513210000_add_cms_pricing_module`):
- `CmsCategory` enum (15 categories: SERVER_EQUIPMENT, SCALER, ROUTER, LICENSE, SUPPORT_TIER, etc.)
- `CmsCatalogItem` — SKU rows with unit cost, sell price, watt, BTU, soft-delete via isActive
- `CmsCatalogVersion` — price-change snapshots so historical proposals don't silently re-price
- `CmsProjectBom` — per-proposal cached subtotals + heat/power rollup, 1:1 with Proposal
- `CmsBomLineItem` — selected line items with snapshotted cost/price + pinned catalog version

**Seed** (`prisma/seed-cms-catalog.ts`): 80 SKUs across 15 categories ported verbatim from Natalia's CMS_BASE_BOM (1).xlsx.

**APIs**:
- `GET/POST /api/cms/catalog` — list + admin create
- `GET/PATCH/DELETE /api/cms/catalog/[id]` — fetch w/ version history, edit (auto-snapshots on price change), soft-archive
- `GET/PUT /api/cms/project/[id]/bom` — fetch BOM + live smart-default recommendation + empty-row warnings; PUT replaces line items
- `POST /api/cms/project/[id]/bom/apply-smart-defaults` — fills Integration/Training/Shipping defaults based on hardware loadout
- `GET /api/cms/project/[id]/bom/sanity-check` — cross-references current quote vs CMS/LiveSync deals in the CRM (n=193), flags >25% outside IQR band
- `GET /api/cms/project/[id]/bom/prior-projects` — finds prior priced CMS BOMs for the same client for prefill
- `GET /api/cms/project/[id]/bom/export.xlsx` — generates Excel matching Natalia's two-tab BOM layout

**Pages**:
- `/admin/cms-catalog` — SKU table grouped by category, inline edit, soft-archive, new-SKU form. RBAC: ADMIN + PRODUCT_EXPERT
- `/estimator/[projectId]/cms` — picker UI with Hardware / License sections, smart-defaults button, heat/power panel, sanity-check panel, prior-client prefill, margin column

**Estimator integration** (additive only, RFP-safe):
- `app/components/estimator/CmsSummaryBanner.tsx` — server component above the LED estimator that surfaces "Control System: $X" with click-through. Does NOT modify EstimatorStudio or any RFP-shared module.

**Services**:
- `lib/cms/heatRollup.ts` — watt + BTU sum with AC-capacity flag (24,000 BTU/hr standard rack threshold)
- `lib/cms/smartDefaults.ts` — Integration (ceil(servers/4) weeks), Training (1 wk floor), Shipping (weight/miles/packages from hardware count)
- `lib/cms/bomService.ts` — recompute & persist subtotals after every BOM mutation
- `services/cms/sanityCheck.ts` — Twenty CRM Pool reuse from `services/crmReports`, pulls LiveSync deals + computes p25/median/p75

---

## Recently added (2026-04-17)

**Currency/FX threading across all 6 export surfaces** (hidden behind `FEATURES.CURRENCY_EXCHANGE_RATE` feature flag — OFF by default):
- `lib/pricingMath.ts` — `resolveExchangeRate()`, `computeTableTotals(..., fx)`, `computeDocumentTotal(..., fx)` accept optional rate
- Wizard totals (`Step3Math.tsx`) — rate-scaled displayed amounts
- PDF (`ProposalTemplate5.tsx`, `PdfPricingTables.tsx`, `PdfProjectSummary.tsx`, JSReport transform) — rate-scaled with "converted at X rate" footnote
- Proposal listing API (`/api/projects`) — totalAmount multiplied by saved rate
- **LED Cost Sheet + Margin Analysis preview** (`/api/estimator/preview-univer`) — `services/pricing/scaleWorkbookByFx.ts` walks ExcelJS workbook, scales every currency-formatted cell
- **Estimator Excel download** (`/api/estimator/export-unified`) — same scaler, writes fresh buffer when fx ≠ 1
- **Proposal XLSX export** (`/api/proposals/export`) — scales details.subTotal/totalAmount and item.unitPrice/total
- UI panel: `CurrencyAndRatePanel` on Step4Export (only rendered when flag is on)
- `EstimatorAnswers.exchangeRate` optional field, hydrated from `documentConfig.exchangeRate` on `/estimator/[projectId]` page

---

## PURPOSE

This document is the **scope baseline** for the ANC Proposal Engine. Every feature, route, component, service, and integration that exists in production is listed here.

**Scope Classification:**
- **X exists and is broken** → Fix it, no charge
- **X exists and they want it different** → Gray area, track it
- **X doesn't exist in this inventory** → New feature, change order

---

## SECTION 1: API ROUTES

**Total: 144 route files | 120+ authenticated | ~24 open**

### Core CRUD

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/projects` | GET, POST | List/create proposals. GET returns stats (mirrorCount, intelligenceCount, pipeline). POST auto-provisions AnythingLLM workspace. | Session | Active |
| `/api/projects/[id]` | GET, PATCH, DELETE | Full project CRUD. PATCH: immutability enforcement (SIGNED/CLOSED blocked), financial lockdown on APPROVED. DELETE: soft-delete, creator/admin only. | Session | Active |
| `/api/projects/[id]/activities` | GET | Proposal activity log | Session | Active |
| `/api/projects/[id]/pdf` | GET | PDF generation for specific project | Session | Active |
| `/api/projects/[id]/embedding-status` | GET | AnythingLLM embedding/indexing status | Session | Active |
| `/api/projects/[id]/share` | POST | Generate share link. AI guardrail: blocks if unverified AI fields. | Session | Active |
| `/api/projects/[id]/change-requests` | GET, POST | Change order tracking from client review | Session | Active |
| `/api/proposals/create` | POST | Create proposal with screens + cost line items. Auto-calculates audit. Creates AnythingLLM workspace. | Session | Active |
| `/api/proposals/generate` | POST | Generate PDF via Browserless/Puppeteer (V2). 60s timeout. | Session | Active |
| `/api/proposals/generate-jsreport` | POST | Alternative PDF generation via jsreport | Session | Active |
| `/api/proposals/export` | POST | Export as JSON/CSV/XML/XLSX. Sanitization denylist removes cost/margin for client-safe exports. AI verification guardrail. `?format=JSON|CSV|XML|XLSX&internal=true` | Session | Active |
| `/api/proposals/export/audit` | POST | Internal audit Excel export (all modes) | Session | Active |
| `/api/proposals/send` | POST | Send proposal via email | Session | Active |
| `/api/proposals/verify` | POST | RFP verification/approval | Session | Active |
| `/api/proposals/[id]/verify` | POST | Per-proposal verification | Session | Active |
| `/api/proposals/[id]/verify-field` | POST | Blue-glow field verification (mark human-verified) | Session | Active |
| `/api/proposals/import-excel` | POST | Mirror Mode Excel upload. Two-parser strategy (Intelligence + Mirror). | Session | Active |
| `/api/proposals/ai-import` | POST | AI-driven Excel import with extraction | Session | Active |

### Estimator / Budget Builder

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/estimator/export-unified` | POST | Budget builder unified Excel export → same format as RFP. Maps EstimatorAnswers → ScopingWorkbook. | Session | Active |
| `/api/estimator/convert` | POST | Convert ESTIMATE project → INTELLIGENCE mode. Calculates all display costs, builds pricingDocument. | Session | Active |
| `/api/estimator/ai-chat` | POST | AI chat for budget estimator assistant | Session | Active |
| `/api/estimator/ai-quick` | POST | Quick AI estimation | Session | Active |
| `/api/estimator/ai-reason` | POST | Verbose AI reasoning for estimates | Session | Active |
| `/api/estimator/duplicate` | POST | Clone/duplicate estimator answers | Session | Active |
| `/api/estimator/rates` | GET | Fetch current rate card for estimator | Session | Active |

### RFP Pipeline (12 endpoints)

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/rfp/upload` | POST | Upload RFP PDF to AnythingLLM workspace | Session | Active |
| `/api/rfp/extract` | POST | Re-extract RFP specs (17/20 rule, Section 11 priority, citations, confidence) | Session | Active |
| `/api/rfp/extract-specs` | POST | Spec extraction variant | Session | Active |
| `/api/rfp/extract-pricing` | POST | Pricing table extraction | Session | Active |
| `/api/rfp/extract-schedule` | POST | Section 11 06 60 schedule extraction | Session | Active |
| `/api/rfp/process` | POST | Full RFP processing pipeline | Session | Active |
| `/api/rfp/create-from-filter` | POST | Proposal generation from RFP specs | Session | Active |
| `/api/rfp/auto-response` | POST | Auto-generate bid response | Session | Active |
| `/api/rfp/analyze` | POST | RFP analysis (OCR, vision, Excel) | Session | Active |
| `/api/rfp/analyze/upload` | POST | File upload for analysis | Session | Active |
| `/api/rfp/analyze/excel` | POST | Excel-specific RFP analysis | Session | Active |
| `/api/rfp/analyze/drawings` | POST | Site plan/drawing analysis | Session | Active |
| `/api/rfp/analyze/extract` | POST | Extraction during analysis | Session | Active |
| `/api/rfp/analyses` | GET | List all RFP analyses (history). Paginated, searchable. | Session | Active |
| `/api/rfp/analyses/[id]` | GET, PATCH, DELETE | CRUD for specific RFP analysis | Session | Active |
| `/api/rfp/analyses/[id]/pdf` | GET | Fetch PDF of specific RFP analysis | Session | Active |
| `/api/rfp/workspace/re-embed` | POST | Re-embed RFP docs in AnythingLLM (refresh vector index) | Session | Active |
| `/api/rfp/pipeline/create-proposal` | POST | Step: Create proposal from RFP pipeline | Session | Active |
| `/api/rfp/pipeline/fill-bid-form` | POST | Step: Auto-fill bid response form | Session | Active |
| `/api/rfp/pipeline/extraction-excel` | POST | Step: Generate extraction Excel | Session | Active |
| `/api/rfp/pipeline/scoping-workbook` | POST | Step: Generate scoping workbook (16 sheets) | Session | Active |
| `/api/rfp/pipeline/import-scoping-workbook` | POST | Step: Re-import edited scoping workbook | Session | Active |
| `/api/rfp/pipeline/pricing-preview` | POST | Step: Pricing preview | Session | Active |
| `/api/rfp/pipeline/rate-card-excel` | POST | Step: Generate rate card Excel | Session | Active |
| `/api/rfp/pipeline/vendor-quote-sheet` | POST | Step: Generate vendor quote sheets | Session | Active |
| `/api/rfp/pipeline/subcontractor-excel` | POST | Step: Generate subcontractor bid form | Session | Active |
| `/api/rfp/pipeline/import-quote` | POST | Step: Import quote data | Session | Active |
| `/api/rfp/pipeline/extract-bid-form-specs` | POST | Step: Extract specs from bid form | Session | Active |
| `/api/rfp/pipeline/products` | GET | Step: Product recommendations | Session | Active |

### Products & Catalog

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/products` | GET, POST | List products (filter by manufacturer, environment, pitch). POST: create product. | Session | Active |
| `/api/products/[id]` | GET, PATCH, DELETE | Product CRUD | Session | Active |
| `/api/products/import` | POST | Bulk product import | Session | Active |
| `/api/products/template` | GET | Product template/schema | Session | Active |
| `/api/products/reverse` | POST | Reverse spec lookup (given sqft/pitch → suggest products) | Session | Active |
| `/api/manufacturers/list` | GET | List all distinct manufacturers | Session | Active |

### Pricing Logic (Decision Tree)

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/pricing-logic/categories` | GET, POST | List/create pricing categories (margin, install, electrical) | Session | Active |
| `/api/pricing-logic/categories/[id]` | GET, PATCH, DELETE | CRUD specific category | Session | Active |
| `/api/pricing-logic/nodes` | GET, POST | Create decision tree nodes | Session | Active |
| `/api/pricing-logic/nodes/[id]` | GET, PATCH, DELETE | CRUD specific node | Session | Active |
| `/api/pricing-logic/options` | GET, POST | List/create decision node options with formulas | Session | Active |
| `/api/pricing-logic/options/[id]` | GET, PATCH, DELETE | CRUD specific option | Session | Active |
| `/api/pricing-logic/tree` | GET | Full pricing tree export | Session | Active |

### Rate Card (Admin)

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/rate-card` | GET, POST | Get/create rate card entries | Admin | Active |
| `/api/rate-card/import` | POST | Bulk rate card import | Admin | Active |
| `/api/rate-card/template` | GET | Rate card schema/template | Admin | Active |
| `/api/rate-card/audit` | GET | Rate card validation audit | Admin | Active |

### Admin

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/admin/users` | GET, POST | CRUD users. Roles: ADMIN, ESTIMATOR, PRODUCT_EXPERT, PROPOSAL_LEAD, FINANCE, VIEWER, OUTSIDER | Admin | Active |
| `/api/admin/users/[id]` | PATCH, DELETE | Update/delete user. Prevents self-delete, protects last admin. | Admin | Active |
| `/api/admin/user-stats` | GET | Per-user stats (proposal count, activity, status breakdown, last login) | Admin | Active |
| `/api/admin/seed` | GET, POST | One-click seed: Rate Card + Yaham products. `?target=all|rate-card|products` | Admin | Active |
| `/api/admin/ops/health` | GET | Health of AI services (Mistral OCR, Gemini, Llama Vision) | Platform Owner | Active |
| `/api/admin/ops/activity-feed` | GET | Recent activity across all proposals. Paginated with cursor. | Platform Owner | Active |
| `/api/admin/ops/pipeline` | GET | Win/loss/pipeline analytics (deals, value, winrate, per-user breakdown) | Platform Owner | Active |

### Chat & Copilot

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/chat/stream` | POST | Direct GLM-5 streaming via Z.AI API. SSE chunking. | None | Active |
| `/api/chat/system-prompt` | GET, POST | Read/save system prompt from local file | None | Active |
| `/api/copilot/chat` | POST | Project-scoped AI chat via AnythingLLM workspace | Session | Active |
| `/api/copilot/stream` | POST | Streaming copilot chat. 60s timeout. SSE. | Session | Active |
| `/api/copilot/prompt` | GET, POST | System prompt management | Session | Active |
| `/api/copilot/dashboard` | GET | Dashboard data for copilot stats | Session | Active |
| `/api/copilot/propose` | POST | Trigger proposal generation via copilot | Session | Active |
| `/api/command` | POST | Copilot command dispatcher. NLP → gap analysis, confidence scoring, RFP validation. 408 lines. | Session | Active |
| `/api/dashboard/chat` | POST | Dashboard aggregator chat | Session | Active |
| `/api/dashboard/chat/history` | GET | Chat conversation history | Session | Active |

### Document Generation

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/specsheet/generate` | POST | Generate tech spec sheet PDF | Session | Active |
| `/api/specsheet/preview` | POST | Preview spec sheet before generation | Session | Active |
| `/api/specsheet/recall` | GET | Fetch saved spec sheet | Session | Active |
| `/api/specsheet/remember` | POST | Save spec sheet preferences | Session | Active |
| `/api/spec-generator/parse` | POST | Parse spec data from various sources | Session | Active |
| `/api/spec-generator/download` | GET | Download generated spec | Session | Active |
| `/api/cutsheet/generate` | POST | Generate LED product cutsheet | Session | Active |
| `/api/rfq/generate` | POST | Generate RFQ document from proposal specs | Session | Active |
| `/api/sow/generate-installation` | POST | Scope of work for installation phase | Session | Active |
| `/api/sow/scan` | POST | OCR/scan SOW documents | Session | Active |

### Intelligence & Vision

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/vision/analyze` | POST | Image/drawing analysis via vision AI | Session | Active |
| `/api/vendor/parse` | POST | Parse vendor quotes/spec sheets | Session | Active |
| `/api/intelligence/competitor-radar` | GET | Competitive analysis data | Session | Active |
| `/api/agent/enrich` | POST | Data enrichment via agent | Session | Active |
| `/api/agent/intelligence-brief` | POST | AI-generated proposal brief | Session | Active |

### Performance / Proof of Performance

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/performance/reports` | GET, POST | Performance/sports reports for venue | Session | Active |
| `/api/performance/reports/[id]` | GET, PATCH, DELETE | Specific report CRUD | Session | Active |
| `/api/performance/reports/[id]/pdf` | GET | Report PDF generation | Session | Active |
| `/api/performance/reports/generate` | POST | Report generation trigger | Session | Active |
| `/api/performance/activate` | POST | Activate performance tracking | Session | Active |
| `/api/performance/eligible` | GET | Check eligibility for performance tracking | Session | Active |
| `/api/performance/venues` | GET | Venue list for performance | Session | Active |
| `/api/performance/sponsors` | GET | Sponsor/partner data | Session | Active |
| `/api/performance/seed` | POST | Seed demo performance data | Session | Active |

### Venue Visualizer

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/venue-visualizer/venues` | GET, POST | Venue list/create | Session | Active |
| `/api/venue-visualizer/venues/[id]` | GET, PATCH, DELETE | CRUD specific venue | Session | Active |
| `/api/venue-visualizer/photos` | GET, POST | Photo list/upload | Session | Active |
| `/api/venue-visualizer/photos/[id]` | GET, PATCH, DELETE | CRUD specific photo | Session | Active |
| `/api/venue-visualizer/hotspots` | GET, POST | Hotspot list/create (clickable regions) | Session | Active |
| `/api/venue-visualizer/hotspots/[id]` | GET, PATCH, DELETE | CRUD specific hotspot | Session | Active |
| `/api/venue-visualizer/seed` | POST | Seed demo venue + photos | Session | Active |

### Bot / Agent Skills

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/bot/stats` | GET | Bot API stats (proposals, screens, products, activity) | Bot Token | Active |
| `/api/bot/proposals` | GET, POST | Bot proposal list/create | Bot Token | Active |
| `/api/bot/proposal/[id]` | GET | Bot-specific proposal view | Bot Token | Active |
| `/api/bot/products` | GET | Bot product queries | Bot Token | Active |
| `/api/bot/excel-to-pdf` | POST | Bot-triggered Excel → PDF conversion | Bot Token | Active |
| `/api/agent-skill/create-proposal` | POST | AnythingLLM agent → create proposal. Auth: x-api-key header. | API Key | Active |
| `/api/agent-skill/generate-excel` | POST | Excel generation from agent skill | API Key | Active |
| `/api/agent-skill/download-excel` | GET | Download agent-generated Excel | API Key | Active |
| `/api/agent-skill/products` | GET | Product recommendations from agent | API Key | Active |
| `/api/agent-skill/demo-files` | GET | Demo/sample files for agent | API Key | Active |

### Other

| Route | Methods | Purpose | Auth | Status |
|-------|---------|---------|------|--------|
| `/api/health` | GET | System health check (DB, Kreuzberg, Mistral OCR, memory, version) | None | Active |
| `/api/auth/[...nextauth]` | GET, POST | NextAuth OAuth/credentials handler | None | Active |
| `/api/auth/debug` | GET, POST | Auth diagnostic. Platform owner only. | Platform Owner | Active |
| `/api/user/profile` | PATCH | Update current user profile (name, image). Max 5MB. | Session | Active |
| `/api/tracker` | GET, POST | Phase 2 tracking items with comments. Auto-seeds 27 items. | None | Active |
| `/api/tracker/[id]` | GET, PATCH | Specific tracker item CRUD | Session | Active |
| `/api/tracker/ai` | POST | AI-generated tracker insights | Session | Active |
| `/api/import/normalize` | POST | Normalize imported Excel data | Session | Active |
| `/api/import/profile` | GET, POST | Import profile (column mapping memory) | Session | Active |
| `/api/rag/sync` | POST | Sync RFP documents to RAG vector store | Session | Active |
| `/api/revision/compare` | POST | Compare proposal versions/revisions | Session | Active |
| `/api/demo/vote` | POST | Demo voting feature | None | Active |
| `/api/workspaces/create` | POST | Create workspace | Session | Active |
| `/api/share/[hash]/request` | POST | Share link request handling | None | Active |
| `/api/mcp` | POST | MCP protocol endpoint | None | Active |

---

## SECTION 2: UI PAGES & COMPONENTS

### Pages (30 distinct routes)

| Page Route | Type | Purpose | Mode |
|------------|------|---------|------|
| `/` | Redirect | → `/projects` | Shared |
| `/projects` | Dashboard | Project list with filters, KPIs, grid/list view | Shared |
| `/projects/new` | Form | New project creation wizard | Shared |
| `/projects/[id]` | Editor | Proposal editor (loads from DB) | Both |
| `/proposals/[id]` | Viewer | Proposal viewer with share/annotate | Both |
| `/estimator` | Dashboard | Estimates list, KPI strip, search | Intelligence |
| `/estimator/new` | Factory | Auto-creates ESTIMATE project, redirects | Intelligence |
| `/estimator/[projectId]` | Editor | EstimatorStudio (split-screen questionnaire + Excel preview) | Intelligence |
| `/pipeline` | Kanban | PipelineKanban (status-based columns) | Shared |
| `/chat` | Iframe | AnythingLLM full-page chat | Shared |
| `/tracker` | Task Board | Kanban/list view, AI panel, verification/dispute | Shared |
| `/settings/profile` | Settings | Name, image, role, email verification | Shared |
| `/demo` | Showcase | DemoFeatureGrid with filters | Shared |
| `/demo/roi-calculator` | Tool | ROI calculator (left/right layout) | Shared |
| `/demo/virtual-venue` | Tool | Virtual venue editor v1 | Shared |
| `/demo/virtual-venue-v2` | Tool | Virtual venue editor v2 | Shared |
| `/demo/virtual-venue-v3` | Tool | Virtual venue editor v3 (latest) | Shared |
| `/tools/rfp-analyzer` | Tool | RFP Analyzer with Univer spreadsheet (21 sheets) | Intelligence |
| `/tools/rfp-analyzer/history` | History | RFP analysis history list | Intelligence |
| `/tools/rfp-analyzer/history/[id]` | Detail | Individual RFP analysis view | Intelligence |
| `/tools/sow-generator` | Tool | SOW generator with Tiptap rich text editor | Shared |
| `/tools/spec-generator` | Tool | Spec sheet generator | Shared |
| `/admin/ops` | Admin | OpsClient (platform owner only) | Admin |
| `/admin/products` | Admin | ProductCatalogAdmin (ADMIN, PRODUCT_EXPERT) | Admin |
| `/admin/rate-card` | Admin | RateCardAdmin (ADMIN only) | Admin |
| `/admin/venues` | Admin | VenueVisualizerAdmin (photo upload, hotspot editing) | Admin |
| `/admin/pricing-logic` | Admin | Pricing logic decision tree editor | Admin |
| `/admin/performance` | Admin | Performance analytics dashboard | Admin |
| `/admin/performance/report/[id]` | Admin | Individual performance report | Admin |
| `/admin/users` | Admin | User management (RBAC) | Admin |
| `/share/[hash]` | Public | Read-only proposal snapshot (ProposalTemplate5) | Public |
| `/share/performance/[hash]` | Public | Performance share link | Public |

### Components (124+ files)

**Layout & Shell (8 files):**
AppShell, BaseNavbar, BaseFooter, Breadcrumbs, DashboardSidebar, ProjectListSidebar, StudioLayout, StudioHeader

**Proposal/Form (30+ files):**
ProposalPage (wizard orchestrator), Charges, Items, Screens, ScreensGridEditor, SingleScreen, SingleItem, PricingTableEditor (Mirror), BillFromSection, BillToSection, PaymentInformation, ProposalDetails, ProposalSummary, SchedulePreview, TemplateSelector, WizardStep, WizardProgress, WizardNavigation, Step1Ingestion, Step2Intelligence, Step3Math, Step4Export, ModeSelector, RfpIngestion, ColumnMapper, EmbeddingStatusBanner, SpecSheetButton, ImportJsonButton

**Proposal Sidebars (7 files):**
RfpSidebar, IntelligenceSidebar, GapFillSidebar, TextEditorPanel, SOWGeneratorPanel, BriefMePanel, InsightCard

**Proposal Actions (7 files):**
ProposalActions, ActionToolbar, FinalPdf, PdfViewer, ActivityLog, AuditTable, RiskBadge

**Estimator (24 files):**
EstimatorStudio, QuestionFlow, ExcelPreview, EstimatorCopilot, EstimatorVenuePanel, VendorDropZone, ProductCatalogBrowser, BundlePanel, ReverseEngineerPanel, LiabilityPanel, RfqPanel, RevisionRadarPanel, CutSheetPanel, AutoRfpPanel, ToolDescription, ExcelGridViewer, EstimatorBridge

**Modals (13 files):**
NewProjectModal, ProposalLoaderModal, ProposalExportModal, SavedProposalsList, SendPdfToEmailModal, SignatureModal (3-tab: draw/type/upload), DrawSignature, TypeSignature, UploadSignature, SignatureColorSelector, SignatureFontSelector, NewProposalAlert

**Form Fields (8 files):**
FormInput, FormTextarea, FormSelect, FormCustomInput, FormFile, DatePickerFormField, CurrencySelector, ChargeInput

**Reusable UI (15 files):**
BaseButton, SaveIndicator, Unauthorized, ModeToggle, ThemeSwitcher, ThemeToggle, BrandGraphics, LogoSelector, LogoSelectorServer, ExcelDropzone, WorkbookShell, AiWand, AgentSearchAnimation, Subheading

**Dashboard & Chat (8 files):**
DashboardChat, CopilotPanel, DashboardBriefMe, BriefMePanel, RfpProcessor, RfpFullAnalysis, PromptLibrary, PromptLibraryPanel

**PDF Templates (11 files):**
ProposalTemplate5 (master), DynamicProposalTemplate, ProposalLayout, PdfHeader, PdfPricingTables, PdfProjectSummary, PdfSpecsTable, PdfResponsibilityMatrix, PdfSignatureBlock, PdfTermsAndConditions, PageBreak, ExhibitA_TechnicalSpecs, ExhibitA_SOW

### Context Providers (6 files)

| Context | Size | State Managed |
|---------|------|---------------|
| ProposalContext | ~1,000+ lines | PDF state, Excel preview, RFP docs, AI fields, verification, form submission, export, diagnostics |
| ChargesContext | ~250 lines | Discount/tax/shipping toggles & amounts, subtotal, total, currency |
| SignatureContext | ~400 lines | Signature data (draw/type/upload), color, font, canvas ref |
| ThemeProvider | ~100 lines | Theme state (dark/light), CSS variables |
| TranslationContext | ~150 lines | Language, translation map |
| Providers | ~50 lines | Root provider composition |

---

## SECTION 3: EXCEL PARSING

### Parsers (Input)

| Parser | File | Mode | Sheets Read | Purpose |
|--------|------|------|-------------|---------|
| pricingTableParser | `services/pricing/pricingTableParser.ts` (288 lines) | Mirror | Margin Analysis (fuzzy match) | Exact pricing reproduction — NO MATH |
| excelImportService | `services/proposal/server/excelImportService.ts` (861 lines) | Intelligence | LED Sheet + Margin Analysis | LED specs, hardware costs, margin data |
| respMatrixParser | `services/pricing/respMatrixParser.ts` | Both | Resp Matrix (fuzzy match) | Statement of Work (ANC vs Purchaser) |
| scopingWorkbookImporter | `services/rfp/pipeline/scopingWorkbookImporter.ts` | Both | LED Cost Sheet + Margin Analysis | Round-trip: re-import edited scoping workbook |

### Exporters (Output)

| Exporter | File | Lines | Sheets Created | Purpose |
|----------|------|-------|----------------|---------|
| generateScopingWorkbook | `services/rfp/pipeline/generateScopingWorkbook.ts` | 2,031 | 16 sheets | **UNIFIED** — Budget Builder + RFP Builder both use this |
| exportMirrorUglySheetExcel | `services/proposal/server/exportMirrorUglySheetExcel.ts` | — | 5 sheets | Mirror Mode PDF prep |
| exportFormulaicExcel | `services/proposal/server/exportFormulaicExcel.ts` | — | 14 sheets | Audit Excel with live formulas |
| generateMarginExcel | `services/intelligence/generateMarginExcel.ts` | — | N+1 sheets | Intelligence Mode export |
| exportEstimatorExcel | `app/components/estimator/exportEstimatorExcel.ts` | 298 | Dynamic | Client-side Budget Builder export |
| generateRateCardExcel | `services/rfp/pipeline/generateRateCardExcel.ts` | — | 3 sheets | RFP rate card + pricing summary |
| generateSubcontractorExcel | `services/rfp/pipeline/generateSubcontractorExcel.ts` | — | 2 sheets | Quote request for LG/Yaham |
| generateVendorQuoteSheets | `services/rfp/pipeline/generateVendorQuoteSheets.ts` | — | 3 sheets | Vendor quotes (electrical, install, LED) |

### Mapper Bridges

| Mapper | File | From → To |
|--------|------|-----------|
| estimatorToScopingMapper | `services/rfp/pipeline/estimatorToScopingMapper.ts` | Budget Builder → ScopingWorkbookOptions |
| pricingDocumentToScopingMapper | `services/rfp/pipeline/pricingDocumentToScopingMapper.ts` | Mirror Mode → ScopingWorkbookOptions |
| screenAuditToScopingMapper | `services/rfp/pipeline/screenAuditToScopingMapper.ts` | Intelligence Mode → ScopingWorkbookOptions |
| EstimatorBridge | `app/components/estimator/EstimatorBridge.ts` | Questionnaire → ExcelPreviewData |

### Sheet Names (Generated)

**generateScopingWorkbook (16 sheets):**
Project Overview, Margin Analysis, Budget Summary, LED Cost Sheet, {Display} - Install (per display), P&L, Cash Flow, PO's, Processor Count, Resp Matrix, ANC Travel, CMS, Scoring, Bundle Equipment, Tech Specs (Installers), Alternates

**exportFormulaicExcel (14 sheets):**
Project Summary, Margin Analysis, LED Cost Sheet, Bundle Equipment, Install, Project Management, Electrical and Data, Professional Services, Control System CMS, Shipping, Alternates, Content Creation, AI SOW, Tech Specs (Installers)

### Unification Status

Budget Builder and RFP Builder are **UNIFIED** at the export layer — both call `generateScopingWorkbook()` via different mapper bridges. Same tabs, same layout, same formulas.

---

## SECTION 4: PDF GENERATION

### Templates

| Template | File | Status |
|----------|------|--------|
| ProposalTemplate5 (ANC Hybrid) | `app/components/templates/proposal-pdf/ProposalTemplate5.tsx` | **ACTIVE** — master template for all modes |
| Templates 1-4 | N/A | **DEPRECATED** — all remapped to Template 5 |

**Section Sub-Components:**
PdfHeader, PdfPricingTables, PdfSpecsTable, PdfProjectSummary, PdfResponsibilityMatrix, PdfSignatureBlock, PdfTermsAndConditions, ExhibitA_TechnicalSpecs, ExhibitA_SOW

### Generation Service

| Service | File | Engine | Status |
|---------|------|--------|--------|
| V2 (Primary) | `services/proposal/server/generateProposalPdfServiceV2.ts` | Browserless/Puppeteer → Chrome PDF | **ACTIVE** |
| V1 (Legacy) | `services/proposal/server/generateProposalPdfService.ts` | Same engine, older API | Deprecated |
| jsreport | `services/proposal/server/transformProposalToJsreport.ts` | jsreport rendering | Fallback |

**Browserless Connection Strategy:**
1. Internal Docker: `ws://basheer_browserless:3000`
2. Fallback: External WSS endpoint
3. Final fallback: Local Chromium / Puppeteer

### Document Modes

| Mode | Label | Signatures | Payment Terms | Legal Intro | Exhibits |
|------|-------|------------|---------------|-------------|----------|
| BUDGET | "Budget Estimate" | No | No | No | Specs |
| PROPOSAL | "Proposal" | Optional | Optional | No | Specs + Exhibit A |
| LOI | "Letter of Intent" | Required | Required | Yes | Exhibit A + B (Resp Matrix) |
| CONTRACT | "Contract" | Required | Required | Yes | Exhibit A + B + C (T&C) |

### Other PDF Endpoints

| Route | Purpose |
|-------|---------|
| `/api/specsheet/generate` | Tech spec sheet PDF |
| `/api/cutsheet/generate` | Product cut sheet PDF |
| `/api/rfp/analyses/[id]/pdf` | RFP analysis PDF |
| `/api/projects/[id]/pdf` | Project snapshot PDF |
| `/api/performance/reports/[id]/pdf` | Performance report PDF |
| `/api/bot/excel-to-pdf` | Agent Excel → PDF conversion |

---

## SECTION 5: UNIVER SPREADSHEET INTEGRATION

**Status: PRODUCTION-READY | 21 sheets | Full formula engine | Cell editing with persistence**

**Package:** `@univerjs/preset-sheets-core@0.16.1`

**Main Component:** `app/tools/rfp-analyzer/_components/UniverSpreadsheet.tsx` (2,189 lines)

### Sheets Rendered (21 total)

1. Project Overview
2. Margin Analysis
3. Budget Summary
4. LED Cost Sheet (editable: height, width, qty, cost, margin%)
5. Tech Specs (Installers) — cross-sheet formulas
6. Install (Base) — per-display structural/labor/electrical
7. Processor Count
8. Bundle Equipment (editable: unit cost, quantity)
9. Travel (ANC)
10. CMS
11. Scoring
12. Resp Matrix
13. P&L
14. Cash Flow
15-21. Internal/Utility tabs (POs, Bid Form, LED Display Request, Form, Config, Pricing, Extended Warranty)

### Editing

- Users CAN edit cells (LED Cost Sheet: height, width, qty, cost, margin%; Bundle: unit cost, qty)
- Edits auto-save to DB (2-second debounce via PATCH `/api/rfp/analyses/{id}`)
- All dependent sheets recalculate immediately (cross-sheet formulas)
- Protected sheets prevent structural changes (no insert/delete rows) but allow value editing

### Formula Support

Built-in to `@univerjs/preset-sheets-core`:
- `=SUM()`, `=ROUND()`, arithmetic, cross-sheet references (`='Sheet Name'!A1`)
- Guarded division (prevents #DIV/0)
- Guarded selling formula (prevents margin >= 100% errors)

---

## SECTION 6: FORMULA ENGINE

### Formula Types

| Formula | Implementation | Location |
|---------|---------------|----------|
| Margin (Divisor) | `sellPrice = cost / (1 - marginPct)` | estimator.ts, intelligenceMathEngine.ts, generateScopingWorkbook.ts |
| Bond | `bond = sellPrice × bondRate%` | All export engines |
| Tax | `tax = (sellPrice + bond) × taxRate%` | All export engines |
| Cabinet Topology | Grid layout solver given active area | productCatalog.ts |
| Power Calc | `activeAreaM2 × powerDensityWm2` | productCatalog.ts |
| Weight Calc | `activeAreaM2 × weightDensityLbm2` | productCatalog.ts |
| Spare Parts | `displayCost × 5%` | productCatalog.ts |
| Warranty Escalation | `×1.1 per year` (years 4-10) | productCatalog.ts |

### Per-Category Margins (Default)

| Category | Default Margin |
|----------|---------------|
| LED Hardware | 30% |
| Structural | 20% |
| Install/Services | 20% |
| Electrical | 20% |
| PM | 20% |
| Engineering | 20% |
| Equipment | 30% |
| CMS | 35% |
| Scoring | 10% |

### Cascade Chain

```
Rate Card (DB) → productCatalog.ts constants (fallback)
    ↓
estimator.ts / computeDisplays() → per-screen cost breakdown
    ↓
Margin Analysis (cost/sell/margin per category per screen)
    ↓
Budget Summary (category rollup) + P&L (profit model) + Cash Flow (payment schedule)
```

### Calculation Location

- **Server-side (primary):** All cost calculations, margin formulas, export generation
- **Client-side:** Univer live formulas (RFP Analyzer only), React useMemo for previews
- **Mirror Mode:** NO calculation — trust Excel's grand total exactly

---

## SECTION 7: DATABASE SCHEMA

**33 Prisma models | 7 enums | 28+ indexes**

### Core Models

| Model | Fields | Purpose |
|-------|--------|---------|
| Workspace | 6 | Multi-tenant workspace container |
| User | 14 | Auth + role-based access |
| Account | 9 | OAuth provider mapping (NextAuth) |
| Session | 5 | JWT session tracking |
| VerificationToken | 3 | Email verification |
| DashboardChatSession | 6 | Copilot chat history |
| **Proposal** | **93** | **Master document — status machine, financial data, Mirror/Intelligence modes** |
| ScreenConfig | 14 | Display configuration per proposal |
| CostLineItem | 6 | Per-screen cost breakdown (category, cost, margin, price) |
| RfpDocument | 5 | Linked RFP PDFs |
| ProposalSnapshot | 5 | Share link snapshots |
| ManualOverride | 8 | Tracked manual adjustments |
| ProposalVersion | 8 | Immutable version snapshots |
| BidVersion | 8 | Bid revision tracking |
| SignatureAuditTrail | 12 | Forensic signature records |
| Comment | 9 | Threaded comments (recursive) |
| ChangeRequest | 15 | Client review feedback with annotations |
| ActivityLog | 8 | Proposal change history |

### Product Catalog

| Model | Fields | Purpose |
|-------|--------|---------|
| Manufacturer | 6 | LED manufacturer (LG, Yaham, etc.) |
| ProductSeries | 6 | Product line grouping |
| ProductModule | 10 | Individual LED cabinet/module specs |
| Processor | 5 | Video processor specs |
| **ManufacturerProduct** | **26** | **Full product catalog — replaces hardcoded LED_MODULES** |

### Pricing Logic

| Model | Fields | Purpose |
|-------|--------|---------|
| Category | 5 | Pricing categories (LED, Electrical, Structural, CMS) |
| DecisionNode | 8 | Decision tree nodes (recursive) |
| DecisionOption | 8 | Leaf nodes with formulas |
| PricingFormula | 6 | Formula strings + units |
| FormulaVariable | 6 | Variable defaults + sources |
| **RateCardEntry** | **10** | **Admin-editable estimation constants (40+ keys)** |
| RateCardAudit | 7 | Rate card change tracking |
| ImportProfile | 9 | Excel column mapping memory ("Map Once, Remember Forever") |

### Performance / Proof of Performance

| Model | Fields | Purpose |
|-------|--------|---------|
| Venue | 9 | Stadium/arena with installed screens |
| VenuePhoto | 8 | Photo-based LED overlay |
| ScreenHotspot | 11 | Interactive rectangles on venue photos |
| InstalledScreen | 12 | Installed LED screens at venues |
| Sponsor | 6 | Sponsor/partner tracking |
| PlayLog | 9 | Content play tracking (per screen, per sponsor) |
| PerformanceReport | 13 | Sponsor proof-of-performance reports |

### Tracker & Reference

| Model | Fields | Purpose |
|-------|--------|---------|
| TrackerItem | 12 | Phase 2 completion tracker |
| TrackerComment | 6 | Tracker discussion |
| TrackerActivity | 6 | Tracker audit trail |
| RfpAnalysis | 23 | RFP analysis results (pipeline data) |
| SpecFieldMemory | 8 | Spec auto-fill memory ("Learn Once, Remember Forever") |
| FeatureVote | 4 | Demo feature voting |

### Key Enums

```
UserRole: ADMIN | ESTIMATOR | PRODUCT_EXPERT | PROPOSAL_LEAD | FINANCE | OUTSIDER | VIEWER
ProposalStatus: DRAFT → PENDING_VERIFICATION → AUDIT → APPROVED → SHARED → SIGNED → CLOSED → ARCHIVED → CANCELLED
CalculationMode: MIRROR | INTELLIGENCE | ESTIMATE
```

---

## SECTION 8: SERVICES & BUSINESS LOGIC

**107 service files across 18 subdirectories**

### Service Directory

| Directory | Files | Purpose |
|-----------|-------|---------|
| `services/pricing/` | 15 | Mirror parser, margin engine, currency, column detection, validation |
| `services/rfp/` | 28 | RFP extraction, analysis, product catalog, rate card |
| `services/rfp/pipeline/` | 12 | Scoping workbook, mappers, bid form, vendor quotes |
| `services/rfp/unified/` | 7 | Unified RFP analysis v2 (Mistral OCR, Gemini vision) |
| `services/proposal/server/` | 10 | PDF generation, Excel import/export, email |
| `services/chat/` | 9 | Copilot NLP (intent parser, action executor, context builder) |
| `services/sow/` | 6 | Statement of Work generation |
| `services/specsheet/` | 6 | Spec sheet builder, parser, renderer |
| `services/ingest/` | 3 | PDF triage, smart filtering, tonnage extraction |
| `services/catalog/` | 2 | Product matching, reverse engineering |
| `services/estimator/` | 2 | Zone mapping, bundle rules |
| `services/import/` | 2 | Column utilities, normalization |
| `services/intelligence/` | 1 | Margin Excel generation |
| `services/vision/` | 2 | Drawing analysis, GLM client |
| `services/dashboard/` | 1 | Dashboard intelligence |
| `services/cutsheet/` | 1 | Cut sheet generation |
| `services/rfq/` | 1 | RFQ document generation |
| `services/vendor/` | 1 | Vendor spec parsing |
| `services/anythingllm/` | 1 | User provisioning |
| `services/kreuzberg/` | 1 | OCR client (Tesseract/PaddleOCR) |
| `services/revision/` | 1 | Delta scanning between versions |

### Key Services

| Service | File | Purpose |
|---------|------|---------|
| pricingTableParser | `services/pricing/pricingTableParser.ts` | Mirror Mode parser (exact fidelity) |
| excelImportService | `services/proposal/server/excelImportService.ts` | Intelligence Mode import (861 lines) |
| generateScopingWorkbook | `services/rfp/pipeline/generateScopingWorkbook.ts` | Unified Excel export (2,031 lines) |
| generateProposalPdfServiceV2 | `services/proposal/server/generateProposalPdfServiceV2.ts` | PDF via Browserless |
| intelligenceMathEngine | `services/pricing/intelligenceMathEngine.ts` | Margin/pricing calculations |
| productCatalog | `services/rfp/productCatalog.ts` | 22 Yaham products + rate constants |
| productMatcher | `services/catalog/productMatcher.ts` | Product catalog matching engine |
| rateCardLoader | `services/rfp/rateCardLoader.ts` | DB-first rate card with hardcoded fallback |
| currencyService | `services/pricing/currencyService.ts` | USD/CAD/EUR/GBP formatting |
| scaleWorkbookByFx | `services/pricing/scaleWorkbookByFx.ts` | Multiplies every currency-formatted cell + cached formula result in an ExcelJS workbook by the user-entered exchange rate. Used by estimator preview and exports. Added 2026-04-17 behind `FEATURES.CURRENCY_EXCHANGE_RATE`. |
| intentParser | `services/chat/intentParser.ts` | Copilot NLP → structured intents |
| actionExecutor | `services/chat/actionExecutor.ts` | Execute copilot actions on form |
| rfpExtractor | `services/rfp/rfpExtractor.ts` | RFP PDF text extraction |
| analyzeRfp | `services/rfp/unified/analyzeRfp.ts` | Unified RFP analysis (Mistral + Gemini) |
| kreuzbergClient | `services/kreuzberg/kreuzbergClient.ts` | OCR wrapper |

### AI/LLM Integrations

| Service | API | Purpose |
|---------|-----|---------|
| AnythingLLM | REST | RAG workspace, doc upload, chat, embeddings |
| Mistral OCR | REST | Structured markdown extraction from PDFs |
| Google Gemini | REST | Vision analysis for drawings + specs |
| Llama Vision | REST | Vision fallback |
| Zhipu GLM-5 | REST (Z.AI) | Pricing auditor, tracker AI |
| GLM Vision | REST | Diagram analysis |

---

## SECTION 9: AUTH & RBAC

### Roles & Permissions

| Role | Create Proposal | Edit Proposal | Delete Proposal | View Cost/Margin | PDF Export | Audit Export | Admin |
|------|----------------|---------------|-----------------|-----------------|------------|-------------|-------|
| ADMIN | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| ESTIMATOR | Yes | Yes | No | Yes | Yes | Yes | No |
| PROPOSAL_LEAD | Yes | Yes | Yes | Yes | Yes | Yes | No |
| PRODUCT_EXPERT | No | Yes | No | Yes | Yes | Yes | No |
| FINANCE | No | No | No | Yes | No | Yes | No |
| VIEWER | No | No | No | Selling only | No | No | No |
| OUTSIDER | No | No | No | Specs only | No | No | No |

### Implementation

- **Auth Provider:** NextAuth v5 (Auth.js Beta 30) with Credentials + Prisma adapter
- **Session:** JWT-based, 30-day max age
- **RBAC Engine:** `lib/rbac.ts` (289 lines) with `hasPermission()`, `sanitizeForRole()`
- **Middleware:** `middleware.ts` (100 lines) — route-level protection
- **AI Guardrail:** Share links block if unverified AI fields exist

### Protected Route Rules

- `/admin/*` → ADMIN only
- `/api/admin/*` → ADMIN only
- `/api/rate-card/*` → ADMIN only
- `/api/products/*` → ADMIN + PRODUCT_EXPERT
- `/api/proposals/create` → ADMIN + ESTIMATOR + PROPOSAL_LEAD
- `/api/proposals/export/audit` → ADMIN + ESTIMATOR + FINANCE + PROPOSAL_LEAD

---

## SECTION 10: INFRASTRUCTURE

### Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Next.js | 15.3.3 |
| Runtime | React | 18.2.0 |
| Language | TypeScript | 5.2.2 |
| Database | PostgreSQL | (via Prisma 5.22.0) |
| ORM | Prisma | 5.22.0 |
| Auth | NextAuth | 5.0.0-beta.30 |
| UI | shadcn/ui + Radix | 14 Radix packages |
| CSS | Tailwind | 3.3.5 |
| Animation | Framer Motion | 12.29.0 |
| Grid | AG Grid | 35.0.1 |
| Spreadsheet | Univer | 0.16.1 |
| Excel I/O | ExcelJS + xlsx | 4.4.0 / 0.18.5 |
| PDF | Puppeteer + Chromium | 24.9.0 / 138.0.2 |
| Rich Text | Tiptap | 5 packages |
| Math | Decimal.js | 10.6.0 |
| Validation | Zod | 3.22.2 |
| Monitoring | Sentry | Integrated |

### Deployment

- **Platform:** EasyPanel on VPS (138.201.126.110)
- **Container:** Docker (Node 22 slim + Python3)
- **Port:** 3000 → 80
- **Domain:** proposals.anc.com
- **Branch:** phase2/product-database
- **Process:** Code → commit → push → EasyPanel auto-builds

### External Services

| Service | URL | Purpose |
|---------|-----|---------|
| PostgreSQL | `DATABASE_URL` env var | Primary database |
| AnythingLLM | `basheer-anything-llm.prd42b.easypanel.host` | RAG backend |
| Browserless | Internal Docker + WSS fallback | PDF rendering |
| jsreport | `basheer-jsreport` EasyPanel | Alt PDF engine |
| Sentry | Cloud | Error tracking |
| Nodemailer | SMTP | Email delivery |

### Environment Variables (Key)

```
AUTH_SECRET          — NextAuth JWT secret (REQUIRED)
DATABASE_URL         — PostgreSQL connection (REQUIRED)
ANYTHING_LLM_URL    — AnythingLLM endpoint
ANYTHING_LLM_KEY    — AnythingLLM API key
Z_AI_BASE_URL       — Zhipu AI endpoint
Z_AI_API_KEY        — Zhipu AI key
JSREPORT_URL         — jsReport server
NODEMAILER_EMAIL     — Email sender
NODEMAILER_PW        — Email password
SENTRY_ORG/PROJECT   — Error tracking
NEXT_PUBLIC_BASE_URL — Public app URL
```

---

## SECTION 11: KNOWN BUGS / INCOMPLETE FEATURES

### Security Issues

| Issue | Severity | File | Description |
|-------|----------|------|-------------|
| Hardcoded API Key | CRITICAL | `lib/pricingAuditor.ts:53` | Zhipu AI API key exposed in source code |
| Default jsReport Creds | CRITICAL | `lib/variables.ts:28` | Fallback `admin:admin` if env vars missing |
| TS Errors Ignored | HIGH | `next.config.js:7` | `ignoreBuildErrors: true` — type errors don't block deploy |
| PDF Triage Unauthed | HIGH | `docker-entrypoint.sh:41` | Python service on 0.0.0.0:8000 without auth |
| DB Push Data Loss | HIGH | `docker-entrypoint.sh:9` | `prisma db push --accept-data-loss` in production |
| AI Guardrail Gap | HIGH | Share route only | Unverified AI fields blocked on share links but NOT on PDF/audit exports |

### Pricing Discrepancy (Investigated 2026-03-10)

| Issue | Files | Description |
|-------|-------|-------------|
| Budget vs RFP install rate | `generateScopingWorkbook.ts:88` vs `estimator.ts:390-395` | Budget path uses $289/sqft composite rate; estimator uses weight-based ~$251/sqft |
| Single vs per-category margin | `generateScopingWorkbook.ts:357` vs `:920-921` | computeDisplays applies 30% to everything; MA tab uses 30% hw / 20% services |

### Potentially Orphaned Features

| Feature | Routes | Notes |
|---------|--------|-------|
| Performance/PoP | 9 endpoints + 7 DB models | Fully built but low usage — not actively marketed |
| Venue Visualizer | 7 endpoints + 3 DB models | Photo-based LED overlay system — demo-stage |
| Competitor Radar | 1 endpoint | Single endpoint, likely unfinished |
| Virtual Venue | 3 page versions (v1/v2/v3) | Iterative demos, v3 is latest |
| Demo Voting | 1 endpoint | Standalone feature, unclear use |

---

## DOCUMENT STATISTICS

| Category | Count |
|----------|-------|
| API Routes | 144 |
| UI Pages | 30 |
| UI Components | 124+ |
| Context Providers | 6 |
| Excel Parsers | 4 |
| Excel Exporters | 8 |
| PDF Templates | 1 (master) + 11 sections |
| Univer Sheets | 21 |
| Prisma Models | 33 |
| Service Files | 107 |

### Service Contract Terms System (2026-07-08)
- **Document mode:** `SERVICE_CONTRACT` (Prisma enum + migration `20260708120000`); legacy `SERVICE_AGREEMENT` resolves to it.
- **Template registry:** `lib/serviceContracts/` — `types.ts`, `registry.ts` (getTemplate/getDefaultTemplate/resolveExhibits), `renderMarkdown.tsx` (react-markdown + remark-gfm, verbatim-preserving), `presets.ts` (4 project-type presets), `templates/ravens.ts` (verbatim Ravens exhibit bodies).
- **PDF rendering:** `PdfServiceContract.tsx` (Ravens contract body + toggleable exhibits), `PdfTermExhibit.tsx` (exhibit header + Markdown body). Wired via `ProposalTemplate5.tsx` SERVICE_CONTRACT branch.
- **CONTRACT General Terms:** `PdfTermsAndConditions.tsx` renamed header to "General Terms" + per-instance `generalTermsBodyOverride` Markdown override (byte-identical default).
- **Edit UI:** `ServiceContractTermsPanel.tsx` (Step4Export) — preset selector, per-exhibit on/off + Markdown editor, signature editor. Document Lifecycle select: "Service Contract" option.
- **Schema:** `termExhibitOverrides`, `serviceContractTemplateId`, `serviceContractProjectType`, `serviceContractSignatureText`, `generalTermsBodyOverride` on ProposalDetailsSchema.
- **Tests:** `lib/serviceContracts/serviceContract.test.ts` (18) + 3 ProposalTemplate5 integration tests. Byte-identical default regression guard for CONTRACT T&C.
- **Deferred:** 7–8 contract analysis pass (taxonomy refinement) when contracts land in `docs/service-agreements/`. DOCX export (data model future-proofed). Builder-from-scratch (P1-tied), Mirror-mode for services (P2), service estimator (P3) — separate specs.
| AI Integrations | 6 |
| User Roles | 7 |
| Environment Variables | 20+ |

---

*Generated by Claude Code — 2026-03-10*
*Commit: 69c04cdad25857c7aed1d896511e7448e5ba493e*
