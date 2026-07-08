# P1 — Service Contract Templates & Terms System

**Date:** 2026-07-08
**Status:** Approved (build)
**Project:** ANC Proposal Engine (rag2)
**Scope:** Priority 1 — Service contract document type + toggleable/editable term exhibits

## Context

Natalia wants a new "Service Contract" document type alongside Letter of Intent and Contract, with a modular system of toggleable, per-instance-editable term exhibits (General Terms, Live Sync, Parts, Software, Labor…), seeded from ANC's existing service agreements. Legal language stays 100% verbatim — no AI rewriting, no paraphrasing, caps preserved, exact signature block language.

Today the engine has: a `documentMode` enum (BUDGET/PROPOSAL/LOI/CONTRACT/CHANGE_ORDER), an app-only `SERVICE_AGREEMENT` mode that renders a frozen verbatim "Baltimore Ravens Service" agreement (`PdfServiceAgreement.tsx`, source at `docs/service-agreements/ravens-service-agreement-source.md`), and a frozen-JSX `PdfTermsAndConditions.tsx` for the CONTRACT path. There is no Terms/Section/Exhibit DB model — the proposal body is a `documentConfig Json?` blob of boolean toggles plus hardcoded clause templates.

## Decisions (locked with Ahmad, 2026-07-08)

1. **New `SERVICE_CONTRACT` document type** that formalizes the existing service agreements. The standalone `SERVICE_AGREEMENT` mode is folded into it: Ravens becomes the default template, `PdfServiceAgreement.tsx` is refactored into the template-seeded renderer. Legacy JSON blobs carrying `SERVICE_AGREEMENT` resolve to `SERVICE_CONTRACT` + Ravens template (the enum column never held `SERVICE_AGREEMENT`, so no data migration).
2. **Approach 1 storage** — term exhibits are repo-seeded (`lib/serviceContracts/templates/*.ts`, source-of-truth mirrored from `docs/service-agreements/`); per-instance edits live in `Proposal.documentConfig` JSON, matching the existing override pattern (`signatureBlockText`, `tableHeaderOverrides`, `descriptionOverrides`).
3. **Also convert the existing CONTRACT T&C** into an editable "General Terms" exhibit (Natalia 1C), seeded from its current text so default output is byte-identical, with editability layered on.
4. **PDF now**, via the existing Puppeteer pipeline. Term blocks are structured `{id, title, body, order, enabled}` so a future DOCX generator consumes the same model without rework. No DOCX in this phase.
5. **7–8 contract analysis is deferred** (pass 2). This phase ships the system + Ravens + the project-type-preset mechanism, seeded with the exhibit taxonomy Natalia named. Refining the taxonomy from real contracts happens when Ahmad drops them into `docs/service-agreements/`.

## Architecture

### Data model

```ts
// lib/serviceContracts/types.ts
interface TermExhibit {
  id: string;            // "general-terms" | "live-sync" | "parts" | "software" | "labor"
  exhibitLetter: string; // "C", "D", ...
  title: string;         // "General Terms"
  body: string;          // verbatim legal text (multi-line, caps preserved)
  defaultOn: boolean;
  category?: "general" | "optional";
}

interface ProjectTypePreset {
  id: string;            // "general-only" | "general+live-sync" | "general+parts" | "general+parts&labor"
  label: string;
  defaultExhibits: Record<string, boolean>; // exhibitId -> enabled
}

interface ServiceContractTemplate {
  id: string;            // "ravens"
  name: string;          // "Baltimore Ravens Service"
  sourceDoc: string;     // "docs/service-agreements/ravens-service-agreement-source.md"
  intro?: string;        // optional intro paragraph (verbatim)
  exhibits: TermExhibit[];
  signatureBlockText: string;   // verbatim signature language
  projectTypePresets: ProjectTypePreset[];
}
```

Per-instance override, stored in `Proposal.documentConfig`:

```ts
serviceContractTemplateId: string                          // default "ravens"
serviceContractProjectType: string                          // selected preset id
termExhibitOverrides: Record<string, { enabled?: boolean; body?: string }>
serviceContractSignatureText: string                       // explicit edit wins; else template default
```

Resolution rule (matches existing `signatureBlockText` pattern): per-instance `body`/`enabled` override wins; otherwise template default applies.

### Template registry

- `lib/serviceContracts/registry.ts` — `getTemplate(id)`, `getDefaultTemplate()` → Ravens, `listTemplates()`.
- `lib/serviceContracts/templates/ravens.ts` — Ravens agreement decomposed into exhibits, verbatim from `docs/service-agreements/ravens-service-agreement-source.md`.
- `lib/serviceContracts/templates/contract-general-terms.ts` — the existing CONTRACT T&C clause text (`PdfTermsAndConditions.tsx`), byte-identical seed, exposed as the "General Terms" exhibit for the CONTRACT path.
- `lib/serviceContracts/presets.ts` — the four named project-type presets.

### Document type + resolver

- `prisma/schema.prisma`: add `SERVICE_CONTRACT` to `DocumentMode` enum. Migration `20260708_add_service_contract_mode`.
- `lib/documentMode.ts`: resolve `SERVICE_CONTRACT`; map legacy `SERVICE_AGREEMENT` → `SERVICE_CONTRACT` + `serviceContractTemplateId="ravens"`; `forceDocumentModeDefaults` sets exhibit toggles to template defaults.
- `app/components/proposal/form/sections/ProposalDetails.tsx`: Document Lifecycle select — replace "Service Agreement" option with "Service Contract".

### Rendering

- `app/components/templates/proposal-pdf/PdfServiceContract.tsx` (NEW; refactors `PdfServiceAgreement.tsx`): reads `serviceContractTemplateId` → template from registry → applies per-instance `termExhibitOverrides` + signature text → renders the service-contract document flow.
- Document flow (Natalia 1A): `intro → scope of work → terms → pricing → signatures → exhibits`, each toggleable:
  - **Intro** — from template, editable.
  - **Scope of Work** — reuses existing `scopeOfWorkText` field + SOW generator.
  - **Terms** — toggleable term exhibits (General Terms, Live Sync, Parts, Software, Labor…), each editable per-instance.
  - **Pricing** — reuses existing `PricingSection` / `PdfPricingTables`. (Full free-form builder is P1-tied, separate spec.)
  - **Signatures** — verbatim signature language from template, editable per-instance. No AI-generated wording.
  - **Exhibits** — term exhibits render as labeled exhibits ("Exhibit C — General Terms").
- `app/components/templates/proposal-pdf/sections/PdfTermsAndConditions.tsx`: CONTRACT path reads the seeded "General Terms" exhibit + override; default output byte-identical.
- `services/proposal/server/generateProposalPdfServiceV2.ts`: route `SERVICE_CONTRACT` → `PdfServiceContract` (mirror of the current SERVICE_AGREEMENT branch).

### Edit UI

- `app/components/proposal/form/wizard/steps/Step4Export.tsx` (new Service Contract terms panel): exhibit list with on/off toggles, per-exhibit text editor, signature text editor, project-type preset selector. Reuses the existing `show*`-toggle + autosave pattern.

## Testing & regression safety

- `lib/serviceContracts/serviceContract.test.ts`:
  - Ravens template loads and round-trips.
  - `termExhibitOverrides` toggle off + body override apply correctly.
  - Signature override wins; default falls through.
  - Project-type preset pre-toggles the right exhibits.
- **Byte-identical default regression test**: render the existing CONTRACT T&C path with no overrides → assert output equals current frozen-JSX output (proves the refactor is non-destructive).
- Mirror Mode preflight gates unaffected (Mirror is a separate `calculationMode`).
- RFP Analyzer frozen zone untouched.

## Project-type presets (mechanism for pass 2)

A `ProjectTypePreset` pre-toggles exhibits. Seeded with the four Natalia named: `general-only`, `general+live-sync`, `general+parts`, `general+parts&labor`. Selecting a preset sets `termExhibitOverrides` enabled flags; user can still override individually. When the 7–8 contracts arrive, pass 2 refines presets + adds exhibits from real contract analysis — **no schema change**, just new seed files.

## Deferred (not in this spec)

- 7–8 contract analysis pass (taxonomy refinement) — when contracts land in `docs/service-agreements/`.
- DOCX export (data model future-proofed only).
- Builder-from-scratch pricing tables (P1-tied, separate spec).
- Mirror-mode for services (P2), service estimator (P3).

## Build order (implementation plan)

1. Prisma: add `SERVICE_CONTRACT` enum value + migration; run migrate.
2. `lib/serviceContracts/types.ts` + `registry.ts`.
3. `templates/ravens.ts` (decompose Ravens verbatim) + `templates/contract-general-terms.ts` (seed from current T&C text).
4. `presets.ts` (four named presets).
5. `lib/schemas.ts` + `lib/documentMode.ts` (resolver + legacy mapping + `forceDocumentModeDefaults`).
6. `PdfServiceContract.tsx` (renderer); wire `generateProposalPdfServiceV2` + `ProposalTemplate5` dispatch.
7. Refactor `PdfTermsAndConditions.tsx` to read seeded General Terms exhibit; byte-identical default.
8. `Step4Export.tsx` Service Contract terms panel + `ProposalDetails.tsx` select option.
9. Tests + byte-identical regression test; `npm run build` green.
10. Verify on a live proposal (Service Contract + Ravens) end-to-end; verify existing CONTRACT T&C unchanged.