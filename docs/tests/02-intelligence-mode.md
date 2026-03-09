# Test Guide: Intelligence Mode (Estimator / Build from Scratch)

**URL:** https://proposals.anc.com/estimator
**Login:** natalia.kovaleva@anc.com / admin123
**Rule:** Math engine recalculates everything. Formula: Sell = Cost / (1 - Margin%)

---

## Setup
- No Excel needed — builds from scratch via questionnaire
- Have a real project in mind (client name, venue type, display count)

---

## Test 1: Full Questionnaire Flow

1. Click **"Estimator"** in navbar
2. Click **"New Estimate"**
3. Fill in:
   - Project Name: any
   - Client Name: any
   - Indoor / Outdoor: toggle
   - Union / Non-Union: toggle
4. Click **"Add Display"**
5. Fill in:
   - Display Name (e.g. "Main Scoreboard")
   - Width: 40 ft
   - Height: 20 ft
   - Pixel Pitch: 4mm
   - Qty: 1
6. Proceed through all questions to end
7. Review Excel preview

**PASS criteria:**
- [ ] All questions load without errors
- [ ] Back button works on every step
- [ ] LED hardware cost appears in Budget Summary
- [ ] Structural, install labor, electrical, PM, engineering, shipping all appear
- [ ] Bond = 1.5% of sell price
- [ ] Grand total = subtotal + bond + tax

---

## Test 2: Margin Math Verification

1. Create estimate with one display
2. Note the LED Cost and LED Margin %
3. Manually verify: Sell Price = Cost / (1 - Margin%)

**Example:** Cost = $100,000 at 15% margin → Sell = $100,000 / 0.85 = $117,647

**PASS criteria:**
- [ ] Math checks out to the dollar
- [ ] LED margin % used is 15% (not blended margin)
- [ ] Services margin is separate from LED margin

**FAIL if:** Wrong margin applied, blended margin used instead of LED-specific

---

## Test 3: Bond & Tax = 0

1. Create an estimate
2. Set Bond Rate to 0%
3. Set Sales Tax to 0%
4. Check Budget Summary

**PASS criteria:**
- [ ] Bond line shows $0
- [ ] Tax line shows $0
- [ ] Grand total = subtotal only

**FAIL if:** Bond or tax still calculate despite being set to 0

---

## Test 4: Alternate Pixel Pitches

1. Add a display (e.g. 4mm primary)
2. Select 2 alternate pitches (e.g. 2.5mm, 6mm)
3. Check Budget Summary and Display Details

**PASS criteria:**
- [ ] ALT rows appear in Display Details
- [ ] ALT rows show cost diff for LED hardware only
- [ ] Labor, PM, engineering do NOT double-calculate for alts
- [ ] Alternates NOT added to grand total

---

## Test 5: Supply Only Mode

1. On Installation Services Margin question → click **"Supply Only"**
2. Check Budget Summary

**PASS criteria:**
- [ ] No install labor line item
- [ ] No PM, no engineering, no structural
- [ ] Only LED hardware + shipping

---

## Test 6: CMS / Scoring / Warranty Sections

1. During questionnaire, enable CMS section
2. Enable Scoring section
3. Enable Warranty (pick 3 years)
4. Review Budget Summary

**PASS criteria:**
- [ ] CMS appears as its own section below Installation Services
- [ ] Scoring appears as its own section
- [ ] Warranty shows dollar value
- [ ] All three roll into subtotal, bond, and grand total

---

## Test 7: Excel Export

1. Complete an estimate → click **"Export Excel"**
2. Open downloaded file

**PASS criteria:**
- [ ] File opens without errors
- [ ] Tabs present: Display Details, LED Cost Sheet, Budget Summary, Labor Worksheet, Margin Analysis, Processor Count
- [ ] Live formulas in cells (not hardcoded values)
- [ ] Column I on Install tab = SUM of C through G
- [ ] Margin $ and Margin % columns present in Display Details
- [ ] TV model numbers show correctly (not with "mm" suffix)
- [ ] CMS and Scoring tabs present if enabled

---

## Test 8: Budget vs Proposal Mode

1. Create estimate in **Budget** mode
2. Duplicate → switch to **Proposal** mode
3. Compare margins

**PASS criteria:**
- [ ] Different margin tiers applied correctly per mode
- [ ] Switching mode updates grand total

---

## Notes
- Hard refresh between tests: Ctrl+Shift+R
- If custom margins are ignored → margin tier sync bug
- If project info changes don't update grand total → known limitation (Excel is static export)
