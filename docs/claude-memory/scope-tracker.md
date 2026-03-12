# ANC Scope Tracker — Post-Phase 2 Features

> **CORE RULE: Keep this updated after every feature/fix built from stakeholder feedback.**
> When something new gets built or requested, add it here immediately.
> This is Ahmad's change order reference — what was given for free vs what's still pending.

## Status Key
- **FREE** = built without a change order
- **QUEUED** = requested, not built yet (change order candidates)
- **SCOPED** = formally in a change order / paid phase

---

## From Natalia (RFP Analyzer)

### Built (FREE)
1. QTY/dimension editing on LED Cost Sheet — FREE (6 commits)
2. Total Cost recalculates when QTY changes — FREE
3. Product dropdown selection (working, alphabetical) — FREE
4. Product matching (correct catalog, real specs) — FREE

5. Cross-document mismatch detection (QTY, pitch, dimensions between RFP and bid form) — FREE
6. Editable install/structural/engineering costs in-browser — FREE
7. Editable LED hardware cost (hard vendor quotes) — FREE
8. Structural cost as separate column — FREE
9. Add custom line items to Margin Analysis — FREE
10. Per-item margin control (set margin % per display) — FREE
11. LED Cost Sheet restructured to 20-col ANC format (Vendor, SqFt, NITs, Service, Processor, Shipping, Margin%, Selling Price) — FREE
12. Margin Analysis restructured to flat ANC format (Line Item | Cost | Selling | Margin$ | Margin%) — FREE
13. Add/remove screens on LED Cost Sheet (× to delete, + Add Screen row) — FREE
14. Bid form review-before-download (no auto-download, shows match results + Download button) — FREE
15. Bid form auto re-fills when specs/pricing edited (debounced 2s) — FREE

### Building Now (FREE — Natalia sent UNC Kenan Stadium workbook as reference)
13. Install (Base) sheet — per-zone structural/labor/electrical breakdowns (300+ line items)
14. Extended Warranty sheet — Year 3-10 pricing tiers
15. Responsibility Matrix — ANC vs Purchaser scope checklist
16. Form (Vendor Spec) sheet — 60+ specs per display
17. Config sheet — panel layout per display
18. Travel sheet — per-person daily rates, weekly rollup
19. P&L sheet — revenue vs cost vs margin summary
20. Cash Flow sheet — monthly payment schedule
21. POs sheet — purchase order tracking
22. Vendor Pricing BOM — panel-by-panel manufacturer costs

### Workbook Polish (FREE — from Jireh — 8ad42638)
23. Install Column I: SUM(C:G) formula instead of hard values — FIXED
24. Install Margin: linked to margin assignment rows at top of sheet — FIXED
25. CMS tab renamed from "CMS (Ross)" to generic "CMS" — FIXED
26. New Scoring tab (Hardware/Software/Services sections) — BUILT
27. CMS + Scoring placeholder rows in Margin Analysis tab — BUILT
28. Processor Count moved right after LED Cost Sheet — FIXED
29. LED Cost Sheet download expanded from 11→20 columns matching online format — FIXED
30. Online workbook tab order + MA sections synced with download — FIXED

---

## From Jireh (Estimator)

### Built (FREE)
1. Supply Only mode + margin columns + labor breakdown — FREE
2. TV display grouping by model + size — FREE
3. CMS, Scoring, and Warranty sections — FREE
4. Excel formulas (SUM, blended margin) — FREE
5. Per-category margin split (LED 30%, Services 20%, CMS 35%) — FREE
6. Bid form auto-fill (AJP dual upload, Column C detection) — FREE
7. Labor worksheet → Budget Summary direct integration — FREE
8. Accessories listed separately below labor on Budget Summary — FREE

### Not Built Yet (QUEUED)
_(none currently)_

---

## From Jeremy (Estimator Bugs → Fixed)

### Bug Fixes (FREE — reasonable fixes)
1. Custom margins not applying (|| vs ?? nullish coalescing) — FIXED (c74133e0)
2. Bond/Tax still adding when set to 0 (same || bug) — FIXED (c74133e0)
3. Copilot "error: terminated" on complex questions — FIXED (b7beaad0, 60s timeout + graceful error)

### Not Built Yet (QUEUED)
1. Signage/aesthetics options in estimates — needs team input on options/pricing

---

## Ahmad's Own Requests (not stakeholder-driven, not billable)
- History page pipeline stepper redesign — DONE
- History page made editable — DONE
- Win/Loss Pipeline dashboard (/admin/ops) — DONE
- Dashboard Chat upgrade (system guard, chips, stats) — DONE
- Soft delete proposals — DONE
- Vendor Operations page + Activity Feed — DONE
- User Stats Cards on admin — DONE
- Created By tracking across all routes — DONE

---

## From Natalia (Estimator)

### Bug Fixes (FREE)
1. LED margin showing blended instead of LED-specific (ledMarginPct fix) — FIXED (055ad940)
2. 19000000% margin display bug in exported Excel — FIXED (indirect, margin values now correct)
3. Margin tier not syncing to individual fields — FIXED (c74133e0)
4. Project Info showing hardcoded tier labels instead of actual values — FIXED (c74133e0)

### Built (FREE)
5. **Alt pitch system** — 2-3 pixel pitch alternates per display, only LED hardware cost changes. Multi-select question after pixel pitch, interleaved alt rows in Display Details + Budget Summary with yellow highlighting, totals exclude alts. — BUILT (5c2bd11b)
6. **PDF download unblock** — Mirror mode PDF-only download no longer blocked by missing audit/verification. Download Bundle still requires full checks. — BUILT (0b393948)

### Requested / Discussed (QUEUED → BUILT)
1. **Spec Generator Tool (Product Data Forms)** — Full platform tool at /tools/spec-generator. Upload blank template + cost analysis → auto-match from 14+ product DB → editable WorkbookShell preview → download formatted .xlsx. Includes LED Product KB (18 products, 4 vendors) + Gemini prompt for Natalia's "Product Form Genie" mini-app. — BUILT (c15dc104)
2. **Product replacement UX** — "Swap" button on display card. Noted, not started.
3. **Live Excel formulas** — Already partially done (SUM, margin formulas in export). Full live recalc TBD.
4. **RFP ↔ Estimator Excel format alignment** — Natalia/Jireh want them to match. Team deciding which format. Decision expected soon.
5. **Margin tier label swap** — Natalia thinks Budget should have higher margins (safety buffer). Business decision pending.

---

## From Natalia (March 9, 2026)

### Built (FREE)
1. **Courtside & Stanchion products** — 12 products (8 tables, 4 stanchions) seeded in ManufacturerProduct with per-unit pricing from Natalia's Excel. ANC manufacturer badge, filter tabs in product catalog browser. — BUILT
2. **Quick Budget shortcuts** — "Courtside Table" and "Stanchion" presets added to estimator display type selector. Auto-fills locationType/pixelPitch/complexity. Screen + Install only (structural/electrical/PM questions hidden). — BUILT

### Built (FREE — CO territory, given for free)
3. **CONTRACT document mode** — Full 4th document mode (Budget → Proposal → LOI → Contract) across 18+ files. CONTRACT inherits LOI layout, adds T&C exhibit. Document Mode selector, Pipeline badge, PDF label, Promote to Contract button. — BUILT
4. **T&C Exhibit (Exhibit C)** — Terms and Conditions page for CONTRACT mode. 8 legal sections from Dodgers template, toggleable (labor warranty, materials, CMS, graphics). Blue-bar section headers matching PDF style. Master on/off toggle in PDF section controls. Individual section toggles + warranty years in Text Editor panel. Purchaser name auto-fills. — BUILT
5. **New user login** — Ahmad handled directly. — DONE

### Pending (waiting on external input)
6. **T&C additional legal clauses** — Natalia: "legal will provide those 2-3 things." When received, add as new numbered sections in PdfTermsAndConditions.tsx. — WAITING ON LEGAL

---

## From Natalia (March 12, 2026 — Live Testing Batch)

### Bugs (FREE — reasonable fixes)
1. **Missing underpass screens** — ✅ FIXED
2. **#NAME? errors on Yaham rows** — ✅ FIXED
3. **Processor/shipping $0 on RFP export** — ✅ FIXED
4. **Unify LED sheet between Budget Builder and RFP** — ✅ FIXED
5. **Manual add screen** — ✅ FIXED
6. **Margin Analysis tab missing from RFP export** — RFP workbook doesn't generate an MA tab. Needs same MA sheet that Budget Builder produces (Cost, Selling Price, Margin $, Margin %). — QUEUED
7. **H/W dimension edits don't recalculate pixels or price** — On LED sheet (both RFP and Budget Builder), editing height/width in feet doesn't update pixel dimensions, SqFt, modules, weight, power, or price. Must be reactive to manual edits. — QUEUED

### Requested (QUEUED)
8. **Spec sheets in navigation** — Natalia asked "where is spec sheets thingy on the engine?" Wants it added to navbar. — QUEUED

---

## From Jireh (March 12, 2026)

### Requested (QUEUED)
1. **Navigation labels / feature discovery** — "Is it possible to add to navigation the names of the different features or maybe a box that enlarges?" Wants clearer feature names in nav. — QUEUED

---

## Reasonable Fixes (NOT scope creep — just making delivered features work)
- Product dropdown selection bug — BUG FIX
- QTY editing off-by-one — BUG FIX
- Alphabetical dropdown sort — POLISH
- Read-only tabs preventing phantom edits — BUG FIX
- Back button visibility — UX FIX
- "Services" → "Installation Services" naming — LABEL FIX
- Bond/Tax "Not Included" button — UX SHORTCUT
- Margin $/% columns on existing tables — DISPLAY TWEAK
- Blended margin split into two lines — FORMATTING
- User column on project list — SIMPLE ADD
