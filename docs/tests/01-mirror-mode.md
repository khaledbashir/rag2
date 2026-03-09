# Test Guide: Mirror Mode (Excel → PDF)

**URL:** https://proposals.anc.com
**Login:** natalia.kovaleva@anc.com / admin123
**Rule:** NO math recalculation. Output must exactly match input Excel.

---

## Setup
- Have a real ANC cost analysis Excel ready (needs: Margin Analysis tab + LED Cost Sheet tab)
- Good test files: Bon Secours, UNC Kenan, Washington Commanders

---

## Test 1: Basic Upload & Parse

1. Login → land on Dashboard
2. Click **"New Project"**
3. Select **"Mirror Mode"**
4. Drag & drop Excel file into upload zone
5. Wait for parse (5-15 seconds)

**PASS criteria:**
- [ ] All display rows appear — count matches Excel
- [ ] Display names match Excel exactly (same capitalization, same order)
- [ ] Pricing per row matches Excel exactly (no rounding)
- [ ] Subtotal, bond, tax, grand total match Excel exactly
- [ ] Alternates appear as separate section (NOT summed into grand total)

**FAIL if:** Any number is different from Excel, any row is missing, order is different

---

## Test 2: Hidden Rows

1. Upload an Excel that has hidden rows
2. Check the pricing table in the UI

**PASS criteria:**
- [ ] Hidden rows do NOT appear by default
- [ ] Toggle button exists to show/hide them

---

## Test 3: Multi-Bid Excel (e.g. Washington Commanders)

1. Upload a file with multiple bid options in one sheet
2. Verify each bid appears as its own section

**PASS criteria:**
- [ ] Each bid option is a separate section
- [ ] Alternates below each bid are separate (not merged)

---

## Test 4: PDF Export

1. After successful parse → click **"Export PDF"**
2. PDF should open in new tab or download

**PASS criteria:**
- [ ] PDF downloads (not blocked)
- [ ] Tab title shows project name (not "about:blank")
- [ ] ANC logo appears top-left
- [ ] Font is Work Sans (not Arial, not system font)
- [ ] Section headers are French Blue (#0A52EF)
- [ ] All line items present
- [ ] Grand total on PDF matches grand total in Excel
- [ ] Alternates section is present and separate

**FAIL if:** PDF blank, PDF blocked, wrong grand total, missing sections

---

## Test 5: Document Type Toggle

1. In project settings, toggle between **Budget / Proposal / LOI**
2. Export PDF for each type

**PASS criteria:**
- [ ] Budget: shows full cost breakdown
- [ ] Proposal: client-facing format
- [ ] LOI: Letter of Intent format with signature block

---

## Test 6: Currency Detection

1. Upload a UK Excel (Leeds FC — prices in GBP)
2. Check that system auto-detects pounds

**PASS criteria:**
- [ ] Currency shows £ not $
- [ ] VAT is recognized (not just "Tax")
- [ ] No #DIV/0! errors

---

## Notes
- Hard refresh between tests: Ctrl+Shift+R
- If specs column shows wrong pitch after upload → product parsing bug
- If grand total is off by even $1 → fail, Mirror Mode must be exact
