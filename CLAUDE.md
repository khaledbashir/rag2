# Project: ANC Proposal Engine (rag2)

## 🧊 RFP ANALYZER — FROZEN (Production-approved 2026-04-02)
DO NOT TOUCH. Behavior must remain IDENTICAL. No "quick fixes" or "improvements".

**Protected (NO EDIT without Ahmad's explicit approval):**
- `app/rfp-analyzer/**/*`, `services/rfp/pipeline/**/*`, `app/api/rfp/**/*`, `app/components/rfp/**/*`
- Any file with "rfp" in name/path.

**Shared Modules (READ-ONLY unless approved):**
- `WorkbookShell.tsx`, Product/Rate card queries, any utility used by Estimator + RFP.
- *If modifying:* Explain what/why/RFP impact -> Get approval -> Write test proving RFP unchanged -> Edit.
- *Verify:* After sessions touching estimator, confirm: "Verified no RFP-protected/shared files were modified."

## 🏀 Estimator — Courtside/Stanchion Rules
- Courtside tables & stanchions are FIXED-DIMENSION (no manual H/W).
- Wizard: pitch toggle (3.9/2.9mm) + size cards (Tables: 10'/8'/6'/5', Stanchions: Single/Double).
- Dims auto-populate from DB (`extendedSpecs.displayWidthFt`, etc).
- Seed: `prisma/seed-courtside-tables.ts`. (LED displays still manual dims).

## 🚀 What's Live
- Auto-populated courtside/stanchion wizard, Premium SOW default DOCX (2026-04-03)
- Cost sheet row/formula/TOTAL row fixes (2026-04-03)
- RFP Analyzer Univer preview migrated to unified server generator to match export exactly (2026-04-04)
- Native Univer dropdown overlays added for Product and Qty columns (2026-04-04)
- Mirror Mode margin-sheet detection now prefers populated non-CMS tabs and preserves GBP via sheet names or Excel currency formatting (2026-04-07)
- Currency FX threading across 6 surfaces (wizard/PDF/cost sheet/Excel/margin/rate card), behind `FEATURES.CURRENCY_EXCHANGE_RATE` flag (2026-04-17)
- RFP Analyzer LED Cost Sheet Column A display renaming and independent duplicate display row edits fixed (2026-04-24)
- ANC Twenty CRM mobile metadata quota/chunk-cache crash fixed in live image `twenty-anc:metadata-field-quota-fix-20260501e` (2026-05-01)

## 🎯 ANC Twenty CRM — #1 priority (decision Mon-Tue 2026-04-21/22)
- Live at `https://crm.ancsports.net` — replaces Salesforce
- 8,360 opportunities · 3,730 companies · 5,160 revenue splits · 20K+ design requests
- 17 new Opp fields added 2026-04-17: probability, proposalDueDate, substantialCompletionDate, paidAmount, percentPaid, accountExecutive, accountExecutiveEmail, margin, revenue2026, margin2026, revenue2027, margin2027, proposalStage, priority, pricingComplete, technologyVendorPartner, pricingCompleteDate
- 11 new dashboard widgets on ANC 2026 Company Dashboard matching Jireh's SF layout
- 2 new views: Proposal Pipeline + Estimation & Proposals (Natalia's daily)
- Boyka custom agent with 30 ANC-specific skills
- **Full state in `/root/.claude/skills/crm-knowledge/SKILL.md`** — read this for any CRM question; update after any CRM change.
- **Read-only SF access:** `salesforce-crm` skill, creds at `/root/.sf-creds`

## 🛑 ABSOLUTE RULE: NO SHORTCUTS
- Build it RIGHT, not fast. Fix the ROOT CAUSE, not the symptom.
- NO band-aids, quick fixes, silent fallbacks, hardcoded values, or magic numbers.
- NO `sed`, regex surgery, or suppressing errors.
- Fix the code, don't change the test to match wrong behavior.
- *If about to take a shortcut, stop and say: "I was about to take a shortcut. Here's the real fix instead."*

## 📝 CLAUDE.md MAINTENANCE
- Update this file at the end of sessions with new rules, decisions, or status changes.
- Move fixed bugs to "resolved", add features to "What's Live" (1-liner).
- This is the single source of truth. Keep it tight. Never remove rules unless told.
