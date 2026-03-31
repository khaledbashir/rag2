# ANC Twenty CRM Setup Plan

> Source: Two projects — ANC Proposal Engine + ANC Services Dashboard
> Both feed into this CRM as the single source of truth for the business.

---

## The Big Picture

ANC has three business lines:
1. **Technology** — LED installs (one-time, $100K-$5M per project)
2. **Venue Services** — ongoing operations, game-day support, content management (recurring monthly)
3. **Media/Sponsorships** — ad sales for brands across ANC's venue network (recurring annual)

The CRM needs to track the full lifecycle: prospect → bid → win → install → service → renew.

```
[PROSPECT] → [RFP/BID] → [PROPOSAL] → [WIN] → [INSTALL] → [WARRANTY] → [SERVICE] → [RENEW]
     ↑                                                                         ↓
     └─────────────────────────── NEW OPPORTUNITY ─────────────────────────────┘
```

---

## Phase 1: Core Data (Companies + People + Deals)

### Companies = Venues + Teams + Partners

**Already created (7 custom fields):**
- Venue Type, League/Org, Region, Service Status, Revenue Type, Total LED SqFt, Display Count

**Still needed:**

| Field | Type | Options | Why |
|-------|------|---------|-----|
| Venue Name | TEXT | — | "Bank of America Stadium" (separate from company name "Panthers Stadium LLC") |
| Capacity | NUMBER | — | Seating capacity (impacts project scale) |
| Partner Type | SELECT | CLIENT, MANUFACTURER, SUBCONTRACTOR, CONSULTANT | ANC works with LG, Yaham as manufacturers, not clients |
| Primary Contact | RELATION | → Person | Who Natalia calls first |
| ANC Account Rep | RELATION | → Person | Who at ANC owns this account |
| Contract Start | DATE | — | When the service relationship began |
| Contract End | DATE | — | When warranty/service expires |
| Annual Contract Value | CURRENCY | — | Recurring revenue per year |
| Website | LINK | — | Built into Twenty already |
| Notes | RICH_TEXT | — | Built into Twenty already |

**Seed data to import (from ANC's website):**

| Company | Venue | League | Region | Status |
|---------|-------|--------|--------|--------|
| Panthers Stadium LLC | Bank of America Stadium | NFL | Southeast | Active Install |
| Boston Red Sox | Fenway Park | MLB | Northeast | Active Install |
| Los Angeles Dodgers | Dodger Stadium | MLB | West | Active Install |
| Baltimore Ravens | M&T Bank Stadium | NFL | Northeast | Active Install |
| San Francisco 49ers | Levi's Stadium | NFL | West | Active Install |
| Indiana Pacers/Fever | Gainbridge Fieldhouse | NBA | Midwest | Active Install |
| Cleveland Cavaliers | Rocket Arena | NBA | Midwest | Active Install |
| Milwaukee Brewers | American Family Field | MLB | Midwest | Active Install |
| Washington Commanders | Northwest Stadium | NFL | Northeast | Active Install |
| Washington Nationals | Nationals Park | MLB | Northeast | Active Install |
| Dallas Stars | American Airlines Center | NHL | Southwest | Active Install |
| Notre Dame | Notre Dame Stadium | NCAA | Midwest | Active Install |
| University of Texas | UT Stadium | NCAA | Southwest | Active Install |
| Oregon State | Reser Stadium | NCAA | West | Active Install |
| NBCUniversal | 30 Rock / Studios | Corporate | Northeast | Active Install |
| Westfield | World Trade Center | Retail | Northeast | Active Install |
| MTA | Moynihan Train Hall | Transit | Northeast | Active Install |
| JP Morgan Chase | Flagship Branch | Corporate | Northeast | Active Install |
| MGM | MGM Music Hall | Corporate | Northeast | Active Install |
| Haslam Sports | Community Field | — | Midwest | Prospect |

### People = Contacts at Venues + ANC Team

**Already created (1 custom field):**
- Decision Role

**Still needed:**

| Field | Type | Why |
|-------|------|-----|
| Department | SELECT (Operations, AV/Technology, Facilities, Executive, Finance, Procurement) | Who does what |
| Preferred Contact | SELECT (Email, Phone, Slack, Text) | How to reach them |
| Last Contact Date | DATE | When did we last talk to them |
| Relationship Strength | SELECT (Cold, Warm, Hot, Champion) | How close are we |

**Seed contacts (from meeting transcripts):**

| Name | Company | Role | Department |
|------|---------|------|------------|
| Natalia Kovaleva | ANC | Proposal Lead | Operations |
| Matt | ANC | Senior Estimator | Operations |
| Jeremy | ANC | Senior Estimator | Operations |
| Eric Gruner | ANC | Head of Product | Technology |
| Jireh Billings | ANC | Services Lead | Venue Services |
| Kirsten Savage | ANC | Services Manager | Venue Services |
| John Obropta | ANC | Advertising Lead | Media/Sponsorships |

### Opportunities = Deals + Projects

**Already created (3 custom fields):**
- Deal Size, Project Type, Bid Status

**Still needed:**

| Field | Type | Why |
|-------|------|-----|
| RFP Source | SELECT (Building Connected, Direct, Referral, Cold Outreach) | Where the lead came from |
| RFP Document | LINK | URL to the uploaded RFP in the Proposal Engine |
| Proposal URL | LINK | URL to the generated proposal |
| Expected Close | DATE | When we expect to win/lose |
| Probability | NUMBER | Win probability % |
| LED SqFt | NUMBER | Total display square footage for this project |
| Display Count | NUMBER | Number of screens in this project |
| Manufacturer | SELECT (LG, Yaham, Absen, Daktronics, Samsung, Other) | Which LED manufacturer |
| Union Labor | BOOLEAN | Does this project require union labor? |
| Bond Required | BOOLEAN | Is a performance bond required? |
| Assigned Estimator | RELATION → Person | Who's scoping this |
| Assigned Proposal Lead | RELATION → Person | Who's building the proposal |

---

## Phase 2: Pipeline Stages

### Technology Pipeline (LED Installs)

```
[RFP Received] → [Scoping] → [Bid Submitted] → [Shortlisted] → [Won] → [In Progress] → [Installed] → [Warranty]
                                                                    ↓
                                                                 [Lost]
```

| Stage | What happens | Who owns it |
|-------|-------------|-------------|
| RFP Received | Doc lands from Building Connected or direct | Natalia |
| Scoping | Estimator reviews spec, sizes displays, estimates costs | Matt/Jeremy |
| Bid Submitted | Proposal sent to client | Natalia |
| Shortlisted | Client narrowed to 2-3 bidders | Matt |
| Won | Contract signed | Leadership |
| Lost | Didn't get it (track why) | — |
| In Progress | Active installation | Project Manager |
| Installed | Hardware up, commissioning done | — |
| Warranty | 5-year warranty period active | Jireh/Services |

### Service Pipeline (Recurring)

```
[Service Proposal] → [Negotiating] → [Active] → [Renewal Due] → [Renewed] / [Churned]
```

| Stage | What happens |
|-------|-------------|
| Service Proposal | Scoping ongoing support |
| Negotiating | Price/terms discussion |
| Active | Under active service contract |
| Renewal Due | 90 days before contract end |
| Renewed | Contract extended |
| Churned | Lost the service contract |

### Media Pipeline (Sponsorships)

```
[Lead] → [Pitch] → [Proposal Sent] → [Negotiating] → [Signed] → [Active Campaign] → [Renewal]
```

---

## Phase 3: Automation (Twenty Workflows)

### Workflow 1: New RFP Alert
**Trigger:** Opportunity created with bidStatus = BID_RECEIVED
**Action:** Create task for Natalia: "Review new RFP: {opportunity.name}"

### Workflow 2: Warranty Expiring
**Trigger:** Company.contractEnd < 90 days from now
**Action:** Create task for Jireh: "Service renewal due: {company.name}"

### Workflow 3: Deal Won → Create Service Record
**Trigger:** Opportunity.bidStatus changed to BID_WON
**Action:** Create new Opportunity (Service Pipeline) linked to same company

### Workflow 4: Proposal Engine Integration
**Trigger:** Webhook from Proposal Engine when analysis completes
**Action:** Update Opportunity with LED SqFt, Display Count, Proposal URL

### Workflow 5: Stale Deal Alert
**Trigger:** Opportunity.bidStatus unchanged for 30 days AND not WON/LOST
**Action:** Create task for assigned estimator: "Follow up on {opportunity.name}"

---

## Phase 4: Integration with Existing Systems

### Proposal Engine → CRM

When an RFP is analyzed in the Proposal Engine:
1. Auto-create or update Company in CRM (from extracted project info)
2. Auto-create Opportunity with extracted specs (display count, sqft, client name)
3. Link to the analysis URL
4. Set bidStatus = BID_SCOPING

**API call from Proposal Engine:**
```typescript
// After successful extraction
await fetch('https://abc-twenty.izcgmb.easypanel.host/rest/core/opportunities', {
  method: 'POST',
  headers: { Authorization: `Bearer ${TWENTY_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: `${project.venue} LED ${project.isOutdoor ? 'Outdoor' : 'Indoor'}`,
    dealSize: totalSqFt > 5000 ? 'DEAL_MASSIVE' : totalSqFt > 500 ? 'DEAL_LARGE' : 'DEAL_MEDIUM',
    projectType: 'PROJECT_NEW',
    bidStatus: 'BID_SCOPING',
    companyId: companyId,
  }),
});
```

### ANC Services Dashboard → CRM

When a service event completes:
1. Update Company.serviceStatus
2. Log activity on the Company timeline
3. Create task if follow-up needed

### Building Connected → CRM (Future)

When a new RFP notification arrives:
1. Auto-create Opportunity with bidStatus = BID_RECEIVED
2. Attach RFP document
3. Notify Natalia

---

## Phase 5: Views & Dashboards

### Saved Views to Create

| View | Object | Filter | Sort | Purpose |
|------|--------|--------|------|---------|
| Active Bids | Opportunities | bidStatus NOT IN (WON, LOST, NOBID) | expectedClose ASC | What's Natalia working on |
| NFL Venues | Companies | league = NFL | name ASC | All NFL clients |
| Expiring Warranties | Companies | contractEnd < 90 days | contractEnd ASC | Jireh's renewal list |
| Won This Quarter | Opportunities | bidStatus = WON, createdAt > quarter start | amount DESC | Revenue tracking |
| Prospects | Companies | serviceStatus = PROSPECT | createdAt DESC | New business |
| Massive Deals | Opportunities | dealSize = MASSIVE | createdAt DESC | High-value pipeline |
| By Region | Companies | — | region GROUP | Geographic distribution |

### Dashboard Widgets

1. **Pipeline Value** — total $ by bid stage (bar chart)
2. **Win Rate** — won / (won + lost) this quarter
3. **Active Installs** — count by region (map or bar)
4. **Revenue by Type** — Technology vs Services vs Media (pie)
5. **Upcoming Renewals** — next 90 days (list)

---

## Phase 6: Twenty App (Custom Features)

### App: ANC Proposal Integration

**Objects:**
- `rfpAnalysis` — links an Opportunity to a Proposal Engine analysis (analysisId, displayCount, totalSqFt, extractionConfidence)

**Logic Functions:**
- `sync-proposal` — webhook from Proposal Engine, creates/updates rfpAnalysis
- `check-stale-bids` — cron job, flags opportunities stale > 30 days
- `match-company` — finds or creates company from RFP project info

**Front Components:**
- `ProposalPreview` — inline preview of the scoping workbook inside Twenty
- `PipelineHealth` — visual pipeline with stage counts and value

**AI Skills:**
- `bid-assistant` — "What NFL deals are in scoping? What's our win rate on stadium projects?"
- `venue-enrichment` — "Add all the venue details for this company from our proposal data"

---

## Implementation Order

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1 | Seed the 20+ known ANC venues as Companies | 30 min | Data foundation |
| 2 | Seed ANC team as People + link to "ANC" company | 15 min | Internal contacts |
| 3 | Create missing Company fields (venue name, capacity, contract dates) | 15 min | Complete data model |
| 4 | Create missing Opportunity fields (RFP source, probability, manufacturer) | 15 min | Deal tracking |
| 5 | Create saved views (Active Bids, NFL Venues, Expiring Warranties) | 20 min | Day-1 usability |
| 6 | Wire Proposal Engine → CRM (auto-create opportunity on RFP analysis) | 2 hrs | Pipeline automation |
| 7 | Build Workflow: New RFP → task for Natalia | 30 min | Notifications |
| 8 | Build Workflow: Warranty expiring → task for Jireh | 30 min | Retention |
| 9 | Import historical deals from spreadsheets/memory | 1 hr | Backfill |
| 10 | Build Twenty App: ProposalPreview front component | 2 hrs | In-CRM visibility |

---

## What This Unlocks

**For Natalia:** "Show me all active bids" — one click. No spreadsheet.
**For Matt:** "What's our win rate on stadium projects?" — data-driven.
**For Jireh:** "Which warranties expire this quarter?" — automated alerts.
**For Matt/Leadership:** "Pipeline value by stage" — real-time dashboard.
**For Ahmad:** Proof that the Proposal Engine feeds the CRM automatically. No manual entry. End-to-end.

---

## Schema Summary

```
Company (venue/team/partner)
  ├── venueType, league, region, serviceStatus, revenueType
  ├── totalLedSqFt, displayCount, capacity
  ├── contractStart, contractEnd, annualContractValue
  ├── primaryContact → Person
  └── accountRep → Person

Person (contact)
  ├── decisionRole, department
  ├── relationshipStrength, lastContactDate
  └── company → Company

Opportunity (deal/project)
  ├── dealSize, projectType, bidStatus
  ├── rfpSource, manufacturer, probability
  ├── ledSqFt, displayCount
  ├── unionLabor, bondRequired
  ├── proposalUrl, rfpDocumentUrl
  ├── assignedEstimator → Person
  ├── assignedProposalLead → Person
  └── company → Company

Task (action item)
  ├── linked to Company, Person, or Opportunity
  └── auto-created by workflows

Note (free text)
  └── linked to any record
```
