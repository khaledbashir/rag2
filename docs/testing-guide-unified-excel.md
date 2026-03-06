# Unified Excel — Manual Testing Guide

What I tested automatically (7/7 pass):
- Column detection (Cost, Selling Price mapped correctly)
- Row type detection (headers, subtotals, tax, bond, tariff, grand totals, alt headers, alt lines)
- Boundary detection (2 screen sections + 1 alt section, CMS/Scoring excluded from alt)
- Table extraction (correct items, subtotals, bonds, tariffs, grand totals per screen)
- Global document total (BASE BID GRAND TOTAL found after all boundaries)

Run the automated test anytime: `npx tsx scripts/test-unified-parser.ts`

---

## What YOU need to test (manual — needs browser)

### Test 1: RFP Export Round-Trip

1. Go to the RFP Analyzer: `/tools/rfp-analyzer`
2. Open any existing analysis that has 2+ screens
3. Click "Export Excel" (or "Download Scoping Workbook")
4. Open the downloaded `.xlsx` in Excel or Google Sheets
5. CHECK:
   - [ ] Tab order matches: Overview, MA, Budget Summary, LED, Tech Specs, Install sheets, Processor, Bundle, Travel, CMS, Scoring, Resp Matrix, P&L, Cash Flow
   - [ ] Margin Analysis tab has per-screen sections (each screen with LED Hardware, Structural, Install, etc.)
   - [ ] Each screen section has: SUBTOTAL, TAX, BOND, TARIFF, GRAND TOTAL rows
   - [ ] BASE BID GRAND TOTAL at the bottom sums all screens
   - [ ] Formulas work (change a cost cell — selling price should recalculate)
6. Now re-upload that same Excel into Mirror Mode:
   - Go to `/projects/new` or open an existing project
   - Upload the Excel file
   - CHECK:
   - [ ] Parser detects the Margin Analysis tab
   - [ ] Each screen shows as a separate pricing section
   - [ ] Subtotal, Tax, Bond, Grand Total numbers match the Excel
   - [ ] No "TARIFF" showing as a line item (it should be absorbed as a special row)
   - [ ] Document total at top matches BASE BID GRAND TOTAL from Excel
7. Generate PDF from that proposal:
   - [ ] Each screen section renders cleanly
   - [ ] Subtotal / Tax / Bond / Grand Total lines present
   - [ ] If tariff was non-zero, "Tariff" line appears between Bond and Total
   - [ ] No #REF! or broken numbers

### Test 2: Budget Export Round-Trip

1. Go to the Estimator: `/estimator`
2. Open any existing budget with 2+ screens
3. Export the Excel
4. Same checks as Test 1 steps 5-7

### Test 3: Univer Online Editing

1. Open any RFP analysis result that shows the Univer spreadsheet
2. CHECK:
   - [ ] All tabs present in correct order
   - [ ] Margin Analysis tab shows per-screen breakdown
   - [ ] Budget Summary tab shows per-category breakdown
   - [ ] Processor Count tab exists
   - [ ] Edit a cost cell on MA → selling price recalculates live
   - [ ] Download from Univer → open in Excel → formulas still work

### Test 4: Alt Display in Mirror Mode

1. Create or open a project that has alternate displays (base + alt)
2. Export the Excel
3. CHECK:
   - [ ] Alt lines appear under their parent screen as "Alternates — Add/Deduct from Above"
   - [ ] Alt lines show delta values (+ or - $X), not absolute costs
4. Re-upload to Mirror Mode:
   - [ ] Alt section detected separately from main screen
   - [ ] Alt items don't bleed into the next screen's section

---

## Quick Smoke Test (fastest path)

If you're short on time, just do this:

1. Open any RFP analysis with 2+ screens
2. Download the scoping workbook Excel
3. Open it — check MA tab looks right (per-screen sections with categories)
4. Upload that same Excel into a new Mirror Mode proposal
5. Check that each screen parsed correctly (sections, totals)
6. Generate PDF — should be clean

If that works, the unified format round-trip is solid.

---

## Known Limitations (not bugs, just not built yet)

- CMS/Scoring placeholder rows ($0) are orphaned between boundaries — harmless but won't appear in Mirror Mode output (they're $0 anyway)
- Grand total toggle (row grouping) only works in downloaded Excel, not in Univer browser
- Bid form ordering (MA sections match bid form display order) — deferred
- Export filename doesn't include project name + date yet (Phase 6)
