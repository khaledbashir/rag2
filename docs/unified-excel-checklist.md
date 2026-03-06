# Unified Excel Build — Checklist

## Pre-Build (Answers Needed)
- [ ] Eric confirms: 3.9mm Mesh indoor or outdoor?
- [ ] Matt shares 2-3 SOW template examples
- [x] Natalia confirms tab order (FINAL: Overview, MA, Budget Summary, LED, Tech Specs, Install, Processor, Bundle, Travel, CMS, Scoring, Resp Matrix, P&L, Cash Flow)

---

## Phase 1: Unify Tab Structure
- [ ] Add Project Overview tab to RFP export (generateScopingWorkbook.ts)
- [ ] Add missing tabs to Budget export (exportEstimatorExcel.ts):
  - [ ] P&L
  - [ ] Cash Flow
  - [ ] Travel
  - [ ] Resp Matrix
  - [ ] Bundle Equipment (per-zone)
  - [ ] Tech Specs (no pricing)
  - [ ] Processor Count
- [ ] Confirm both exports produce identical tab names and order
- [ ] Test: generate from Budget builder, verify all tabs present
- [ ] Test: generate from RFP builder, verify all tabs present (including Project Overview)

## Phase 2: Base/Alt Separation in Margin Analysis
- [ ] RFP mode: parse bid form display order and sort MA sections to match
- [ ] RFP mode: display names in MA match bid form names exactly
- [ ] No-RFP mode: base screens listed with per-screen subtotals
- [ ] No-RFP mode: alts show as add/deduct lines under their parent base screen
- [ ] Calculate alt delta: "+$X" or "-$X" relative to base screen
- [ ] Base bid grand total row with SUM formula
- [ ] Alt lines excluded from base bid grand total
- [ ] Toggleable grand total (on/off) in UI and exported Excel

## Phase 2b: Two Pricing Views
- [ ] Margin Analysis tab: per-screen breakdown (LED, install, structural per display)
- [ ] Budget Summary tab: per-category breakdown (all hardware, all labor, all misc)
- [ ] Both tabs pull from same source data via cross-sheet formulas
- [ ] MA grand total matches Budget Summary grand total

## Phase 2c: Per-Screen Cost Breakdown
- [ ] Labor costs broken down per screen (not project-wide)
- [ ] Structural costs per screen
- [ ] Electrical costs per screen
- [ ] PM costs per screen
- [ ] Each screen's install sheet rolls up to MA per-screen subtotal
- [ ] Budget export matches RFP per-zone pattern (not lumped)

## Phase 3: Formula Integrity
- [ ] All cross-sheet references work (LED Sheet ↔ MA ↔ Project Overview)
- [ ] Changing qty on LED Sheet updates MA subtotals via formula
- [ ] Changing margin % updates selling price via =Cost/(1-Margin)
- [ ] Tax/bond calculate from subtotal via formula
- [ ] Grand total = SUM of all base screen zone totals
- [ ] Project Overview document total links to MA grand total

## Phase 4: Online Editing (Univer)
- [ ] Univer workbook matches unified tab structure
- [ ] Alt add/deduct lines editable
- [ ] Grand total toggle works in browser
- [ ] All formula recalc works live in browser
- [ ] Edit online → export → formulas preserved in .xlsx

## Phase 5: Mirror Mode Round-Trip
- [ ] Export unified Excel from Budget builder
- [ ] Re-upload to Mirror Mode
- [ ] Parser recognizes unified format (MA tab, LED sheet)
- [ ] Generate PDF — verify clean output
- [ ] Repeat for RFP builder export
- [ ] Verify alt sections render correctly in PDF

## Phase 6: Polish
- [ ] Yellow highlighting on editable input cells
- [ ] Section headers styled (bold, gray background)
- [ ] Alt lines visually distinct from base lines (indent or color)
- [ ] No #REF! or #DIV/0! errors in any scenario
- [ ] Empty sections (CMS, Scoring) hidden if not applicable
- [ ] Export filename includes project name + date

---

## Done Today (March 6)
- [x] Claimed pixel pitch = N/A globally (formSheetParser.ts)
- [x] 4mm Mesh product added to catalog (seed-products.ts)
- [x] All 11 Capital One products verified in DB
- [x] Build passes, deployed to production
