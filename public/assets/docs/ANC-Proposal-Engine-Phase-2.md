# ANC Proposal Engine — Phase 2 Proposal

### Prepared for ANC Sports Enterprises
### Prepared by Assisted.VIP
### February 2026

---

## Executive Summary

Phase 1 delivered two foundational capabilities: **Mirror Mode** (exact Excel-to-PDF reproduction) and the **Budget Estimator** (guided cost estimation). Together, they eliminated the manual formatting pipeline and gave the Proposals team a real-time, web-based workflow used daily.

Phase 2 takes the platform from a proposal formatting tool to an **end-to-end deal intelligence system**. Four new capabilities — Intelligence Mode, RFP Analyzer, AI Copilot, and Product Catalog — collapse what currently takes days of manual work into minutes of guided, AI-assisted workflow.

**The bottom line:** Phase 2 reduces the average RFP-to-proposal cycle from **2-3 days to under 4 hours**, while improving pricing accuracy and eliminating the most error-prone manual steps in the process.

---

## What Phase 2 Delivers

### 1. Intelligence Mode — Build Proposals from Scratch

**The Problem:**
When ANC receives a vendor quote (Excel workbook with hardware pricing, install labor, soft costs), the Proposals team manually re-keys data into ANC's pricing sheets, applies margin calculations by hand, groups costs by category, and builds the final client-facing proposal. This takes 4-6 hours per quote and introduces transcription errors.

**The Solution:**
Intelligence Mode imports vendor Excel files directly, normalizes 20+ column types automatically (pixel pitch, resolution, brightness, hardware cost, install labor, electrical, PM, engineering), and applies ANC's margin structure in real time. The system detects margin analysis sheets, groups soft costs (rigging, cranes, travel, commissioning, warranty), flags alternate rows to prevent inflated base bids, and reconciles subtotals — all without manual intervention.

**Key Capabilities:**
- Direct vendor Excel import with automatic column detection and normalization
- Three-tier margin presets: 20% services, 30% LED hardware, 35% CMS/software — or override per project
- Automatic soft cost extraction and grouping (structure, electrical, PM, engineering, permits, shipping, warranty)
- Alternate row detection (prevents "ALT" options from inflating the base bid)
- Real-time margin calculations using the divisor model: Selling Price = Cost / (1 - Margin%)
- Automatic bond (1.5%) and tax calculation
- Multi-currency support (USD, CAD, EUR, GBP)

**Business Impact:**
- 4-6 hours saved per vendor quote
- Eliminates transcription errors between vendor files and ANC pricing
- Consistent margin application across all proposals
- Instant "what-if" scenarios — change a margin and see the impact in real time

---

### 2. RFP Analyzer — From 100-Page PDF to Scoping Workbook in Minutes

**The Problem:**
When an RFP lands (often 100-2,500 pages), someone on the team has to read the entire document, hunt for LED display specifications buried in Division 11 sections, extract dimensions and requirements from tables and drawings, manually match specs to products, and build a scoping workbook from scratch. This is the single most time-consuming step in the proposal process — often 8-12 hours of focused work.

**The Solution:**
Upload the RFP PDF. The system processes it through a 7-stage extraction pipeline:

1. **Text Extraction** — OCR-powered processing handles scanned documents, typed PDFs, and mixed formats
2. **Content Scoring** — Pages are scored by relevance and filtered — table of contents, disclaimers, and boilerplate are discarded, keeping only the 30-40% that matters
3. **Section Discovery** — Automatically locates Division 11 specifications, Display Schedules (Section 11 06 60), and LED Systems (Section 11 63 10)
4. **Display Schedule Extraction** — Structured tables of displays are parsed for names, dimensions, pixel pitch, quantity, and environment
5. **Drawing Detection** — Technical drawing pages (blueprints, layouts) are identified and flagged for manual review
6. **AI Extraction** — High-value sections are analyzed by AI, returning structured data: project name, venue, list of screens with full specifications
7. **Product Matching** — Each extracted screen is matched to the closest product in the catalog by pitch, environment, and dimensions — with a fit score (0-100)

**Output:**
- Interactive split-panel viewer: PDF on the left, extracted specs on the right — every spec links back to its source page
- Inline-editable specs table — adjust any extracted value before export
- One-click scoping workbook generation (10+ sheets: LED Cost, Margin Analysis, Project Info, Requirements, Processor Count, Page Triage, P&L, Cash Flow, POs, Travel)
- Rate card export for subcontractor distribution
- Direct pipeline to create a full proposal from extracted data

**Business Impact:**
- 8-12 hours saved per RFP analysis
- No more missed specs — the system reads every page so the team doesn't have to
- Source traceability — every extracted number traces back to the exact page in the original PDF
- Consistent scoping workbook format across all projects

---

### 3. AI Copilot — Talk to Your Proposal

**The Problem:**
Building a proposal means navigating dozens of form fields across multiple sections — client info, display specs, dimensions, pricing, margins, taxes, terms. Even with a well-designed UI, it's a lot of clicking, tabbing, and typing. Experienced users know what they want but still have to find the right field and enter it manually.

**The Solution:**
The AI Copilot is a natural language interface layered directly on top of the proposal and estimator forms. Type or speak what you want in plain English, and the system executes it:

- *"Set the client to Dallas Cowboys"* → Updates client name
- *"Add a 40x20 scoreboard at 4mm pixel pitch"* → Creates a new display with specs
- *"Change margin to 35% on all screens"* → Updates margin across all displays
- *"Set currency to CAD"* → Switches currency formatting project-wide
- *"Remove the ribbon board"* → Deletes the specified display
- *"What's the total cost?"* → Returns the current total with breakdown
- *"Export to PDF"* → Triggers document generation

**Key Capabilities:**
- 36 recognized intent types (14 proposal + 22 estimator actions)
- Confidence scoring on every parsed command — ambiguous inputs are flagged for confirmation
- Context-aware suggestions based on current form state
- Works in both Mirror Mode and Intelligence Mode
- Streaming responses for real-time feedback
- Full conversation history within each session

**Business Impact:**
- 1-2 hours saved per proposal through conversational form-filling
- Reduces training time for new team members — talk to the form instead of learning the UI
- Eliminates field-hunting — the Copilot knows where every setting lives

---

### 4. Product Catalog — Single Source of Truth for LED Specs & Pricing

**The Problem:**
LED product specifications live in manufacturer datasheets, scattered spreadsheets, and team members' heads. When someone needs to calculate power draw, weight, or resolution for a given screen size, they're looking up cabinet dimensions, doing manual math, and hoping the datasheet they found is current. Different team members may use different numbers for the same product.

**The Solution:**
A centralized, searchable product database with 20+ LED modules, each containing:
- Pixel pitch (2.5mm - 10mm)
- Power density (W/m²) and weight density (lbs/m²)
- Brightness (1,000 - 10,000 nits)
- Environment rating (indoor / outdoor / both)
- Cabinet dimensions with small-variant support
- Color temperature, diode type, processing specs, rated lifespan

**Key Capabilities:**
- **Automatic spec calculation:** Enter screen dimensions + select product → system calculates cabinet grid (cols × rows), total resolution, power draw, and weight
- **Fuzzy product matching:** Loose specs from an RFP ("40x20 outdoor 4mm") are matched to the best product with a fit score
- **Rate card integration:** Yaham NX pricing, install rates (structure, labor, electrical, PM, engineering) are loaded and cached
- **Tiered service margins:** Larger projects automatically get more competitive margin percentages
- **Pricing estimation:** Hardware cost + labor cost + contingency calculated per display

**Business Impact:**
- One number, everywhere — eliminates inconsistencies between team members
- Instant power/weight calculations for any screen configuration
- Automatic product matching speeds up RFP response by removing the lookup step
- Rate card integration ensures every quote uses current pricing

---

## Phase 2 Pricing

| Component | Description | Investment |
|-----------|-------------|------------|
| Intelligence Mode | Vendor Excel import, margin engine, soft cost grouping | Included |
| RFP Analyzer | 7-stage PDF pipeline, AI extraction, scoping workbook | Included |
| AI Copilot | 36-intent NLP, streaming chat, form automation | Included |
| Product Catalog | 20+ modules, auto-matching, rate card integration | Included |
| **Phase 2 Platform License** | **All four capabilities above** | **TBD** |
| Monthly Maintenance | Updates, support, hosting, AI model costs | **TBD** |

*Pricing to be discussed based on scope of deployment, number of users, and AI model provider selection.*

---

## AI Model Flexibility

The platform is built **model-agnostic** with an OpenAI-compatible API layer. ANC selects the AI provider that meets your compliance and security requirements:

- OpenAI (GPT-4, GPT-4o)
- Azure OpenAI (enterprise, SOC 2 compliant)
- Anthropic (Claude)
- Any OpenAI-compatible provider

We handle the integration. You provide the API key and approval — the system plugs in seamlessly. All AI features work with any compatible model, and switching providers requires zero code changes.

---

## Implementation Timeline

Phase 2 is **fully built and production-ready** as of February 2026. Deployment requires:

1. **ANC approval** of Phase 2 scope
2. **AI model selection** — ANC chooses preferred provider
3. **API key provisioning** — ANC provides credentials for chosen model
4. **Activation** — Features are enabled on the existing platform (no new infrastructure)
5. **Team walkthrough** — 60-minute session covering all new capabilities

**Time to live: 1 week from approval.**

---

## ROI Summary

| Metric | Before (Manual) | After (Phase 2) | Savings |
|--------|-----------------|------------------|---------|
| Vendor quote processing | 4-6 hours | 30-45 minutes | ~85% |
| RFP analysis & scoping | 8-12 hours | 1-2 hours | ~85% |
| Proposal form filling | 2-3 hours | 30-60 minutes | ~70% |
| Product spec lookup | 30-60 min per screen | Instant | ~95% |
| **Full RFP-to-proposal cycle** | **2-3 days** | **Under 4 hours** | **~80%** |

---

## Next Steps

1. Review this proposal with the team
2. Schedule a Phase 2 demo walkthrough
3. Confirm AI model provider preference
4. Approve scope and timeline
5. Go live

---

*Prepared by Assisted.VIP for ANC Sports Enterprises*
*Platform: ANC Proposal Engine v2*
*Contact: Ahmad Basheer — ahmad@assisted.vip*
