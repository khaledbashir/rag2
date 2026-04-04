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
