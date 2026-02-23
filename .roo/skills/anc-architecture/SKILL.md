---
name: anc-architecture
description: Onboarding skill for the ANC Proposal Engine. Use when you need to understand the tech stack, data model, pricing logic, RFP pipeline, or Excel/PDF processing. Keywords: ANC, proposal, LED, stadium, pricing, RFP, Excel, PDF, Mirror Mode, Intelligence Mode, AnythingLLM, Mistral OCR, Gemini.
---

# ANC Proposal Engine — Architecture Onboarding

Quick-reference skill for understanding the ANC Proposal Engine codebase.

## When to Use This Skill

- You're new to the project and need a technical overview
- You need to modify pricing calculations, Excel parsing, or PDF generation
- You're working on the RFP extraction pipeline
- You need to understand the database schema or data flow
- You're debugging issues related to margin math, verification, or state management

## When NOT to Use This Skill

- You're making UI-only changes (use standard React/Next.js patterns)
- You're adding new translations (use i18n patterns)
- You're working on unrelated projects

---

## Project Overview

**What**: Proposal/estimation platform for ANC Sports Enterprises — LED display integrations for NFL, NBA, MLS, NCAA stadiums.

**Users**:
- **Natalia** (Proposal Lead): Imports Excel → generates PDFs. Needs pixel-perfect output. NO MATH — her Excel is truth.
- **Matt** (VP Sales): Builds proposals from scratch. Needs real margin calculations.
- **Jeremy** (Estimator): Uses RFP analyzer and estimator tools.

**Business Model**: $4K platform + $500-800/mo maintenance per venue.

---

## Tech Stack (30-Second Version)

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router), React 18, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth v5 (JWT) |
| AI/ML | Mistral OCR, Gemini 2.0 Flash, AnythingLLM (RAG) |
| Excel | xlsx (parse), ExcelJS (generate) |
| PDF | Browserless/Puppeteer |
| Hosting | Docker on EasyPanel (Hetzner VPS) |

---

## Two Modes — Know the Difference

### Mirror Mode (Natalia)
- **Parser**: [`services/pricing/pricingTableParser.ts`](services/pricing/pricingTableParser.ts)
- **Rule**: Excel → exact PDF reproduction. NO MATH.
- **6 Golden Rules**: No math, exact order, trust the grand total, don't recalculate, don't reorder, don't guess.

### Intelligence Mode (Matt/Jeremy)
- **Parser**: [`services/proposal/server/excelImportService.ts`](services/proposal/server/excelImportService.ts)
- **Math**: [`lib/estimator.ts`](lib/estimator.ts) — real margin calculations
- **Formula**: `sellingPrice = cost / (1 - marginPercent)` (divisor model, NOT markup)

---

## Key Files (Memorize These)

| File | Purpose |
|------|---------|
| [`prisma/schema.prisma`](prisma/schema.prisma) | Database schema — start here for data model |
| [`lib/pricingMath.ts`](lib/pricingMath.ts) | Round-then-sum invariant, table totals |
| [`lib/estimator.ts`](lib/estimator.ts) | Margin math, screen pricing, bond/tax |
| [`services/rfp/unified/analyzeRfp.ts`](services/rfp/unified/analyzeRfp.ts) | RFP pipeline orchestrator |
| [`services/rfp/unified/types.ts`](services/rfp/unified/types.ts) | ExtractedLEDSpec, AnalyzedPage types |
| [`services/proposal/server/excelImportService.ts`](services/proposal/server/excelImportService.ts) | Excel → proposal parsing |
| [`services/proposal/server/exportFormulaicExcel.ts`](services/proposal/server/exportFormulaicExcel.ts) | Audit Excel with live formulas |
| [`services/rfp/rateCardLoader.ts`](services/rfp/rateCardLoader.ts) | DB-first rate resolution |
| [`lib/anything-llm.ts`](lib/anything-llm.ts) | RAG integration |

---

## Database Schema (Core Tables)

```
Workspace ─┬─ Proposal ─┬─ ScreenConfig ─── CostLineItem
           │            ├─ ManualOverride
           │            ├─ ProposalVersion (immutable snapshots)
           │            ├─ RfpDocument
           │            └─ ActivityLog
           └─ User
```

**Key Fields on Proposal**:
- `calculationMode`: MIRROR | INTELLIGENCE | ESTIMATE
- `status`: DRAFT → PENDING_VERIFICATION → AUDIT → APPROVED → SIGNED (locked)
- `pricingDocument`: Full Excel parse (JSON)
- `marginAnalysis`: Non-LED items breakdown
- `verificationManifest`: Audit trail for every computed value

---

## RFP Pipeline (6 Steps)

1. **Upload PDF** → Mistral OCR extracts structured markdown per page
2. **Classify Pages** → Text heuristics categorize: led_specs, drawing, cost_schedule, etc.
3. **Extract Data** → Gemini vision for drawings, regex+AI for text
4. **Store** → `ExtractedLEDSpec` → `ScreenConfig` in Postgres
5. **Generate Excel** → Subcontractor bid workbooks via ExcelJS
6. **Price & Export** → Apply margins, generate proposal PDF

**Pipeline Entry**: [`services/rfp/unified/analyzeRfp.ts`](services/rfp/unified/analyzeRfp.ts)

---

## Pricing Logic — The Critical Bits

### Divisor Model (NOT Markup)
```typescript
// CORRECT: Natalia Math
sellPrice = cost / (1 - marginPercent);
// Example: $100 cost at 20% margin = $100 / 0.8 = $125

// WRONG: Markup
sellPrice = cost * (1 + marginPercent); // DON'T DO THIS
```

### Round-Then-Sum Invariant
Every value is rounded to display precision BEFORE summing:
```typescript
// From lib/pricingMath.ts
export function roundToDisplay(value: number): number {
    return Math.round(value * DISPLAY_SCALE) / DISPLAY_SCALE;
}
```
This guarantees: `displayedTotal ≡ Σ displayedLineItems + displayedTax + displayedBond`

### Default Rates
| Rate | Value |
|------|-------|
| Bond | 1.5% |
| Default Margin | 30% |
| Sales Tax | 9.5% |
| Steel/Ton | $3,000 |

---

## Workflow & Deployment

**CRITICAL**: No local dev. Workflow is:
1. Write code
2. `git add` + `git commit` + `git push`
3. EasyPanel auto-builds from push (Docker)
4. Done.

**Branch**: `phase2/product-database` (main working branch)

**Production URL**: https://basheer-therag2.prd42b.easypanel.host

**No .env file** — all env vars in EasyPanel dashboard.

---

## Common Gotchas

1. **Auth in Docker**: Must have `secret: process.env.AUTH_SECRET` in BOTH `auth.ts` AND `auth-middleware.ts`
2. **Stale JS chunks**: After deploy, users may need hard refresh (Ctrl+Shift+R)
3. **Prisma migrations**: Uses `npx prisma db push --accept-data-loss` in entrypoint
4. **ExcelJS memory**: Large workbooks can OOM — stream when possible
5. **Browserless timeout**: PDF generation can take 10-30s for large proposals

---

## Quick Navigation

| I need to... | Go to |
|--------------|-------|
| Understand data model | [`prisma/schema.prisma`](prisma/schema.prisma) |
| Fix pricing math | [`lib/pricingMath.ts`](lib/pricingMath.ts), [`lib/estimator.ts`](lib/estimator.ts) |
| Modify Excel import | [`services/proposal/server/excelImportService.ts`](services/proposal/server/excelImportService.ts) |
| Change PDF template | [`app/components/templates/proposal-pdf/ProposalTemplate5.tsx`](app/components/templates/proposal-pdf/ProposalTemplate5.tsx) |
| Debug RFP extraction | [`services/rfp/unified/analyzeRfp.ts`](services/rfp/unified/analyzeRfp.ts) |
| Update rate cards | [`services/rfp/rateCardLoader.ts`](services/rfp/rateCardLoader.ts) or `/admin/rate-card` |
| Add AI features | [`lib/anything-llm.ts`](lib/anything-llm.ts), [`services/AnythingLLMService.ts`](services/AnythingLLMService.ts) |

---

## Related Documentation

- Project rules: [`.roo/rules/01-project-overview.md`](.roo/rules/01-project-overview.md) through [`.roo/rules/08-gotchas-and-patterns.md`](.roo/rules/08-gotchas-and-patterns.md)
- Detailed architecture: Read [`references/ARCHITECTURE.md`](references/ARCHITECTURE.md) for deep dives
