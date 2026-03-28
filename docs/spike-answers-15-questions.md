# 15 Questions — Written Answers

**Date:** March 28, 2026

---

## 1. What document classes does the next version explicitly support?

**Supported now (after spike):**

- **Selectable-text PDF schedules** — yes. This is the primary target. Panthers Indoor, Panthers Outdoor, most RFP spec documents with Division 11 sections. pdfplumber reads the tables directly.

- **Vector drawing sheets with selectable text** — yes, with caveats. BofA AV Schedule falls here. The PDF has selectable text (pdftotext works) but the visual layout is a drawing. pdfplumber may or may not detect table boundaries. pdftotext -layout preserves enough structure for Gemini to parse column-by-column. This class works but is the most fragile.

- **Multi-page spec books** — partially. Page classification (keyword scan on pdftotext per page) identifies the 3-10 relevant pages. Those pages get extracted as Class A or B. The risk is the page classifier missing a relevant page. Mitigation: if the extracted count doesn't match the document's stated total, flag it.

**Not supported yet (deferred):**

- **Scanned/raster PDFs** — no. Requires OCR as a prerequisite step. OCR quality varies. Will add after the deterministic pipeline proves stable on text-layer docs.

**Explicitly out of scope:**

- Hand-drawn sketches
- Narrative-only specs with no tables
- Encrypted/password-protected PDFs
- Non-English documents

---

## 2. What is the exact extraction pipeline, in order?

```
1. pdfplumber.open(pdf) → find tables on each page
   - Looks for table structures with cell boundaries
   - If tables found → extract rows with cell values → map to schema

2. If pdfplumber finds 0 tables on a page:
   pdftotext -layout on that page
   - If text > 50 chars and contains table headers → structured text parsing
   - Parse columns by whitespace alignment (pdftotext -layout preserves spacing)

3. If pdftotext returns < 50 chars (raster/drawing with no text):
   PyMuPDF word extraction with coordinates
   - Extracts individual words with (x, y) positions
   - Groups words into rows by y-coordinate proximity
   - Groups columns by x-coordinate alignment

4. If PyMuPDF also returns nothing useful:
   Vision on cropped table region ONLY
   - pdftoppm at 300 DPI → crop to the table area
   - Send cropped image to Gemini with the expected column schema
   - Validate output against same hard gates

5. If vision also fails:
   BLOCKED — "This section could not be parsed. Manual entry required."
   - No silent skip
   - No empty result pretending to be complete
   - Export disabled for this document
```

The text layer is always tried first. Vision is step 4 of 5, not step 1.

---

## 3. What is the canonical output schema?

```typescript
interface ExtractedDisplay {
  // Required — extraction fails if these are missing
  name: string;                    // room/location name, never empty, never "LED Display"
  widthFt: number | null;          // decimal feet, null only if truly absent from source
  heightFt: number | null;         // decimal feet
  environment: "indoor" | "outdoor";

  // Required for LED displays (null for scoreboards/clocks)
  pixelPitchMm: number | null;
  brightnessNits: number | null;

  // Source tracking — required for audit trail
  sourceDoc: string;               // filename
  sourcePage: number;              // 1-indexed page number
  sourceTable: string;             // table header name
  sourceRowIndex: number;          // position within that table
  rawRowText: string;              // original text for this row, verbatim

  // Optional enrichment
  deviceId: string | null;         // "LED.000.A.01" if present
  description: string | null;      // "Large Format LED"
  widthRaw: string | null;         // "14' X 8'" as printed
  heightRaw: string | null;        // preserved for comparison
  areaSqFt: number | null;         // from document or calculated
  quantity: number;                // default 1

  // Parse metadata
  confidence: "high" | "medium" | "low";
  parseMethod: "pdfplumber" | "pdftotext" | "pymupdf" | "vision" | "ai-repair";
  validationErrors: string[];      // empty array = clean
}
```

**Required fields that block extraction if missing:** name, sourceDoc, sourcePage, sourceTable, rawRowText.

**Fields that trigger "needs review" if missing:** widthFt, heightFt, pixelPitchMm, brightnessNits.

---

## 4. Where exactly is AI used, and where is it forbidden?

**AI is forbidden from:**

- Deciding what rows exist in a table
- Deciding how many displays are in a document
- Reading a full page and returning structured data
- Choosing which tables to extract
- Determining the count of anything

**AI is permitted for:**

- Normalizing one parsed row's room name (e.g., "INCIDENT COMMANT" → "INCIDENT COMMAND")
- Parsing a dimension string that the deterministic parser couldn't handle (e.g., "21' 8\" x 5' 4\"" → widthFt: 21.67, heightFt: 5.33)
- Inferring environment when the table doesn't state it explicitly (given surrounding context rows)
- Mapping a device ID to a room name when the parser extracted both but couldn't associate them

**The hard line:**

The deterministic parser decides WHAT exists (tables, rows, cells). AI decides HOW to interpret ambiguous values within a single cell. If the parser can't find a row, that row doesn't exist. AI cannot invent it.

---

## 5. What are the hard validation gates that block export?

**Count checks:**
- If the document states a total ("29 displays"), the extracted count must match exactly
- If it doesn't match → BLOCKED
- If no stated total exists → count check is skipped (no fabricated baseline)

**Required row checks:**
- For documents with gold test data: named rows must be present with matching values
- For new documents: skip this check (no gold data yet)

**Duplicate detection:**
- No two rows may have identical (name + widthFt + heightFt + sourceTable)
- If duplicates found → BLOCKED, show which rows are duplicated

**Numeric dimension checks:**
- widthFt and heightFt must be > 0 and < 2000 (no 0' displays, no absurd values)
- pixelPitchMm must be between 0.5 and 50
- brightnessNits must be between 100 and 20000
- Any value outside range → that row flagged, export blocked if >2 flagged rows

**Missing table detection:**
- Keyword scan identifies all table headers present in the document text (e.g., "INTERIOR LED BOARD SCHEDULE", "SCOREBOARD & RIBBON BOARD SCHEDULE", etc.)
- Parser must extract rows from EVERY identified table header
- If ANY identified table produces 0 extracted rows → BLOCKED immediately
- Not "warning if 1 missed, blocked if 2 missed" — ANY missed table is a failure
- Reason: a single missed table can mean 18 missing outdoor displays. There is no acceptable number of missed tables.

**Fabrication check:**
- Every extracted row must have non-empty rawRowText
- rawRowText must be findable (substring match) in the original pdftotext output
- If a row has no traceable source → BLOCKED as fabrication

**What stops the pipeline:**
- Count mismatch (when document states a total)
- Duplicate rows
- Fabricated rows (no rawRowText trace)
- More than 2 rows with out-of-range dimensions
- Missing more than 1 expected table

---

## 6. What happens if two methods disagree?

**The text layer is primary — unless its own validation fails.**

Text layer wins when:
- pdfplumber or pdftotext extraction passes all validation gates (count, duplicates, dimensions, traceability)
- In that case, vision is never consulted

Text layer loses when:
- Text extraction passes count check but rawRowText traceability fails on specific rows (values don't match source text — indicates column misalignment)
- Text extraction returns 0 tables on a page that keyword scan said was relevant
- In those cases, fall through to the next step in the pipeline (PyMuPDF → vision → blocked)

If pdfplumber says 47 and vision says 48:
- pdfplumber's 47 is the answer IF all 47 pass validation
- If pdfplumber's 47 has validation failures, investigate — don't blindly trust count alone

If pdftotext says 47 and pdfplumber says 45:
- Use pdftotext's 47 as the candidate set
- Validate each row — the 2 rows pdfplumber missed may have parse issues
- If all 47 validate → accept. If the extra 2 fail validation → accept 45 + flag the 2 for review

**Export blocks automatically when:**
- Two methods produce different counts AND neither matches a stated document total
- The delta is more than 1 row
- The primary method's output has validation failures that can't be resolved

**Export proceeds when:**
- Primary text-layer extraction passes ALL validation gates
- No unresolved validation errors remain

---

## 7. What is the confidence model?

Not vibes. Concrete signals:

**HIGH confidence (green — export allowed):**
- parseMethod = "pdfplumber" or "pdftotext" (text-layer source)
- All required fields populated
- rawRowText traces to source for every row
- Zero validation errors
- Count matches document total (if stated)
- This is the ONLY level that allows export without review

**MEDIUM confidence (yellow — export BLOCKED until reviewed):**
- parseMethod = "pdftotext" with 1-2 rows needing AI repair
- Count matches but 1-2 rows have dimension warnings
- rawRowText traces to source
- Export requires user to click "I reviewed the flagged rows" before it unblocks
- This is NOT auto-export. The user must confirm.

**LOW confidence (red — export BLOCKED, no override):**
- parseMethod = "vision" or "ai-repair" on more than 3 rows
- Count doesn't match document total
- Any fabrication detected (row without rawRowText trace)
- More than 2 validation errors
- Export cannot be unblocked — user must fix the data first

**NEEDS REVIEW (blocked, manual intervention required):**
- parseMethod = "vision" AND validation failed
- Or deterministic pipeline returned 0 rows for a page that keyword scan said was relevant
- Export cannot be unblocked — manual entry required for the failed section

---

## 8. What is the spike plan and evidence package?

**Documents in the spike:**

| # | Document | Why |
|---|----------|-----|
| 1 | Panthers Indoor (23 pages) | Clean text-layer spec, 25 displays |
| 2 | Panthers Outdoor (20 pages) | Same format, outdoor, ribbons |
| 3 | BofA AV Schedule (1 page) | Dense vector drawing, 6 tables, 47 displays — the hard test |
| 4 | Haslam Sports RFP (~10 pages) | Different client, different format, proves generalization |

**Outputs for each document:**

1. pdfplumber raw extraction (tables found, rows per table, cell values)
2. pdftotext -layout output (for comparison)
3. PyMuPDF word extraction with coordinates (if pdfplumber fails)
4. Mapped canonical schema output (JSON)
5. Validation results (pass/fail per check)
6. Diff against gold test JSON (exact field-by-field comparison)
7. Which rows needed AI repair and what was changed

---

## 9. What does success mean for the spike?

**Pass criteria per document:**

- Row count matches gold exactly
- Every row's name matches gold
- Every row's widthFt and heightFt match gold within 0.1 ft
- Every row's pixelPitchMm and brightnessNits match gold exactly
- Every row's environment matches gold
- Zero fabricated rows (no row without rawRowText source)
- Zero duplicate rows

**Overall spike passes if:**

- 4/4 documents pass all checks
- OR 3/4 pass, and the 1 failure has a clear documented reason + proposed fix

**Spike fails if:**

- Any document has fabricated rows
- Any document has more than 2 wrong dimension values
- The approach requires full-page AI reading on any text-layer document

---

## 10. What is the gold test set?

**Documents with expected JSON ground truth:**

```
tests/gold/panthers-indoor.json    — 25 displays, manually verified
tests/gold/panthers-outdoor.json   — 18 displays, manually verified
tests/gold/bofa-av-schedule.json   — 47 displays, manually verified
tests/gold/haslam-sports.json      — TBD displays, manually verified after first extraction
```

**How future changes are tested:**

- Every PR that touches extraction code runs the test suite
- Test runner loads each gold JSON, runs extraction on the source PDF, compares field-by-field
- Output: PASS (all fields match) or FAIL (show exact diffs)
- No merge if any gold test fails

**How gold files are created:**

- Extract once with the best available method
- Manually verify every single row against the source document
- Ahmad or Natalia confirms the gold values
- Gold files are checked into the repo and never auto-generated

---

## 11. How will the system handle a totally new RFP format?

**Best case:**
- pdfplumber detects tables, header row matches known patterns ("LED SCHEDULE", "DISPLAY MATRIX", etc.)
- Rows parse cleanly into canonical schema
- Validation passes
- Result: works automatically, high confidence

**Medium case:**
- pdfplumber misses table boundaries, pdftotext -layout gets the text
- Column alignment is off — some rows need AI repair
- Validation passes with medium confidence
- Result: works with some flagged rows for review

**Worst case:**
- Completely novel table format, no header matches
- pdfplumber and pdftotext both fail to detect structure
- Vision fallback on cropped sections produces unreliable output
- Validation fails
- Result: BLOCKED. "This document format is not yet supported. Manual entry required."

**What gets blocked:** Export. Proposal generation. Anything downstream.

**What still works:** The document is stored. The user can see what was attempted. They can manually enter displays. The system doesn't pretend it understood something it didn't.

---

## 12. What can still fail silently in this design?

Honest answer:

**1. pdftotext column alignment on novel layouts.**
pdftotext -layout uses whitespace to infer columns. A document with unusual spacing could cause values from column A to be read as column B. The rawRowText audit trail catches this IF someone reviews it, but the pipeline itself wouldn't detect a misaligned parse.

**Mitigation:** Cross-check that dimension values are reasonable (widthFt > heightFt for landscape displays, widthFt < 500, etc.). Flag rows where the parsed value doesn't appear in the rawRowText.

**2. Table header not matching any known pattern.**
If a document uses "VIDEO DISPLAY INVENTORY" instead of "LED BOARD SCHEDULE", the pipeline won't identify it as a table to extract.

**Mitigation:** Keep a growing list of known headers. Log unmatched tables. Count pages with LED keywords that produced 0 extracted tables — if any exist, warn the user.

**3. Quantity embedded in text, not in a column.**
"2 displays back-to-back" in a notes field. The parser reads it as 1 row with quantity 1.

**Mitigation:** AI repair can check notes fields for quantity language. But this is bounded — it's checking a specific field, not reading the whole document.

**4. Truly invisible data.**
Information that exists only in the visual layout (e.g., a struck-through row that pdftotext doesn't mark as struck-through). The parser can't know it was struck through.

**Mitigation:** None in the deterministic layer. This is where human review exists. The count validation may catch it (expected 44 but got 47 = 3 struck-through rows included).

---

## 13. What logs/debug output will exist when extraction fails?

Every extraction produces a structured log:

```json
{
  "document": "filename.pdf",
  "timestamp": "2026-03-28T07:00:00Z",
  "pipeline": [
    {
      "step": "pdfplumber",
      "pages_processed": 1,
      "tables_found": 0,
      "result": "no_tables",
      "duration_ms": 120
    },
    {
      "step": "pdftotext",
      "pages_processed": 1,
      "chars_extracted": 48839,
      "table_headers_found": ["A/V INTERIOR LED BOARD SCHEDULE", "..."],
      "rows_parsed": 47,
      "result": "success",
      "duration_ms": 85
    },
    {
      "step": "ai_repair",
      "rows_repaired": 2,
      "repairs": [
        {"row": 5, "field": "name", "from": "INCIDENT COMMANT", "to": "INCIDENT COMMAND", "reason": "typo correction"}
      ],
      "duration_ms": 1200
    },
    {
      "step": "validation",
      "checks_passed": 6,
      "checks_failed": 0,
      "result": "PASS",
      "duration_ms": 15
    }
  ],
  "final_count": 47,
  "confidence": "high",
  "export_allowed": true
}
```

When extraction fails, the log shows exactly which step failed and why. No guessing.

---

## 14. If pdfplumber fails AND PyMuPDF fails, what is the exact next step?

```
pdfplumber → 0 tables found on this page
  ↓
pdftotext -layout → text exists (> 50 chars)?
  YES → parse by column alignment → validate
  NO ↓
PyMuPDF word extraction → words with coordinates found?
  YES → group into rows/columns by position → validate
  NO ↓
This page has no extractable text.
  → Convert page to 300 DPI PNG
  → Crop to detected table regions (if identifiable) or send full page
  → Send to Gemini Vision with expected column schema
  → Validate output against hard gates
  → If validation passes → accept with confidence: "low"
  → If validation fails → BLOCKED
     → Log: "Page X: no text layer, vision validation failed"
     → UI: "This page could not be parsed. Manual entry required."
     → Export disabled until user provides manual data or skips this page
```

No silent skip. No "best effort." Blocked or proven correct.

---

## 15. What is the smallest deliverable you can ship first?

**The smallest real improvement that doesn't pretend the whole problem is solved:**

**Ship: pdftotext-first extraction with hard validation gates.**

**THIS IS AN INTERIM SAFETY UPGRADE, NOT THE FINAL ARCHITECTURE.**

It does not mean "RFP extraction is solved." It means "extraction is safer than yesterday and garbage is blocked instead of shipped."

What changes:
- When Gemini is the extractor, feed it pdftotext output instead of the raw PDF/image
- This is what already got 47/47 on BofA with correct values
- Add the hard validation gates (count check, duplicate check, dimension range check, fabrication check via rawRowText)
- If validation fails → export blocked, show what failed

What doesn't change yet:
- Still using Gemini as the structuring engine (not a deterministic parser yet)
- Still using vision for pages with no text
- Still one extraction call (not per-table)
- Still non-deterministic — same input may produce slightly different output across runs
- Still dependent on prompt quality for accuracy

What this buys us:
- BofA goes from oscillating 46-50 with wrong values → 47/47 with correct values (text-based)
- Validation gates block any run where the count is wrong, rows are duplicated, or values are fabricated
- Natalia never sees garbage — she sees correct data or a "validation failed" message
- It ships today

What this does NOT buy us:
- Reliability across arbitrary new formats (that's the spike)
- Deterministic extraction (that's the pdfplumber architecture)
- Format-agnostic table parsing (that's the full pipeline)
- Confidence that it works on documents we haven't tested (that's the gold test set)

**The spike deliverable (ships after this):**
- pdfplumber table extraction replaces Gemini as the primary extractor
- Per-table parsing with schema detection
- AI limited to row-level repair
- Full gold test suite with pass/fail per document
- Defined support matrix: which document classes work, which are blocked

Two steps. Ship the safety net today. Ship the real architecture after the spike proves it works. Don't confuse the two.
