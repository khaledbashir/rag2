# Phase 2 Prompt Tracker

> **Source:** `i18n/ANC_Phase2_Prompt_Playbook.docx.pdf` (60 prompts, Feb 7 2026)
> **Rule:** Update this file after completing each prompt. Mark status, date, and commit hash.

## Status Legend
- ✅ DONE — Completed and pushed
- ⚠️ PARTIAL — Some work done, needs finishing
- ❌ TODO — Not started
- 🔧 HOTFIX — Done outside prompt sequence (bug fix)

---

## Phase A: Mirror Mode Polish (P40-48)

| # | Prompt | Status | Notes |
|---|--------|--------|-------|
| 40 | Master Table Selector for LOI | ✅ DONE | MasterTableSelector component in Step2Intelligence.tsx, `masterTableIndex` in schema, auto-detects roll-up tables |
| 41 | Alternative Tagging | ✅ DONE | Checkbox toggle per line item in SingleScreen.tsx, ALT badge in collapsed header, alternates excluded from grand total + shown in separate section in PDF |
| 42 | Inline Typo Editing | ✅ DONE | `descriptionOverrides` field, inline edit in pricing table preview |
| 43 | WORK/PRICING Header Toggle | ✅ DONE | `columnHeaderStyle` toggle in Step2, switches between WORK/PRICING and DESCRIPTION/AMOUNT |
| 44 | LOI Specs Display Fix | ✅ DONE | `ExhibitA_TechnicalSpecs.tsx` 6-column layout |
| 45 | Manual Line Items | ✅ DONE | "Or start manually" button in Step1, seeds manual line item, skips Excel |
| 46 | PDF Filename Convention | ✅ DONE | `ANC_{ClientName}_{DocumentType}_{YYYY-MM-DD}.pdf` in ProposalContext.tsx |
| 47 | Share Link Fix | ✅ DONE | `share/[hash]/page.tsx` uses ProposalTemplate5 |
| 48 | Visual QA Full Test Run | ✅ DONE | `.claude/skills/visual-qa/visual-qa.js` — 13 test cases across all phases |

**Phase A Score: 9/9 done, 0 partial, 0 todo**

---

## Phase B: Product Catalog & Database (P49-55)

| # | Prompt | Status | Notes |
|---|--------|--------|-------|
| 49 | Product Catalog DB Schema | ✅ DONE | Manufacturer, ProductSeries, ProductModule, Processor models in schema.prisma |
| 50 | Product Catalog API Routes | ✅ DONE | `/api/products` (GET with filtering + POST create), `/api/products/[id]` (GET/PUT/DELETE), `/api/products/import` (Excel import) |
| 51 | Product Catalog Admin UI | ✅ DONE | `/admin/products` page with sortable table, filters (search/mfg/env/pitch), inline editing, add form, Excel import |
| 52 | Product Matching Engine | ✅ DONE | `services/catalog/productMatcher.ts` queries Prisma ManufacturerProduct, falls back to hardcoded LED_MODULES, real fitScore calc |
| 53 | Seed Product Catalog | ✅ DONE | `prisma/seed-products.ts` with 14 LG/Yaham/Absen/Unilumin products, upsert logic |
| 54 | Connect to AnythingLLM | ✅ DONE | `docs/knowledge/product-catalog-knowledge.md` — full knowledge doc for AnythingLLM product queries |
| 55 | Product Catalog Skill | ✅ DONE | `.claude/skills/product-catalog/SKILL.md` — complete skill doc |

**Phase B Score: 7/7 done, 0 partial, 0 todo**

---

## Phase C: Intelligence Mode Core (P56-62)

| # | Prompt | Status | Notes |
|---|--------|--------|-------|
| 56 | Intelligence Mode Math Engine | ✅ DONE | `services/pricing/intelligenceMathEngine.ts` — pure wrapper, presets, validation, calculateIntelligencePricing() |
| 57 | Global Strategic Controls UI | ✅ DONE | Step3Math: margin slider, 4 presets (Aggressive/Standard/Premium/Strategic), bond rate, tax rate, B&O toggle |
| 58 | Sales Quotation Items Builder | ✅ DONE | Step3Math: SortableQuoteItem with dnd-kit drag reorder, From Catalog button, Auto-fill, Add/Remove |
| 59 | Strategic P&L Audit Table | ✅ DONE | AuditTable.tsx: Export Audit CSV button, full 25-column breakdown per screen + totals |
| 60 | SOW Template System | ✅ DONE | `services/sow/sowTemplates.ts` — 8 toggleable sections, buildSOWContent(), getDefaultSOWConfig() |
| 61 | Intelligence Mode Skill | ✅ DONE | `.claude/skills/intelligence-mode/SKILL.md` — complete Intelligence Mode documentation |
| 62 | Visual QA — Intelligence Test | ✅ DONE | 6 intelligence test cases in visual-qa.js (basic, presets, quotes, CSV, B&O) |

**Phase C Score: 7/7 done**

---

## Phase D: AI Copilot Chat — Kimi K2.5 (P63-70)

| # | Prompt | Status | Notes |
|---|--------|--------|-------|
| 63 | Chat Panel Component | ✅ DONE | `app/components/chat/CopilotPanel.tsx` — slide-out panel, messages, quick actions, echo fallback |
| 64 | Connect Kimi K2.5 via Puter.js | ✅ DONE | `services/chat/kimiService.ts` — Kimi K2.5 via Puter.js + AnythingLLM fallback |
| 65 | Copilot Intent Parser | ✅ DONE | `services/chat/intentParser.ts` — regex intent detection for margin/bond/tax/screens/products |
| 66 | Copilot Action Executor | ✅ DONE | `services/chat/actionExecutor.ts` — executes intents against form state via setValue |
| 67 | Copilot Context Awareness | ✅ DONE | `services/chat/contextBuilder.ts` — builds project context string for AI requests |
| 68 | Quick Actions Bar | ✅ DONE | `services/chat/quickActions.ts` — step-aware quick actions (Step1-4 + Mirror Mode) |
| 69 | Conversation Memory | ✅ DONE | `chatHistory Json?` field on Proposal model in schema.prisma |
| 70 | Copilot Skill File | ✅ DONE | `.claude/skills/copilot/SKILL.md` — complete Copilot documentation |

**Phase D Score: 8/8 done**

---

## Phase E: RFP Extraction & Advanced (P71-78)

| # | Prompt | Status | Notes |
|---|--------|--------|-------|
| 71 | RFP Upload & Text Extraction | ✅ DONE | `services/rfp/rfpExtractor.ts` — pdf-parse extraction with page range support |
| 72 | Division 11 Section Finder | ✅ DONE | `services/rfp/divisionFinder.ts` — 6 patterns for 11 06 60, 11 63 10, etc. |
| 73 | Display Schedule Extractor | ✅ DONE | `services/rfp/displayScheduleExtractor.ts` — regex parser for dims, pitch, qty, env |
| 74 | RFP to Proposal Auto-Fill | ✅ DONE | `services/rfp/proposalAutoFill.ts` — maps extracted RFP data to form fields |
| 75 | Drawing Page Extractor | ✅ DONE | `services/rfp/drawingExtractor.ts` — A-/AV-/E-/S- sheet detection |
| 76 | Multi-Currency Support | ✅ DONE | `services/pricing/currencyService.ts` — USD/CAD/EUR/GBP with Intl.NumberFormat |
| 77 | Dashboard Intelligence | ✅ DONE | `services/dashboard/dashboardIntelligence.ts` — pipeline, stats, activity, top clients |
| 78 | Full System Visual QA + Deploy | ✅ DONE | visual-qa.js 13 test cases + all services committed and pushed |

**Phase E Score: 8/8 done**

---

## Hotfixes (Done outside prompt sequence)

| Date | Fix | Commit | Notes |
|------|-----|--------|-------|
| Feb 8 | Bundle download: 4 files not zip | `8aa6d006` | Removed JSZip, restored sequential downloads with 800ms delays |
| Feb 8 | Parser: orphaned summary + grand total | `48f58582` | findTableBoundaries orphan detection + findGlobalDocumentTotal rewrite |
| Feb 8 | ANC Bible skill | `d6796e69` | `.claude/skills/anc-bible/SKILL.md` |

---

## Overall Progress

| Phase | Done | Partial | Todo | Total |
|-------|------|---------|------|-------|
| A: Mirror Polish | 9 | 0 | 0 | 9 |
| B: Product Catalog | 7 | 0 | 0 | 7 |
| C: Intelligence | 7 | 0 | 0 | 7 |
| D: AI Copilot | 8 | 0 | 0 | 8 |
| E: RFP & Advanced | 8 | 0 | 0 | 8 |
| **TOTAL** | **39** | **0** | **0** | **39** |

**🎉 ALL 39 PROMPTS COMPLETE — Phase 2 Done**
