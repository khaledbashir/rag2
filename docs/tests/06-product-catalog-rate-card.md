# Test Guide: Product Catalog & Rate Card (Admin)

**URL:** https://proposals.anc.com/admin
**Login:** natalia.kovaleva@anc.com / admin123
**Purpose:** Manage LED products and pricing constants used across all estimates

---

## Test 1: Product Catalog — Browse

1. Go to **Admin → Product Catalog**
2. Browse the catalog

**PASS criteria:**
- [ ] Products visible with: name, manufacturer, pixel pitch, cabinet size, weight, power, IP rating
- [ ] Search works (type "Yaham" → only Yaham products)
- [ ] Filter by manufacturer works
- [ ] Filter by environment (Indoor/Outdoor) works
- [ ] Filter by type works
- [ ] 13+ Yaham products present (Corona, Halo indoor; Radiance, Aura, Halo outdoor)
- [ ] LG TV products present (UH Series, 32" through 110")
- [ ] 23+ OES products present

---

## Test 2: Product Catalog — Pixel Pitch Values

Check these specific products:

| Product | Expected Pitch |
|---------|---------------|
| Yaham R10 | 10.417mm |
| Yaham HO6T | 6mm |
| Yaham H10T | 10mm (indoor ribbon) |
| Yaham C4 | 4mm |
| Yaham C2.5-MIP | 2.5mm |

**PASS criteria:**
- [ ] All pitch values match above table
- [ ] No blank pitch cells for known models

---

## Test 3: Product Catalog — Download Template

1. Click **"Download Template"** button
2. Open file
3. Add a fake product row
4. Re-upload

**PASS criteria:**
- [ ] Template downloads as Excel
- [ ] Re-upload imports new product
- [ ] New product appears in catalog immediately

---

## Test 4: Rate Card — View Constants

1. Go to **Admin → Rate Card**
2. Review all 41 cost constants

**PASS criteria:**
- [ ] Yaham pricing waterfall visible: Ex-works → +10% tariff → +5% shipping → +28% LGEUS markup
- [ ] Indoor LED rates by pitch present (e.g. 4mm indoor = $178.09/sqft)
- [ ] Outdoor LED rates by pitch present (e.g. 4mm outdoor = $232.53/sqft)
- [ ] Install labor rate present (~$105/sqft standard)
- [ ] Electrical rate present ($125/sqft)
- [ ] PM fee present (~$5,882/display)
- [ ] Engineering fee present (~$4,706/display)
- [ ] Shipping rate present (~$0.50/lb)
- [ ] Spare parts rate present (5% of hardware)
- [ ] Union uplift present (+15% on labor)
- [ ] Bond rate present (1.5%)

---

## Test 5: Rate Card — Edit & Save

1. Click on any rate card value
2. Edit it inline (e.g. change bond rate from 1.5% to 2%)
3. Create a new estimate and check bond calculation

**PASS criteria:**
- [ ] Edit saves immediately
- [ ] New estimate uses updated rate
- [ ] Change takes effect across all future estimates

---

## Test 6: Outdoor vs Indoor Rate Differentiation

1. In Rate Card, verify indoor vs outdoor pricing

**Expected rates:**

| Pitch | Indoor $/sqft | Outdoor $/sqft |
|-------|--------------|----------------|
| 2.5mm | $251.57 | $536.25 |
| 4mm | $178.09 | $232.53 |
| 6mm | $136.51 | $260.14 |
| 8mm | — | $194.07 |
| 10mm | $112.22 | $154.79 |

**PASS criteria:**
- [ ] Rates match above table
- [ ] Estimator uses correct indoor vs outdoor rate (not mixing them)

**FAIL if:** Outdoor 10mm pulls $112.22 (indoor rate) — this was a known bug, must stay fixed

---

## Notes
- Rate card changes = instant effect on all new estimates
- When LGEUS sends updated Yaham pricing, update the single ex-works value → propagates automatically
- OES pricing from quotes 2010-2025 loaded — treat as template, update numbers when Jeremy confirms
