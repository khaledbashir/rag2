# Service Contract Templates & Terms System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SERVICE_CONTRACT` document type with a modular system of toggleable, per-instance-editable term exhibits, seeded from the existing Ravens service agreement; also convert the existing CONTRACT T&C into an editable "General Terms" exhibit.

**Architecture:** Repo-seeded term-exhibit templates (`lib/serviceContracts/`) with Markdown bodies; per-instance overrides stored in `Proposal.documentConfig` JSON (same pattern as `signatureBlockText`/`tableHeaderOverrides`). A single `TermExhibitView` renderer converts Markdown → styled PDF output and is DOCX-future-proof. Existing `PdfServiceAgreement.tsx` (Ravens) is refactored to render its exhibits from the registry; existing `PdfTermsAndConditions.tsx` (CONTRACT) is refactored to render from a seeded "General Terms" exhibit with byte-identical default text.

**Tech Stack:** Next.js (App Router), React, Prisma, Zod, TypeScript, Puppeteer PDF pipeline. Minimal custom Markdown renderer (no new dependency).

## Global Constraints

- Legal language stays **100% verbatim** — no AI rewriting/paraphrasing, preserve capitalization, all-caps, exact wording. Signature block language comes verbatim from the contract, never AI-generated.
- **Additive, non-destructive.** Default output for existing CONTRACT T&C must be **byte-identical** (regression test). RFP Analyzer frozen zone untouched. Mirror Mode preflight untouched.
- PDF now via existing Puppeteer pipeline; term blocks are structured data so a DOCX generator can consume the same model later without rework.
- Per-instance override rule (matches existing `signatureBlockText`): explicit override wins; otherwise template default applies.
- `npm run build` must stay green. One push per build.

## File Structure

**Created:**
- `lib/serviceContracts/types.ts` — `TermExhibit`, `ServiceContractTemplate`, `ProjectTypePreset`, override types.
- `lib/serviceContracts/registry.ts` — `getTemplate(id)`, `getDefaultTemplate()`, `listTemplates()`, `resolveExhibits(template, overrides)`.
- `lib/serviceContracts/renderMarkdown.tsx` — minimal Markdown→React renderer (paragraphs, `**bold**`, ordered lists, unordered lists, line breaks).
- `lib/serviceContracts/templates/ravens.ts` — Ravens agreement decomposed into exhibits (verbatim).
- `lib/serviceContracts/templates/contract-general-terms.ts` — existing CONTRACT T&C clause text as the "General Terms" exhibit (byte-identical seed).
- `lib/serviceContracts/presets.ts` — the four named project-type presets.
- `app/components/templates/proposal-pdf/sections/PdfTermExhibit.tsx` — `TermExhibitView` renderer (exhibit header + markdown body, gated by enabled).
- `app/components/templates/proposal-pdf/PdfServiceContract.tsx` — service-contract renderer (refactors `PdfServiceAgreement.tsx` body + renders exhibits from registry).
- `app/components/proposal/form/wizard/steps/ServiceContractTermsPanel.tsx` — exhibit toggles + per-exhibit text editor + signature editor + preset selector.
- `lib/serviceContracts/serviceContract.test.ts` — unit tests + byte-identical regression test.
- `prisma/migrations/<timestamp>_add_service_contract_mode/migration.sql` — enum addition.

**Modified:**
- `prisma/schema.prisma` — add `SERVICE_CONTRACT` to `DocumentMode` enum.
- `lib/documentMode.ts` — resolve `SERVICE_CONTRACT`; map legacy `SERVICE_AGREEMENT` → `SERVICE_CONTRACT` + Ravens; `forceDocumentModeDefaults` for the new mode.
- `lib/schemas.ts` — new `serviceContract*` fields + `termExhibitOverrides` on `ProposalDetailsSchema`.
- `app/components/templates/proposal-pdf/ProposalTemplate5.tsx` — dispatch `SERVICE_CONTRACT` → `PdfServiceContract`; render CONTRACT T&C via seeded exhibit.
- `app/components/templates/proposal-pdf/sections/PdfTermsAndConditions.tsx` — render from seeded "General Terms" exhibit + override (byte-identical default).
- `app/components/proposal/form/sections/ProposalDetails.tsx` — Document Lifecycle select: rename "Service Agreement" → "Service Contract".
- `app/components/proposal/form/wizard/steps/Step4Export.tsx` — render `ServiceContractTermsPanel` when `SERVICE_CONTRACT`.
- `services/proposal/server/generateProposalPdfServiceV2.ts` — route `SERVICE_CONTRACT` through the same React-template path (no special-casing beyond template dispatch).

---

### Task 1: Prisma enum + migration

**Files:**
- Modify: `prisma/schema.prisma` (enum at lines 42–48)
- Create: `prisma/migrations/<timestamp>_add_service_contract_mode/migration.sql`

**Interfaces:**
- Produces: `DocumentMode` enum now includes `SERVICE_CONTRACT`. DB column accepts the new value.

- [ ] **Step 1:** In `prisma/schema.prisma`, add `SERVICE_CONTRACT` to the `DocumentMode` enum (append after `CHANGE_ORDER`).
- [ ] **Step 2:** Generate + run the migration: `npx prisma migrate dev --name add_service_contract_mode --create-only`, inspect the generated SQL (must be `ALTER TYPE "DocumentMode" ADD VALUE 'SERVICE_CONTRACT';`), then `npx prisma migrate dev`.
- [ ] **Step 3:** Regenerate client: `npx prisma generate`.
- [ ] **Step 4:** Verify build still compiles: `npm run build`. Expected: green.
- [ ] **Step 5:** Commit: `git add prisma/ && git commit -m "feat(service-contracts): add SERVICE_CONTRACT document mode enum"`.

### Task 2: Types + registry + Markdown renderer (TDD)

**Files:**
- Create: `lib/serviceContracts/types.ts`
- Create: `lib/serviceContracts/renderMarkdown.tsx`
- Create: `lib/serviceContracts/registry.ts`
- Create: `lib/serviceContracts/serviceContract.test.ts`

**Interfaces:**
- Produces:
  - `TermExhibit { id: string; exhibitLetter: string; title: string; bodyMarkdown: string; defaultOn: boolean; category?: "general"|"optional" }`
  - `ProjectTypePreset { id: string; label: string; defaultExhibits: Record<string, boolean> }`
  - `ServiceContractTemplate { id: string; name: string; sourceDoc: string; intro?: string; body?: string; exhibits: TermExhibit[]; signatureBlockText: string; projectTypePresets: ProjectTypePreset[] }`
  - `TermExhibitOverride { enabled?: boolean; bodyMarkdown?: string }`
  - `getTemplate(id: string): ServiceContractTemplate | undefined`
  - `getDefaultTemplate(): ServiceContractTemplate`
  - `listTemplates(): ServiceContractTemplate[]`
  - `resolveExhibits(template, overrides: Record<string, TermExhibitOverride>): { id; exhibitLetter; title; bodyMarkdown; enabled }[]` (override wins; default otherwise)
  - `renderMarkdown(md: string): React.ReactNode`

- [ ] **Step 1: Write failing tests** in `lib/serviceContracts/serviceContract.test.ts`:
  - `getDefaultTemplate().id === "ravens"`
  - `resolveExhibits` with no overrides returns all `defaultOn` exhibits enabled with template bodies.
  - `resolveExhibits` with `{ "general-terms": { enabled: false } }` disables that exhibit only.
  - `resolveExhibits` with `{ "general-terms": { bodyMarkdown: "OVERRIDE" } }` returns the override body.
  - `renderMarkdown("**Bold** then text")` produces a `<strong>Bold</strong>` element.
  - `renderMarkdown("1. One\n2. Two")` produces an ordered list with two items.
- [ ] **Step 2:** Run `npx vitest run lib/serviceContracts/serviceContract.test.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Create `lib/serviceContracts/types.ts` with the interfaces above (pure types, no runtime).
- [ ] **Step 4:** Create `lib/serviceContracts/renderMarkdown.tsx` — a minimal renderer: split body into blocks on blank lines; each block is an ordered list (lines starting `N.`), unordered list (lines starting `-`), or a paragraph; inline `**bold**` → `<strong>`; preserve text verbatim (no case changes, no trimming of all-caps). Escape nothing that isn't markdown structure.
- [ ] **Step 5:** Create `lib/serviceContracts/registry.ts` exporting `getTemplate`, `getDefaultTemplate`, `listTemplates`, `resolveExhibits`. `getDefaultTemplate()` returns the Ravens template (imported from Task 3 — for now stub `ravens.ts` with one exhibit so tests pass; Task 3 fills the verbatim content).
- [ ] **Step 6:** Run tests — expect PASS.
- [ ] **Step 7:** Commit: `git commit -m "feat(service-contracts): types, registry, markdown renderer"`.

### Task 3: Ravens template (verbatim) + contract-general-terms seed + presets

**Files:**
- Create: `lib/serviceContracts/templates/ravens.ts`
- Create: `lib/serviceContracts/templates/contract-general-terms.ts`
- Create: `lib/serviceContracts/presets.ts`
- Modify: `lib/serviceContracts/registry.ts` (wire the real templates + presets)

**Interfaces:**
- Produces: `RAVENS_TEMPLATE: ServiceContractTemplate` (id `"ravens"`), `CONTRACT_GENERAL_TERMS_EXHIBIT: TermExhibit` (id `"general-terms"`, body = current `PdfTermsAndConditions.tsx` clause text rendered byte-identical), `SERVICE_CONTRACT_PRESETS: ProjectTypePreset[]`.

- [ ] **Step 1:** Build `templates/ravens.ts`:
  - `intro` = the verbatim AGREEMENT/WHEREAS paragraphs from `PdfServiceAgreement.tsx` lines 92–106 (kept as the contract body; rendered by `PdfServiceContract` from the existing JSX — see Task 6 — so `intro` here is informational/DOCX-future only; store as markdown for future use).
  - `exhibits`:
    - `{ id: "general-terms", exhibitLetter: "", title: "General Terms", defaultOn: true, bodyMarkdown: <the 10-item General Terms ordered list from PdfServiceAgreement lines 200–236, as markdown: `1. **Intellectual Property.** ...` etc., verbatim> }`
    - `{ id: "parts", exhibitLetter: "C", title: "Parts Replacement Procedures", defaultOn: true, bodyMarkdown: <Exhibit C text from lines 249–280, verbatim> }`
    - `{ id: "exhibit-a-stub", exhibitLetter: "A", title: "Exhibit A", defaultOn: true, bodyMarkdown: "" }` (placeholder page)
    - `{ id: "exhibit-b-stub", exhibitLetter: "B", title: "Exhibit B", defaultOn: true, bodyMarkdown: "" }`
  - `signatureBlockText` = verbatim "AGREED TO AND ACCEPTED" block (lines 177–192) — store the ANC side text verbatim; purchaser-side is filled from receiver config.
  - `projectTypePresets` = `SERVICE_CONTRACT_PRESETS` (import).
  - HARD RULE: copy wording character-for-character from `docs/service-agreements/ravens-service-agreement-source.md` / `PdfServiceAgreement.tsx`. No paraphrasing.
- [ ] **Step 2:** Build `templates/contract-general-terms.ts`:
  - `CONTRACT_GENERAL_TERMS_EXHIBIT` = `{ id: "general-terms", exhibitLetter: "C", title: "General Terms", defaultOn: true, bodyMarkdown: <the clause text from PdfTermsAndConditions.tsx lines 60–229 converted to markdown: `1. **Intellectual Property**\n\nAs used herein, "Marks"...` etc., all sections, verbatim including the all-caps LIMITATION paragraph> }`.
  - The default body MUST include every section the current JSX renders when all sub-toggles are ON (labor + materials + exclusions + limitation + IP + ownership + authority + indemnification + force majeure + miscellaneous), so default output is byte-identical to today's all-on render.
- [ ] **Step 3:** Build `presets.ts` with the four named presets:
  - `general-only` → only `general-terms` on.
  - `general+live-sync` → `general-terms` + a `live-sync` exhibit on (live-sync added as a stub exhibit `{id:"live-sync", title:"Live Sync", defaultOn:false, bodyMarkdown:""}` in the Ravens template; on by default off, preset flips it on).
  - `general+parts` → `general-terms` + `parts` on.
  - `general+parts&labor` → `general-terms` + `parts` + a `labor` exhibit on (labor added as stub `{id:"labor", title:"Labor", defaultOn:false, bodyMarkdown:""}`).
  - Also seed `software` stub exhibit `{id:"software", title:"Software", defaultOn:false, bodyMarkdown:""}` for future use.
- [ ] **Step 4:** Wire `registry.ts` to import `RAVENS_TEMPLATE` and return it from `getDefaultTemplate()`; `listTemplates()` returns `[RAVENS_TEMPLATE]`.
- [ ] **Step 5:** Add test asserting `RAVENS_TEMPLATE.exhibits` includes general-terms + parts with non-empty verbatim bodies, and `CONTRACT_GENERAL_TERMS_EXHIBIT.bodyMarkdown` contains the all-caps "DISCLAIMED" limitation text. Run tests — PASS.
- [ ] **Step 6:** Commit: `git commit -m "feat(service-contracts): Ravens + contract general-terms seeds, presets"`.

### Task 4: Schemas + documentMode resolver

**Files:**
- Modify: `lib/schemas.ts` (add fields after line 394 region)
- Modify: `lib/documentMode.ts`

**Interfaces:**
- Produces: new schema fields `serviceContractTemplateId`, `serviceContractProjectType`, `termExhibitOverrides`, `serviceContractSignatureText`, `generalTermsBodyOverride`. `resolveDocumentMode` returns `"SERVICE_CONTRACT"`; legacy `"SERVICE_AGREEMENT"` maps to `"SERVICE_CONTRACT"`. `forceDocumentModeDefaults` sets service-contract defaults.

- [ ] **Step 1:** In `lib/schemas.ts` `ProposalDetailsSchema`, add:
  ```ts
  // Service Contract term-exhibit system
  serviceContractTemplateId: z.string().optional().default("ravens"),
  serviceContractProjectType: z.string().optional(), // preset id
  termExhibitOverrides: z.record(z.object({
      enabled: z.boolean().optional(),
      bodyMarkdown: z.string().optional(),
  })).optional().default({}),
  serviceContractSignatureText: z.string().optional(), // verbatim signature override
  // CONTRACT path: editable General Terms override (seeded from contract-general-terms)
  generalTermsBodyOverride: z.string().optional(),
  ```
- [ ] **Step 2:** In `lib/documentMode.ts`:
  - Add `"SERVICE_CONTRACT"` to the `DocumentMode` type union (keep `"SERVICE_AGREEMENT"` for legacy mapping only).
  - In `resolveDocumentMode`: accept `explicit === "SERVICE_CONTRACT"`; treat legacy `explicit === "SERVICE_AGREEMENT"` (or `documentType === "SERVICE_AGREEMENT"/"Service Agreement"`) as `"SERVICE_CONTRACT"`.
  - Add `SERVICE_CONTRACT_CONFIG` (headerText "SERVICE CONTRACT", includeSignatures true, includePaymentTerms false, includeLegalIntro false, includeResponsibilityMatrix false).
  - In `forceDocumentModeDefaults`/`applyDocumentModeDefaults`: for `SERVICE_CONTRACT`, set `showTermsAndConditions=false` (terms come via exhibits), `showResponsibilityMatrix=false`, `showScopeOfWork=true`, `showSignatureBlock=true`, and default `serviceContractTemplateId="ravens"` if unset.
- [ ] **Step 3:** Test: `resolveDocumentMode({documentMode:"SERVICE_AGREEMENT"})` returns `"SERVICE_CONTRACT"`; `resolveDocumentMode({documentMode:"SERVICE_CONTRACT"})` returns `"SERVICE_CONTRACT"`. Add to `serviceContract.test.ts`. Run — PASS.
- [ ] **Step 4:** `npm run build` — green.
- [ ] **Step 5:** Commit: `git commit -m "feat(service-contracts): schema fields + documentMode resolver, legacy SA mapping"`.

### Task 5: TermExhibitView renderer

**Files:**
- Create: `app/components/templates/proposal-pdf/sections/PdfTermExhibit.tsx`

**Interfaces:**
- Consumes: `renderMarkdown` from `lib/serviceContracts/renderMarkdown`, `PdfColors` from `./shared`.
- Produces: `TermExhibitView({ colors, exhibitLetter, title, bodyMarkdown })` — renders the exhibit header (blue bar + `Exhibit {letter} — {title}` or just `{title}` when letter empty) matching the existing `PdfTermsAndConditions` header style, then `renderMarkdown(bodyMarkdown)`.

- [ ] **Step 1:** Create the component. Header matches `PdfTermsAndConditions.tsx` lines 52–57 (blue bar + uppercase tracking-wider). Body uses the same `text-[12px] leading-relaxed` style.
- [ ] **Step 2:** Render a markdown body with a numbered list + bold + a paragraph and visually confirm style matches existing T&C. (Visual check in Task 9 full render.)
- [ ] **Step 3:** Commit: `git commit -m "feat(service-contracts): TermExhibitView renderer"`.

### Task 6: PdfServiceContract renderer (refactor PdfServiceAgreement)

**Files:**
- Create: `app/components/templates/proposal-pdf/PdfServiceContract.tsx`
- Keep but deprecate: `app/components/templates/proposal-pdf/sections/PdfServiceAgreement.tsx` (Ravens body JSX reused via import of the body portion; or copy the body JSX into the new component and render exhibits from registry).

**Interfaces:**
- Consumes: `getDefaultTemplate`, `resolveExhibits` from `lib/serviceContracts/registry`; `TermExhibitView`; `PdfColors`.
- Produces: `PdfServiceContract({ colors, details, receiver })` — renders the Ravens contract body (intro + responsibilities + term + compensation + fee table + signature) from the existing verbatim JSX, then renders each resolved exhibit via `TermExhibitView` (general-terms, parts, exhibit stubs) in order, applying per-instance overrides + signature override.

- [ ] **Step 1:** Create `PdfServiceContract.tsx`. Reuse the Ravens body JSX (intro, ANC's Responsibilities, Purchaser's Responsibilities, Term, Compensation, fee table, AGREED TO AND ACCEPTED signature block) verbatim from `PdfServiceAgreement.tsx` lines 86–192. Replace the hardcoded `<Header>General Terms</Header>` + `<ol>` (lines 194–237) and Exhibit A/B/C blocks (lines 239–281) with: `resolveExhibits(getDefaultTemplate(), details.termExhibitOverrides).filter(e => e.enabled).map(e => <TermExhibitView .../>)`.
- [ ] **Step 2:** Signature block: use `details.serviceContractSignatureText` override if present and non-empty, else the template's verbatim `signatureBlockText`. Purchaser name/address from `receiver` config (same fields as `ServiceAgreementConfig`).
- [ ] **Step 3:** Wire into `ProposalTemplate5.tsx`: in the existing `isServiceAgreement` branch (lines 709–732), change the guard to `isServiceContract` (resolved mode === "SERVICE_CONTRACT") and render `<PdfServiceContract colors={colors} details={details} receiver={receiver} />`. Keep `PdfServiceAgreement.tsx` for backward-compat import safety but no longer dispatched.
- [ ] **Step 4:** Commit: `git commit -m "feat(service-contracts): PdfServiceContract renderer, Ravens exhibits from registry"`.

### Task 7: Refactor PdfTermsAndConditions → seeded General Terms (byte-identical default)

**Files:**
- Modify: `app/components/templates/proposal-pdf/sections/PdfTermsAndConditions.tsx`
- Consumes: `CONTRACT_GENERAL_TERMS_EXHIBIT` from `lib/serviceContracts/templates/contract-general-terms.ts`, `TermExhibitView`, `renderMarkdown`.

- [ ] **Step 1:** Rewrite `PdfTermsAndConditions.tsx` so the body is `details.generalTermsBodyOverride` if non-empty, else `CONTRACT_GENERAL_TERMS_EXHIBIT.bodyMarkdown`, rendered via `TermExhibitView`. Header label changes from "Exhibit C — Terms and Conditions" to "Exhibit C — General Terms".
- [ ] **Step 2:** **Byte-identical regression test:** add `serviceContract.test.ts` case that renders `PdfTermsAndConditions` with no override and asserts the rendered output contains the exact all-caps LIMITATION string "THE WARRANTY SET FORTH HEREIN IS THE SOLE AND EXCLUSIVE WARRANTY" and every section title (Intellectual Property, Ownership of the Equipment, Existence, Power and Authority, Warranty, Indemnification, Force Majeure, Miscellaneous) — proving all sections still render by default. (Full visual byte-identity confirmed in Task 9.)
- [ ] **Step 3:** Run tests — PASS.
- [ ] **Step 4:** Commit: `git commit -m "feat(service-contracts: CONTRACT T&C → editable General Terms exhibit (byte-identical default)"`.

### Task 8: Edit UI — ServiceContractTermsPanel + Document Lifecycle select

**Files:**
- Create: `app/components/proposal/form/wizard/steps/ServiceContractTermsPanel.tsx`
- Modify: `app/components/proposal/form/sections/ProposalDetails.tsx` (select option ~line 210–227)
- Modify: `app/components/proposal/form/wizard/steps/Step4Export.tsx` (render panel when SERVICE_CONTRACT)

**Interfaces:**
- Consumes: `listTemplates`, `resolveExhibits`, `SERVICE_CONTRACT_PRESETS`; the react-hook-form `details` fields.
- Produces: a panel listing each exhibit with an on/off Switch + a "Edit text" textarea (writes `termExhibitOverrides[id].bodyMarkdown` / `.enabled`), a signature textarea (`serviceContractSignatureText`), and a preset selector (`serviceContractProjectType`) that pre-toggles exhibits.

- [ ] **Step 1:** Build `ServiceContractTermsPanel`:
  - Preset selector (Select) — on change, write `serviceContractProjectType` and set `termExhibitOverrides[id].enabled` per the preset's `defaultExhibits`.
  - Exhibit list: for each exhibit in the resolved template, a Switch (enabled) + collapsible textarea for body. Editing body writes `termExhibitOverrides[id].bodyMarkdown`.
  - Signature text textarea → `serviceContractSignatureText`.
  - Follow the existing `Step4Export` Switch + autosave pattern (`useDebouncedSave`).
- [ ] **Step 2:** In `ProposalDetails.tsx`, change the "Service Agreement" option to label "Service Contract", value `SERVICE_CONTRACT`. Keep `handleModeChange` → `forceDocumentModeDefaults`.
- [ ] **Step 3:** In `Step4Export.tsx`, render `<ServiceContractTermsPanel .../>` when resolved mode === `SERVICE_CONTRACT`, in place of the standard T&C toggle row.
- [ ] **Step 4:** `npm run build` — green.
- [ ] **Step 5:** Commit: `git commit -m "feat(service-contracts): terms panel UI + Service Contract document option"`.

### Task 9: Verify end-to-end on a live proposal + regression

- [ ] **Step 1:** Run full test suite: `npx vitest run` — green, including the byte-identical regression case.
- [ ] **Step 2:** `npm run build` — green.
- [ ] **Step 3:** Create a Service Contract proposal (documentMode = SERVICE_CONTRACT, template ravens). Open the preview/PDF. Verify: intro + responsibilities + compensation + fee table render verbatim; General Terms exhibit renders the 10-item list; Parts exhibit (Exhibit C) renders; signature block present; toggling an exhibit off removes it; editing exhibit text changes the PDF; selecting "general+parts" preset toggles parts on.
- [ ] **Step 4:** Open an existing CONTRACT-mode proposal with T&C on and no overrides. Verify the rendered General Terms exhibit is visually identical to the pre-change T&C (all sections present, all-caps LIMITATION intact) — byte-identical default confirmed.
- [ ] **Step 5:** Verify Mirror Mode proposal still generates (preflight untouched) and RFP Analyzer is untouched (`git diff --stat` shows no files under `app/rfp-analyzer/`, `services/rfp/pipeline/`, `app/api/rfp/`).
- [ ] **Step 6:** Commit any fixes. Push.

## Self-Review notes

- Spec coverage: new type (Task 1), toggleable/editable exhibits (2,3,5,6,8), verbatim preservation (3,6,7), CONTRACT T&C rename + editability (7), signature verbatim (3,6), project-type presets (3,8), DOCX-future-proof (structured markdown bodies), testing + byte-identical regression (2,7,9). Deferred items (7–8 contract analysis, DOCX export, builder, mirror-for-services, estimator) are out of scope per spec. ✓
- No placeholders: each task lists exact files and the content/wording source (existing file line ranges or source doc). ✓
- Type consistency: `TermExhibit`, `ServiceContractTemplate`, `TermExhibitOverride`, `resolveExhibits`, `getTemplate`/`getDefaultTemplate` used consistently across tasks. ✓