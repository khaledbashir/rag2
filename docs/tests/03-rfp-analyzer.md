# Test Guide: RFP Analyzer

**URL:** https://basheer-therag2.prd42b.easypanel.host/tools/rfp-analyzer
**Login:** natalia.kovaleva@anc.com / admin123
**Purpose:** Upload RFP PDF → extract all LED display specs → generate workbook

---

## Setup
- Have an RFP PDF ready (AJP, WJHW, or Clark Construction format)
- Optional: matching bid form Excel to attach alongside
- Good test files: UNC Kenan Stadium, Bon Secours, Washington Commanders, Oklahoma City

---

## Test 1: Basic PDF Upload

1. Navigate to **RFP Analyzer**
2. Drag & drop RFP PDF into upload zone
3. Wait for extraction (10-30 seconds)

**PASS criteria:**
- [ ] Extraction completes without error
- [ ] Displays extracted with: name, dimensions (H x W), pixel pitch, qty, indoor/outdoor
- [ ] Display count matches what's in the RFP
- [ ] No phantom displays (displays that don't exist in RFP)

**FAIL if:** 0 displays extracted, wrong dimensions, extra fake displays added

---

## Test 2: AJP Format (page 30 spec table)

1. Upload an AJP RFP (specs are on page ~30 in a table)
2. Verify extraction

**PASS criteria:**
- [ ] Specs correctly pulled from the table on page 30
- [ ] Alternate displays recognized (e.g. "ALTERNATE 1: INCREASED RESOLUTION")
- [ ] Exact pitch values extracted (R10 = 10.417mm, R8 = 8.333mm)

---

## Test 3: WJHW Format (11 63 11 sections)

1. Upload a WJHW RFP (uses section codes like "11 63 11")
2. Verify extraction

**PASS criteria:**
- [ ] Section codes recognized and data extracted
- [ ] Displays correctly identified

---

## Test 4: PDF + Bid Form Together

1. Upload RFP PDF
2. Also attach bid form Excel in the same upload zone
3. Check the generated workbook

**PASS criteria:**
- [ ] System reads both files
- [ ] Bid form gets auto-populated with ANC specs
- [ ] Column C in bid form shows actual ANC product specs (not RFP specs)
- [ ] "Vendor Name" column shows "ANC"
- [ ] Bid form does NOT auto-download (user should manually download at end)

---

## Test 5: Excel-Only Upload

1. Upload a Cost Analysis Excel (no PDF)
2. Verify system processes it

**PASS criteria:**
- [ ] System accepts Excel without requiring PDF
- [ ] LED Cost Sheet tab is parsed
- [ ] Displays appear in workbook view

---

## Test 6: Workbook Quality Check

After extraction, check the generated workbook:

**LED Cost Sheet tab:**
- [ ] Display names with proposed sizes in first column
- [ ] H x W dimensions show RFP-requested sizes (not ANC product sizes)
- [ ] Total Sq Ft column present
- [ ] Modules, Weight, Power, Amps columns present
- [ ] BTU/hr column present (BTU = watts × 3.412)
- [ ] Circuit count column present (formula: amps ÷ 16A per 20A breaker)

**Margin Analysis tab:**
- [ ] LED displays section
- [ ] CMS section below LED (if in RFP)
- [ ] Scoring section below CMS (if in RFP)
- [ ] Live formulas (not hardcoded values)
- [ ] Install margin links to margin assignments at top of sheet
- [ ] Column I = SUM of C through G

**CMS tab:**
- [ ] Named "CMS" (not "Ross CMS" or other vendor branding)
- [ ] Hardware, Software, Services sections

**Scoring tab:**
- [ ] Hardware, Software, Services sections

**Processor Count tab:**
- [ ] Appears right after LED Cost Sheet

---

## Test 7: Product Auto-Match

1. After extraction, check Product column on LED Cost Sheet
2. Verify products matched correctly

**PASS criteria:**
- [ ] Indoor 4mm → Yaham C4
- [ ] Indoor 2.5mm → Yaham C2.5-MIP
- [ ] Indoor 10mm ribbon → Yaham H10T (NOT R10 outdoor)
- [ ] Outdoor 10mm → Yaham R10
- [ ] Dropdown available on Product cell to manually switch

**FAIL if:** Indoor ribbon pulls outdoor product (R10 vs H10T)

---

## Test 8: Circuit Count Math (Jeremy's Formula)

1. Find a display with known specs (e.g. UNC Blue Zone: 650W/cab, 325 cabs)
2. Check circuit count in workbook

**Expected:** 3328W per 20A circuit ÷ 650W per cab = 5 cabs/circuit → 325 cabs ÷ 5 = 65 circuits

**PASS criteria:**
- [ ] Circuit count matches manual calculation
- [ ] Formula uses 208V, 20A breakers, 80% NEC derating

---

## Notes
- Hard refresh between tests: Ctrl+Shift+R
- "Hanging corner display" appearing = AI hallucination bug, should not happen
- Downloaded LED Cost Sheet must match the online version (20 columns)
- Indoor/outdoor pitch filtering: indoor shows all; outdoor narrows to 3.9mm+
