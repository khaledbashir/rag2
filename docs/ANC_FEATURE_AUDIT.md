# ANC Proposal Engine — Complete Feature Audit & Growth Map

**Generated:** February 18, 2026  
**Method:** Full codebase scan — 27 pages, 89 API routes, 76 services, 30+ Prisma models, 80+ components  
**Purpose:** Cross-reference ANC_STRATEGIC_ANALYSIS.md claims against actual code, then map growth opportunities

---

## PART 1: EVERY FEATURE THAT EXISTS IN CODE (verified)

### A. CORE PROPOSAL ENGINE (Phase 1 — the $4,000 contract)

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 1 | **Mirror Mode** — Upload Excel → branded PDF | **LIVE, PRODUCTION-USED** | `services/pricing/pricingTableParser.ts` (6-file parser subsystem), `services/proposal/server/generateProposalPdfServiceV2.ts`, `services/proposal/server/transformProposalToJsreport.ts` | Natalia used it for a real Westfield bid. Parser has boundary detection, column detection, column shift, row parser, table extraction, and validation modules. This is serious engineering. |
| 2 | **Three-Mode Document Toggle** (Budget / Proposal / LOI) | **LIVE** | `DocumentMode` enum in Prisma, `form/wizard/ModeSelector.tsx`, template system in `components/templates/proposal-pdf/` | Each mode has different rendering rules. LOI has legal header text, purchaser legal name fields. |
| 3 | **PDF Generation Pipeline** | **LIVE** | `services/proposal/server/generateProposalPdfService.ts` + `V2`, Browserless WSS connection | Real headless Chrome PDF rendering via Browserless. Not a toy — production PDF pipeline. |
| 4 | **Excel Import Service** | **LIVE** | `services/proposal/server/excelImportService.ts`, `app/api/proposals/import-excel/route.ts` | Parses LED Cost Sheet + Margin Analysis from ANC's real Excel workbooks. |
| 5 | **Pricing Table Parser** (the hard problem) | **LIVE** | `services/pricing/pricingTableParser.ts` + 6 sub-modules in `services/pricing/parser/` | This is the "Margin Analysis varies wildly" problem Natalia described. Full parser with boundary detection, column detection, row parsing, validation. Non-trivial. |
| 6 | **Responsibility Matrix Parser** | **LIVE** | `services/pricing/respMatrixParser.ts` | Two rendering types: short bullets + full table. Mentioned in the strategic doc as Change Order item #5. |

### B. ESTIMATOR STUDIO (Phase 2 territory — built ahead of contract)

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 7 | **LED Budget Estimator** — guided questionnaire | **LIVE** | `app/estimator/page.tsx`, `app/components/estimator/EstimatorStudio.tsx`, `EstimatorBridge.ts`, `QuestionFlow.tsx`, `questions.ts` | Full question-based flow: indoor/outdoor, pitch, dimensions → cost estimate. Uses rate card data. |
| 8 | **Excel Preview** — live spreadsheet-like view | **LIVE** | `app/components/estimator/ExcelPreview.tsx` | Real-time Excel-like preview of the estimate as user fills in data. Cell override support (`estimatorCellOverrides` in Prisma). |
| 9 | **Estimator Export to Excel** | **LIVE** | `app/components/estimator/exportEstimatorExcel.ts`, `app/api/estimator/convert/route.ts` | Exports real .xlsx from estimator data. Convert route converts estimator→proposal. |
| 10 | **AI Quick Estimate** | **LIVE** | `app/api/estimator/ai-quick/route.ts`, `services/chat/estimatorIntents.ts` | Natural language → estimate. "I need a 6mm outdoor 11x21ft 7500 nits" → filled estimate. |
| 11 | **Smart Assembly Bundler** | **LIVE** | `app/components/estimator/BundlePanel.tsx`, `services/estimator/bundleRules.ts` | Groups related components into logical bundles (LED + mounting + data). |
| 12 | **Budget Reverse Engineer** | **LIVE** | `app/components/estimator/ReverseEngineerPanel.tsx`, `services/catalog/reverseEngineer.ts`, `app/api/products/reverse/route.ts` | Given a budget number, reverse-engineer what product/size combo fits. |
| 13 | **Vendor RFQ Generator** | **LIVE** | `app/components/estimator/RfqPanel.tsx`, `services/rfq/rfqGenerator.ts`, `app/api/rfq/generate/route.ts` | Auto-generates vendor request-for-quote documents from estimator data. |
| 14 | **Liability/Contract Risk Scanner** | **LIVE** | `app/components/estimator/LiabilityPanel.tsx`, `services/sow/liabilityScanner.ts`, `app/api/sow/scan/route.ts` | 20-point liability checklist scanning SOW/contract text. |
| 15 | **Revision Radar** | **LIVE** | `app/components/estimator/RevisionRadarPanel.tsx`, `services/revision/deltaScanner.ts`, `app/api/revision/compare/route.ts` | Detects changes between bid versions — what moved, by how much. |
| 16 | **Cut-Sheet Generator** | **LIVE** | `app/components/estimator/CutSheetPanel.tsx`, `services/cutsheet/cutSheetGenerator.ts`, `app/api/cutsheet/generate/route.ts` | Generates product cut-sheets/spec sheets from catalog data. |
| 17 | **Estimator Copilot** | **LIVE** | `app/components/estimator/EstimatorCopilot.tsx` | In-context AI assistant within the estimator workspace. |
| 18 | **Display-to-Zone Mapper** | **LIVE** | `services/estimator/displayToZoneMapper.ts` | Maps displays to venue zones (scoreboard, ribbon, fascia, etc.). |
| 19 | **Estimator Duplicate** | **LIVE** | `app/api/estimator/duplicate/route.ts` | Clone an estimate to create variants (different vendor, different config). |
| 20 | **Vendor Spec Sheet Parser** | **LIVE** | `app/components/estimator/VendorDropZone.tsx`, `services/vendor/vendorParser.ts`, `app/api/vendor/parse/route.ts` | Upload vendor spec PDF → extract structured product data. |

### C. RFP INTELLIGENCE (the "way beyond scope" features)

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 21 | **PDF Smart Filter** (RFP page triage) | **LIVE** | `app/tools/pdf-filter/page.tsx`, `services/ingest/smart-filter.ts`, `services/ingest/smart-filter-streaming.ts` | Uploads 1000+ page RFP → AI identifies relevant pages (Division 11, specs, drawings). Streaming version for large docs. |
| 22 | **RFP Extraction Pipeline** | **LIVE** | `services/rfp/rfpExtractor.ts`, `services/rfp/rfpAnalyzer.ts`, `services/rfp/pdfProcessor.ts`, `services/rfp/server/RfpExtractionService.ts` | Full extraction: screens, specs, schedule, pricing sections from RFP documents. |
| 23 | **Auto-RFP Response** | **LIVE** | `app/components/estimator/AutoRfpPanel.tsx`, `services/rfp/autoRfpResponse.ts`, `app/api/rfp/auto-response/route.ts` | AI reads RFP → extracts screens → matches products → pre-fills estimator. 4-phase UI. |
| 24 | **RFP Spec Extraction** | **LIVE** | `services/rfp/specFormExtractor.ts`, `app/api/rfp/extract-specs/route.ts` | Extracts LED specs from RFP documents. |
| 25 | **RFP Schedule Extraction** | **LIVE** | `services/rfp/scheduleGenerator.ts`, `services/rfp/displayScheduleExtractor.ts`, `services/rfp/scheduleWarrantyExtractor.ts`, `app/api/rfp/extract-schedule/route.ts` | Extracts project timeline, warranty terms, schedule constraints. |
| 26 | **RFP Pricing Section Mapper** | **LIVE** | `services/rfp/pricingSectionMapper.ts`, `app/api/rfp/extract-pricing/route.ts` | Maps RFP sections to pricing categories. |
| 27 | **RFP Division Finder** | **LIVE** | `services/rfp/divisionFinder.ts` | Finds Division 11 (LED specs) in construction document sets — Jeremy's "40 pages from 2,500" problem. |
| 28 | **Drawing Extractor** | **LIVE** | `services/rfp/drawingExtractor.ts`, `services/vision/drawing-service.ts` | Extracts architectural/AV drawings from RFP documents. |
| 29 | **Alternates Extractor** | **LIVE** | `services/rfp/alternatesExtractor.ts` | Finds alternate/substitute product options in RFP text. |
| 30 | **RFP→Project Pipeline** | **LIVE** | `app/api/rfp/create-from-filter/route.ts`, `app/api/rfp/upload/route.ts`, `app/api/rfp/process/route.ts` | Full pipeline: upload RFP → filter → extract → create project. |

### D. SPEC SHEET SYSTEM

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 31 | **Spec Sheet Generator** (FORM tab parser) | **LIVE** | `services/specsheet/formSheetParser.ts`, `services/specsheet/specSheetRenderer.ts`, `app/api/specsheet/generate/route.ts`, `app/api/specsheet/preview/route.ts` | Parses FORM tab from Excel, groups by model, generates Performance Standards PDF. Change Order item requested by Natalia. |
| 32 | **Spec Sheet Auto-Fill Memory** | **LIVE** | `services/specsheet/specAutoFill.ts`, `app/api/specsheet/remember/route.ts`, `app/api/specsheet/recall/route.ts`, `SpecFieldMemory` Prisma model | "Learn Once, Remember Forever" — saves spec values by manufacturer+model+pitch, auto-fills next time. |

### E. AI/COPILOT SYSTEM

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 33 | **AI Copilot (Lux)** — dual-brain architecture | **LIVE** | `app/components/chat/CopilotPanel.tsx`, `services/chat/copilotRouter.ts`, `services/chat/formFillBridge.ts` | Kimi (vision brain via Puter.js) + AnythingLLM (knowledge brain). Routes by keyword. |
| 34 | **Vision AI** (screenshot analysis) | **LIVE** | `app/api/vision/analyze/route.ts`, `services/vision/glm-client.ts` | Screenshot capture → AI analysis for UI commands and field changes. |
| 35 | **AnythingLLM RAG Integration** | **LIVE** | `services/AnythingLLMService.ts`, `app/api/copilot/chat/route.ts`, `app/api/copilot/stream/route.ts` | Full RAG: workspace management, document upload, chat, streaming responses. |
| 36 | **Dashboard Intelligence Chat** | **LIVE** | `app/api/dashboard/chat/route.ts`, `app/api/copilot/dashboard/route.ts`, `services/dashboard/dashboardIntelligence.ts` | AI chat for the dashboard — portfolio-level intelligence. |
| 37 | **Intelligence Brief ("Brief Me")** | **LIVE** | `app/api/agent/intelligence-brief/route.ts`, `app/components/proposal/intelligence/BriefMePanel.tsx` | AI-generated project intelligence summary. Cached in `intelligenceBrief` field. |
| 38 | **AI Verification Guardrail** | **LIVE** | `app/api/proposals/verify/route.ts`, `app/api/proposals/[id]/verify/route.ts`, `app/api/proposals/[id]/verify-field/route.ts` | Field-level AI verification with blue glow tracking for human-verified vs AI-filled fields. |
| 39 | **Gap Fill Assistant** | **LIVE** | `app/components/proposal/GapFillSidebar.tsx`, `services/rfp/proposalAutoFill.ts` | Identifies missing fields and auto-fills from RFP/project context. |
| 40 | **Competitor Radar** | **LIVE** | `app/api/intelligence/competitor-radar/route.ts`, `app/components/intelligence/CompetitorRadarCard.tsx` | Competitive intelligence on other LED vendors (Daktronics, Samsung, etc.). |
| 41 | **SOW Generator** | **LIVE** | `app/components/proposal/SOWGeneratorPanel.tsx`, `services/sow/sowGenerator.ts`, `services/sow/sowTemplates.ts` | Generates scope of work documents from proposal data. |

### F. PROJECT MANAGEMENT & COLLABORATION

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 42 | **Projects Dashboard** | **LIVE** | `app/projects/page.tsx`, `app/projects/[id]/page.tsx`, `app/projects/new/page.tsx` | Full project CRUD with list view, detail view, create new. |
| 43 | **Pipeline Kanban Board** | **LIVE** | `app/pipeline/page.tsx`, `PipelineKanban` component | Visual kanban: Draft → Sent → Approved → Signed → Closed. Drag-and-drop. Real Prisma data. |
| 44 | **Client Share Links** | **LIVE** | `app/share/[hash]/page.tsx`, `app/api/projects/[id]/share/route.ts`, `ProposalSnapshot` model | Secure, version-locked share links with optional password and expiration. |
| 45 | **Change Request System** | **LIVE** | `app/api/share/[hash]/request/route.ts`, `ChangeRequest` model | Client-facing change requests from share page with pin annotations, screenshots, audio, AI categorization. |
| 46 | **Activity Logging** | **LIVE** | `app/components/proposal/ActivityLog.tsx`, `services/proposal/server/activityLogService.ts` | Full audit trail: created, imported, exported, edited, renamed, etc. |
| 47 | **Proposal Versioning** | **LIVE** | `ProposalVersion` model, `BidVersion` model | Immutable snapshots with manifest, audit data, PDF/Excel URLs. |
| 48 | **Comment System** (threaded) | **LIVE** | `Comment` model with self-referential `parentComment` | Threaded comments on proposals. |
| 49 | **Manual Override Tracking** | **LIVE** | `ManualOverride` model | Tracks every price override with original value, reason, approver, audit trail. |
| 50 | **Signature Audit Trail** | **LIVE** | `SignatureAuditTrail` model | IP, user agent, auth method, document hash, PDF hash at signing time. |

### G. PRODUCT CATALOG & RATE CARD SYSTEM

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 51 | **Product Catalog** (admin) | **LIVE** | `app/admin/products/page.tsx`, `app/api/products/route.ts`, CRUD on `ManufacturerProduct` + normalized `Manufacturer → ProductSeries → ProductModule` | Dual model: legacy flat `ManufacturerProduct` + normalized 3-tier hierarchy. 13 Yaham products with real LGEUS pricing loaded. |
| 52 | **Rate Card** (admin) | **LIVE** | `app/admin/rate-card/page.tsx`, `app/api/rate-card/route.ts`, CSV import/export, audit trail | Full rate card management with categories, provenance, confidence levels. CSV upload for bulk updates. Audit log on every change. |
| 53 | **Rate Card Loader** (estimator backend) | **LIVE** | `services/rfp/rateCardLoader.ts` | Hardcoded fallback + DB override pattern. Loads rates at estimation time. |
| 54 | **Product Matcher** | **LIVE** | `services/catalog/productMatcher.ts`, `services/rfp/productCatalog.ts` | Matches RFP requirements to catalog products by pitch, environment, brightness. |
| 55 | **Module Matching** | **LIVE** | `services/module-matching.ts` | Eric's building-block approach: module size → screen size calculation. |
| 56 | **Pricing Logic Tree** (admin) | **BETA** | `app/admin/pricing-logic/page.tsx`, `Category → DecisionNode → DecisionOption → PricingFormula` models, 7 API routes | Full decision tree CRUD: categories, nodes, options, formulas. This IS the estimation tree Natalia/Matt described. |

### H. EXPORT & DOCUMENT SYSTEM

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 57 | **Branded PDF Export** | **LIVE** | `services/proposal/server/generateProposalPdfServiceV2.ts` | Headless Chrome via Browserless WSS. Modern template with Natalia/Alison-approved design. |
| 58 | **Internal Audit Excel Export** | **LIVE** | `services/proposal/server/exportFormulaicExcel.ts`, `app/api/proposals/export/audit/route.ts` | "Ugly sheet" — internal audit workbook with formulas. This is the audit Excel Jireh wants to discuss. |
| 59 | **Mirror Ugly Sheet Excel** | **LIVE** | `services/proposal/server/exportMirrorUglySheetExcel.ts` | Excel export specifically for mirror mode data. |
| 60 | **Email PDF Delivery** | **LIVE** | `services/proposal/server/sendProposalPdfToEmailService.ts`, `app/api/proposals/send/route.ts`, email templates in `components/templates/email/` | Send proposal PDF via email with branded HTML template. |
| 61 | **Margin Analysis Excel Export** | **LIVE** | `services/intelligence/generateMarginExcel.ts` | Generates margin analysis Excel — the Jireh "margin $ column" request. |

### I. FRANKENSTEIN EXCEL NORMALIZER

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 62 | **Non-Standard Excel Importer** | **LIVE** | `services/import/excelNormalizer.ts`, `services/import/columnUtils.ts`, `app/api/import/normalize/route.ts`, `app/api/import/profile/route.ts`, `ImportProfile` model | "Map Once, Remember Forever" — SHA-256 fingerprint of sheet structure, saves column mapping, auto-matches on repeat. 4-step Mapping Wizard UI. |

### J. PROOF OF PERFORMANCE (Phase 3 feature — already built)

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 63 | **Performance Dashboard** | **LIVE** | `app/admin/performance/page.tsx`, `app/admin/performance/report/[id]/page.tsx` | Admin dashboard for managing performance reports. |
| 64 | **Performance Report Generator** | **LIVE** | `app/api/performance/reports/generate/route.ts`, 5 Prisma models: `Venue`, `InstalledScreen`, `PlayLog`, `Sponsor`, `PerformanceReport` | Generates branded PDF performance reports with screen breakdown, play logs, uptime/compliance metrics. |
| 65 | **Pipeline→Performance Bridge** | **LIVE** | `app/api/performance/activate/route.ts` | Converts SIGNED/APPROVED proposals into Venue + InstalledScreens. Real data flow. |
| 66 | **Sponsor Share Links** | **LIVE** | `app/share/performance/[hash]/page.tsx` | Public branded link for sponsors to view their performance report. |
| 67 | **Performance PDF** | **LIVE** | `app/api/performance/reports/[id]/pdf/route.ts` | Real jsreport-rendered branded 2-page PDF. |

### K. VENUE VISUALIZER (Sales demo tool)

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 68 | **Virtual Venue V1** (simple 3D) | **LIVE** | `app/demo/virtual-venue/page.tsx` | Basic 3D venue with LED screen placement. |
| 69 | **Virtual Venue V2** (bloom 3D) | **LIVE** | `app/demo/virtual-venue-v2/page.tsx` | Enhanced with UnrealBloomPass visual effects. |
| 70 | **Virtual Venue V3** (photo-based) | **LIVE** | `app/demo/virtual-venue-v3/page.tsx`, admin at `app/admin/venues/page.tsx` | Photo-based overlay system. Admin draws hotspot rectangles on real venue photos. `VenuePhoto` + `ScreenHotspot` models. |
| 71 | **Venue Admin** (hotspot drawing) | **LIVE** | `app/admin/venues/page.tsx`, 7 API routes under `/api/venue-visualizer/` | Full CRUD for venues, photos, hotspots. Seed data for Ravens M&T Bank + Levi's Stadium. |

### L. SALES TOOLS

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 72 | **ROI Calculator** | **LIVE** | `app/demo/roi-calculator/page.tsx` | Input attendance, events, CPM → shows screen ROI from ad revenue. |
| 73 | **Demo Lab / Sales Toolkit** | **LIVE** | `app/demo/page.tsx`, `app/demo/data/featureIdeas.ts` | Feature voting gallery. 7 features listed (2 live, 2 in development, 3 concept). |

### M. INFRASTRUCTURE & PLATFORM

| # | Feature | Status | Key Files | Notes |
|---|---------|--------|-----------|-------|
| 74 | **Auth System** (NextAuth v5) | **LIVE** | `app/api/auth/[...nextauth]/route.ts`, `User` model with RBAC roles | 7 roles: Admin, Estimator, Product Expert, Proposal Lead, Finance, Outsider, Viewer. |
| 75 | **RBAC** (Role-Based Access Control) | **LIVE** | `hooks/useRbac.ts`, `lib/rbac.ts`, sidebar role gating | Per-nav-item role restrictions. Admin-only sections gated in UI. |
| 76 | **User Management** (admin) | **LIVE** | `app/admin/users/page.tsx`, `app/api/admin/users/route.ts` | Admin user CRUD. |
| 77 | **Profile Settings** | **LIVE** | `app/settings/profile/page.tsx`, `app/api/user/profile/route.ts` | User profile management. |
| 78 | **Workflow Dashboard** | **LIVE** | `app/workflow/page.tsx`, `ANCWorkflowDashboard.tsx`, `OperationsManager.tsx` | Operations workflow management. |
| 79 | **Health Check** | **LIVE** | `app/api/health/route.ts` | System health endpoint. |
| 80 | **Document OCR** | **LIVE** | `services/kreuzberg/kreuzbergClient.ts`, `services/ingest/pdf-screenshot.ts` | Real OCR pipeline — Kreuzberg client for text extraction, PDF screenshot service. |
| 81 | **Tonnage Extractor** | **LIVE** | `services/ingest/tonnage-extractor.ts` | Extracts structural steel tonnage from documents (REQ-86: Thornton Tomasetti). |
| 82 | **Currency Service** | **LIVE** | `services/pricing/currencyService.ts` | Currency formatting — whole numbers for PDF per Natalia's rule. |
| 83 | **Risk Detector** | **LIVE** | `services/risk-detector.ts`, `app/components/proposal/RiskBadge.tsx` | Identifies risk signals in proposals. |
| 84 | **Bot/Agent API** | **LIVE** | `app/api/bot/` (5 routes), `app/api/agent-skill/` (3 routes), `app/api/command/route.ts` | External bot integration, agent skills for AnythingLLM, command execution. |
| 85 | **RAG Sync** | **LIVE** | `app/api/rag/sync/route.ts`, `app/api/workspaces/create/route.ts` | Syncs documents to AnythingLLM vector DB. Workspace creation for new projects. |
| 86 | **Manufacturer List API** | **LIVE** | `app/api/manufacturers/list/route.ts` | Lists all manufacturers for dropdowns/selectors. |
| 87 | **PDF Vision Analysis** | **LIVE** | `app/api/tools/pdf-vision/route.ts` | AI-powered PDF page analysis (vision model). |

---

## PART 2: CROSS-REFERENCE — Strategic Doc Claims vs Reality

### What the doc claims as "22 free demos" (Section 3, items 8-29):

| # | Claimed Feature | Code Status | Verdict |
|---|-----------------|-------------|---------|
| 8 | Three-Mode Document Toggle | Full implementation (Budget/Proposal/LOI) | **REAL** |
| 9 | Non-Standard Excel Importer | Full Frankenstein normalizer with fingerprinting | **REAL — exceeds claim** |
| 10 | Client Share Links | Snapshot + hash + password + expiry | **REAL** |
| 11 | E-Signature (DocuSign integration) | `SignatureAuditTrail` model exists, full audit schema. No DocuSign OAuth integration found — uses internal signing flow | **PARTIAL — internal signing, not DocuSign** |
| 12 | AI Verification Guardrail | Field-level verify routes + blue glow tracking | **REAL** |
| 13 | Smart Assembly Bundler | `BundlePanel.tsx` + `bundleRules.ts` | **REAL** |
| 14 | AI Quick Estimate | API route + estimator intents service | **REAL** |
| 15 | Vendor RFQ Generator | Full panel + service + API | **REAL** |
| 16 | Budget Reverse Engineer | Full panel + service + API | **REAL** |
| 17 | Metric Mirror (imperial/metric) | Part of estimator bridge calculations | **REAL** |
| 18 | Cost Category Breakdown | Part of estimator studio display | **REAL** |
| 19 | AI Copilot (Lux) | Dual-brain (Kimi + AnythingLLM), router, form fill bridge | **REAL — sophisticated** |
| 20 | PDF Page Triage | Smart filter with streaming | **REAL** |
| 21 | Contract Risk Scanner | Liability scanner with 20-point checklist | **REAL** |
| 22 | Revision Radar | Delta scanner + compare API | **REAL** |
| 23 | Cut-Sheet Generator | Full service + API + panel | **REAL** |
| 24 | Projects Dashboard | Full CRUD with list/detail/create | **REAL** |
| 25 | Project Intelligence (AI briefing) | Brief Me panel + cached intelligence | **REAL** |
| 26 | Product Catalog | Admin page + dual model (flat + normalized) | **REAL** |
| 27 | Rate Card | Admin page + CSV import + audit trail | **REAL** |
| 28 | Gap Fill Assistant | Sidebar + auto-fill service | **REAL** |
| 29 | Document OCR | Kreuzberg client + PDF screenshot | **REAL** |

**Verdict: 21 of 22 claims are fully verified in code. 1 (DocuSign) is partial — internal signing exists but no DocuSign OAuth.**

### What the doc DOESN'T mention but EXISTS in code:

| Feature | Code Location | Why it matters |
|---------|---------------|----------------|
| **Pipeline Kanban Board** | `app/pipeline/page.tsx` | Visual deal tracking — management visibility |
| **Proof of Performance module** (5 models, 10 API routes) | `app/admin/performance/`, `/api/performance/` | Sponsor ad verification — the "killer feature" from Phase 3 plan |
| **Virtual Venue Visualizer** (3 versions) | `app/demo/virtual-venue*` | Sales demo tool — clients see screens in their venue |
| **ROI Calculator** | `app/demo/roi-calculator/` | Overcomes "too expensive" objection |
| **Workflow/Operations Dashboard** | `app/workflow/page.tsx` | Internal operations management |
| **Demo Lab with Feature Voting** | `app/demo/page.tsx` | Stakeholder engagement tool |
| **Venue Admin with Hotspot Drawing** | `app/admin/venues/page.tsx` | Admin tool for managing venue photos + screen placements |
| **Email PDF Delivery** | `services/proposal/server/sendProposalPdfToEmailService.ts` | Direct proposal delivery to clients |
| **Pricing Logic Tree Builder** (admin) | `app/admin/pricing-logic/page.tsx` + 7 API routes | The estimation decision tree Matt/Natalia described |
| **Threaded Comments** | `Comment` model with threading | Collaboration on proposals |
| **Change Request with Annotations** | `ChangeRequest` model with pin, screenshot, audio, AI categorization | Client feedback capture |
| **Competitor Radar** | `/api/intelligence/competitor-radar/` | Competitive intelligence |
| **SOW Generator** | SOW templates + generator service | Scope of work document creation |
| **Sponsor Share Links** | `/share/performance/[hash]` | Public branded links for sponsors |
| **Bot/Agent External API** | `/api/bot/`, `/api/agent-skill/` | AnythingLLM integration layer |
| **Tonnage Extractor** | `services/ingest/tonnage-extractor.ts` | Structural steel estimation support |

**The strategic doc claims "22 capabilities beyond scope." The actual count in code is closer to 40+ distinct features.**

---

## PART 3: WHAT'S NOT BUILT YET (gaps and opportunities)

### A. Features MENTIONED in meetings/doc but NOT in code:

| Feature | Source | Status | Complexity |
|---------|--------|--------|------------|
| **Salesforce Integration** | Meeting 1 (Natalia), Phase 3 plan | NOT STARTED | Medium-High — one-way push sync (deal value, status, PDFs → Opportunity) |
| **Notifications System** | Sidebar shows "Notifications (Soon)" | NOT STARTED | Medium — needs event triggers, delivery channel |
| **Templates Library** | Sidebar shows "Templates (Soon)" | NOT STARTED | Low-Medium — saved proposal templates for quick start |
| **LCD/Non-LED Estimator** | Meeting 4 — "LCD later, separate agent" | NOT STARTED | Medium — different product catalog, simpler math |
| **Multi-Vendor Option Compare** | Demo Lab "development" status | NOT STARTED as dedicated feature | Medium — duplicate display with different vendor, side-by-side |
| **Client Decision Portal V2** | Demo Lab "concept" | NOT STARTED | Medium — approval workflow, comments, status tracking on share page |
| **vSOFT API Integration** | Phase 3 plan — automated play log ingestion | NOT STARTED | Medium — API integration with vSOFT/LiveSync |
| **Bid/No-Bid Scorecard** | Phase 3 plan | NOT STARTED | Low-Medium — Go/Caution/No-Go decision framework |
| **Warranty/Service Calculator** | Phase 3 plan — 10-year TCO | NOT STARTED | Medium — needs warranty escalation math (10% annual confirmed) |

### B. HIGH-VALUE FEATURES THEY DON'T KNOW THEY NEED:

---

## PART 4: GROWTH OPPORTUNITIES — Features to Suggest

### TIER 1: Immediate Revenue / Daily-Use Impact

**1. Batch Excel Processing ("Monday Morning Mode")**
- **What:** Upload 5-10 Excel files at once → get 5-10 branded PDFs back. Queue processing.
- **Why:** Natalia said 75% of usage is Mirror Mode. If she has 8 proposals to send Monday morning, she's uploading one at a time right now.
- **Effort:** Low (1-2 days) — batch wrapper around existing import→PDF pipeline
- **Revenue hook:** Retainer value justification

**2. Template Library (with Quick Clone)**
- **What:** Save proposal configurations as reusable templates. "Standard Outdoor Scoreboard" → pre-filled screens, specs, payment terms.
- **Why:** Already in sidebar as "Soon." Reduces setup time from 20 min to 2 min for common project types.
- **Effort:** Low-Medium (2-3 days)
- **Revenue hook:** Change order or Phase 2 item

**3. Multi-Vendor Option Compare**
- **What:** One-click duplicate current estimate with different vendor. Side-by-side Yaham vs LG vs Absen.
- **Why:** Already in Demo Lab as "development." Natalia creates 2-3 option proposals constantly — currently redoes the whole thing.
- **Effort:** Medium (3-4 days) — estimator duplicate exists, need comparison view
- **Revenue hook:** Phase 2 item — directly addresses estimator pain

**4. Notification System (Activity Digests)**
- **What:** Daily/weekly email digest: new proposals, status changes, pending approvals, change requests.
- **Why:** Already in sidebar as "Soon." Jireh and Eric are now in the system — they need ambient awareness without logging in.
- **Effort:** Medium (3-5 days) — needs event system + email delivery
- **Revenue hook:** Retainer justification — leadership engagement

**5. PDF Comparison (Before/After Diff)**
- **What:** Upload two versions of a proposal PDF → visual side-by-side with highlighted differences.
- **Why:** Natalia manually compares revisions. This is Revision Radar but for the final PDF output, not just the data.
- **Effort:** Medium (4-5 days)
- **Revenue hook:** Change order

### TIER 2: Strategic / Stickiness Features

**6. Salesforce Push Sync**
- **What:** When proposal status changes (Draft→Sent→Signed), push update to Salesforce Opportunity. Attach PDF.
- **Why:** Natalia mentioned this in Meeting 1. Pipeline Kanban already tracks status — just need the CRM bridge.
- **Effort:** Medium-High (5-7 days) — Salesforce REST API, OAuth, field mapping
- **Revenue hook:** $3,000-5,000 Phase 3 item. Makes the tool part of their CRM workflow.

**7. Warranty & Service Contract Calculator (10-Year TCO)**
- **What:** Project total cost of ownership including 10-year warranty with annual escalation, maintenance contracts, spare parts.
- **Why:** Phase 3 plan item. Warranty escalation math (10% annual) already validated from Excel formulas. Spare parts (5% of display cost) confirmed.
- **Effort:** Medium (4-5 days)
- **Revenue hook:** Phase 3 item — finance team value

**8. Bid/No-Bid Scorecard**
- **What:** Before spending 40 hours on an RFP response, score the opportunity: margin potential, competition, relationship strength, timeline feasibility → Go / Caution / No-Go.
- **Why:** Phase 3 plan item. Saves Matt/Jeremy from wasting time on unwinnable bids.
- **Effort:** Low-Medium (2-3 days)
- **Revenue hook:** Phase 3 item — management decision tool

**9. Client Portal V2 (Approval + Comments + Status)**
- **What:** Enhanced share links: clients can approve inline, leave comments on specific line items, see project status timeline.
- **Why:** Change Request infrastructure already exists (pin annotations, screenshots, audio, AI categorization). Just needs better UI + approval workflow.
- **Effort:** Medium (5-7 days) — UI heavy, logic mostly exists
- **Revenue hook:** Phase 3 item — replaces Sportsdigita/Digideck partially

**10. Subcontractor Portal**
- **What:** Share specific sections of a proposal with subcontractors (structural, electrical) without exposing margins or full pricing. They can submit bids back through the portal.
- **Why:** Matt sends RFQs to subcontractors constantly. The `OUTSIDER` role already exists in RBAC. Vendor RFQ Generator already creates the documents.
- **Effort:** Medium-High (5-7 days)
- **Revenue hook:** New module — saves Matt hours per project

### TIER 3: Differentiation / "Wow" Features

**11. Predictive Maintenance Dashboard**
- **What:** Track screen uptime, predict failure before it happens, alert before game-day outages.
- **Why:** Already in Demo Lab as concept. With Proof of Performance play logs, you have the data foundation. Add monitoring alerts.
- **Effort:** High (2-3 weeks) — needs real sensor/API data integration
- **Revenue hook:** Premium service tier — recurring revenue per venue

**12. AI Negotiation Coach**
- **What:** Before a pricing call, AI analyzes the deal (margin room, competitor pricing, client history) and suggests negotiation strategies.
- **Why:** Already in Demo Lab as concept. Rate card + competitor radar data already exists.
- **Effort:** Medium (4-5 days) — AI prompt engineering + data aggregation
- **Revenue hook:** Sales team value — Jireh would love this

**13. Sponsor ROI Dashboard**
- **What:** Extend Proof of Performance: show sponsors real-time impression data, CPM calculations, ROI metrics. Let sponsors log in and see their own dashboard.
- **Why:** Performance module exists. ROI Calculator exists. Combine them for sponsors.
- **Effort:** Medium (5-7 days)
- **Revenue hook:** Makes ANC irreplaceable to sponsors — they can't get this from Daktronics

**14. Historical Win/Loss Analyzer**
- **What:** Track which proposals won vs lost, by venue type, deal size, competitor, product mix. Surface patterns: "You win 80% of indoor arena deals under $500K but only 30% of outdoor stadium deals over $2M."
- **Why:** All the data is in Prisma already (proposals, status, screens, pricing). Just needs analytics layer.
- **Effort:** Medium (5-7 days)
- **Revenue hook:** Management reporting — Jireh value

**15. Automated Site Survey Form**
- **What:** Mobile-friendly form for field engineers to capture: venue dimensions, mounting points, power access, structural constraints. Photos + GPS. Feeds directly into estimator.
- **Why:** Matt described getting "vague emails" with minimal info. This standardizes the intake.
- **Effort:** Medium-High (7-10 days)
- **Revenue hook:** New module — field operations value

**16. LED Content Preview / Mockup Generator**
- **What:** Upload sponsor artwork → see it rendered on the venue visualizer screens in real-time. Export mockup PDF for sponsor presentations.
- **Why:** Venue Visualizer V3 (photo-based with hotspots) already exists. Just need to render uploaded artwork onto the hotspot areas.
- **Effort:** Low-Medium (3-4 days) — hotspot system exists, need image overlay
- **Revenue hook:** Sales tool — sponsors see their content on screens before committing

**17. Project Timeline / Gantt Chart**
- **What:** Visual project timeline from contract signing through installation. Schedule data already extracted from RFPs. Business-day math already validated.
- **Why:** Schedule extraction exists (`services/rfp/scheduleGenerator.ts`, `displayScheduleExtractor.ts`). `SchedulePreview` component exists. Just needs interactive Gantt view.
- **Effort:** Medium (4-6 days)
- **Revenue hook:** Project management value — PM team use case

**18. Electrical Load Calculator**
- **What:** Given screen specs (power density validated at 488W/m² for 4mm, 298W/m² for 10mm), calculate total electrical requirements: circuits needed, breaker sizing, conduit runs, transformer sizing.
- **Why:** Matt specifically called out electrical calculations as a value-add for AI. Power density constants already validated from real Excel formulas.
- **Effort:** Medium (4-5 days) — math engine, constants already known
- **Revenue hook:** Phase 2+ — estimator team pain point

**19. Multi-Project Portfolio View**
- **What:** Dashboard showing ALL active projects across the company: total pipeline value, win rate, average margin, deals by stage. Filter by estimator, client, region.
- **Why:** Pipeline Kanban exists but is flat. Jireh (executive) needs portfolio-level visibility.
- **Effort:** Medium (4-6 days)
- **Revenue hook:** Management reporting — retainer justification

**20. Automated Follow-Up Reminders**
- **What:** If a shared proposal hasn't been viewed in X days, or a change request is unresolved for Y days, auto-notify the team.
- **Why:** Share links already track access. Change requests have status. Just need timer + notification.
- **Effort:** Low-Medium (2-3 days) — needs cron job + email
- **Revenue hook:** Pipeline management — prevents deals from going cold

---

## PART 5: FEATURE COUNT SUMMARY

| Category | Count | Examples |
|----------|-------|---------|
| **Core Proposal Engine** | 6 | Mirror Mode, 3-mode toggle, PDF pipeline, Excel import, pricing parser, resp matrix |
| **Estimator Studio** | 14 | Budget estimator, Excel preview, AI quick estimate, bundler, reverse engineer, RFQ gen, liability scanner, revision radar, cut-sheet, copilot, zone mapper, vendor parser, duplicate, export |
| **RFP Intelligence** | 10 | PDF filter, extraction pipeline, auto-response, spec/schedule/pricing extraction, division finder, drawing extractor, alternates, RFP→project pipeline |
| **Spec Sheet System** | 2 | Generator + auto-fill memory |
| **AI/Copilot** | 9 | Dual-brain copilot, vision AI, RAG, dashboard intel, brief me, verification, gap fill, competitor radar, SOW generator |
| **Project Management** | 9 | Dashboard, pipeline kanban, share links, change requests, activity log, versioning, comments, manual overrides, signature audit |
| **Product & Rate Card** | 6 | Catalog, rate card, loader, matcher, module matching, pricing logic tree |
| **Export & Documents** | 5 | PDF, audit Excel, mirror Excel, email delivery, margin Excel |
| **Frankenstein Normalizer** | 1 | Non-standard Excel importer |
| **Proof of Performance** | 5 | Dashboard, report generator, pipeline bridge, sponsor links, PDF |
| **Venue Visualizer** | 4 | V1, V2, V3, venue admin |
| **Sales Tools** | 2 | ROI calculator, demo lab |
| **Infrastructure** | 14 | Auth, RBAC, user mgmt, profile, workflow, health, OCR, tonnage, currency, risk detector, bot API, RAG sync, manufacturers, PDF vision |
| **TOTAL VERIFIED FEATURES** | **87** | |

### vs Strategic Doc claim: "22 capabilities beyond scope" + 7 core = 29 total
### Actual code: **87 distinct features/capabilities**
### The doc undersells the platform by ~3x

---

## PART 6: RECOMMENDED PITCH ORDER (for your next conversation)

Based on stakeholder pain points from the meetings:

1. **For Natalia (daily user):** Batch Excel Processing, Template Library, Notification Digests
2. **For Matt/Jeremy (estimators):** Multi-Vendor Compare, Electrical Load Calculator, Subcontractor Portal, Automated Site Survey
3. **For Jireh (executive):** Portfolio View, Historical Win/Loss, Salesforce Integration
4. **For Eric (product):** Product catalog expansion (auto-import from vendor specs), Module matching refinements
5. **For sponsors (external):** Sponsor ROI Dashboard, LED Content Preview, Performance Reports
6. **For Alex/Jack (junior staff):** Template Library (reduce learning curve), AI Quick Estimate (natural language input)
