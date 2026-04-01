# Natalia's Requirements Checklist

Last updated: 2026-04-01

## RFP Analyzer

### Screen Extraction
- [ ] All screens from uploaded RFP get picked up — zero dropped
- [ ] Duplicate screen names handled correctly (each is independent)
- [ ] Removing one screen with same name as others only removes THAT one

### Product Selection (Online Platform)
- [ ] Every screen row has a product dropdown
- [ ] Changing product updates: pitch, nits, pixels, dimensions, pricing
- [ ] Product selection persists after page reload
- [ ] Product selection saves to DB (auto-save)

### Online Preview Numbers
- [ ] $/SqFt matches exported Excel exactly
- [ ] Display Cost matches exported Excel exactly
- [ ] Processor cost matches exported Excel exactly
- [ ] Shipping matches exported Excel exactly
- [ ] Total Cost matches exported Excel exactly
- [ ] Margin % matches exported Excel exactly
- [ ] Selling Price matches exported Excel exactly
- [ ] TOTAL row matches exported Excel exactly
- [ ] Grand total in bottom bar matches Margin Analysis BASE BID GRAND TOTAL

### Exported Excel — Formulas
- [ ] $/SqFt is NOT hardcoded — linked to product
- [ ] Display Cost is formula ($/SqFt x Total SqFt)
- [ ] Total SqFt is formula (H x W x Qty)
- [ ] H(px) is formula (H(ft) x 304.8 / Pitch)
- [ ] W(px) is formula (W(ft) x 304.8 / Pitch)
- [ ] Shipping is formula (MAX(TotalSqFt x 10, 500))
- [ ] Total Cost is formula (Display Cost + Processor + Shipping)
- [ ] Margin % references master override cell
- [ ] Selling Price is formula (Total Cost / (1 - Margin%))
- [ ] ANC Margin is formula (Selling - Cost)
- [ ] Vendor is VLOOKUP from _Products sheet
- [ ] Pitch is VLOOKUP from _Products sheet
- [ ] NITs is VLOOKUP from _Products sheet
- [ ] Weight is VLOOKUP from _Products sheet
- [ ] Power is VLOOKUP from _Products sheet
- [ ] BTU is formula (Power x 3.412)
- [ ] TOTAL row uses SUM formulas for all numeric columns
- [ ] Changing product dropdown in Excel cascades all dependent cells
- [ ] No "Number stored as text" warnings on any cell

### Exported Excel — Accuracy
- [ ] Every row's numbers match what's shown on the online platform
- [ ] TOTAL row matches online platform TOTAL row
- [ ] Margin Analysis grand total matches LED Cost Sheet grand total (adjusted for services/tax/bond)
- [ ] All products have non-zero $/SqFt (no $0 rows)
- [ ] _Products hidden sheet has all 23+ catalog products with 7 columns (Name, Vendor, Pitch, $/SqFt, NITs, Weight, Power)

### Cross-Sheet Consistency
- [ ] Project Overview financial parameters are real numbers with % format (not text)
- [ ] Margin Analysis totals consistent with LED Cost Sheet totals
- [ ] Budget Summary consistent with Margin Analysis
- [ ] P&L consistent with Margin Analysis

## Estimator

### Online Preview
- [ ] Product dropdown works, cascades correct specs
- [ ] Typing height/width/qty does NOT cause full spreadsheet refresh
- [ ] Preview matches exported Excel exactly (same generator)
- [ ] All tabs render (Project Overview, Margin Analysis, Budget Summary, LED Cost Sheet, Tech Specs, Install, Processor, Bundle, Travel, CMS, Scoring, Resp Matrix, P&L, Cash Flow)

### Export
- [ ] Export .xlsx has same formulas as RFP export
- [ ] Numbers match online preview exactly
- [ ] Product dropdown in exported Excel cascades everything
- [ ] No "Number stored as text" warnings

## Test Files
- [ ] Large Format LED (44 displays) — passes all checks
- [ ] Bank of America Stadium (15-18 displays) — passes all checks
- [ ] WTC Digital Signage (13 displays) — passes all checks
- [ ] Any new RFP Natalia uploads — passes all checks

## Root Cause of Past Failures
The online preview and the Excel export were built by TWO DIFFERENT GENERATORS:
- Online: `buildRfpWorkbook()` in `rfpWorkbookBuilder.ts` (client-side JS)
- Export: `generateScopingWorkbook()` in `generateScopingWorkbook.ts` (server-side)

They calculated costs independently through different code paths, producing different numbers. The fix is to use ONE generator for both — the server-side `generateScopingWorkbook` rendered through Univer for the online preview (same approach the Estimator already uses).

Until this is complete, online preview and export WILL show different numbers.
