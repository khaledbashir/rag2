# ANC Unified Platform
### One System. Zero Licensing. Full Ownership.

---

## The Problem

ANC currently runs on fragmented tools:

| Tool | What It Does | Cost | Pain |
|------|-------------|------|------|
| **Salesforce** | CRM, accounts, pipeline | Per-seat licensing + customization fees | "Every time we need something done, it costs tons of money" — Charlie |
| **HubSpot** | Marketing campaigns | Per-seat licensing | Separate system, separate data |
| **Microsoft Dynamics** | Under evaluation | Per-seat licensing | Would add another system, not reduce them |
| **Excel** | Proposals, pricing, scoping | Free but manual | No automation, no version control, emailed back and forth |
| **Scattered tools** | Ticketing, service contracts, reporting | Various | Nothing talks to each other |

**Result:** 60 employees across 5+ systems, paying licensing fees on each, with data siloed everywhere.

---

## The Solution

**One platform. Three products. Zero per-seat fees.**

```
┌─────────────────────────────────────────────────────────────┐
│                    ANC UNIFIED PLATFORM                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │     CRM      │  │   Proposal   │  │     Service       │  │
│  │              │  │    Engine    │  │    Dashboard      │  │
│  │  Accounts    │  │              │  │                   │  │
│  │  Contacts    │  │  Mirror Mode │  │  Venues           │  │
│  │  Pipeline    │  │  Intel Mode  │  │  Technicians      │  │
│  │  Forecasting │  │  RFP Analyzer│  │  Service Tickets  │  │
│  │  Dashboards  │  │  AI Copilot  │  │  Game-Day Events  │  │
│  │  Reporting   │  │  PDF Export  │  │  Contract Tracker │  │
│  │              │  │  Excel I/O   │  │                   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                 │                    │             │
│         └─────────────────┼────────────────────┘             │
│                           │                                  │
│                    Shared Data Layer                          │
│              (One database, one login, one URL)               │
└─────────────────────────────────────────────────────────────┘
```

ANC owns the platform, the code, the data, and the infrastructure. No vendor lock-in. No per-seat fees. Unlimited users.

---

## What Already Exists (Built & Running)

### CRM — Live Now
https://abc-twenty.izcgmb.easypanel.host

| Feature | Status | Details |
|---------|--------|---------|
| **Accounts** | **3,628 migrated** | All Salesforce accounts imported with League, Region, Status, Revenue Type |
| **Contacts** | **19,000+ migrating** | Linked to accounts, with titles, roles, emails, phones |
| **Opportunities** | **8,385 migrating** | Stage, bid status, deal size, close dates, linked to accounts |
| **Tasks** | **2,000 imported** | From Salesforce |
| **Pipeline Board** | **Live** | Kanban view — drag deals across stages (New → Screening → Proposal → Customer) |
| **Bid Tracker** | **Live** | Kanban view — RFP Received → Scoping → Submitted → Won/Lost |
| **Company Views** | **Live** | By League (NFL/NBA/NCAA), By Status (Prospect/Active), By Venue Type |
| **Sales Command Center** | **Live** | Dashboard: pipeline value, deal count, account count, avg deal size, charts |
| **Account Intelligence** | **Live** | Dashboard: league pie, region pie, venue types, lifecycle, revenue streams |
| **Custom Fields** | **13 on Company, 5 on Person, 3 on Opportunity** | ANC-specific: League, Conference, Venue Type, Service Status, Deal Size, Bid Status, etc. |
| **Venues** | **49 physical locations** | Linked to parent companies (multi-venue support) |
| **Technicians** | **25 staff** | Field operations team |
| **Service Tickets** | **680+** | Synced every 15 min from Services Dashboard |
| **Game-Day Events** | **500+** | Synced every 15 min from Services Dashboard |

### Proposal Engine — Live Now
https://proposals.anc.com

| Feature | Status | Details |
|---------|--------|---------|
| **Mirror Mode** | **Production** | Upload Excel → exact PDF reproduction. Natalia's primary workflow |
| **Intelligence Mode** | **Production** | Build proposals from scratch with margin calculations |
| **RFP Analyzer** | **Production** | Upload RFP PDF → auto-extract screens, dimensions, requirements |
| **Budget Estimator** | **Production** | Interactive questionnaire → full budget workbook |
| **AI Copilot** | **Production** | Natural language: "set margin to 35%" → updates the proposal |
| **Product Catalog** | **Production** | 22 Yaham products + LG, Absen, Daktronics, Samsung |
| **PDF Generation** | **Production** | 4 document modes: Budget, Proposal, LOI, Contract |
| **Excel Export** | **Production** | 8 export engines, 5-16 sheets per workbook |
| **Spec Sheets** | **Production** | Auto-generated technical specifications |
| **SOW Generator** | **Production** | Scope of work documents |
| **Responsibility Matrix** | **Production** | Client vs ANC responsibility breakdown |
| **Shared Links** | **Production** | Public share URLs for client review |
| **Multi-Currency** | **Production** | USD, CAD, EUR, GBP |

**By the numbers:** 144 API routes, 33 pages, 214 components, 13 PDF templates, 33 data models

### Service Dashboard — Live Now

| Feature | Status | Details |
|---------|--------|---------|
| **Venue Management** | **Production** | Track all service venues with contact info |
| **Technician Scheduling** | **Production** | Assign field staff to venues and events |
| **Service Tickets** | **Production** | Create, assign, track, resolve support tickets |
| **Game-Day Events** | **Production** | Schedule and staff live events |
| **CRM Sync** | **Production** | Auto-syncs to Twenty CRM every 15 minutes |

---

## Jireh's Requirements — Mapped

From Jireh's CRM requirements document (March 30, 2026):

### CRM — Account Management

| Requirement | Status | How |
|-------------|--------|-----|
| **Accounts** | Done | 3,628 accounts migrated from Salesforce |
| **Opportunities** (Technology, Venue Services, Media & Sponsorships) | Done | 8,385 opportunities with pipeline stages and bid tracking |
| **Contacts** | Done | 19,000+ contacts linked to accounts |
| **Forecasting / booked business, reporting** | Done | Sales Command Center dashboard + Account Intelligence dashboard |
| **Marketing campaigns (replace HubSpot)** | Phase 3 | Twenty supports email campaigns — scoped separately |

### Proposal Engine

| Requirement | Status | How |
|-------------|--------|-----|
| **RFP Analyzer** | Done | Upload PDF → auto-extract requirements, screens, dimensions |
| **Proposal Engine** | Done | Full proposal creation with Mirror + Intelligence modes |
| **Product Sheets (approved products)** | Done | 22 products, 5 manufacturers, with tech specs |
| **Venue Services** (service contracts, graphics, maintenance) | Phase 3 | Service Contract Engine planned for April |
| **Proposals, LOI, Contracts** | Done | 4 document modes with PDF generation |

### Venue Services

| Requirement | Status | How |
|-------------|--------|-----|
| **Joe's domain** | Done | Service Dashboard with venues, technicians, tickets, events |

### CRM Questions

| Question | Answer | Status |
|----------|--------|--------|
| **1. Microsoft Outlook integration?** | Twenty has native IMAP/SMTP + Outlook OAuth | Config needed |
| **2. Slack integration?** | Twenty has webhook-based Slack + native connector | Config needed |
| **3. Weekly automated summaries?** | Workflow automation: cron trigger → aggregate data → email | Build in Phase 2 |
| **4. Project Management handoff?** | Deal won → auto-create project tasks + assign PM | Build in Phase 2 |
| **5. Accounting/Finance (Procore, QuickBooks)?** | Both have APIs. Webhook: deal won → create invoice | Phase 3 scope |

---

## Platform Architecture

### How the Three Products Connect

```
Twenty CRM                    Proposal Engine              Service Dashboard
─────────────                ──────────────               ─────────────────
Click Opportunity    ──────→  Opens proposal
  "Panthers LED"              for that project

Deal Won             ──────→  Archive proposal   ──────→  Create service record
                              Generate contract            Schedule technicians

New RFP uploaded     ←──────  Auto-create
                              Opportunity in CRM

Service ticket       ←──────────────────────────────────  Auto-sync to CRM
  created                                                  every 15 min

Weekly digest        ──────→  Include proposal    ──────→  Include service
  email                       pipeline stats               ticket stats
```

### How Users Experience It

**Jireh (Services Lead):**
1. Opens Twenty CRM → sees his dashboard with pipeline, accounts, service tickets
2. Clicks an opportunity → sees deal details, contacts, linked proposals
3. Clicks "Open Proposal" → lands in the full Proposal Engine for that project
4. Gets weekly email: deals won/lost, pipeline value, open tickets

**Natalia (Proposal Lead):**
1. Opens Proposal Engine → uploads Excel or RFP
2. Generates proposal PDF
3. Opportunity auto-created in CRM with deal value and status
4. Pipeline dashboards update in real-time

**Charlie (Finance/Ops):**
1. Opens CRM dashboard → sees forecasting: booked revenue, pipeline, closed won/lost
2. Filters by quarter, by rep, by department
3. Exports to QuickBooks (future integration)

**Matt/Jeremy (Estimators):**
1. RFP comes in → uploaded to RFP Analyzer
2. Auto-extracts requirements → creates opportunity in CRM
3. Build proposal in Intelligence Mode with margin calculations
4. Export Excel for internal review, PDF for client

---

## Roadmap

### Phase 1: CRM Foundation — COMPLETE
*Delivered March 30, 2026*

- [x] Salesforce data migration (33,665 records)
- [x] Custom fields for ANC workflow (League, Region, Venue Type, Service Status, etc.)
- [x] Pipeline Kanban boards (by stage, by bid status)
- [x] Company views (by league, by status, by venue type)
- [x] Sales Command Center dashboard (7 widgets)
- [x] Account Intelligence dashboard (6 widgets)
- [x] Service ticket + event sync from Services Dashboard

### Phase 2: Deep Linking & Automation
*Target: April 2026*

- [ ] Opportunity → Proposal Engine link (one-click from CRM to proposal)
- [ ] Auto-create CRM opportunity when proposal is started
- [ ] Outlook email sync (team email logged against contacts)
- [ ] Slack notifications (deal won, new RFP, bid due soon)
- [ ] Weekly automated digest (pipeline health, workload, deals closed)
- [ ] Stale deal alerts (no activity in 14 days)
- [ ] Warranty expiration alerts (90/60/30 day warnings)
- [ ] Navigation items in CRM sidebar ("Proposals", "Service Dashboard")

### Phase 3: Service Contracts & Integrations
*Target: May 2026*

- [ ] Service Contract Engine (generate, track, renew service agreements)
- [ ] QuickBooks integration (deal won → invoice)
- [ ] Procore integration (project management handoff)
- [ ] Marketing email campaigns (replace HubSpot)
- [ ] Custom reporting (revenue by quarter, by rep, by department)
- [ ] AI Agent in CRM ("What deals are closing this month?")

### Phase 4: Full Unification
*Target: Q3 2026*

- [ ] Single sign-on across all three products
- [ ] Unified search (find anything across CRM + proposals + services)
- [ ] Mobile-responsive CRM views
- [ ] Client portal (clients log in to see their proposals and service status)
- [ ] Advanced forecasting with historical data

---

## Cost Comparison

### Current (Salesforce + HubSpot)

| Item | Cost | Frequency |
|------|------|-----------|
| Salesforce licenses | ~$75-150/user/month | Monthly |
| Salesforce customization | $5,000-50,000+ per project | As needed |
| HubSpot licenses | ~$45-800/month | Monthly |
| Data migration (to Dynamics) | $20,000-100,000+ | One-time |
| **For 60 users at ~$100/seat** | **~$6,000/month** | **$72,000/year** |

### ANC Unified Platform

| Item | Cost | Frequency |
|------|------|-----------|
| Platform licensing | **$0** | Forever |
| Per-seat fees | **$0** | Unlimited users |
| Hosting (VPS) | ~$50-100/month | Monthly |
| Maintenance & development | Negotiable | Monthly |
| **Total infrastructure** | **~$100/month** | **$1,200/year** |

**Annual savings: ~$70,000+ in licensing alone**, before accounting for eliminated customization fees.

---

## What Makes This Different

| | Salesforce | Microsoft Dynamics | ANC Platform |
|---|---|---|---|
| Per-seat cost | $75-300/mo | $65-210/mo | **$0** |
| Customization | Pay consultants | Pay consultants | **Built in-house, unlimited** |
| Proposal generation | Not included | Not included | **Built-in, production-ready** |
| RFP analysis | Not included | Not included | **Built-in, AI-powered** |
| Service ticketing | Extra add-on | Extra add-on | **Built-in, auto-synced** |
| Product catalog | Basic | Basic | **LED-specific with specs** |
| Data ownership | Salesforce owns infra | Microsoft owns infra | **ANC owns everything** |
| Users | Pay per seat | Pay per seat | **Unlimited** |
| AI | Einstein ($$$) | Copilot ($$$) | **Built-in, no extra cost** |

---

## Technical Details

| Component | Technology | Hosting |
|-----------|-----------|---------|
| CRM | Twenty CRM (open source) | ANC VPS (EasyPanel) |
| Proposal Engine | Next.js 15, React 18, TypeScript | ANC VPS (EasyPanel) |
| Service Dashboard | Node.js, PostgreSQL | ANC VPS (EasyPanel) |
| Database | PostgreSQL | ANC VPS |
| AI/RAG | AnythingLLM + multiple AI providers | ANC VPS |
| PDF Generation | Browserless (headless Chrome) | ANC VPS |
| File Storage | Local + S3-compatible | ANC VPS |

All services run on ANC's own server infrastructure. No third-party dependencies for core functionality.

---

## Next Steps

1. **Jireh demos current Salesforce workflow** → we replicate and improve it in Twenty
2. **Charlie exports CSV backup** → we validate completeness against our migration
3. **Team gets access** → invite links for all users who need CRM access
4. **Phase 2 kickoff** → deep linking + automation + email/Slack (April)

---

*Prepared by Ahmad Basheer | Assisted.VIP*
*Platform development: March 2026*
