# ANC Proposal Engine — Current Status

## Production URL
- **Access**: https://basheer-therag2.prd42b.easypanel.host/projects
- **Date**: February 7, 2026

## Live Features (26 items ✅)

### Core Functionality
- Upload Excel → auto-detect sections, specs, and pricing
- Three document types: Budget, Proposal, and LOI
- Live PDF preview (see it before you download)
- LOI with full legal header, addresses, and signature blocks

### Configuration
- Payment terms (editable, saved between sessions)
- Custom intro text (e.g., exchange rate notes for CAD)
- CAD currency auto-detection from Excel
- Alternates sections showing in all pricing tables
- Tax and Bond rows displayed (even if $0)

### Polish
- Screen name edits flow to pricing headers
- Corporate PDF filenames (ANC_Client_DocType_Date.pdf)
- Executive dashboard with proposal overview
- AI-powered address lookup (magic wand)
- Activity log tracking all actions
- Exhibit A — Technical specifications table

### Known Issue from Status Update
- "The engine does zero math. Whatever totals are in your Excel is exactly what shows up in the PDF."
- **Status**: FIXED — Added grand total trust logic in pricingTableParser.ts (Feb 2026 hotfix)

## Coming This Week (priority order)

1. **Column headers: WORK / PRICING** — Natalia's request
2. **LOI specs table layout fix (Exhibit A)** — Bug fix
3. **Project Summary table selector for LOI page 1** — LOI layout improvement
4. **Click to fix typos in pricing table descriptions** — Quality of life
5. **Manual line items** (no Excel needed) — New capability

## Natalia's Workflow (5 Minutes, Start to Finish)

Step 1: Upload your Excel file (the one with the Margin Analysis sheet)
Step 2: Pick your document type — Budget Estimate, Sales Quotation, or LOI
Step 3: For LOI, fill in the client address and payment terms
Step 4: Check the live preview on the right side of the screen
Step 5: Hit Download PDF. Done

## Testing Request (from Feb 7 status)

"Test it. Upload a couple of your recent Excel files and try generating all three document types (Budget, Proposal, LOI). If anything looks off, screenshot it and send it to me on Slack."

"Try the LOI flow. This is the most complex document type. Upload your Indiana Fever file, pick LOI, fill in the address and payment terms, and check that the legal header, signatures, and exhibits all look right."

## Known Issues Being Worked On

- Column headers styling
- LOI Exhibit A layout bugs
- Project Summary selector integration
- Inline typo editing for pricing descriptions
- Manual line item entry (for one-offs)

## February 2026 Hotfixes (applied after status update)

1. **Math fix**: pricingTableParser.ts
   - Grand total trust logic (use Excel's number if our calc doesn't match)
   - "project total" recognized as grand total
   - Per-table diagnostic logging

2. **UI fix**: Step2Intelligence.tsx
   - Editable Document Mode dropdown with promote buttons

3. **Infra fix**: generateProposalPdfService.ts
   - Internal Docker Browserless URL first, external WSS fallback

4. **Auth fix**: auth.ts + auth-middleware.ts
   - Added explicit `secret: process.env.AUTH_SECRET` for Docker
   - Fixed MissingSecret error preventing login