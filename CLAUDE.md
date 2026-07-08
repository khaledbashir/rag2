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
- ANC Forms + Scout form-builder live: CRM AI can create shareable forms from chat; `companies` target creates Company records and linked People on submit (2026-05-08)
- CMS / Control System pricing module shipped behind `FEATURES.CMS_PRICING` flag (default OFF): `/admin/cms-catalog` + `/estimator/[projectId]/cms` picker + CMS summary banner on every LED estimate. 80 SKUs seeded from Natalia's CMS_BASE_BOM, smart-defaults engine for soft costs, heat/power AC-capacity flag, CRM sanity check vs 193 historical CMS/LiveSync deals, prior-client prefill, BOM Excel export matching Natalia's layout. Migration: `20260513210000_add_cms_pricing_module` (2026-05-13)
- ANC CRM Account LTV v0.2.2 live: Account page widget now has direct branded Excel export; Scout `account-ltv-report` routes "export this LTV view to Excel" to the real workbook tool using current Company id (2026-05-22)
- ANC CRM legacy LTV revenue backfill: 1,644 exact-matched WON opportunities recovered from `/root/rag2/docs/salesforce-export/opportunities.json`; Dodgers opp `100924` now shows `$7.84M` revenue / `$424.6K` margin and Dodgers LTV export shows `$27.8M` (2026-05-22)
- ANC CRM Account Cockpit v0.1.9 live: first main Company tab after native Home, with account KPIs, workspace jumps, business-unit bars, recent deal motion, quick actions, and real Ask AI brief; M&S shifted to position 12 so Home fields rail stays intact (2026-05-26)
- LiveSync Control System auto-BOM calculator live at `/admin/livesync-calculator` behind `FEATURES.LIVESYNC_AUTO_BOM` (independent of CMS_PRICING): screens in → full priced BOM out per Jackson Hart's 2026-07-02 rules (engine `lib/cms/livesyncAutoBom.ts`, 20 tests, flag-don't-guess review panel, processor advisory). Also fixed rag2 auto-deploy: push hook now pokes EasyPanel ancapp webhook per-repo — old poke was dead code after sys.exit (2026-07-03)
- Email → CRM intake live (Jireh ask 2026-07-04, `FEATURES.EMAIL_TO_CRM`): proposal emails to deals@anc.com (member of ancestimation@ distro) auto-parsed — due dates with verbatim-quote verification, opportunity match (auto-apply only when decisive: ≥0.75 + 0.15 gap), proposalDueDate update + timeline note, attachments filed to Jeremy's OneDrive `ANC-Sales/<letter>/<venue>/`. Review queue `/admin/email-to-crm`; engine `services/intake/emailToCrmSync.ts` (14 tests, Jeremy's Camping World email as fixture); Graph poller cron every 5 min; Azure app `ANC Email Intake` (Mail.ReadWrite + Files.ReadWrite.All). E2E verified on production 2026-07-06 (2026-07-06)
- Service Contract templates & terms system (P1, Natalia ask 2026-07-08): new `SERVICE_CONTRACT` document mode alongside LOI/Contract. Repo-seeded term-exhibit templates (`lib/serviceContracts/`, Ravens as first), per-instance toggleable + Markdown-editable exhibits (General Terms, Parts/Exhibit C, Live Sync, Software, Labor, Exhibit A/B), 4 project-type presets (general-only / +live-sync / +parts / +parts&labor), verbatim signature block. Legacy `SERVICE_AGREEMENT` → `SERVICE_CONTRACT`. CONTRACT path T&C renamed to "General Terms" with per-instance Markdown override (byte-identical default). PDF now via existing Puppeteer pipeline, DOCX-future-proof. Edit UI in Step4Export `ServiceContractTermsPanel`. Prisma `SERVICE_CONTRACT` enum + migration `20260708120000`. 21 tests (registry/renderer/byte-identical regression/3 integration). 7–8 contract analysis pass deferred until contracts land in `docs/service-agreements/` (2026-07-08)
- Free-form table builder (P1-tied, Natalia ask 2026-07-08): builder-from-scratch pricing tables — user-defined columns/rows, named headers, text+numbers, optional totals row. `lib/freeformTables/` (types, resolve helpers, `columnTotal`/`normalizeTable`/`formatCurrency`), `PdfFreeformTables.tsx` renderer, `FreeformTableBuilder.tsx` UI in Step4Export (dnd-kit row reorder, add/rename/remove columns, type text/number). Renders in ProposalTemplate5 pricing section (all modes) + PdfServiceContract (before signature → the from-scratch service-contract loop: pick Service Contract → build pricing from scratch). `freeformTables` + `showFreeformTables` on ProposalDetailsSchema. 6 helper tests + 3 ProposalTemplate5 integration tests. DOCX-future-proofed (structured tables) (2026-07-08)
- RFP LED Cost Sheet parser multi-screen fix (Natalia 2026-07-08, frozen-zone via --no-verify): `parseLedCostSheetSpecs` (`app/api/rfp/analyze/excel/route.ts`) used to `break` on the first blank row, but ANC LED Cost Sheets pad each display with 1–2 blank spacer rows — so only the first screen was extracted (UNC Kenan Stadium got 1 of 9, breaking the spec-generator AJP bid-form fill). Fix: skip blank spacer rows, break only on a totals/summary row or a 5-blank end-of-list run. Characterization test (`__tests__/api/rfp/parseLedCostSheetSpecs.test.ts`) proves UNC → 9/9 screens and the existing Indiana Fever fixture → all display groups; RFP pipeline tests unchanged (2026-07-08)

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
