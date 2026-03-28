# Spike Plan: Deterministic RFP Extraction Pipeline

**Date:** March 28, 2026
**Goal:** Replace prompt-based AI extraction with a deterministic parser that uses AI only for bounded row-level cleanup. Prove it works on 4 different RFP formats.

---

## 1. Canonical Display Schema

Every extracted display maps to this exact object. No coding before this is agreed.

```typescript
interface ExtractedDisplay {
  // Source tracking
  sourceDoc: string;          // filename
  sourcePage: number;         // 1-indexed
  sourceTable: string;        // "A/V INTERIOR LED BOARD SCHEDULE"
  sourceRowIndex: number;     // row position in that table
  rawRowText: string;         // original text of this row for audit

  // Display identity
  deviceId: string | null;    // "LED.000.A.01" or null
  name: string;               // "FIELD RIBBON NORTH" — room/location name
  description: string | null; // "Large Format LED"

  // Physical specs
  widthFt: number | null;     // decimal feet (14.0, 21.67)
  heightFt: number | null;    // decimal feet
  widthRaw: string | null;    // "14' X 8'" — exactly as printed
  heightRaw: string | null;   // preserved for audit
  areaSqFt: number | null;    // calculated or from document

  // LED specs
  pixelPitchMm: number | null;
  brightnessNits: number | null;
  environment: "indoor" | "outdoor";

  // Metadata
  confidence: "high" | "medium" | "low";  // based on parse quality
  parseMethod: "deterministic" | "ai-repair" | "vision-fallback";
  validationErrors: string[]; // empty = clean
}
```

---

## 2. Supported Document Classes

### Class A: Text-layer schedule pages
- PDF has selectable text with table structure
- Examples: Panthers Indoor spec (23 pages), Panthers Outdoor spec (20 pages)
- Method: pdftotext -layout OR pdfplumber table extraction
- Expected reliability: high

### Class B: Vector-drawn AV schedule sheets
- PDF has selectable text but tables are drawn as vector graphics
- pdftotext extracts text but column alignment may be garbled
- Example: BofA AV Schedule (1 page, 6 tables)
- Method: pdfplumber table extraction with coordinate-based parsing
- If pdfplumber fails: pdftotext -layout + AI column separation
- Expected reliability: medium-high

### Class C: Multi-page spec books (100-600 pages)
- Mix of text, drawings, legal, structural
- LED specs are on 3-10 pages buried in the middle
- Example: DD Project Manual Vol I (500 pages)
- Method: page classification (keyword scan) → extract only relevant pages → Class A or B handling
- Expected reliability: depends on page classification accuracy

### Class D: Scanned/raster PDFs
- No selectable text at all
- Method: OCR (Mistral OCR or Tesseract) → treat as Class A/B after OCR
- If OCR fails: vision on cropped table regions
- Expected reliability: low — flag for human review

### Unsupported (blocked, not attempted):
- Hand-drawn sketches
- PDFs with no tables (narrative-only specs)
- Encrypted/password-protected PDFs

---

## 3. Test Documents (4 formats)

| # | Document | Class | Pages | Expected Displays | Why It's in the Set |
|---|----------|-------|-------|-------------------|---------------------|
| 1 | Panthers Indoor Spec | A | 23 | 25 | Clean text-layer spec with table on pages 12-13 |
| 2 | Panthers Outdoor Spec | A | 20 | 18 | Same format, outdoor environment, ribbon boards |
| 3 | BofA AV Schedule | B | 1 | 47 | Dense vector drawing, 6 tables on 1 page, the hard test |
| 4 | Haslam Sports RFP | A/B | ~10 | TBD | Different client, different format, proves generalization |

Each document gets a gold JSON file with exact expected output.

---

## 4. Extraction Pipeline (build order)

### Phase A: Deterministic Ingestion

```
PDF uploaded
  → pdfinfo: get page count
  → Attempt pdfplumber table extraction on each page
    → If tables found: extract rows with cell boundaries
    → If no tables: try pdftotext -layout
    → If no text at all: mark as Class D (raster)
  → Identify schedule tables by header row matching:
    - "LED BOARD SCHEDULE"
    - "SCOREBOARD"
    - "RIBBON BOARD"
    - "ENTRY LED"
    - "EXTERIOR LED"
    - "DISPLAY SCHEDULE"
    - "DISPLAY MATRIX"
  → For each identified table:
    → Detect column schema from header row
    → Extract each data row into canonical schema
    → Preserve rawRowText for audit
```

### Phase B: Bounded AI Cleanup (row-level only)

For each extracted row, IF it has parse issues:
- Missing room name but has device ID → AI: "What room is LED.300.A.1?"
- OCR artifacts in dimension string → AI: "Parse '21\' 8\" x 5\' 4\"' into decimal feet"
- Ambiguous environment → AI: "Is 'NORTH CORRIDOR' indoor or outdoor?"

Rules:
- AI receives ONE row at a time
- AI receives the column schema and surrounding rows for context
- AI does NOT see the whole document
- AI response is validated against the column schema before acceptance

### Phase C: Hard Validation Gates

Every extraction must pass ALL of these before export is allowed:

**Count validation:**
- If document states a total (e.g., "29 displays"), extracted count must match exactly
- If multiple tables, sum of table row counts must equal total display count

**Required row validation (per document, from gold test set):**
- Named rows that MUST exist (e.g., FIELD RIBBON NORTH, DEF UNIT)
- If any required row is missing → BLOCKED

**Data quality checks:**
- Every display must have a name (not empty, not "LED Display")
- widthFt and heightFt must be numeric and > 0
- pixelPitchMm must be in range [0.5, 50]
- brightnessNits must be in range [100, 20000]
- No duplicate rows (same name + same dimensions + same table)

**Structural checks:**
- No fabricated rows (row must trace back to rawRowText in the source)
- No dimension swaps from adjacent columns (width of display A != height of display B)

**On failure:**
- Export is BLOCKED
- UI shows which checks failed and which rows are affected
- User can review/repair flagged rows
- Downstream proposal generation is disabled until all checks pass

### Phase D: Vision Fallback (section-level only)

Triggered ONLY when:
- pdfplumber finds 0 tables on a page AND pdftotext returns < 50 chars
- OR a specific table section fails deterministic parsing

When triggered:
- Crop ONLY the failed section (not full page)
- Convert to 300 DPI PNG
- Send cropped image to Gemini with the table's column schema
- Validate vision output against the same hard gates
- If vision also fails → mark section as "Needs Manual Review"

---

## 5. Fallback Chain (exact order)

```
1. pdfplumber table extraction
   ↓ fails
2. pdftotext -layout + column detection
   ↓ fails
3. PyMuPDF word extraction with coordinates
   ↓ fails
4. Vision on cropped table region
   ↓ fails
5. BLOCKED — "This table could not be parsed. Manual entry required."
```

No silent fallbacks. Each step logs why it failed. The user sees exactly where the pipeline stopped.

---

## 6. Gold Test Set Format

For each test document, a JSON file:

```
tests/gold/panthers-indoor.json
tests/gold/panthers-outdoor.json
tests/gold/bofa-av-schedule.json
tests/gold/haslam-sports.json
```

Each file contains:
```json
{
  "document": "Carolina Panthers - Indoor LED Videoboards.pdf",
  "expectedDisplayCount": 25,
  "expectedTables": [
    {"name": "LED Display Schedule", "rowCount": 25}
  ],
  "requiredRows": [
    {"name": "Team Room", "widthFt": 14, "heightFt": 8, "pitchMm": 3.9, "nits": 8000},
    {"name": "Elev Lobby", "widthFt": 6, "heightFt": 4, "pitchMm": 3.9, "nits": 8000}
  ],
  "displays": [
    // ... all 25 displays with exact values
  ]
}
```

Test runner compares extraction output against gold:
- Row count must match
- Every required row must be present with exact values
- No extra rows that don't exist in gold
- Dimensions must match within 0.1 ft tolerance

**PASS = exact match. Everything else = FAIL.**

---

## 7. What Gets Built vs What Gets Deferred

### Build now (spike):
- pdfplumber table extraction on 4 test docs
- PyMuPDF fallback for tables pdfplumber misses
- Canonical schema mapping
- Gold test set for all 4 docs
- Hard validation engine
- Test runner (pass/fail per doc)

### Build after spike proves the approach:
- Integration into the app (replace current Gemini-first pipeline)
- AI row-level cleanup
- Vision fallback for cropped sections
- UI for validation failures and manual review
- Support for Class C (600-page docs) and Class D (scanned)

### Not building:
- Universal PDF reader
- More prompt tuning on the current approach
- Running extraction 3 times and voting
- Full-page vision on dense drawings

---

## 8. Success Criteria

The spike passes if:

1. **Panthers Indoor:** 25/25 displays, all values match gold, zero errors
2. **Panthers Outdoor:** 18/18 displays, all values match gold, zero errors
3. **BofA AV Schedule:** 47/47 displays, all values match gold, zero errors
4. **Haslam Sports:** TBD/TBD displays, all values match gold, zero errors

"Match gold" means: name, widthFt, heightFt, pixelPitchMm, brightnessNits, environment — all correct.

If any document fails, the spike report says exactly why and what fallback would be needed.

No vibes. No "looks promising." Pass or fail.
