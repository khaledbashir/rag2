# Spec: Responsibility Matrix — 3-tier redesign (Natalia #2)

**Ask:** Natalia's team is updating their own matrix (the old one "is not very good"). They want it updated *in the system*, plus the tiered idea: Tier 3 (premium) = the matrix "pops in," the user assigns each line to Purchaser/ANC, and can tweak the wording per field.

## Current implementation (mapped)
- **Types:** `types/pricing.ts:151-176` — `RespMatrixItem`, `RespMatrixCategory`, `RespMatrix`.
- **DB:** `prisma/schema.prisma:223-225` on `Proposal` — `includeResponsibilityMatrix` (bool), `responsibilityMatrix` (JSON), `respMatrixFormatOverride` (auto/short/long/hybrid).
- **Parser:** `services/pricing/respMatrixParser.ts` — extracts the "Resp Matrix" sheet from an uploaded Excel (description / ANC col / Purchaser col; detects short/long/hybrid format).
- **PDF:** `app/components/templates/proposal-pdf/sections/PdfResponsibilityMatrix.tsx` — renders as "Exhibit B — Statement of Work" (table of X-marks or paragraph mode).
- **UI:** `Step4Export.tsx` — include/exclude toggle + format dropdown (Budget/Proposal/LOI tabs).
- **Defaults:** `lib/documentMode.ts`, `lib/variables.ts` — ON for LOI/CONTRACT, OFF for Budget/Proposal.

## Key gap to solve
Today the matrix exists ONLY when an Excel is uploaded — there's **no master/default matrix baked into the platform**. Natalia's "update the matrix in the system" + "it pops in" implies ANC wants a **stored master matrix** that appears without an Excel upload. That's the core new piece, and it's what her updated file feeds.

## Tiered build plan
- **Tier 1 (exists):** include/exclude + format override. No work.
- **Tier 2:** seed ANC's **master matrix** into the platform (so it "pops in" with no upload) + an **edit panel** in Step4Export — editable grid of rows: description (text), responsibility selector (ANC / Purchaser / Both), remove-row. Save serializes back to `Proposal.responsibilityMatrix` JSON (no migration — column already JSON).
- **Tier 3 (premium):** Tier 2 + per-field **editable wording** overrides + (the "assign access" idea) optionally scope who can edit which lines + live PDF preview sync. Extend `RespMatrixItem` with `customDescription?`, `assignedResponsibility?: "anc"|"purchaser"|"both"`, `originalDescription?`. PDF renderer prefers `customDescription` then falls back; renders merged ANC+Purchaser cell when "both".

## Frozen-zone check
- Safe to edit (estimator side): `respMatrixParser.ts`, `PdfResponsibilityMatrix.tsx`, `Step4Export.tsx`, `app/api/projects/[id]/route.ts`, `lib/documentMode.ts`, `lib/variables.ts`, `types/pricing.ts`, `lib/schemas.ts`.
- **Read-only/borderline frozen:** `services/rfp/productCatalog.ts:1103-1143` (DOCUMENT_MODES include-flags). We won't change LOI/CONTRACT defaults — leave it.
- No edits to `services/rfp/pipeline/**` needed for this feature. Good — unlike the Excel cover-page, the Matrix build avoids the frozen generator.

## What's needed from Natalia
- Her **updated master matrix content** (the rows/categories, ANC-vs-Purchaser defaults, wording) — ideally the file.
- **Which tier** she wants built (she'll pick; Tier 3 is the premium one she tagged "most expensive").
- Confirm what "assign access to Purchaser/ANC" means: per-line responsibility (data) vs. per-user edit permissions (access control) — the call was ambiguous.

## Status
Architecture is clear and almost entirely on the safe estimator side (no frozen-generator edit). Buildable fast once she sends the file + tier. Existing JSON column means no migration for Tier 2/3 data.
