# Natalia's Requirements Checklist

Last updated: 2026-04-04

## RFP Analyzer

### Screen Extraction
- [x] All screens from uploaded RFP get picked up — zero dropped
- [x] Duplicate screen names handled correctly (each is independent)
- [x] Removing one screen with same name as others only removes THAT one

### Product Selection (Online Platform)
- [x] Every screen row has a product dropdown ("Select ∨" inline — same as Estimator)
- [x] Changing product updates: pitch, nits, pixels, dimensions, pricing
- [x] Product selection persists after page reload
- [x] Product selection saves to DB (auto-save)
- [x] Dropdown only shows LED display products (no scoring/timing/courtside/TV)
- [x] Selecting product snaps H/W to nearest cabinet/module configuration

### Online Preview Numbers
- [x] $/SqFt matches exported Excel exactly (same generator)
- [x] Display Cost matches exported Excel exactly
- [x] Processor cost matches exported Excel exactly
- [x] Shipping matches exported Excel exactly
- [x] Total Cost matches exported Excel exactly
- [x] Margin % matches exported Excel exactly
- [x] Selling Price matches exported Excel exactly
- [x] TOTAL row matches exported Excel exactly
- [x] Grand total in bottom bar matches Margin Analysis BASE BID GRAND TOTAL

### Exported Excel — Formulas
- [x] $/SqFt is NOT hardcoded — linked to product via VLOOKUP
- [x] Display Cost is formula ($/SqFt x Total SqFt)
- [x] Total SqFt is formula (H x W x Qty)
- [x] H(px) is formula (H(ft) x 304.8 / Pitch)
- [x] W(px) is formula (W(ft) x 304.8 / Pitch)
- [x] Shipping is formula (MAX(TotalSqFt x 10, 500))
- [x] Total Cost is formula (Display Cost + Processor + Shipping)
- [x] Margin % references master override cell
- [x] Selling Price is formula (Total Cost / (1 - Margin%))
- [x] ANC Margin is formula (Selling - Cost)
- [x] Vendor is VLOOKUP from _Products sheet
- [x] Pitch is VLOOKUP from _Products sheet
- [x] NITs is VLOOKUP from _Products sheet
- [x] Weight is VLOOKUP from _Products sheet
- [x] Power is VLOOKUP from _Products sheet
- [x] BTU is formula (Power x 3.412)
- [x] TOTAL row uses SUM formulas for all numeric columns
- [x] Changing product dropdown in Excel cascades all dependent cells
- [ ] No "Number stored as text" warnings on any cell — NEEDS VERIFICATION

### Exported Excel — Accuracy
- [x] Every row's numbers match what's shown on the online platform (same generator)
- [x] TOTAL row matches online platform TOTAL row
- [x] Margin Analysis grand total matches LED Cost Sheet grand total (adjusted for services/tax/bond)
- [x] All products have non-zero $/SqFt (no $0 rows)
- [x] _Products hidden sheet has all catalog products with 7 columns (Name, Vendor, Pitch, $/SqFt, NITs, Weight, Power)

### Cross-Sheet Consistency
- [x] Project Overview financial parameters are real numbers with % format (not text)
- [x] Margin Analysis totals consistent with LED Cost Sheet totals
- [x] Budget Summary consistent with Margin Analysis (references correct columns T/V)
- [x] P&L consistent with Margin Analysis

## Estimator

### Online Preview
- [x] Product dropdown works ("Select ∨" inline), cascades correct specs
- [ ] Typing height/width/qty does NOT cause full spreadsheet refresh — NEEDS VERIFICATION
- [x] Preview matches exported Excel exactly (same server generator)
- [x] All tabs render (Project Overview, Margin Analysis, Budget Summary, LED Cost Sheet, Tech Specs, Install, Processor, Bundle, Travel, CMS, Scoring, Resp Matrix, P&L, Cash Flow)
- [x] H/W snap to nearest cabinet config when product is selected
- [x] Courtside tables: wizard asks pitch (3.9/2.9mm) + size (10'/8'/6'/5'), dims auto-populate
- [x] Stanchions: wizard asks pitch (3.9/2.9mm) + size (Single/Double), dims auto-populate
- [x] Dropdown only shows LED products (no scoring/timing/courtside/TV)
- [x] TOTAL row counts actual screen qty, not just line items
- [x] Tech Specs H/W pull from correct cells (not shifted by RFP columns)

### Export
- [x] Export .xlsx has same formulas as RFP export
- [x] Numbers match online preview exactly
- [x] Product dropdown in exported Excel cascades everything
- [ ] No "Number stored as text" warnings — NEEDS VERIFICATION

## Test Files
- [ ] Large Format LED (44 displays) — NEEDS TESTING
- [ ] Bank of America Stadium (15-18 displays) — NEEDS TESTING
- [ ] WTC Digital Signage (13 displays) — NEEDS TESTING
- [ ] Center-Hung (courtside + stanchion) — NEEDS TESTING
- [ ] Oklahoma City Arena (72 displays) — NEEDS TESTING
- [ ] Any new RFP Natalia uploads — NEEDS TESTING

## Architecture (Fixed 2026-04-04)
The root cause of ALL number mismatches is now eliminated:

**Before (broken):** Two separate generators
- Online preview: `buildRfpWorkbook()` (client-side JS) — DELETED
- Excel export: `generateScopingWorkbook()` (server-side)
- They calculated independently → different numbers

**After (fixed):** ONE generator for everything
- Both RFP and Estimator use `generateScopingWorkbook()` server-side
- Online preview: server generates → `buildEstimatorWorkbook()` converts → `WorkbookShell` renders
- Excel export: same `generateScopingWorkbook()` → ExcelJS writes .xlsx
- Online preview and export are mathematically identical by construction

**Component flow:**
- Server: `generateScopingWorkbook()` → Univer IWorkbookData
- Client: `buildEstimatorWorkbook()` converts IWorkbookData → WorkbookData (HTML table format)
- Client: `WorkbookShell` renders HTML tables with native `<select>` dropdowns
- Product dropdown: inline "Select ∨" in Product column, triggers cascade via `onProductSelect`

## Natalia's Open Items (from Slack)
- [x] Missing outdoor products in dropdown
- [x] Tech Specs H/W pulling wrong cells (column shift fix)
- [x] Alternates moved back to LED Cost Sheet (no separate tab)
- [x] TOTAL row counts actual qty not line items
- [x] Oklahoma qty corrected
- [x] SOW red line → blue (Hobbs request)
- [x] Premium SOW DOCX template added as second option
- [x] Courtside wizard: pitch + size selection, auto-dims
- [x] H/W snap to nearest cabinet when product changes (both RFP and Estimator)
- [x] Budget Summary references correct columns T/V (not Q/S)
