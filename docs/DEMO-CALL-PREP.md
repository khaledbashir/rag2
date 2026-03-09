# ANC Proposal Engine — Complete Feature Guide & Demo Prep

**Platform URL:** https://proposals.anc.com  
**Login:** Use your existing credentials  
**Call Date:** Today  
**Attendees:** Ahmad, Natalia, Jeremy, Matt, Jack, Eric, Jireh

---

## TABLE OF CONTENTS

1. [Agenda Cheat Sheet](#agenda)
2. [Complete Feature Map](#feature-map) — every feature, where it lives, what it does
3. [Dashboard & Projects](#dashboard)
4. [Mirror Mode (Excel → PDF)](#mirror-mode)
5. [Intelligence Mode (Build from Scratch)](#intelligence-mode)
6. [Estimator Toolbar — 10 Power Tools](#estimator-tools)
7. [RFP PDF Filter](#pdf-filter)
8. [AI Chat (GLM-5)](#ai-chat)
9. [Client Share Portal](#client-portal)
10. [Pipeline View](#pipeline)
11. [Admin Pages](#admin)
12. [Copilot (Dual-Brain AI)](#copilot)
13. [Phase 2 Proposal](#phase-2)
14. [Working Session Questions](#working-session)
15. [Pre-Call Checklist](#checklist)

---

<a id="agenda"></a>
## 1. AGENDA CHEAT SHEET

| # | Section | Owner | Time | What to Show |
|---|---------|-------|------|-------------|
| 1 | Platform Intro & Demo | Ahmad | 20 min | Login → Dashboard → Excel→PDF → Live Budget Test |
| 2 | Phase 2 Proposal | Ahmad | 15 min | Feature roadmap, what's next |
| 3 | Working Session | Jeremy, Matt, Jack, Eric, Jireh | Open | Brainstorm priorities for Phase 2 |

---

<a id="feature-map"></a>
## 2. COMPLETE FEATURE MAP

Every feature in the platform, organized by where it lives:

### Navigation Structure

```
SIDEBAR
├── MAIN
│   ├── Projects (/projects)         — Dashboard with all projects, KPIs, search, filters
│   ├── Pipeline (/pipeline)         — Kanban board, drag projects between stages
│   └── Templates (/templates)       — [Coming Soon]
│
├── TOOLS
│   ├── Chat (/chat)                 — AI chat with GLM-5, thinking display, Excel export
│   ├── PDF Filter (/tools/pdf-filter) — Upload RFP PDF, AI scores pages, filter & export
│   └── Estimator (/estimator)       — Creates new estimate project, redirects to wizard
│
├── SETTINGS
│   ├── Profile (/settings/profile)  — User name, email, avatar, role display
│   ├── Notifications                — [Coming Soon]
│   └── Users (/admin/users)         — Admin only: manage user accounts & roles
│
└── ADMIN
    ├── Product Catalog (/admin/products)     — LED products database (13+ Yaham products)
    ├── Rate Card (/admin/rate-card)          — Pricing constants, margins, multipliers
    ├── Pricing Logic (/admin/pricing-logic)  — [Beta] Visual pricing rule editor
    └── Performance (/admin/performance)      — [Phase 3] Project performance metrics
```

### Project Creation — Three Entry Points

When you click **New Project**, you see three options:

| Option | What It Does | When to Use |
|--------|-------------|-------------|
| **I Have an RFP** | Opens PDF Filter → upload RFP, filter pages, then create project | You received a 500+ page RFP PDF |
| **Upload Excel → PDF** (Mirror Mode) | Upload ANC Excel → branded PDF instantly | Natalia has a completed Excel with pricing |
| **Build from Scratch** (Intelligence Mode) | Estimator wizard → questionnaire → live Excel preview | Starting a new estimate with no existing data |

---

<a id="dashboard"></a>
## 3. DASHBOARD & PROJECTS

**URL:** `/projects`

### What You See
- **Hero greeting** — "Good morning, Ahmad" with pipeline summary
- **KPI strip** — total projects, Mirror count, Intelligence count, Estimates, Pipeline $
- **Status filters** — Overview / Drafts / Approved / Signed
- **Search bar** — search across all projects by client name
- **Grid/List toggle** — switch between card view and compact list
- **Project cards** — each shows client name, status badge, total amount, last updated
- **Quick actions per project** — Brief Me (AI summary), status change, delete

### Dashboard AI Features
- **Dashboard Chat** — floating chat bar at bottom, ask questions about your pipeline
- **Brief Me** — click on any project, get an AI-generated summary of where it stands
- **Copilot Panel** — floating AI assistant (bottom-right), ask "What's my total pipeline value?" or "Which projects need attention?"
- **Prompt Library** — pre-built AI prompts for common operations

### How the Math Works
- Pipeline value = sum of all project `totalAmount` fields
- Status counts pulled from database, not filtered view
- Insights auto-generated: stale drafts, top deals, recent activity

---

<a id="mirror-mode"></a>
## 4. MIRROR MODE (Excel → PDF)

**URL:** `/projects/new` → "Upload Excel → PDF"

### What It Does
Takes an existing ANC Excel file and converts it into a branded PDF proposal. No re-typing. The system reads every cell.

### Step by Step
1. Click **New Project** → select **Upload Excel → PDF**
2. Upload `.xlsx` file (drag & drop or file picker)
3. System parses the Excel using `excelImportService.ts`:
   - Reads all sheets, detects headers, maps columns
   - Extracts: client name, project name, display specs, pricing, services
   - Handles multiple display sheets
4. Shows **branded PDF preview** in real-time
5. **Every field is editable** — click any value in the PDF to change it
6. Changes reflect immediately in the preview
7. **Export** → download PDF or share via client portal link

### The PDF Template
- **Font:** Work Sans (ANC brand)
- **Colors:** French Blue accents (#0A52EF)
- **Layout:** Supports both portrait and landscape
- **Sections:** Cover page, executive summary, display specifications, pricing table, terms
- **Template:** `ProposalLayout.tsx` with section components in `proposal-pdf/sections/`

### Key Files
- `services/proposal/server/excelImportService.ts` — Excel parsing engine
- `app/components/templates/proposal-pdf/ProposalLayout.tsx` — PDF template
- `app/components/templates/proposal-pdf/sections/` — Individual PDF sections

---

<a id="intelligence-mode"></a>
## 5. INTELLIGENCE MODE (Build from Scratch)

**URL:** `/estimator` → auto-creates project → `/estimator/[projectId]`

### What It Does
Split-screen workspace: left side is a typeform-style questionnaire, right side is a live Excel preview that updates as you answer questions.

### The Questionnaire Flow
Questions are defined in `questions.ts`. Three phases:

**Phase 1 — Project Info:**
- Client name, project name, location
- Document type (Budget / Proposal / LOI)
- Estimate depth (ROM / Detailed / Final)
- Indoor/outdoor, new install/replacement, union labor

**Phase 2 — Display Configuration (per display):**
- Display name (e.g., "Main Scoreboard")
- Display type preset (scoreboard, ribbon, fascia, marquee, end-zone, custom)
- Location type (wall, ceiling, floor, freestanding)
- Width × Height in feet
- Pixel pitch (1.5mm to 16mm)
- Product selection from catalog
- Install complexity (standard / complex / heavy)
- Service type (front/rear access)
- Steel scope (existing / secondary / full)
- Lift type (none / scissor / boom / crane)
- Power distance (near / medium / far)
- Data run (copper / fiber)
- Replacement? Existing structure? Spare parts?

**Phase 3 — Financial:**
- Margin tier (Budget: 15%/10%, Proposal: 30%/20%, LOI: 30%/20%)
- LED margin %, services margin %
- Bond rate, sales tax rate
- Target price (for Profit Shield reverse-calc)
- PM complexity

### The Calculation Engine (`EstimatorBridge.ts`)
For EACH display, `calculateDisplay()` computes:

| Line Item | How It's Calculated |
|-----------|-------------------|
| **LED Hardware** | Area (sqft) × cost per sqft (from rate card, varies by pixel pitch) |
| **Spare Parts** | 5% of hardware cost (if enabled) |
| **Structure/Steel** | Hardware × structure % (5% existing, 12% secondary, 20% full) |
| **Installation** | (Estimated weight × steel rate) + (area × LED install rate) |
| **Electrical** | Area × materials rate × power distance multiplier (1.0/1.3/1.8) |
| **Equipment Rental** | Lift type: scissor=$500, boom=$1,500, crane=$5,000 |
| **Data Cabling** | Fiber adds $3,000 flat; copper = $0 |
| **PM Cost** | Base fee × complexity multiplier (1×/2×/3×) |
| **Engineering** | Base fee × complexity multiplier |
| **Shipping** | Estimated weight × $0.50/lb |
| **Demolition** | $5,000 if replacement install |
| **Bundle Accessories** | Auto-calculated by Smart Assembly Bundler (see below) |
| **Union Multiplier** | 15% uplift on labor costs if union job |
| **Tiered Margins** | Separate LED margin vs services margin |
| **Bond** | Sell price × bond rate (default 1.5%) |
| **Sales Tax** | (Sell + bond) × tax rate (default 9.5%) |
| **Profit Shield** | If target price set, reverse-calculates required margin |

### Excel Preview Sheets (auto-generated)
The right panel shows a live Excel with these tabs:

1. **Executive Summary** — project overview, total cost/sell/margin
2. **Display Specifications** — per-display breakdown with all line items
3. **Margin Waterfall** — cost → margin → sell → bond → tax → final
4. **Cabinet Layout (Tetris)** — requested vs actual dimensions, cabinet grid, resolution, weight, power, heat load
5. **Bundle Accessories** — auto-suggested items with toggle on/off
6. **Custom Sheets** — user can add blank sheets and edit cells

### Export
- **Export .xlsx** button → downloads real Excel file with all sheets
- **Duplicate** → clones the entire estimate as a new project
- **To Proposal** → converts estimate into a full proposal (Mirror Mode)

---

<a id="estimator-tools"></a>
## 6. ESTIMATOR TOOLBAR — 10 POWER TOOLS

These are buttons in the EstimatorStudio toolbar. Each opens a panel overlay.

---

### 6.1 Auto-RFP Response (⚡ Auto-RFP)

**What:** AI reads an RFP document, extracts every LED screen requirement, matches each to a product from the catalog, and pre-fills the estimator with all displays.

**How it works:**
1. Upload an RFP PDF (or paste text)
2. PDF gets uploaded to AnythingLLM workspace
3. AI extraction prompt runs → returns structured JSON with every screen
4. Each screen gets matched to closest product in catalog (by pixel pitch + environment)
5. Review screen: shows each extracted screen with confidence badge, product match, fit score
6. Toggle individual screens on/off
7. Click "Apply" → all screens populate the estimator

**When to use:** When you receive a new RFP and need to extract all the display requirements.

**Benefit:** Turns a 2,500-page RFP into a populated estimate in 30 seconds.

---

### 6.2 3D Arena Preview (📦 3D)

**What:** Live 3D visualization of an arena showing LED display zones. Zones light up as you add displays to the estimate.

**When to use:** After adding displays. Show clients what the venue will look like.

**Benefit:** Visual selling tool — clients see their investment come to life.

---

### 6.3 Smart Assembly Bundle (📦 Bundle)

**What:** Auto-suggests hidden/forgotten accessories for each display. Estimators regularly forget items like video processors, receiving cards, spare modules, mounting brackets, cable kits — leaving $5K-$30K on the table per project.

**How it works:**
The bundler has 20+ rules in `bundleRules.ts`. For each display, it examines the configuration and suggests:

| Category | Example Items |
|----------|--------------|
| **Signal Processing** | Video processor ($12K), receiving cards ($85 each), sending card ($450), signal cables, fiber converters, backup processor |
| **Electrical** | PDU ($850), power cables ($8 each), surge protector ($350), UPS battery ($2,500 for scoreboards) |
| **Structural** | Mounting brackets ($25×2 per cabinet), rigging hardware ($3,500 for center-hung), weatherproof enclosure (outdoor) |
| **Accessories** | Spare receiving cards (2%), spare power supplies (2%), calibration probe ($800), CMS license ($2,400/yr) |
| **Services** | Commissioning ($2/sqft), demo/disposal ($3,500 if replacement), operator training ($1,500), as-built docs ($2,000) |

**User control:** Each item has a checkbox. Toggle items on/off. Excluded items are saved per display in `excludedBundleItems`.

**The bundle cost is included in the total estimate automatically.**

---

### 6.4 Price-to-Spec Reverse Engineer (🔍 Budget)

**What:** Enter a target budget and display size. The system searches the entire product catalog and shows which LED products fit within that budget, ranked by fit score.

**How it works:**
1. Enter: budget ($), width (ft), height (ft), indoor/outdoor
2. System queries all active products matching environment
3. For each product: calculates cabinet layout, hardware cost, estimated services, margin, bond, tax
4. Filters to products under budget
5. Ranks by fit score (area match × dimension match)
6. Shows top 10 options with: product name, pixel pitch, brightness, cabinet layout, estimated total, headroom, % of budget

**When to use:** Client says "I have $200K for a scoreboard" — instantly see what's possible.

**Benefit:** Answers "what can I get for $X?" in seconds instead of manual trial-and-error.

---

### 6.5 Vendor Spec Drop Zone (📦 Vendor)

**What:** Drop a manufacturer's PDF spec sheet and the system extracts cabinet dimensions, weight, power, pixel pitch, and other specs automatically.

**When to use:** When you receive a new product spec sheet from LG, Yaham, Absen, etc.

**Benefit:** Eliminates manual data entry from spec sheets — seconds instead of minutes.

---

### 6.6 Vendor RFQ Generator (📤 RFQ)

**What:** Auto-generates a professional Request for Quote email to LED manufacturers with your display specs, quantities, and ANC standard terms.

**How it works:**
1. Click RFQ after finalizing display specs
2. System builds email with: display dimensions, pixel pitch, quantity, environment, delivery requirements
3. Copy email or send directly

**When to use:** After finalizing specs, generate one RFQ per manufacturer.

**Benefit:** Professional RFQ in 10 seconds instead of writing emails from scratch.

---

### 6.7 Liability Hunter / SOW Scanner (🛡️ Risk)

**What:** Upload a SOW, RFP, or contract. The system scans it against a **20-point checklist** of required clauses:

| # | Check | What It Looks For |
|---|-------|------------------|
| 1 | Payment Terms | Net-30/60/90, milestone payments |
| 2 | Liability Cap | Maximum liability clause |
| 3 | Indemnification | Who indemnifies whom |
| 4 | Change Order Process | How scope changes are handled |
| 5 | Force Majeure | Acts of God, pandemic, supply chain |
| 6 | Warranty Terms | Duration, coverage, exclusions |
| 7 | Liquidated Damages | Penalties for late delivery |
| 8 | Insurance Requirements | GL, Workers Comp, Umbrella |
| 9 | Termination Clause | How either party can exit |
| 10 | IP Ownership | Who owns the work product |
| 11-20 | + 10 more | Dispute resolution, prevailing wage, bonding, retention, etc. |

**Output:** Risk score per category, overall risk level, specific clause recommendations.

**When to use:** Before signing ANY contract or SOW.

**Benefit:** Catches liability gaps that could cost $50K+ in unprotected exposure.

---

### 6.8 Revision Radar / Delta Scanner (🔀 Delta)

**What:** Upload an original and revised cost analysis Excel. The system diffs them section-by-section, highlights every change, and shows the dollar impact.

**When to use:** When a client sends an addendum or revised scope.

**Benefit:** Spot hidden cost changes in seconds instead of line-by-line comparison.

---

### 6.9 Visual Cut-Sheet Automator (📄 Cuts)

**What:** Generates per-display spec sheets with product specs, cabinet layout, power/weight/resolution stats, and installation notes. Ready for submittal packages.

**When to use:** Before submitting a proposal. Generate cut sheets for each display.

**Benefit:** One-click submittal-ready spec sheets instead of manual formatting.

---

### 6.10 Lux AI Copilot (💬 Lux)

**What:** Chat with Lux about your estimate in real-time. Lux sees your full estimate data — all displays, costs, margins, bundle items.

**Example questions:**
- "What's the cost breakdown for Display 1?"
- "How can I reduce the total by 15%?"
- "What's the margin on the ribbon boards?"
- "Explain the bundle items for the scoreboard"
- "What if we switch to 6mm instead of 4mm?"

**When to use:** Anytime you need help understanding costs, exploring alternatives, or explaining numbers to a client.

**Benefit:** AI assistant that understands your exact estimate — no copy-pasting needed.

---

<a id="pdf-filter"></a>
## 7. RFP PDF FILTER

**URL:** `/tools/pdf-filter`

### What It Does
Upload a massive RFP PDF (500-2,500 pages). The system scores every page for relevance to LED/AV work, then lets you drag pages between Keep and Discard piles.

### How It Works
1. **Upload PDF** — drag & drop or file picker
2. **Text extraction** — extracts text from every page
3. **AI scoring** — each page scored for relevance using keyword matching + AI classification
4. **Vision analysis** — for drawing pages, uses AI vision to categorize (electrical, structural, architectural, LED-specific)
5. **Triage view** — two columns: Keep (relevant) and Discard (irrelevant)
6. **Drag & drop** — move pages between columns, reorder
7. **Export** — build filtered PDF with only the pages you kept
8. **Metadata extraction** — auto-extracts project name, client, location, deadlines

### Scoring System
- Text pages: keyword matching against LED/AV terminology presets
- Drawing pages: AI vision categorization (electrical, structural, architectural, etc.)
- Confidence scores per page
- Threshold slider to adjust sensitivity

### Key Sections It Looks For
- Section 11 06 60 — Display Schedule (quantities/dimensions)
- Section 11 63 10 — LED Display Systems (technical specs)
- Division 11 — General LED display requirements
- Any mention of: scoreboard, ribbon, fascia, marquee, video board

---

<a id="ai-chat"></a>
## 8. AI CHAT (GLM-5)

**URL:** `/chat`

### What It Does
Direct chat with GLM-5 AI model via Z.AI API. No middleman (AnythingLLM removed from this pipeline).

### Features
- **Streaming responses** — text appears as the model generates
- **Thinking/Reasoning accordion** — see the model's internal reasoning (if model supports `reasoning_content`)
- **Markdown rendering** — tables, code blocks, lists, headings all render properly
- **Edit & resend** — click edit on any user message, modify, resend from that point
- **Retry** — regenerate any assistant response
- **Copy** — one-click copy to clipboard
- **Delete** — remove message pairs
- **New Chat** — reset conversation
- **System Prompt editor** — click "Prompt" button, edit the AI's instructions, save
- **Export Excel** — every assistant response has an "Export Excel" button

### System Prompt
The default prompt configures the AI as the "ANC Senior Estimator" — a 20-year veteran who runs through the estimator questionnaire internally and presents 3 options (Budget/Recommended/Premium).

You can change the prompt to anything via the Prompt button.

---

<a id="client-portal"></a>
## 9. CLIENT SHARE PORTAL

**URL:** `/share/[hash]` (each project gets a unique share link)

### What Clients See
- **Branded proposal view** — ANC-styled PDF rendering
- **Status tracker** — Draft → Under Review → Approved → Signed
- **Annotation mode** — click anywhere on the proposal to drop a pin
- **Voice recording** — record audio notes attached to annotations
- **Change request form** — submit text-based change requests
- **Screenshot capture** — auto-captures annotated areas
- **Comment threading** — back-and-forth between client and ANC team

### What ANC Team Sees
- All annotations with pins on the proposal
- Voice recordings transcribed
- Change requests with status (Open/Resolved)
- Activity log of all client interactions

---

<a id="pipeline"></a>
## 10. PIPELINE VIEW

**URL:** `/pipeline`

Kanban-style board showing all projects organized by status:
- **Draft** → **Approved** → **Signed** → **Closed**
- Drag projects between columns to change status
- Each card shows: client name, total amount, last updated

---

<a id="admin"></a>
## 11. ADMIN PAGES

### Product Catalog (`/admin/products`)
- 13+ Yaham LED products loaded
- Each product has: manufacturer, model number, display name, pixel pitch, max brightness (nits), environment (indoor/outdoor), cabinet dimensions (mm), weight, power, cost per sqft
- Used by: estimator calculations, reverse engineer, auto-RFP product matching
- Admin can add/edit/deactivate products

### Rate Card (`/admin/rate-card`)
- All pricing constants used by the calculation engine
- LED cost per sqft by pixel pitch
- Service rates: install, electrical, PM, engineering
- Margin presets per tier (Budget/Proposal/LOI)
- Bond rate, tax rate
- Warranty escalation rate
- Equipment rental rates
- Changes here affect ALL new estimates immediately

### Users (`/admin/users`)
- Role-based access control (RBAC)
- Roles: ADMIN, ESTIMATOR, PROPOSAL_LEAD, PRODUCT_EXPERT, VIEWER
- Each role sees different sidebar items and has different permissions

### Pricing Logic (`/admin/pricing-logic`) — Beta
- Visual editor for pricing rules
- Experimental — not yet production-ready

---

<a id="copilot"></a>
## 12. COPILOT (Dual-Brain AI)

The floating copilot panel (bottom-right on dashboard) uses a dual-brain architecture:

| Brain | Model | What It Handles |
|-------|-------|----------------|
| **Kimi (Vision)** | Kimi K2.5 via Puter.js | Takes a screenshot of the current page, understands what you're looking at, handles UI commands and field changes |
| **AnythingLLM (Knowledge)** | RAG workspace | Database queries, product lookups, project data, rate card info |

**Router:** Keywords like "product catalog", "search the database", "@agent" go to AnythingLLM. Everything else goes to Kimi.

**Quick actions on dashboard:**
- "What's my total pipeline value?"
- "Which projects need attention?"
- "Start a new budget proposal"
- "Open [client name]"

---

<a id="phase-2"></a>
## 13. PHASE 2 PROPOSAL

### What's Already Built (Phase 1 Complete)

| # | Feature | Status | Where |
|---|---------|--------|-------|
| 1 | Excel → PDF (Mirror Mode) | ✅ Live | `/projects/new` → Upload Excel |
| 2 | Intelligence Mode (Estimator Wizard) | ✅ Live | `/estimator` |
| 3 | Auto-RFP Response | ✅ Live | Estimator toolbar → Auto-RFP |
| 4 | Smart Assembly Bundle (20+ rules) | ✅ Live | Estimator toolbar → Bundle |
| 5 | Price-to-Spec Reverse Engineer | ✅ Live | Estimator toolbar → Budget |
| 6 | Vendor Spec Drop Zone | ✅ Live | Estimator toolbar → Vendor |
| 7 | Vendor RFQ Generator | ✅ Live | Estimator toolbar → RFQ |
| 8 | Liability Hunter (20-point scanner) | ✅ Live | Estimator toolbar → Risk |
| 9 | Revision Radar (Delta Scanner) | ✅ Live | Estimator toolbar → Delta |
| 10 | Visual Cut-Sheet Automator | ✅ Live | Estimator toolbar → Cuts |
| 11 | Lux AI Copilot (in-estimator) | ✅ Live | Estimator toolbar → Lux |
| 12 | RFP PDF Filter (text + vision) | ✅ Live | `/tools/pdf-filter` |
| 13 | Product Catalog (13+ products) | ✅ Live | `/admin/products` |
| 14 | Rate Card Management | ✅ Live | `/admin/rate-card` |
| 15 | Client Share Portal (annotate + voice) | ✅ Live | `/share/[hash]` |
| 16 | Pipeline Kanban | ✅ Live | `/pipeline` |
| 17 | Role-Based Access Control | ✅ Live | `/admin/users` |
| 18 | AI Chat (GLM-5 direct) | ✅ Live | `/chat` |
| 19 | Dashboard Copilot (dual-brain) | ✅ Live | Dashboard floating panel |
| 20 | Cabinet Tetris (layout calculator) | ✅ Live | Excel preview → Cabinet Layout tab |
| 21 | Profit Shield (reverse margin calc) | ✅ Live | Set target price in estimator |
| 22 | Estimate Auto-Save | ✅ Live | Saves to DB automatically |
| 23 | Estimate Duplicate | ✅ Live | Estimator toolbar → Duplicate |
| 24 | Estimate → Proposal Convert | ✅ Live | Estimator toolbar → To Proposal |
| 25 | Brief Me (AI project summary) | ✅ Live | Dashboard → project card |
| 26 | 3D Arena Preview | ✅ Live | Estimator toolbar → 3D |

### Phase 2 Proposed Features (8 weeks)

| # | Feature | Who Benefits | Time | Why It Matters |
|---|---------|-------------|------|---------------|
| 1 | **Multi-Vendor Option Compare** | Natalia | 1 week | Compare Yaham vs LG vs Absen side-by-side |
| 2 | **Export All 3 Tiers** (Budget→Proposal→LOI) | Natalia | 3 days | Same data, three documents, one button |
| 3 | **Warranty/Service Contract Calculator** | Matt, Jireh | 1 week | 10-year TCO with compound escalation |
| 4 | **Client Portal Enhancements** | Natalia, Clients | 1 week | Approve + comment + status tracker |
| 5 | **Bid/No-Bid Scorecard** | Jeremy | 1 week | Score RFPs before spending 20-40 hours |
| 6 | **Salesforce Integration** | Jireh, Sales | 1 week | Push deal data into Salesforce Opportunities |
| 7 | **Proof of Performance Reporting** | Eric, Jireh | 2 weeks | Branded reports proving sponsor ads ran |

**Strategic position:** We are the Estimation & Proposal Brain. Salesforce is the Relationship & Pipeline Tracker. We complement, not compete.

---

<a id="working-session"></a>
## 14. WORKING SESSION QUESTIONS

**For Jeremy (RFP/Sales):**
- How many RFPs per month? How many pages average?
- What's the biggest time waste in the RFP process?
- Would a Bid/No-Bid scorecard actually change decisions?

**For Matt (Estimation):**
- What calculations do you do manually that the system should automate?
- Is the warranty/service contract a standard part of every deal?
- How often do clients ask for multi-vendor comparisons?

**For Jack:**
- What reporting do you need that doesn't exist?
- How do you track project profitability today?

**For Eric (Operations):**
- How do you currently generate proof of performance for sponsors?
- What data do you have from vSOFT/LiveSync?
- How many sponsor reports per month?

**For Jireh (Sales/Revenue):**
- What Salesforce fields matter most for deal tracking?
- Would automatic sync from our platform to Salesforce save time?
- What's the sponsor renewal process look like?

---

<a id="checklist"></a>
## 15. PRE-CALL CHECKLIST

### Verify These Work

- [ ] **Login** — go to URL, log in
- [ ] **Dashboard** — projects visible, stats showing, greeting works
- [ ] **New Project → Mirror Mode** — upload Excel, see PDF preview
- [ ] **New Estimate** — create estimate, add display, see live calculations
- [ ] **Bundle** — after adding display, click Bundle, see suggested accessories
- [ ] **Reverse Engineer** — click Budget, enter $200K / 20×12 / indoor, see options
- [ ] **PDF Filter** — upload test PDF, see page scoring
- [ ] **Chat** — send message, get GLM-5 response
- [ ] **Share link** — open existing share link, verify it renders
- [ ] **Product Catalog** — `/admin/products`, products listed
- [ ] **Rate Card** — `/admin/rate-card`, values populated
- [ ] **Pipeline** — `/pipeline`, projects in kanban

### Have Ready

- [ ] Real ANC Excel file for Mirror Mode demo
- [ ] Sample RFP PDF (100+ pages) for PDF Filter demo
- [ ] This doc open for reference
- [ ] Screen share ready
- [ ] Notes app for action items

### Known Limitations (Be Honest)

| Issue | Status | Workaround |
|-------|--------|-----------|
| Some complex Excel layouts may not parse perfectly | Known | Manual edit after upload |
| AI Chat system prompt may need tuning | New | Edit via Prompt button |
| Templates section not built | Planned | Use existing project as template |
| Notifications not built | Planned | — |
| Salesforce not connected | Proposed Phase 2 | Manual data entry |

---

## ELEVATOR PITCH

> "The ANC Proposal Engine has 26 production features. Upload your Excel, get a branded PDF. Build an estimate from scratch with auto-calculations from your rate card. The Smart Assembly Bundler catches $5K-$30K in forgotten accessories per project. The Reverse Engineer tells you what you can build for any budget. The Liability Hunter scans contracts for 20 risk categories. Filter a 2,000-page RFP down to the 50 pages that matter. Share proposals with clients who can annotate with voice and approve directly. And the AI chat gives your team an estimator that knows your products, your pricing, and your process."

> "Phase 2 takes us from 'faster proposals' to 'smarter business.' Multi-vendor comparison, 3-tier export, warranty calculators, Salesforce sync, and proof of performance reporting that no one else in the industry offers."

---

*Prepared: February 20, 2026*
