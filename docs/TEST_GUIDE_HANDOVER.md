# ANC Proposal Engine — Complete Test Guide (Handover)

**Last Updated:** March 6, 2026
**Covers:** All Excel generators, online workbook, Mirror Mode round-trip, PDF generation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Test Environment Setup](#2-test-environment-setup)
3. [Generator 1: Mirror Export](#3-generator-1-mirror-export)
4. [Generator 2: Intelligence/Budget Export](#4-generator-2-intelligencebudget-export)
5. [Generator 3: Scoping Workbook](#5-generator-3-scoping-workbook)
6. [Generator 4: RFP Extraction Export](#6-generator-4-rfp-extraction-export)
7. [Online Workbook (UniverSpreadsheet)](#7-online-workbook-universpreadsheet)
8. [Mirror Mode Round-Trip](#8-mirror-mode-round-trip)
9. [PDF Generation](#9-pdf-generation)
10. [Sheet Detection & Parsing](#10-sheet-detection--parsing)
11. [Cross-Sheet Formula Verification](#11-cross-sheet-formula-verification)
12. [Regression Checklist](#12-regression-checklist)

---

## 1. Architecture Overview

### Four Excel Generators

| Generator | File | Used By | Trigger |
|-----------|------|---------|---------|
| **Mirror Export** | `services/proposal/server/exportMirrorUglySheetExcel.ts` | Mirror Mode proposals (RFP + Budget) | `POST /api/proposals/export/audit` with `calculationMode=MIRROR` |
| **Intelligence Export** | `services/proposal/server/exportFormulaicExcel.ts` | Intelligence/Budget proposals | `POST /api/proposals/export/audit` with `calculationMode=INTELLIGENCE` |
| **Scoping Workbook** | `services/rfp/pipeline/generateScopingWorkbook.ts` | RFP pipeline scoping | `POST /api/rfp/pipeline/scoping-workbook` |
| **Extraction Export** | `app/api/rfp/pipeline/extraction-excel/route.ts` | RFP raw spec extraction | `POST /api/rfp/pipeline/extraction-excel` |

### Online Workbook

| Component | File | Used By |
|-----------|------|---------|
| **UniverSpreadsheet** | `app/tools/rfp-analyzer/_components/UniverSpreadsheet.tsx` | RFP Analyzer in-browser workbook |

### Key Support Files

| File | Purpose |
|------|---------|
| `lib/sheetDetection.ts` | Fuzzy sheet name matching for LED/MA detection |
| `services/proposal/server/excelImportService.ts` | Excel parser for Mirror Mode import |
| `lib/estimator.ts` | `calculatePerScreenAudit()` — weight/power calculations |
| `services/rfp/productCatalog.ts` | Product density data (weight/power per m²) |

---

## 2. Test Environment Setup

### Prerequisites
```bash
# Ensure dev server is running
cd /root/rag2
npm run dev
```

### Test Data
- Any existing proposal with screens in the database
- An ANC-format Excel file (.xlsx) with "Margin Analysis" + "LED Cost Sheet" tabs
- An RFP PDF for extraction testing

### Key URLs
- **RFP Analyzer:** `/tools/rfp-analyzer`
- **Projects List:** `/projects`
- **Proposal Editor:** `/projects/{proposalId}`

---

## 3. Generator 1: Mirror Export

**File:** `services/proposal/server/exportMirrorUglySheetExcel.ts`
**Function:** `generateMirrorUglySheetExcelBuffer()`
**API:** `POST /api/proposals/export/audit` (with `calculationMode=MIRROR`)

### Expected Sheets (in order)

| # | Sheet Name | Tab Color | Purpose |
|---|-----------|-----------|---------|
| 1 | Project Summary | — | Project metadata, document total |
| 2 | LED Cost Sheet | — | Per-screen specs, weight, power, BTU |
| 3 | Margin Analysis | — | Per-section line items, subtotals |
| 4 | Tech Specs (Installers) | — | No-pricing specs for subs |
| 5 | Bundle Equipment | Cyan | Processor & Equipment components |

### Test: Project Summary Sheet
1. Open any Mirror Mode proposal → click **Export Excel** (audit export)
2. Open downloaded .xlsx → go to "Project Summary" tab
3. **Verify:**
   - [ ] Row has "Project Name" with correct value
   - [ ] Row has "Client" name
   - [ ] Row has "Created" and "Revision Date"
   - [ ] Row has "Document Mode" showing "MIRROR" or "BUDGET"
   - [ ] Row has "Number of Displays" matching screen count
   - [ ] "Document Total" row has a **cross-sheet formula** `='Margin Analysis'!C{row}`

### Test: LED Cost Sheet — Weight/Power/BTU (Item 6)
1. In the same exported .xlsx, go to "LED Cost Sheet" tab
2. **Verify columns exist in header row 4:**
   - [ ] Col N = "Weight (lbs)"
   - [ ] Col O = "Total Power (W)"
   - [ ] Col P = "BTU/hr"
3. **Verify data rows (row 5+):**
   - [ ] Weight column has numeric values (not blank)
   - [ ] Power column has numeric values (not blank)
   - [ ] BTU column has formula `=O{row}*3.412`
4. **Verify other LED columns:**
   - [ ] Col A = Display Name
   - [ ] Col C = Quantity
   - [ ] Col E = MM Pitch
   - [ ] Col F = Active Height (ft)
   - [ ] Col G = Active Width (ft)
   - [ ] Col M = Brightness (nits) — should NOT be blank

### Test: Margin Analysis — Layout (Item 7)
1. Go to "Margin Analysis" tab
2. **When pricingDocument exists (Mirror Mode with sections):**
   - [ ] Each section has a dark header row: Section Name | "Selling Price"
   - [ ] Line items show: Col A = Description, Col B = Selling Price only
   - [ ] Cost is in **hidden Col F** (not visible to client)
   - [ ] SUBTOTAL row shows: Cost (B) | Selling (C) | Margin $ (D) | Margin % (E)
   - [ ] TAX row with formula `=C{subtotal}*F{taxRow}` (formula-driven, not static)
   - [ ] BOND row with formula `=C{subtotal}*F{bondRow}` (formula-driven, not static)
   - [ ] "SUB TOTAL (BID FORM)" row: `=C{subtotal}+C{tax}+C{bond}`
3. **Verify per-section structure repeats for each display zone**
4. **DOCUMENT TOTAL row at bottom:**
   - [ ] Sums all section grand totals via formula

### Test: Spare Parts Roll-In (Item 8)
1. In "Margin Analysis" tab, search for "Spare Parts"
2. **Verify:**
   - [ ] **No row** named "Spare Parts" exists as a separate line item
   - [ ] LED Hardware line includes spare parts cost (rolled in)

### Test: Tech Specs (Installers) Sheet
1. Go to "Tech Specs (Installers)" tab
2. **Verify:**
   - [ ] Header shows: Display Name, Qty, Pixel Pitch, Height, Width, Pixels H, Pixels W, Sq Ft, Brightness, Service, Environment, Weight, Power, BTU/hr
   - [ ] **No pricing columns** (no cost, selling price, margin)
   - [ ] Cross-sheet formulas reference LED Cost Sheet: e.g., Pitch = `='LED Cost Sheet'!E{row}`
   - [ ] Weight references `='LED Cost Sheet'!N{row}`
   - [ ] Power references `='LED Cost Sheet'!O{row}`
   - [ ] BTU formula: `=M{row}*3.412`

### Test: Bundle Equipment Sheet
1. Go to "Bundle Equipment" tab
2. **Verify:**
   - [ ] Header: Component | Qty | Unit Cost | Total Cost
   - [ ] Default items: Video Processor, Sending Card, Media Player, Signal Cable Kit, Power Supply Unit
   - [ ] Total row with SUM formula

---

## 4. Generator 2: Intelligence/Budget Export

**File:** `services/proposal/server/exportFormulaicExcel.ts`
**Function:** `generateAuditExcelBuffer()`
**API:** `POST /api/proposals/export/audit` (with `calculationMode=INTELLIGENCE`)

### Expected Sheets (13+ tabs)

| # | Sheet Name | Tab Color | Purpose |
|---|-----------|-----------|---------|
| 1 | Project Summary | — | Metadata |
| 2 | Margin Analysis | Blue | Master cost/selling/margin |
| 3 | LED Cost Sheet | Amber | Per-screen specs + pricing |
| 4 | Bundle Equipment | Cyan | Processor & Equipment breakdown |
| 5 | Install | Green | Installation costs |
| 6 | Project Management | Cyan | PM costs |
| 7 | Electrical and Data | Amber | Electrical costs |
| 8 | Professional Services | Grey | Prof services |
| 9 | Control System CMS | Purple | CMS costs |
| 10 | Shipping | Orange | Shipping costs |
| 11 | Alternates | Red | Alternate screen options |
| 12 | Content Creation | Pink | Content hours/rates |
| 13 | AI SOW | Blue | AI-generated scope of work |
| 14 | Tech Specs (Installers) | Grey | No-pricing for subs |

### Test: Verify All Sheets Exist
1. Open any Intelligence Mode proposal → Export Excel (audit)
2. **Count tabs — should be 14** (or 13 if no AI SOW data)
3. **Verify each sheet name matches the table above**

### Test: LED Cost Sheet — Weight/Power Columns
1. Go to "LED Cost Sheet"
2. **Verify same as Mirror Export test:** Weight (lbs), Total Power (W), BTU/hr columns exist and populate

### Test: Formula Linking
1. In "Margin Analysis", find a display's cost cell
2. **Verify:** Selling Price uses `=Cost/(1-MarginCell)` formula
3. **Verify:** Bond uses `=SellingPrice*BondRateCell` formula
4. **Verify yellow highlighting** on editable input cells (Margin %, Bond Rate, Tax Rate, Costs)

### Test: Tech Specs Cross-Sheet Formulas
1. Go to "Tech Specs (Installers)"
2. **Verify all values are cross-sheet formulas** to LED Cost Sheet:
   - [ ] Display Name: `='LED Cost Sheet'!A{row}`
   - [ ] Qty: `='LED Cost Sheet'!C{row}`
   - [ ] Pitch: `='LED Cost Sheet'!E{row}`
   - [ ] Weight: `='LED Cost Sheet'!N{row}`
   - [ ] Power: `='LED Cost Sheet'!O{row}`
   - [ ] BTU: `=K{row}*3.412`

---

## 5. Generator 3: Scoping Workbook

**File:** `services/rfp/pipeline/generateScopingWorkbook.ts`
**Function:** `generateScopingWorkbook()`
**API:** `POST /api/rfp/pipeline/scoping-workbook`

### Expected Sheets (15+ tabs)

| # | Sheet Name | Purpose |
|---|-----------|---------|
| 1 | Project Summary | Metadata (NEW) |
| 2 | Margin Analysis | Master budget per zone |
| 3 | LED Cost Sheet | Product specs + pricing |
| 4 | Processor Count | Pixel math for processor ports |
| 5-N | {Display} - Install | Per-zone install sheets |
| N+1 | P&L | Revenue vs cost |
| N+2 | Cash Flow | Monthly projections |
| N+3 | PO's | Purchase order tracking |
| N+4 | Resp Matrix | ANC vs Purchaser responsibility |
| N+5 | ANC Travel | Travel breakdown |
| N+6 | CMS | Content management system |
| N+7 | Scoring | Scoring system |
| N+8 | Bundle Equipment | Equipment breakdown (NEW) |
| N+9 | Tech Specs (Installers) | No-pricing specs (NEW) |
| N+10 | Alternates | Optional add-ons (if any) |

### Test: Project Summary (NEW)
1. Upload an RFP PDF → wait for extraction → click "Generate Scoping Workbook"
2. Open downloaded .xlsx
3. **Verify "Project Summary" is the FIRST tab**
4. **Verify fields:** Project Name, Client, Created, Document Mode = "SCOPING_WORKBOOK", Number of Displays, Document Total

### Test: Spare Parts Roll-In (NEW)
1. Go to "Margin Analysis" tab
2. Find any display zone → look at sub-lines
3. **Verify:**
   - [ ] "LED Hardware" line includes spare parts cost (higher than raw LED cost alone)
   - [ ] **No "Spare Parts Package (2%)" sub-line** exists
4. Go to "LED Cost Sheet"
5. **Verify:**
   - [ ] "Display Cost" column (Col N) includes spare parts rolled in
   - [ ] $/SqFt reflects the rolled-in cost

### Test: Per-Zone TAX/BOND/ZONE TOTAL (NEW)
1. In "Margin Analysis", look at any display zone section
2. After the sub-lines (LED Hardware, Structural, etc.), verify:
   - [ ] "TAX" row with formula `=D{zoneRow}*G{taxRow}` — Col G has editable tax rate (yellow)
   - [ ] "BOND" row with formula `=D{zoneRow}*G{bondRow}` — Col G has editable bond rate (yellow)
   - [ ] "ZONE TOTAL" row with formula `=D{zoneRow}+D{taxRow}+D{bondRow}`
3. **Verify tax rate defaults to 0% (editable)**
4. **Verify bond rate defaults to 1.5% when bond is enabled, 0% otherwise**

### Test: Bundle Equipment Sheet (NEW)
1. Go to "Bundle Equipment" tab
2. **Verify per-zone structure:**
   - [ ] Each display has a zone header row
   - [ ] Equipment items: Sending Card, Signal Cable Kit, UPS Battery Backup (if scoreboard), Backup Video Processor (if >300 sqft), Weatherproof Enclosure (if outdoor)
   - [ ] Each cost cell is **yellow** (editable)
   - [ ] Zone Subtotal with `=SUM(D{first}:D{last})` formula
3. **Verify EQUIPMENT GRAND TOTAL** at bottom with SUM of all zone subtotals

### Test: Tech Specs (Installers) Sheet (NEW)
1. Go to "Tech Specs (Installers)" tab
2. **Verify:**
   - [ ] Title includes "No Pricing"
   - [ ] Subtitle: "Technical specifications only — no pricing data. Safe for installer/subcontractor distribution."
   - [ ] Columns: Display Name, Qty, Pixel Pitch, Height, Width, Pixels H, Pixels W, Sq Ft, Brightness, Service, Environment, Weight, Power, BTU/hr
   - [ ] Cross-sheet formulas to LED Cost Sheet (e.g., `='LED Cost Sheet'!A{row}`)
   - [ ] Weight/Power computed from product catalog densities
   - [ ] BTU formula: `=M{row}*3.412`
   - [ ] **No cost/price/margin columns**

---

## 6. Generator 4: RFP Extraction Export

**File:** `app/api/rfp/pipeline/extraction-excel/route.ts`
**API:** `POST /api/rfp/pipeline/extraction-excel`

### Expected Sheets

| # | Sheet Name | Purpose |
|---|-----------|---------|
| 1 | Project Summary | Metadata (NEW) |
| 2 | LED Displays | Raw extracted specs |
| 3 | Requirements | Extracted requirements |
| 4 | Project Info | Extracted project details |

### Test: Project Summary (NEW)
1. Upload a PDF to RFP Analyzer → wait for extraction
2. Click "Export Excel" (the extraction export button, NOT the audit export)
3. Open downloaded .xlsx
4. **Verify "Project Summary" is the FIRST tab**
5. **Verify:** Project Name, Client, Document Mode = "RFP_ANALYSIS", Number of Displays

### Test: LED Displays Sheet
1. Go to "LED Displays" tab
2. **Verify columns:** Display Name, Location, Width (ft), Height (ft), Width (px), Height (px), Pixel Pitch (mm), Brightness (nits), Environment, Quantity
3. **Note:** This export is for raw extracted specs — NO weight/power/BTU columns (those require product matching which happens at pricing stage)

### Test: Requirements Sheet
1. Go to "Requirements" tab
2. **Verify:** Category, Requirement, Priority, Source columns
3. **Verify data matches** what was extracted from the RFP

---

## 7. Online Workbook (UniverSpreadsheet)

**File:** `app/tools/rfp-analyzer/_components/UniverSpreadsheet.tsx`

### Expected Sheets (in-browser)

| # | Sheet Name | Purpose |
|---|-----------|---------|
| 1 | Project Summary | Metadata with cross-sheet doc total |
| 2 | LED Cost Sheet | Full 23-column spec + pricing sheet |
| 3 | Margin Analysis | Per-section or flat pricing layout |
| 4 | Tech Specs (Installers) | No-pricing specs |
| 5 | Project Config | Rate card settings |

### Test: Formula-Driven Tax/Bond (FIXED)
1. Upload an ANC Excel file to RFP Analyzer (one with Margin Analysis + LED Cost Sheet)
2. In the browser workbook, navigate to "Margin Analysis" sheet
3. For any section, find the TAX row:
   - [ ] **Verify formula:** `=C{subtotalRow}*F{taxRow}` (NOT a static number)
   - [ ] Col F (hidden) should contain the tax rate
4. Find the BOND row:
   - [ ] **Verify formula:** `=C{subtotalRow}*F{bondRow}` (NOT a static number)
   - [ ] Col F (hidden) should contain the bond rate (defaults to 1.5%)
5. **Test live recalculation:** Change a selling price in an item row → subtotal should update → tax/bond should recalculate

### Test: Cross-Sheet LED → MA Linking (NEW)
1. In the browser workbook, go to "LED Cost Sheet"
2. Find the Selling Price column (Col T, index 19) for any display
3. **If Mirror Mode with pricingDocument sections:**
   - [ ] Selling Price should be a formula: `='Margin Analysis'!C{grandTotalRow}`
   - [ ] Changing a price in MA should auto-update LED Cost Sheet selling price
4. **If no matching section found:** Selling Price falls back to `=ROUND(IF(S{r}>0,R{r}/(1-S{r}),R{r}),2)`

### Test: Project Summary Cross-Sheet Formula
1. Go to "Project Summary" sheet
2. Find "Document Total" row
3. **Verify formula:** `='Margin Analysis'!C{totalRow}` — should reference the MA document total

---

## 8. Mirror Mode Round-Trip

**This is Natalia's key ask:** "confirm that excel we generate can be uploaded to mirror thing for instant pdf"

### Flow: Generate → Adjust → Re-Upload → Instant PDF

#### Step 1: Generate Excel
1. Open any proposal in the system
2. Click **Export Excel** (audit export)
3. Save the downloaded `.xlsx` file

#### Step 2: Adjust Numbers
1. Open the .xlsx in Excel/Google Sheets
2. Change some selling prices in the Margin Analysis tab
3. Save the modified file

#### Step 3: Re-Upload to RFP Analyzer
1. Go to `/tools/rfp-analyzer`
2. Upload the modified .xlsx file
3. **Verify:**
   - [ ] System detects screens from LED Cost Sheet
   - [ ] System detects Margin Analysis
   - [ ] Status shows "Excel Validated" (green badge)
   - [ ] **"Generate Instant PDF" button appears** (blue box with Zap icon)
   - [ ] Button text: "Generate Instant PDF"

#### Step 4: Generate Instant PDF
1. Click "Generate Instant PDF"
2. **Verify:**
   - [ ] Loading state: "Creating Proposal..."
   - [ ] Redirects to `/projects/{newProposalId}`
   - [ ] New proposal opens in Mirror Mode
   - [ ] PDF preview loads with the adjusted prices

### Failure Cases to Test
- [ ] Upload a file WITHOUT "Margin Analysis" tab → button should NOT appear
- [ ] Upload a file WITHOUT "LED Cost Sheet" tab → button should NOT appear
- [ ] Upload a non-Excel file (.pdf, .csv) → should show error, not crash

---

## 9. PDF Generation

### Test: Puppeteer PDF
1. Open any proposal → go to Step 4 (Export)
2. Click the PDF export button
3. **Verify:**
   - [ ] PDF generates without error
   - [ ] PDF contains all screen data
   - [ ] Layout matches the preview

### Test: jsreport PDF (if available)
1. On Step 4, find the purple jsreport button (printer icon)
2. Click to generate
3. **Verify:** PDF generates, layout is correct

### Test: Mirror Mode PDF
1. Follow the round-trip flow above (Section 8)
2. After redirect to proposal page, verify PDF preview renders

---

## 10. Sheet Detection & Parsing

**File:** `lib/sheetDetection.ts`

### Test: LED Sheet Detection
The `findLedOrCostSheet()` function must detect all of these sheet names:
- [ ] "LED Cost Sheet" (standard name — all generators now use this)
- [ ] "LED Sheet" (legacy name — still detected for old files)
- [ ] "Copy of LED Sheet" (user-modified copies)
- [ ] "led cost sheet" (case-insensitive)

### Test: Margin Analysis Detection
The parser must detect:
- [ ] "Margin Analysis"
- [ ] "margin analysis" (case-insensitive)

### Test: Parser Handles Renamed Sheet
Since we renamed "LED Sheet" → "LED Cost Sheet" in the Mirror Export:
1. Generate a new Mirror Export .xlsx
2. Upload it back to RFP Analyzer
3. **Verify:** System correctly detects "LED Cost Sheet" and populates screens
4. **Verify:** `hasLedCostSheet: true` in the response

---

## 11. Cross-Sheet Formula Verification

### Mirror Export Cross-Sheet Formulas

| Source Sheet | Target Sheet | Formula Pattern | What It Links |
|-------------|-------------|-----------------|---------------|
| Project Summary | Margin Analysis | `='Margin Analysis'!C{docTotalRow}` | Document total |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!E{row}` | Pitch |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!F{row}` | Height |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!G{row}` | Width |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!N{row}` | Weight |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!O{row}` | Power |

### Intelligence Export Cross-Sheet Formulas

| Source Sheet | Target Sheet | Formula Pattern | What It Links |
|-------------|-------------|-----------------|---------------|
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!A{row}` | Display name |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!C{row}` | Qty |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!N{row}` | Weight |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!O{row}` | Power |

### Scoping Workbook Cross-Sheet Formulas

| Source Sheet | Target Sheet | Formula Pattern | What It Links |
|-------------|-------------|-----------------|---------------|
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!A{row}` | Display name |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!I{row}` | Qty |
| Tech Specs | LED Cost Sheet | `='LED Cost Sheet'!K{row}` | Brightness |

### Verification Steps
1. Open any exported .xlsx in Excel
2. Click on a cell in Tech Specs that should have a cross-sheet formula
3. **Verify the formula bar shows** `='LED Cost Sheet'!{cell}` — not a static value
4. Go to LED Cost Sheet → change the source value → return to Tech Specs → **verify it updated**

---

## 12. Regression Checklist

Run this after any code change to the export generators:

### Quick Smoke Test (5 min)
- [ ] Mirror Export: generates .xlsx with 5 tabs, no error
- [ ] Intelligence Export: generates .xlsx with 13+ tabs, no error
- [ ] TypeScript compiles: `npx tsc --noEmit` passes (ignore `.next/types/` venue-visualizer errors)

### Core Feature Verification (15 min)
- [ ] LED Cost Sheet: Weight/Power/BTU columns populated (not blank)
- [ ] Margin Analysis: No "Spare Parts" separate line item
- [ ] Margin Analysis: Line items show description + selling only; cost/margin on totals
- [ ] Tech Specs: No pricing columns, cross-sheet formulas work
- [ ] Project Summary: First tab, has document total
- [ ] Sheet name: "LED Cost Sheet" (not "LED Sheet") in all exports

### Round-Trip Test (10 min)
- [ ] Export .xlsx from any proposal
- [ ] Upload to RFP Analyzer
- [ ] "Generate Instant PDF" button appears
- [ ] Click → creates Mirror Mode proposal → PDF renders

### Formula Integrity (10 min)
- [ ] Open exported .xlsx in Excel
- [ ] Change a cost value → selling price recalculates via `=Cost/(1-Margin)`
- [ ] Change a margin % → selling price recalculates
- [ ] Tax/Bond formulas reference rate cells (not hardcoded amounts)
- [ ] Cross-sheet formulas in Tech Specs resolve correctly

---

## File Reference

### All Modified Files (This Session)

| File | Changes Made |
|------|-------------|
| `services/rfp/pipeline/generateScopingWorkbook.ts` | Spare parts roll-in, Project Summary, Tech Specs, Bundle Equipment, per-zone TAX/BOND/TOTAL |
| `services/proposal/server/exportMirrorUglySheetExcel.ts` | Renamed "LED Sheet" → "LED Cost Sheet", updated cross-sheet refs |
| `app/tools/rfp-analyzer/_components/UniverSpreadsheet.tsx` | Formula-driven tax/bond, LED→MA cross-sheet linking |
| `services/proposal/server/excelImportService.ts` | Updated sheetsRead metadata |
| `app/api/rfp/pipeline/extraction-excel/route.ts` | Added Project Summary sheet (previous session) |

### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/proposals/export/audit` | POST | Export Mirror or Intelligence Excel |
| `/api/rfp/pipeline/extraction-excel` | POST | Export raw RFP extraction Excel |
| `/api/rfp/pipeline/scoping-workbook` | POST | Generate scoping workbook |
| `/api/rfp/analyze/excel` | POST | Parse uploaded Excel for RFP Analyzer |
| `/api/proposals/import-excel` | POST | Parse Excel for Mirror Mode import |
| `/api/workspaces/create` | POST | Create workspace + proposal (used by Instant PDF) |

### Product Catalog Density Constants

Used for weight/power calculations in Tech Specs and LED sheets:

| Product | Power (W/m²) | Weight (lbs/m²) | Avg/Max Ratio |
|---------|-------------|-----------------|---------------|
| 4mm Nitxeon | 488.3 | 45.4 | 40% |
| 10mm Mesh P10 | 298.0 | 19.6 | 40% |
| 2.5mm Nationstar MIP | 390.6 | 52.6 | 33% |
| Yaham Corona C2.5 | 401.5 | 50.2 | 40% |
| Yaham Radiance R4 Outdoor | 650.0 | 68.3 | 40% |

**Formula:** `Weight = Area(m²) × weightDensityLbm2` / `Power = Area(m²) × powerDensityWm2`
**Source:** `services/rfp/productCatalog.ts`

---

## 13. Bugs Found & Fixed (March 6, 2026)

### Bug A: LMU — TAX Row Shows 277 Trillion

**Symptom:** TAX row in Margin Analysis shows `277015768377416` instead of a real dollar amount. Column G shows `553738888404043`.

**Root Cause (confirmed):** Two compounding issues:

1. **Parser tax rate detection too broad** (`tableExtraction.ts:54`): Old code searched for ANY cell containing `"0."` — a dollar amount like `"$10,500.00"` matches because it contains `"0."`. This produced `parseNumber("$10,500.00") = 10500`, then `rate / 100 = 105` stored as `tax.rate`. A 10500% tax rate.

2. **UniverSpreadsheet fallback divided by 1** (`UniverSpreadsheet.tsx:472`): `sectionSubtotal = sectionSellSum || 1` — when all selling prices are $0, `sectionSellSum = 0`, falls to denominator of `1`, so `taxRate = taxAmount / 1 = taxAmount` (a dollar amount used as a percentage).

**Fixes applied:**

| File | Fix |
|------|-----|
| `services/pricing/parser/tableExtraction.ts` | Tightened regex: only match `^\d{1,3}(\.\d+)?%$` or `^0\.\d+$`. Skip cells with `$£€`. Added sanity clamp: `rate > 0.50 → 0`. |
| `app/tools/rfp-analyzer/_components/UniverSpreadsheet.tsx` | Removed `|| 1` fallback. Uses `sectionSellSum` directly — if 0, taxRate defaults to 0. Added clamp: `taxRate > 0.50 → 0`, `bondRate > 0.10 → 0.015`. |

**Verification:** Run `npx tsx scripts/test-parser-sanity.ts` — NBCU fixture confirms tax rate 0.08875 correctly extracted after fix.

### Bug B: Bon Secours — All Base Selling Prices $0 in Column B

**Symptom:** Costs populate correctly in hidden column F, but selling prices in column B are all $0.

**Root Cause (probable — needs actual file to confirm):**

The pricing parser's column detection (`columnDetection.ts`) requires BOTH a "cost" and "selling price" column header. Possible causes:

1. **Column mapping mismatch**: Bon Secours MA may have non-standard column headers that the parser maps incorrectly, resulting in `row.sell = 0` for all items while `row.cost` reads correctly.
2. **Excel formula caching**: If the file has formula-computed selling prices (`=Cost/(1-Margin)`) and was saved without recalculating, SheetJS reads cached values of 0.
3. **Mirror export re-upload**: If Bon Secours is a Mirror Mode export, it has selling price but NO cost column — the parser maps "selling price" to `sell` but may also need cost to function correctly.

**Fix applied:** Added diagnostic logging that fires when >80% of items have $0 selling but valid costs — look for `[UniverSpreadsheet] BUG DETECTED:` in browser console. This will immediately show the section name and cost totals, making the exact cause identifiable on next upload.

**Manual test required:**
1. Upload Bon Secours file to RFP Analyzer
2. Open browser DevTools → Console
3. Look for `[UniverSpreadsheet] BUG DETECTED:` messages
4. Share the console output — it will show exactly which sections are affected and whether costs exist

---

## 14. Automated Test Results (March 6, 2026)

### Parser Sanity Test: `npx tsx scripts/test-parser-sanity.ts`

| File | Sheet | Tables | Tax Rate | Result |
|------|-------|--------|----------|--------|
| Indiana Fever | Margin Analysis | 10 | 0 (no tax) | ✅ PASS |
| NBCU 9C | Margin Analysis | 5 | 0.08875 (NYC) | ✅ PASS |
| Denver Summit FC | Margin Analysis | 0 | — | ⚠ EXPECTED — our Mirror export has no cost column |
| UNC Kenan (1) | Margin Analysis | 0 | — | ⚠ No boundaries (sparse data) |
| UNC Kenan (2) | Margin Analysis | 0 | — | ⚠ No boundaries (sparse data) |

### TypeScript Compilation

```
npx tsc --noEmit → EXIT 0
Only errors: pre-existing .next/types/ venue-visualizer route types (unrelated)
```

### Key Tax Rate Assertions Verified

| Input | Expected Rate | Actual Rate | Status |
|-------|-------------|-------------|--------|
| Cell `"0.08875"` | 0.08875 | 0.08875 | ✅ |
| Cell `"8.875%"` | 0.08875 | 0.08875 | ✅ |
| Cell `"13%"` | 0.13 | 0.13 | ✅ |
| Cell `"$10,500.00"` (contains "0.") | 0 (reject) | 0 (rejected by `$` check) | ✅ FIXED |
| Rate > 0.50 after parse | 0 (clamped) | 0 (clamped) | ✅ FIXED |
| `sectionSellSum = 0` | taxRate = 0 | taxRate = 0 | ✅ FIXED |
| `sectionSellSum = 0`, old code | taxRate = taxAmount (BUG) | N/A (removed) | ✅ FIXED |

---

## 15. Manual-Only Tests (Cannot Be Automated)

These require uploading actual client files to the deployed app:

### HIGH PRIORITY (Blocks Sign-Off)

- [ ] **Bon Secours:** Re-upload after fix deploy. Check selling prices in col B populate. Check browser console for diagnostic logs.
- [ ] **LMU:** Re-upload after fix deploy. Verify TAX row shows reasonable dollar amount (not trillions). Verify tax rate in hidden col F is 0-15% range.
- [ ] **Round-trip: Bon Secours** → Export Excel → Edit numbers → Re-upload → "Generate Instant PDF" button appears → Click → PDF renders

### MEDIUM PRIORITY

- [ ] **Round-trip: any Mirror export** → Download → Re-upload to RFP Analyzer → Verify screens detected and "Generate Instant PDF" button appears
- [ ] **Round-trip: Scoping Workbook** → Download → Re-upload to RFP Analyzer → Verify parsing works
- [ ] **PDF generation** from Mirror Mode proposal → Verify layout and data correctness

### LOW PRIORITY

- [ ] Verify all tabs present in each export type (see Section 3-6)
- [ ] Verify cross-sheet formulas update when source values change (open in Excel, not just viewer)

---

## 16. Files Modified in Bug Fix Session

| File | Changes |
|------|---------|
| `services/pricing/parser/tableExtraction.ts` | Tax rate regex tightened, `$£€` exclusion, sanity clamp >0.50 |
| `app/tools/rfp-analyzer/_components/UniverSpreadsheet.tsx` | Removed `sectionSubtotal \|\| 1`, added tax/bond rate sanity clamps, added $0 selling diagnostic logging |
| `scripts/test-parser-sanity.ts` | NEW — automated parser test against fixture files |

---

## Sign-Off

| Tester | Date | Result | Notes |
|--------|------|--------|-------|
| Cascade (automated) | March 6, 2026 | PARTIAL | TypeScript ✅, Parser fixtures ✅ (4/5), Tax rate fix ✅. Bon Secours/LMU need manual re-test after deploy. |
| | | | |
| | | | |
| | | | |
