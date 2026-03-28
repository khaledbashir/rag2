# Handover — March 28, 2026

**Session:** 13 hours (11 PM March 27 → 12 PM March 28)
**Branch:** phase2/product-database
**Last commit:** 6dd804c8

---

## What works RIGHT NOW (tested, reliable)

| Document | Count | Method | Runs |
|----------|-------|--------|------|
| Panthers Indoor (23pg spec) | 25/25 | Gemini Flash text-first | 4/4 PASS |
| Panthers Outdoor (20pg spec) | 18/18 | Gemini Flash text-first | 3/3 PASS |
| BofA AV Schedule (1pg drawing) | 47/47 | pdfplumber deterministic | Every run |

These three are ready for Natalia on Monday.

---

## What's broken and why

**DD Project Manual (499pg scanned PDF): 32/43**

The manual contains the same LED specs as the Panthers files (pages 427-428 indoor, 454-455 outdoor). Mistral OCR converts the scanned pages to text. Keyword filter finds the LED pages. But Gemini reads the OCR text and skips 11 rows.

The 11 missing displays are: East Corridor, Large Admin Room, 4x Panthers Den, 3x Elev Lobby, 1x South Club, 1x North Club.

**Root cause:** Gemini is non-deterministic when extracting rows from long text. Same input, different row counts across runs. This is a structural limitation of using an LLM as the row extractor.

**The fix:** Build a deterministic text parser that reads OCR output line by line. The LED spec format is structured:
```
Location    Pixel Pitch    Brightness    Width    Height
Team Room      3.9           8000       14'       8'
```
This is parseable without AI. The parser detects the table header, then reads every subsequent line as a row until the next section heading.

---

## Architecture (as deployed)

```
PDF uploaded
  → pdfplumber (deterministic, zero AI)
    → Found tables? → validate → Extract QA (GLM-5 Turbo) → product match → done
  → No tables → pdftotext
    → Got text? → keyword-filter to LED sections → Gemini Flash
    → No text? → Mistral OCR → keyword-filter → Gemini Flash
  → Gemini Flash validates
    → Passed? → Extract QA → product match → done
    → Failed? → auto-escalate to Gemini 3.1 Pro
    → Pro also failed? → BLOCKED
```

## Key files changed in this session

| File | What |
|------|------|
| `services/rfp/unified/geminiExtractor.ts` | Text-first extraction, OCR, TOC navigation, streaming |
| `services/rfp/unified/glmExtractor.ts` | Gated pipeline (pdfplumber → Flash → Pro), Extract QA integration |
| `services/rfp/extractionValidator.ts` | Hard validation gates |
| `services/rfp/extractQAAgent.ts` | Extract QA (GLM-5 Turbo) + scout |
| `services/rfp/aiProductMatcher.ts` | Gemini function calling against DB |
| `services/catalog/productMatcher.ts` | Mesh/nits penalties, DB-only |
| `scripts/pdfplumber-extract.py` | Deterministic table extraction |
| `app/api/rfp/repair-row/route.ts` | Row repair endpoint (OpenClaw → Gemini) |
| `app/api/rfp/analyze/route.ts` | Pipeline log, SSE guard, progress fix |
| `app/tools/rfp-analyzer/RfpAnalyzerClient.tsx` | Repair button, qty change, dim locking |
| `app/tools/rfp-analyzer/_components/UploadZone.tsx` | AI Thinking panel |
| `app/tools/rfp-analyzer/_components/rfpWorkbookBuilder.ts` | Dedup-safe pricing, qty dropdown |
| `app/components/reusables/WorkbookShell.tsx` | Fix button render |
| `prisma/schema.prisma` | Cabinet packing fields |
| `LESSONS.md` | Production rules |

## OpenClaw

- Agent: `rfp-extractor` (renamed to "Extract")
- Model: `google/gemini-2.5-flash`
- Identity: QA manager — reviews extractions, fixes errors
- Skills: led-display-extractor, led-repair-agent, pdf-extract, excel-xlsx, pdf-processing, automate-excel, doc-extract-filter, image-vision
- Google + Inception providers added to OpenClaw config

## Database changes

- 8 new fields on ManufacturerProduct (cabinet packing)
- 13 NX Yaham products updated with pricing
- Pre-migration backup: `/root/backups/db/ancdb_pre-migration_20260328-010224.sql.gz`

## Environment

- `GEMINI_API_KEY=AIzaSyCyGpAkD6zfG8ifgRo3TXDbzbBOqKxVti0` (updated in EasyPanel)
- All env vars saved in memory: `reference_env_vars.md`
- Backup runs daily at 3 AM CET to Hetzner Storage Box

## What to build next (in order)

### 1. Deterministic text parser for LED spec format
The DD Manual fix. Parse OCR text line by line instead of sending to Gemini.
- Detect section headers ("2.3 LOCATIONS", "SECTION 116843")
- Find table headers (Location, Pixel Pitch, Brightness, Width, Height)
- Parse each line after the header as a display row
- Handle multi-line wrapped rows
- Validate count against expected total

### 2. Gold test set
- `tests/gold/panthers-indoor.json` — 25 displays, manually verified
- `tests/gold/panthers-outdoor.json` — 18 displays
- `tests/gold/bofa-av-schedule.json` — 47 displays
- `tests/gold/dd-manual.json` — 43 displays (25 indoor + 18 outdoor)
- Test runner: `npm run test:extraction` — compare output vs gold, pass/fail

### 3. Export blocking in UI
- Wire `validation.exportAllowed` into the UI
- Disable export button when validation fails
- Show which checks failed

### 4. Wire Extract into UI
- Not just pipeline log — visible review step
- "Extract verified: 47 displays, 0 corrections" as a green badge
- Or "Extract fixed 3 issues" with expandable change log

## Rules for the next developer

Read these files first:
- `LESSONS.md` — Production rules, Docker gotchas, build philosophy
- `docs/spike-plan-deterministic-extraction.md` — Architecture plan
- `docs/spike-answers-15-questions.md` — All design decisions explained
- `docs/test-reference/natalia-rfp-test-checklist.md` — Expected test results

Core rules:
- One commit, one build, one deploy, verify, then next
- No silent failures — throw errors, don't catch and hide
- Products in DB only — no static files
- Build Ahmad's ideas now, not later
- "Good enough" is not acceptable
- Parser first, AI for cleanup only
- Test every file 3 times before showing Natalia
