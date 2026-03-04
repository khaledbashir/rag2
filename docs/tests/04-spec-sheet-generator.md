# Test Guide: Spec Sheet Generator (Product Data Form)

**URL:** https://basheer-therag2.prd42b.easypanel.host
**Login:** natalia.kovaleva@anc.com / admin123
**Purpose:** Generate one filled-out product data form per LED display from a Cost Analysis Excel

---

## Setup
- Have a Cost Analysis Excel with a "FORM" tab (client's product data form template baked in)
- OR: have the blank product data form + Cost Analysis Excel as two separate files
- Test file: Capital One Arena - Product Data Forms.xlsx (42 displays)

---

## Test 1: FORM Tab Detection

1. Open a project (Mirror Mode) that has a FORM tab in its Excel
2. Look for the **Spec Sheet** option in the toolbar or export menu
3. Click **"Generate Spec Sheets"**

**PASS criteria:**
- [ ] System detects FORM tab automatically
- [ ] One output sheet generated per LED display
- [ ] Sheet count matches LED display count in LED Cost Sheet

---

## Test 2: Field Population Per Display

Open one generated spec sheet and verify:

**PASS criteria:**
- [ ] Display name/ID correct (e.g. LED-L1-01)
- [ ] Location correct
- [ ] Vendor correct (LG or Yaham)
- [ ] Product model correct
- [ ] Pixel pitch correct
- [ ] Physical dimensions correct (H x W in ft/m)
- [ ] Pixel count correct (H x W pixels)
- [ ] Sq ft correct
- [ ] NITs correct
- [ ] Viewing angles populated (if in product catalog)
- [ ] Power consumption populated
- [ ] Weight populated
- [ ] Color temperature populated
- [ ] IP rating populated (outdoor displays)

---

## Test 3: Missing Fields Detection

1. After generation, check if system flags missing fields

**PASS criteria:**
- [ ] System identifies which fields are blank across all displays
- [ ] Missing fields reported: Physical Display Size with Borders, Pixel Fill Factor %, Color Space (Rec 709, DCI-P3, Rec 2020)
- [ ] These are known blanks — LG doesn't publish them for LSCC series

---

## Test 4: Auto-Fill Memory (Learn Once, Remember Forever)

1. Generate spec sheets for a project
2. Manually fill in a missing field (e.g. Pixel Fill Factor for LG LSCC012)
3. Generate spec sheets for a DIFFERENT project with the same product
4. Check if the previously filled value auto-populates

**PASS criteria:**
- [ ] Value auto-fills on second project
- [ ] Match is by: manufacturer + model + pitch

---

## Test 5: Gemini Product Form Genie (External Tool)

This is a separate Gemini-based tool — not in the main app.

1. Open the Product Form Genie prompt (see `Product Data Form Generator - Gemini Prompt.md`)
2. Upload: blank client product data form template + Cost Analysis Excel
3. Verify Gemini fills one sheet per display

**PASS criteria:**
- [ ] One sheet per LED display (skip non-LED rows)
- [ ] Formatting matches blank template exactly (merged cells, colors, fonts)
- [ ] All LED- prefixed rows processed
- [ ] ALT rows marked as ALTERNATE

---

## Test 6: Download

1. After generation, click download
2. Open the file

**PASS criteria:**
- [ ] File downloads (not blocked)
- [ ] File opens in Excel without errors
- [ ] Each display is a separate sheet/tab
- [ ] Formatting preserved (not plain text)

---

## Notes
- Known missing fields (not bugs): Physical Display Size with Borders, Pixel Fill Factor %, Color Space Rec 709/DCI-P3/Rec 2020
- Mesh displays (LED-L1-03, LED-L1-04) may have blank vendor — confirm if Yaham before filling
- LG LSCC series = known spec gaps, normal
