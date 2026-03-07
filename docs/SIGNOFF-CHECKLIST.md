# Phase 2 Signoff Checklist

**Purpose**: Verify every deliverable before declaring this phase complete.
**Rule**: No new architecture moves until every item below is PASS or ACCEPTED.

---

## A. Canonical Workbook Contract (14 tabs)

| # | Item | Expected | Status | Notes |
|---|------|----------|--------|-------|
| A1 | Project Overview tab exists | First tab, project info + financial params + display summary + document total | IMPLEMENTED | Renamed from "Project Info" in preview, "Project Overview" in export |
| A2 | Margin Analysis tab exists | Per-screen sections with LED HW / Structural / Install / Electrical / PM / Engineering / Equipment sub-lines. TAX/BOND/TARIFF per screen. CMS + Scoring. BASE BID GRAND TOTAL. | IMPLEMENTED | Same structure in preview + export |
| A3 | Budget Summary tab exists | Category pivot: LED HW, Structural, Install, Electrical, PM/Travel, Engineering, Equipment. SUM formulas. | IMPLEMENTED | |
| A4 | LED Cost Sheet tab exists | 23-col format: vendor, product, pitch, dims, pixels, sqft, NITs, $/sqft, cost, margin, selling, weight, power, BTU | IMPLEMENTED | Renamed from "Display Details" in preview |
| A5 | Tech Specs tab exists (no pricing) | Same dims as LED Cost Sheet, no cost/margin columns | IMPLEMENTED | New in preview + export |
| A6 | Install sheets (one per screen) | 4 sections: Structural Materials, Structural Labor, Electrical, Engineering. Sub-bid columns in export, simplified in preview. | IMPLEMENTED | New per-screen tabs in preview |
| A7 | Processor Count tab exists | Pixel math, NovaStar 660 Pro port calculation | IMPLEMENTED | New in preview + export |
| A8 | Bundle Equipment tab exists | Per-display component breakdown or placeholder | IMPLEMENTED | |
| A9 | Travel tab exists | Template | IMPLEMENTED | Placeholder in preview, template in export |
| A10 | CMS tab exists (conditional) | Shows when CMS enabled | IMPLEMENTED | |
| A11 | Scoring tab exists (conditional) | Shows when Scoring enabled | IMPLEMENTED | |
| A12 | Resp Matrix tab exists | ANC vs Purchaser grid | IMPLEMENTED | Placeholder in preview, full in export |
| A13 | P&L tab exists | Revenue/cost/margin tracking | IMPLEMENTED | Placeholder in preview, template in export |
| A14 | Cash Flow tab exists | Monthly projection | IMPLEMENTED | Placeholder in preview, template in export |

## B. Preview = Export

| # | Item | Expected | Status | Notes |
|---|------|----------|--------|-------|
| B1 | Preview tab count matches export tab count | Same number of tabs visible in preview as in downloaded .xlsx | IMPLEMENTED | 14+ tabs in both |
| B2 | Preview tab names match export tab names | Project Overview, Margin Analysis, Budget Summary, LED Cost Sheet, Tech Specs, [Display] - Install, Processor Count, Bundle Equipment, Travel, CMS, Scoring, Resp Matrix, P&L, Cash Flow | IMPLEMENTED | |
| B3 | Preview totals match export totals | Grand total in preview MA = grand total in exported MA | NEEDS VERIFICATION | Same calculation engine (EstimatorBridge for preview, generateScopingWorkbook for export). Numbers may differ slightly due to different rate sources. |
| B4 | Preview margin structure matches export | Per-screen sections with same category sub-lines | IMPLEMENTED | |

## C. Export Path Convergence

| # | Item | Expected | Status | Notes |
|---|------|----------|--------|-------|
| C1 | RFP Analyzer export uses canonical generator | `/api/rfp/pipeline/scoping-workbook` → `generateScopingWorkbook` | VERIFIED | Direct call, always used this |
| C2 | Estimator export uses canonical generator | `/api/estimator/export-unified` → `mapEstimatorToScoping` → `generateScopingWorkbook` | VERIFIED | Phase 1 |
| C3 | Mirror Mode (with pricingDoc) uses canonical generator | `/api/proposals/export/audit` → `mapMirrorToScoping` → `generateScopingWorkbook` | VERIFIED | Phase 2 |
| C4 | Mirror Mode (no pricingDoc) uses canonical generator | `/api/proposals/export/audit` → `mapIntelligenceToScoping` → `generateScopingWorkbook` | VERIFIED | MA standardization fix |
| C5 | Intelligence Mode uses canonical generator | `/api/proposals/export/audit` → `mapIntelligenceToScoping` → `generateScopingWorkbook` | VERIFIED | Phase 3 |
| C6 | No export path bypasses canonical MA | All 5 paths call `generateScopingWorkbook` | VERIFIED | Legacy generators still importable but not called |

## D. Estimator Financial Integrity

| # | Item | Expected | Status | Notes |
|---|------|----------|--------|-------|
| D1 | LED margin survives to export | User sets 38% → export MA shows 38% | IMPLEMENTED | `mapEstimatorToScoping` → `overrides.ledMarginPct` |
| D2 | Services margin survives to export | User sets 20% → export shows 20% | IMPLEMENTED | `overrides.servicesMarginPct` |
| D3 | Tax rate survives to export | User sets 9.5% → export MA TAX cell = 9.5% | IMPLEMENTED | `overrides.taxRate` |
| D4 | Bond rate survives to export | User sets 0% → no bond. User sets 1.5% → bond at 1.5% | IMPLEMENTED | `overrides.bondRate` |
| D5 | Per-display install complexity | Display 1 standard, Display 2 heavy → separate Install sheets with different rates | IMPLEMENTED | `overrides.perDisplayComplexity[]` |
| D6 | Product selection preserved | User picks "LG C1.2" → export shows LG vendor + product name | IMPLEMENTED | `spec.selectedProductId` → `getProduct()` in LED Cost Sheet |
| D7 | CMS allocation preserved | User sets $25K CMS → export MA shows $25K CMS | IMPLEMENTED | `overrides.cmsAllocation` |
| D8 | Scoring allocation preserved | User sets $15K scoring → export shows $15K | IMPLEMENTED | `overrides.scoringAllocation` |
| D9 | Union labor applied | Union = Yes → 15% uplift on service costs | IMPLEMENTED | `overrides.isUnionLabor` |
| D10 | PM complexity applied | Complex = 2× PM/Eng fees, Major = 3× | IMPLEMENTED | `overrides.pmComplexity` |

## E. Mirror Mode Integrity

| # | Item | Expected | Status | Notes |
|---|------|----------|--------|-------|
| E1 | LED hardware cost from uploaded Excel preserved | Not recomputed from catalog | VERIFIED | `priced.hardwareCost` used directly |
| E2 | Service costs from uploaded Excel preserved | Structural + install + electrical total matches uploaded | FIXED | Was recomputing from BUDGET_RATES. Now uses `priced.installCost` when available (commit 60dce483). |
| E3 | PM/Engineering costs preserved | From uploaded Excel | VERIFIED | `priced.pmCost`, `priced.engCost` used directly |
| E4 | Tax rate derived from uploaded Excel | HST 13% → shows 13% | VERIFIED | `deriveOverrides` extracts from PricingDocument |
| E5 | Bond rate derived from uploaded Excel | Bond $X / Subtotal $Y → rate preserved | VERIFIED | `deriveOverrides` computes `bond/subtotal` |
| E6 | Document total trustworthy | Export grand total ≈ uploaded Excel grand total | NEEDS VERIFICATION | With E2 fix, service costs are now preserved. Totals should be close. Verify with real file. |
| E7 | Section names from uploaded Excel | Display section headers use original Excel section names | VERIFIED | `buildSpec` uses `table.name` from PricingDocument |

## F. Guided Estimator UX

| # | Item | Expected | Status | Notes |
|---|------|----------|--------|-------|
| F1 | Manual mode is the default entry | User lands on "Client Name" input, no AI landing screen | IMPLEMENTED | `manualChosen` defaults to `true` |
| F2 | Question labels are direct, not conversational | "Client Name" not "Who's the client?" | IMPLEMENTED | All 42 labels renamed |
| F3 | Section context labels show current group | "DISPLAY 1 — STRUCTURE" not "Question 14" | IMPLEMENTED | `getSectionLabel()` + `getFinancialSection()` |
| F4 | AI pre-fill is secondary, not primary | Small link on first question, not a landing screen | IMPLEMENTED | |

## G. Rate Card Integration

| # | Item | Expected | Status | Notes |
|---|------|----------|--------|-------|
| G1 | Electrical rate from DB rate card | Admin changes `electrical.materials_per_sqft` → export uses new value | IMPLEMENTED | `rc("electrical.materials_per_sqft", 125)` |
| G2 | PM/Engineering fees from DB rate card | Admin changes `other.pm_base_fee` → export uses new value | IMPLEMENTED | |
| G3 | LED cost per sqft from DB rate card | Admin changes `led_cost.4mm` → export uses new value | IMPLEMENTED | |
| G4 | Spare parts % from DB rate card | Admin changes `spare_parts.led_pct` → export uses new value | IMPLEMENTED | |
| G5 | Bond rate from DB rate card | Admin changes `bond_tax.bond_rate` → export uses new value | IMPLEMENTED | |
| G6 | Fallback when DB empty | All costs compute from hardcoded defaults, no errors | IMPLEMENTED | `rc(key, fallback)` pattern |

---

## Verification Required (with real files)

| # | Test | Files Needed | Owner |
|---|------|-------------|-------|
| V1 | Budget project: Estimator → export → verify 14 tabs, totals, margins | Create in Estimator with 3 displays | |
| V2 | RFP project: Upload PDF → online spreadsheet → export workbook → verify tabs and totals | Any multi-display RFP PDF | |
| V3 | Mirror project: Upload ANC Excel → Download Bundle → compare exported totals to original Excel | Indiana Fever or NBCU Excel | |
| V4 | PDF generation: Mirror project → generate PDF → no 422 error, totals match | Same as V3 | |
| V5 | Cross-path: Same project data entered via Estimator AND uploaded as Excel → compare exported workbooks | Need matching data | |

---

## Status Summary

- **IMPLEMENTED**: Code is written and pushed
- **VERIFIED**: Code traced and confirmed correct
- **FIXED**: Bug found and fixed in this phase
- **NEEDS VERIFICATION**: Implemented but needs real-file testing
- **NOT STARTED**: Not yet addressed

### Counts
- IMPLEMENTED / VERIFIED / FIXED: 35 items
- NEEDS VERIFICATION: 2 items (B3, E6 — need real file testing)
- NOT STARTED: 0 items

### Commits in this phase
1. `7eb0a956` — Phase 1: estimator export integrity (financial overrides)
2. `1cec3115` — Product selection + per-display complexity
3. `bb104b0a` — Phase 2: Mirror → canonical workbook
4. `997ad867` — Phase 3: Intelligence → canonical workbook
5. `230cf109` — MA standardization: eliminate last bypass
6. `0e5aded8` — Guided estimator UX (labels + sections + AI demoted)
7. `a380bfdf` — Rate card integration in generator
8. `9ffa9faa` — Product selection in cost computation
9. `c0c837ff` — Preview unified with canonical 14-tab contract
10. `60dce483` — Critical fix: Mirror service cost preservation
