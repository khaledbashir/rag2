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
