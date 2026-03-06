# Unified Excel Build — Checklist

## Pre-Build (Answers Needed)
- [ ] Eric confirms: 3.9mm Mesh indoor or outdoor?
- [x] Matt shares SOW examples (Bilt HQ + Union Station received March 6)
- [x] Natalia confirms tab order (FINAL: Overview, MA, Budget Summary, LED, Tech Specs, Install, Processor, Bundle, Travel, CMS, Scoring, Resp Matrix, P&L, Cash Flow)

---

## Phase 1: Unify Tab Structure ✅ DONE
- [x] Add Project Overview tab to RFP export (generateScopingWorkbook.ts) — commit 71dd95c3
- [x] Budget export wired to unified server route — commits db0ed4a3, 2c5d2286
- [x] Both exports produce identical tab names and order — commit c0eb8279 (Natalia's final order)
- [ ] Test: generate from Budget builder, verify all tabs present
- [ ] Test: generate from RFP builder, verify all tabs present

## Phase 2: Base/Alt Separation in Margin Analysis ✅ MOSTLY DONE
- [ ] RFP mode: parse bid form display order and sort MA sections to match — DEFERRED
- [ ] RFP mode: display names in MA match bid form names exactly — DEFERRED
- [x] No-RFP mode: base screens listed with per-screen subtotals — commit 585680bf
- [x] No-RFP mode: alts show as add/deduct lines under parent base screen — commit 624efe17
- [x] Calculate alt delta: "+$X" or "-$X" relative to base screen — commit 624efe17
- [x] Base bid grand total row with SUM formula — commit 585680bf
- [x] Alt lines excluded from base bid grand total — commit 624efe17
- [x] Toggleable grand total (on/off) via row grouping — commit 8ceac489

## Phase 2b: Two Pricing Views ✅ DONE
- [x] Margin Analysis tab: per-screen breakdown (LED, install, structural per display) — commit 585680bf
- [x] Budget Summary tab: per-category breakdown (all hardware, all labor, all misc) — commit e091fd34
- [x] Both tabs pull from same source data — commit c0eb8279 (uses display marginPct)
- [x] MA grand total matches Budget Summary grand total — same ComputedDisplay data

## Phase 2c: Per-Screen Cost Breakdown ✅ DONE
- [x] Labor costs broken down per screen — already in generateScopingWorkbook
- [x] Structural costs per screen — already in generateScopingWorkbook
- [x] Electrical costs per screen — already in generateScopingWorkbook
- [x] PM costs per screen — already in generateScopingWorkbook
- [x] Each screen's install sheet rolls up to MA per-screen subtotal
- [x] Budget export matches RFP per-zone pattern (unified engine)

## Phase 3: Formula Integrity ✅ DONE
- [x] All cross-sheet references work (LED Sheet ↔ MA ↔ Project Overview) — commit ae73213f
- [x] Changing margin % updates selling price via =Cost/(1-Margin) — formula in every category row
- [x] Tax/bond calculate from subtotal via formula (hidden Col G rates)
- [x] Grand total = SUM of all base screen zone totals
- [x] Project Overview document total links to MA grand total — commit ae73213f

## Phase 4: Online Editing (Univer) — MOSTLY DONE
- [x] Univer workbook matches unified tab structure — commit b7b463f3
- [x] Tab order matches Natalia's FINAL: Overview → MA → Budget Summary → LED → Tech Specs → Install → Processor → Bundle → Travel → CMS → Scoring → Resp Matrix → P&L → Cash Flow
- [x] Budget Summary tab added (per-category aggregate)
- [x] Processor Count tab added
- [x] Scoring tab added
- [x] Tabs renamed to match unified format
- [x] Alt add/deduct lines in MA (from Mirror Mode data)
- [x] Formula recalc works live in browser (selling = cost/(1-margin))
- [ ] Grand total toggle in browser — row grouping only works in downloaded Excel
- [ ] Edit online → export → verify formulas preserved in .xlsx

## Phase 5: Mirror Mode Round-Trip — MOSTLY DONE
- [x] Parser recognizes unified format (MA tab with per-screen sections) — commit d99686df
- [x] TARIFF row recognized end-to-end (parser → PricingTable → PDF → Excel export) — commit d99686df
- [x] BASE BID GRAND TOTAL detected as global document total (Strategy 3: after boundaries) — commit d99686df
- [x] Alt "Add/Deduct from Above" header detected as isAlternateHeader — already worked
- [x] Screen headers with "Selling Price" detected as viable section starts — already worked
- [x] Tariff displayed in PDF template, PricingTableEditor, Mirror Excel export — commit d99686df
- [ ] Export unified Excel from Budget builder → re-upload → verify clean PDF
- [ ] Repeat for RFP builder export
- [ ] CMS/Scoring placeholder rows may get lumped into adjacent boundary (harmless at $0)

## Phase 6: Polish — TODO
- [ ] Yellow highlighting on editable input cells
- [ ] Section headers styled (bold, gray background)
- [ ] Alt lines visually distinct from base lines (indent or color)
- [ ] No #REF! or #DIV/0! errors in any scenario
- [ ] Empty sections (CMS, Scoring) hidden if not applicable
- [ ] Export filename includes project name + date

---

## Done March 6
- [x] Claimed pixel pitch = N/A globally (formSheetParser.ts)
- [x] 4mm Mesh product added to catalog (seed-products.ts)
- [x] All 11 Capital One products verified in DB
- [x] Build passes, deployed to production
- [x] Tab order fixed to Natalia's final revision (c0eb8279)
- [x] Margins use pricing engine data instead of hardcoded values (c0eb8279)
- [x] TS error fixed: MatchedProduct.model → .name (c0eb8279)
