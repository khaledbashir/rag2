# Unified Excel Build — Plan of Understanding

## Confirmed March 6, 2026 (direct from Natalia)

---

## THE FLOW (Confirmed)

1. **Engine generates Excel workbook** — internal working doc for ANC team
2. **Team edits** — adjust numbers online (Univer) or download and edit in desktop Excel
3. **Re-upload to Mirror Mode** — drop finalized Excel back into the system
4. **Instant branded PDF** — this is what the client sees. Never the Excel.

**The Excel is INTERNAL. The PDF is CLIENT-FACING.**

---

## ONE TEMPLATE (Confirmed)

- Budget and RFP builders produce the SAME Excel format
- "Many budgets turn into RFPs" — so they need to be identical from the start
- **Project Overview tab** (currently Budget-only) goes into both
- Rest follows the RFP format (the fuller one)

---

## BASE BID vs ALTERNATES (Confirmed)

### Grand Total
- **Base bid gets a grand total.** Alts do NOT get their own grand total.
- Base bid grand total is a **toggleable table** on Margin Analysis (can be on/off)

### RFP Mode (bid form exists)
- Margin Analysis matches **exact order and names** from the client's bid form
- If both RFP PDF and bid form exist — **bid form takes priority**

### No-RFP Mode (budget from scratch)
- Base bid screens listed with per-screen subtotals (subtotal + tax + bond)
- Under each base screen, alts show as **add/deduct lines** for different pitch or size
- Example: "Alt: upgrade from 10mm to 8mm → +$24,500"

---

## WHAT'S ALREADY BUILT

| Feature | Status | File |
|---------|--------|------|
| Live Excel formulas (linked between pages) | DONE | exportFormulaicExcel.ts, generateScopingWorkbook.ts |
| Online editing with live recalc | DONE | UniverSpreadsheet.tsx |
| Per-screen subtotals + tax + bond | DONE | All export engines |
| Bundle Equipment sheet | DONE | exportFormulaicExcel.ts, generateScopingWorkbook.ts |
| Tech Specs sheet (no pricing) | DONE | buildTechSpecsOnlySheet() |
| Project Summary tab | DONE | All exports |
| Spare parts in LED hardware | DONE | No separate line |
| Mirror Mode re-upload → PDF | DONE | import-excel route + pricingTableParser |
| Claimed pixel pitch = N/A | DONE | formSheetParser.ts (pushed today) |
| All Capital One products in catalog | DONE | seed-products.ts (pushed today) |

---

## WHAT NEEDS TO BE BUILT

### 1. UNIFY BUDGET + RFP EXCEL FORMAT
- Budget export (exportEstimatorExcel.ts) currently produces 6-8 tabs
- RFP export (generateScopingWorkbook.ts) produces 15+ tabs
- **Action:** Make Budget export match RFP tab structure
- Add to Budget: P&L, Cash Flow, Travel, Resp Matrix, Bundle Equipment per-zone
- Add to RFP: Project Overview tab (currently Budget-only)

### 2. MARGIN ANALYSIS LAYOUT (Confirmed March 6)
- MA is ONE summary tab containing ALL screens vertically
- Each screen gets a full cost breakdown within that single tab:
  ```
  Screen A — [Display Name]
    LED Hardware         | Cost | Sell | Margin
    Install              | ...
    Engineering          | ...
    Structural           | ...
    Electrical           | ...
    PM                   | ...
    Subtotal
    Tax
    Bond
    Tariff
    Grand Total

  Screen B — [Display Name]
    LED Hardware         | ...
    ...
    Grand Total

  (Alt under corresponding screen as add/deduct)

  BASE BID GRAND TOTAL   (toggleable)
  ```
- NOT one tab per screen — one tab, all screens, each fully broken down
- Alts sit under their parent base screen as add/deduct lines
- Base bid grand total at the bottom (toggleable on/off)
- RFP mode: screen order + names match bid form exactly

### 3. BID FORM ORDER MATCHING
- When an RFP has a bid form, MA display order + names must match exactly
- **Action:** Parse bid form display order and use it to sort MA sections
- Bid form takes priority over RFP PDF if both exist

### 4. ALT ADD/DEDUCT DISPLAY
- In no-RFP mode, alts show as delta from base (not absolute cost)
- **Action:** Calculate and display "+$X" or "-$X" relative to the base screen it modifies
- Tie each alt to its parent base screen

### 5. TWO PRICING VIEWS (Confirmed March 6)
- **Margin Analysis** = per-screen breakdown. Each screen: hardware, install, engineering, etc. → subtotal, tax, bond, tariff, grand total. **MA is the basis for Mirror Mode** — Mirror strips out cost/margin columns, PDF shows the rest.
- **Budget Summary** = same data, different view. All screens lumped by category (all hardware, all labor, all misc). For Jireh's internal budgeting.
- **Grand totals must match** between both tabs — same numbers, two presentations.
- Keep BOTH tabs in the unified template.
- **Action:** Ensure both tabs exist with cross-sheet formulas pulling from same source data

### 6. PER-SCREEN COST BREAKDOWN (Confirmed March 6)
- Labor, structural, electrical, PM — ALL must be **per screen**, not per project
- Each display gets its own install/structural/electrical costs
- This is how the RFP Scoping Workbook already works (per-zone install sheets)
- Budget export needs to match this — currently may lump project-wide
- **Action:** Ensure Budget export breaks all service costs per screen

### 6. TOGGLEABLE GRAND TOTAL
- Base bid grand total should be optional
- **Action:** Add toggle in UI and exported Excel to show/hide grand total table on MA

---

## PENDING ANSWERS

| Question | Status | Who |
|----------|--------|-----|
| 3.9mm Mesh indoor or outdoor? | Sent to Eric | Eric Gruner |
| Matt's SOW templates | RECEIVED March 6 — Matt shared examples, need Jeremy's too | Matt Hobbs / Jeremy Riley |
| Tab order confirmation | CONFIRMED March 6 | Natalia |

---

## KEY FILES TO MODIFY

| File | What Changes |
|------|-------------|
| `app/components/estimator/exportEstimatorExcel.ts` | Add missing tabs to match RFP format |
| `services/rfp/pipeline/generateScopingWorkbook.ts` | Add Project Overview tab |
| `app/tools/rfp-analyzer/_components/UniverSpreadsheet.tsx` | Alt add/deduct display, toggleable grand total |
| `services/proposal/server/exportFormulaicExcel.ts` | Base/alt separation, bid form ordering |
| `services/proposal/server/exportMirrorUglySheetExcel.ts` | Ensure round-trip compatibility with unified format |
| `services/pricing/pricingTableParser.ts` | Parse unified format on re-upload |

---

## TAB ORDER (FINAL — Confirmed by Natalia March 6, revised)

1. Project Overview
2. Margin Analysis
3. Budget Summary
4. LED Cost Sheet
5. Tech Specs (no pricing — for sharing with installers/subs)
6. Install sheets (one per screen)
7. Processor Count
8. Bundle Equipment
9. Travel (own tab — hotel, airfare, car, per diem)
10. CMS (if applicable)
11. Scoring (if applicable)
12. Resp Matrix
13. P&L
14. Cash Flow
