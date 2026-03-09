# ANC Stakeholders & Personas

## Company
- **ANC** — LED display integration company for stadiums/arenas
- Partners: LG, Yaham (LED manufacturers)
- Clients: NFL, NBA, MLS, NCAA venues
- **Pricing**: $4,000 platform fee + $500-$800/month maintenance

## Key People

### Natalia — Proposal Lead (PRIMARY USER)
- **Authority**: HIGH — she's the one who decides if the tool works
- **Usage**: 70-75% of all proposal engine use
- **Workflow**: Mirror Mode — uploads Excel from estimators, expects EXACT reproduction
- **Pain points**: "If my numbers don't match, I can't use this"
- **Golden Rules**: NO MATH, EXACT ORDER, TRUST GRAND TOTAL (see mirror-mode-rules.md)
- **Needs**: Speed, accuracy, professional PDF output, client-facing share links
- **Communication style**: Direct, fast-paced, drops multiple items in one Slack thread. Expects "I got it" responses, not long explanations.
- **Expectation on response time**: No expectation of immediate response. SF consultants take 3-4 hours. Told Ahmad "don't put crazy pressure on yourself to be always online."
- **Team context**: Estimators (Jeremy, Matt) work until 1-2am, travel for presentations. Testing the platform is low priority vs actual projects.
- **Business advice**: Told Ahmad to share hourly rate starting month 3 — "we'll work off that, makes sense for both sides." Smart, looks out for both parties.
- **OneDrive structure**: `ANC > ANC - Sales > [Letter] > [Venue Name] > [Year folder]` — RFP docs in "RFP Issued Documents" subfolder, cost analysis sheets inside.
- **Offered 30+ real RFPs** with actual estimates for testing RFP analyzer + estimator accuracy. Pick 2024-2026, freshest cost analysis, LED sheet should match displays.
- **Alt pitch knowledge**: 99% of ANC proposals have alternates. Need 2-3 pixel pitch options per display. Only LED cost changes — services/labor/structure stays the same. "Answering all same questions will be stupid."
- **Considers alt pitch CORE functionality** — pushed back hard when Ahmad tried to scope it as new. "Why is this new scope?" She's right — it's simpler than initially feared.

### Matt — Senior Estimator
- **Role**: Builds cost estimates from scratch in Excel
- **Usage**: Intelligence Mode — imports product catalog, builds quotes
- **Needs**: Product database, margin calculator, bulk operations

### Jeremy — RFP/Large Projects
- **Role**: Handles RFPs and large multi-venue projects
- **Usage**: Intelligence Mode + RFP extraction
- **Needs**: RFP parsing, scope extraction, multi-table support
- **Bugs reported (Mar 2026)**: Custom margins not applying (still showing LED 15%, Svc 20%), bond/tax still adding when set to 0. Both FIXED (|| → ?? nullish coalescing).
- **Copilot user**: Hit "error: terminated" when asking about double-sided displays. FIXED (60s timeout + graceful error).
- **Feature request**: Signage/aesthetics options — wants to include visual upgrade packages in estimates. Pending team input.

### Eric — Head of Product
- **Role**: Product decisions, feature prioritization
- **Involvement**: Reviews progress, approves direction
- **Focus**: ROI, time savings, competitive advantage

### Alison — Marketing/Branding
- **Role**: Brand consistency, marketing materials
- **Involvement**: Template design, color schemes, logos
- **Focus**: Professional appearance, brand alignment

## Sentiment (from 8 meetings)
- Natalia: Cautiously optimistic → enthusiastic (after Mirror Mode accuracy improved)
- Matt: Interested but waiting for Intelligence Mode product catalog
- Jeremy: Excited about RFP extraction potential
- Eric: Supportive, wants measurable time savings
- Overall team: Trust is building, adoption depends on accuracy

### Jireh — Estimator
- **Role**: Does actual cost estimates/pricing for proposals
- **Excel format alignment**: Told Natalia that RFP analyzer and estimator excels "should match" and it "shouldn't be hard — it would be choosing one or the other." Decision pending.
- **Works closely with Natalia** on validating LED specs and cost calculations
