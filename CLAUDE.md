# Project: rag2

## RFP ANALYZER — FROZEN. DO NOT TOUCH.

The RFP Analyzer is production-approved as of April 2, 2026. Natalia confirmed it working. It is FROZEN.

### Protected files — DO NOT EDIT without explicit written approval from Ahmad:
- `app/rfp-analyzer/**/*` (all RFP analyzer pages and components)
- `services/rfp/pipeline/**/*` (extraction pipeline, display detection, product matching)
- `app/api/rfp/**/*` (all RFP API routes)
- `app/components/rfp/**/*` (all RFP-specific components)
- Any file with "rfp" in the path or filename

### Shared modules — READ ONLY unless approved:
- `app/components/reusables/WorkbookShell.tsx`
- Product catalog queries/services
- Rate card queries/services
- Any utility imported by both estimator and RFP code

If you need to modify a shared module:
1. STOP.
2. Explain what you need to change and why.
3. Explain exactly how it affects the RFP Analyzer output.
4. Wait for approval.
5. If approved, write a test that proves RFP behavior is unchanged BEFORE making the change.

### If you are unsure whether a file is shared:
Search for imports. If any RFP file imports it, treat it as protected. ASK before editing.

### No exceptions. No "quick fixes." No "it won't affect anything."
If the RFP Analyzer behaves differently after your session than it did before — even visually, even "better" — you failed. The requirement is IDENTICAL behavior, not improved behavior.

### Verification after ANY session that touches estimator code:
Before saying you're done, confirm: "I verified that no RFP-protected or shared files were modified in this session." If you cannot confirm this, list every protected/shared file you touched and why.

## Overview
<!-- Describe what this project does -->

## Tech Stack
<!-- e.g., Python 3.11, FastAPI, PostgreSQL, etc. -->

## Project Structure
<!-- Key directories and their purposes -->

## Development Commands
<!-- Common commands for building, testing, running -->
<!-- Example:
- `make dev` - Start dev server
- `make test` - Run tests
- `make lint` - Run linter
-->

## Conventions
<!-- Coding style, naming conventions, patterns to follow -->

## Important Notes
<!-- Anything Claude should know when working on this project -->

## Estimator — Courtside/Stanchion Rules
- Courtside tables and stanchions are FIXED-DIMENSION products. User does NOT enter H/W.
- Wizard shows pitch toggle (3.9/2.9mm) + size cards (10'/8'/6'/5' for tables, Single/Double for stanchions).
- All dimensions auto-populate from product DB (`extendedSpecs.displayWidthFt`, `displayHeightFt`, etc.)
- Product seed: `prisma/seed-courtside-tables.ts` — 12 products with full display dimension data.
- LED displays still use manual dimension entry. Courtside changes ONLY affect addon product types.

## What's Live
- Courtside/stanchion wizard with auto-populated dimensions from product DB (2026-04-03)
- Premium SOW as default DOCX button, pricing left blank (2026-04-03)
- Alternate rows with full VLOOKUP/formula breakdown (2026-04-03)
- Grand Total "None" fix (2026-04-03)
- LED Cost Sheet TOTAL row matching (2026-04-03)
- RFP Analyzer TOTAL row fix (2026-04-03)
- RFP Analyzer Univer preview double-quantity rate bug & hydration mismatch fix (2026-04-04)

## ABSOLUTE RULE: NO SHORTCUTS

NEVER search for workarounds, patches, hacks, or "quick fixes." When you hit a problem:

1. Read the actual error. Understand what is ACTUALLY broken.
2. Fix the ROOT CAUSE. Not the symptom. Not a wrapper around it. The actual thing.
3. If the fix feels easy, you're probably patching over the real problem. Stop and think again.
4. NEVER run `sed`, `find/replace`, or regex surgery as a substitute for understanding the code.
5. NEVER Google/search for "how to suppress" or "how to ignore" or "how to bypass" an error.
6. If a dependency is broken, fix the dependency usage. Don't pin, don't patch, don't shim.
7. If a test fails, fix the code. Don't fix the test to match wrong behavior.
8. The "easy way" is ALWAYS the hard way later. Do the work NOW.

If you catch yourself about to suggest a workaround, STOP and say: "I was about to take a shortcut. Here's the real fix instead."

## CLAUDE.md SELF-MAINTENANCE

At the end of every session where a rule was added, a decision was made, or project status changed:

1. Update this file. Don't ask — just do it.
2. Add new rules to the relevant section (RFP freeze goes under RFP, estimator rules under estimator, etc.)
3. If a bug was fixed and confirmed, move it from "open" to "resolved" with the date.
4. If a feature was built, add it to the "What's Live" section with a one-liner.
5. If Ahmad gave you a new rule during the session (like "don't touch X"), add it here permanently.
6. Never remove rules from this file unless Ahmad explicitly says to.
7. Keep it tight — one line per item, no paragraphs.

This file is the sync layer between all AI tools Ahmad uses. If it's not in here, it didn't happen.
