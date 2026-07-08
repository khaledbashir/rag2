# ANC Service Contract Analysis — 2026-07-08

Source contracts (7, dropped by Ahmad 2026-07-08) + the existing Ravens agreement.
Extraction: parallel python-docx pass, one structured+verbatim file per contract
in `/tmp/contracts/analysis/` (verbatim legal text, word-for-word).

This is Natalia's P1.B pass 2: "Feed 7–8 example service contracts into the
AI/system to identify common/general terms, identify variable terms/exhibits,
and infer a list of project types — represented as toggleable term exhibits."

HARD RULE (Natalia + Ahmad): all legal language is verbatim — no rewriting,
no paraphrasing, capitalization and all-caps preserved. Only party/venue/date/
fee-table values are configurable fields.

## Per-contract matrix

| Contract | General Terms set | Graphics | Software/LiveSync | Labor | Parts | Project type |
|---|---|---|---|---|---|---|
| Baltimore Ravens (existing) | Ravens-10 | — | — | — | yes (Exhibit C) | general + parts |
| Arizona Athletic Grounds | Ravens-10 | — | — | yes | — | general + labor |
| Ad Hoc Services (template) | Ravens-10 | — | — | — | — | general only |
| Ad Hoc Graphics (template) | Ravens-10 | yes (inline T&C) | — | — | — | general + graphics |
| Hub City Spartanburgers | Ravens-10 | — | yes (Exhibit B EULA) | — | — | general + software + livesync |
| SMU | Ravens-10 | — | yes (Exhibit B EULA) | yes | yes (Exhibit C) | general + labor + software + parts |
| Iona University | Iona-19 | yes (Exhibit B) | yes (in body) | yes | — | general + labor + software + graphics |
| Toronto Blue Jays | Toronto-10 | yes (rotational) | — | — | — | general + graphics |

## Common vs variable terms

### General Terms — NOT one universal set; ANC has three variants
- **Ravens-10** (dominant — 6 of 8 contracts: Ravens, Arizona, Ad Hoc Services, Ad Hoc Graphics, Hub City, SMU):
  Intellectual Property · Ownership of the Work · Existence, Power and Authority · Confidentiality · Warranty · Indemnification · Purchaser's Obligation to Pay · Force Majeure · Future Pandemic · Miscellaneous (a–f).
- **Iona-19** (Iona — more formal legal style):
  Intellectual Property · Existence/Power/Authority · Warranties · Confidentiality · Indemnification · Indemnification Procedures · Termination · Miscellaneous · Notices · Assignment · Independent Contractors · Taxes · Entire Agreement · Force Majeure · Future Pandemic · Headings · Governing Law · Severability · Counterparts.
- **Toronto-10** (Toronto — rotational-signage style):
  General Agreements · Existence/Power/Authority · Confidentiality · Indemnification · Insurance · Limitation of Liability · Default and Termination · Force Majeure · Future Pandemic · Miscellaneous.

**Truly common clauses across all three variants:** Existence/Power/Authority,
Confidentiality, Indemnification, Force Majeure, Future Pandemic, Miscellaneous.

**Design implication:** General Terms is a **template-level** block, not one
universal block. Each Service Contract template carries its own verbatim General
Terms (Ravens-10 is the default; Iona-19 and Toronto-10 are alternate templates
that can be added as separate seeded templates). This fits the repo-seeded
template architecture (Approach 1).

### Variable term exhibits (toggleable add-ons)
- **Parts / Warranty** — "Parts Replacement Procedures" (Exhibit C style).
  Present in: Ravens, SMU. Verbatim text seeded (Ravens, canonical).
- **Software / LiveSync** — "Software End User License Agreement" (Exhibit B).
  Present in: Hub City, SMU (and in-body at Iona). The EULA uses "Licensee"/"Licensor"
  as defined terms throughout; only the preamble carries the specific licensee
  name+address (a configurable field). Verbatim text seeded from Hub City/SMU
  with `{{purchaserName}}`/`{{purchaserAddress}}` tokens in the preamble.
- **Graphics** — "Terms & Conditions for Graphics Production" / "General Conditions
  for Graphics Production". Present in: Ad Hoc Graphics, Iona, Toronto. Uses
  "Purchaser" throughout (no party-name placeholder needed). Verbatim text seeded
  from Ad Hoc Graphics.
- **Labor** — NOT a separate legal exhibit in any contract. Labor is a scope/body
  element (on-site service, phone support) living in the Responsibilities/Compensation
  body, not a toggleable legal block. Kept as an optional editable exhibit stub for
  per-instance labor-warranty language; not auto-populated from the contracts.
- **Live Sync** — bundled inside the Software EULA (Hub City, SMU) or the body
  (Iona). Not a separate legal exhibit. Merged into the Software exhibit.

## Project types (inferred from the real contracts)
1. **general-only** — Ad Hoc Services
2. **general + labor** — Arizona
3. **general + graphics** — Ad Hoc Graphics, Toronto
4. **general + software** (covers LiveSync) — Hub City
5. **general + parts** — Ravens
6. **general + labor + software + parts** — SMU
7. **general + labor + software + graphics** — Iona

These replace the four placeholder presets seeded in pass 1. The preset set is
refined to match the real combinations (see `lib/serviceContracts/presets.ts`).

## What was populated into the system (pass 2)
- `graphics` exhibit body → verbatim "Terms & Conditions for Graphics Production"
  (Scope of Services, Ownership of Materials, Warranties, Indemnities).
- `software` exhibit body → verbatim Software EULA with `{{purchaserName}}` /
  `{{purchaserAddress}}` tokens in the preamble (Licensee/Licensor defined terms
  throughout the body).
- `parts` exhibit body → unchanged (Ravens "Parts Replacement Procedures", canonical).
- Presets → refined to the 7 real project types above.
- Token substitution added to the exhibit render path so `{{purchaserName}}` /
  `{{purchaserAddress}}` / `{{venueName}}` / `{{agreementDate}}` / `{{termStart}}` /
  `{{termEnd}}` in any exhibit body are replaced with the contract's configured values.

## Follow-up (not in this pass)
- Add Iona-19 and Toronto-10 as alternate General Terms templates (separate seeded
  templates) if those legal styles recur.
- The SMU EULA still references "PROVIDENCE COLLEGE" as Licensee (a template artifact
  ANC forgot to update) — confirms the licensee is a fillable field; the seeded EULA
  uses tokens instead.
- Labor exhibit: gather a clean labor-warranty legal block if ANC wants a distinct
  Labor exhibit (currently labor is body/scope, not a legal block).