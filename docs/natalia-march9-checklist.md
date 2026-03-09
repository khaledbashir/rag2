# Natalia March 9 Request — Checklist

**Source:** Slack messages from Natalia (March 9, 2026 ~4:30-4:57 PM)
**Status:** In Progress

---

## 1. Courtside & Stanchion Products — Add to Product Database
> "these are add on products we sell. they have specs tables like LED."

- [x] **1a.** Seed 8 Courtside Table configs into `ManufacturerProduct` table
  - 3.9mm: 10', 8', 6', 5' (costs $15.1K-$16.6K, sale $24.5K-$30K)
  - 2.9mm: 10', 8', 6', 5' (costs $16K-$18.1K, sale $28K-$35K)
  - Physical specs (H/W in feet) + pixel specs (H/W in pixels) from Excel
- [x] **1b.** Seed 4 Stanchion configs into `ManufacturerProduct` table
  - 3.9mm: Single ($5.9K/$30K), Double ($14.8K/$33K)
  - 2.9mm: Single ($7K/$45K), Double ($17.6K/$50K)
- [x] **1c.** Add `productType` values: `"courtside"` and `"stanchion"` (currently only `"led"`, `"tv"`, `"cms"`)
- [x] **1d.** Specs tables render in ProductCatalogBrowser like LED products
  - Added "Courtside" and "Stanchion" filter tabs
  - Added ANC manufacturer badge (red)

## 2. Quick Budget Shortcuts for Courtside & Stanchion
> "this should be living on 'quick budget' thing"

- [x] **2a.** Add "Courtside Table" preset to `DISPLAY_TYPE_PRESETS` in `questions.ts`
  - Defaults: locationType=courtside, pixelPitch=3.9, installComplexity=standard
- [x] **2b.** Add "Stanchion" preset to `DISPLAY_TYPE_PRESETS` in `questions.ts`
  - Defaults: locationType=stanchion, pixelPitch=3.9, installComplexity=standard
- [x] **2c.** Cost categories: Screen + Install only (travel baked into install)
  - Structural, electrical, PM, equipment, data cabling questions hidden for addon products
  - EstimatorBridge uses per-unit pricing (not per-sqft) for courtside/stanchion
  - Install cost left as manual entry (per Natalia: "very hard to calculate")

## 3. Add Another User Login
> "we need one other log in - do i add the person or you?"

- [ ] **3a.** Get name, email, role from Natalia/Ahmad
- [ ] **3b.** Create user via `/api/admin/users` endpoint or admin panel
- [ ] **3c.** Share credentials with Natalia

## 4. Budget → Proposal → LOI → Contract Document Flow (FLAG: BIG)
> "there will be CO to do 'budget-proposal-LOI-CONTRACT'"

**What exists:** DocumentMode enum has BUDGET, PROPOSAL, LOI already.
**What's new:** CONTRACT mode + "one pre other legal page that have slight variations"

- [ ] **4a.** Add `CONTRACT` to `DocumentMode` enum in Prisma schema
- [ ] **4b.** Add CONTRACT mode defaults in `lib/documentMode.ts`
- [ ] **4c.** Add CONTRACT template behavior in `ProposalTemplate5.tsx`
- [ ] **4d.** Legal pre-page (T&C page) that varies by document type
- [ ] **4e.** UI: Document type selector includes CONTRACT option

## 5. Terms & Conditions Template System (FLAG: BIG)
> "this thing but header has to update per what CLIENT says and there are couple types"

**Reference:** Dodgers T&C PDF (3 pages, 8 sections: IP, Ownership, Warranty, Indemnification, Force Majeure, COVID, Misc)

**Variations Natalia listed:**
- With labor warranty / Without
- Labor and materials / Labor only
- With CMS / Without CMS
- With graphics / Without graphics

- [ ] **5a.** Create T&C template data model (store base template + variation toggles)
- [ ] **5b.** Build T&C section registry (8 sections from Dodgers PDF as baseline)
- [ ] **5c.** Dynamic header: client name, project name, entity names swap per deal
- [ ] **5d.** Conditional sections toggle: CMS, graphics, labor warranty, materials
- [ ] **5e.** Warranty terms configuration (duration, scope, exclusions)
- [ ] **5f.** T&C PDF rendering via existing Browserless pipeline
- [ ] **5g.** UI: T&C configuration panel in proposal editor
- [ ] **5h.** T&C attaches to proposal as appendix page(s)

---

## Scope Summary

| # | Item | Size | CO? | Status |
|---|------|------|-----|--------|
| 1 | Courtside & Stanchion products in DB | Medium | No | DONE |
| 2 | Quick Budget shortcuts | Small | No | DONE |
| 3 | Add user login | Small | No | Waiting on user info |
| 4 | Contract document mode + legal page | Big | **Yes — new document type + template** | Pending CO |
| 5 | T&C template system with variations | Big | **Yes — template engine** | Pending CO |

---

## Files Changed

| File | What |
|------|------|
| `prisma/seed-products.ts` | +12 products (8 courtside tables, 4 stanchions) with per-unit pricing |
| `app/components/estimator/questions.ts` | +2 display type presets, +2 location types, showIf guards on 8 questions |
| `app/components/estimator/EstimatorBridge.ts` | Addon product cost model (per-unit, screen+install only) |
| `app/components/estimator/ProductCatalogBrowser.tsx` | +2 product type filters, ANC manufacturer badge |

## Progress Log

| Date | Item | Action | Status |
|------|------|--------|--------|
| 2026-03-09 | — | Checklist created | Done |
| 2026-03-09 | 1, 2 | Products seeded, presets added, bridge updated, build passes | Done |
| 2026-03-09 | 3 | Waiting on name/email/role from Natalia | Blocked |
