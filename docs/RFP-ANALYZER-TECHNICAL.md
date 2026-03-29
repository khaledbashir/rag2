# RFP Analyzer — Complete Technical Architecture

> Last updated: March 29, 2026
> Total pipeline code: ~9,460 lines across 10 core files

---

## Overview

The RFP Analyzer converts PDF construction documents (RFPs, bid specs, project manuals) into structured LED display specifications with automatic product matching and pricing. One upload button, zero user decisions. The system classifies the document, routes to the right OCR backend, extracts displays with AI, cross-verifies with a second AI, and matches products from the database.

**Core principle:** Deterministic extraction first (pdfplumber, regex). AI only handles what deterministic parsing can't. Two AIs verify independently. No single model dependency.

---

## Pipeline Flow: Scout → Chop → Target

Based on external architecture review. Core insight: "The problem is not AI model selection. It's canonicalization failure. Same PDF, different text representation, different result."

**pdftotext is the universal backbone.** It ALWAYS runs first. It gives page-delimited text with preserved columns. From that, we score pages, classify the document, and decide what gets sent to OCR or GPT. Nothing bypasses the scout.

```
User uploads PDF
    |
    v
[1] pdfplumber (deterministic table extraction)
    |-- Found displays? --> Validate --> QA --> Match --> Done
    |-- Found 0?
    v
[2] SCOUT: pdftotext -layout (free, instant, preserves page breaks)
    |   Scans every page. Scores by LED table signals.
    |   Classifies: "text" PDF or "drawing" PDF.
    |
    v
[3] ROUTE by document size:
    |
    |-- Small doc (<=50 pages, <=200KB)
    |   |-- Text PDF --> Kreuzberg (full PDF, ~100ms)
    |   |-- Drawing --> Marker (full PDF, image tables)
    |
    |-- Large doc (>50 pages or >200KB)
    |   |
    |   v
    |   SCORE: every page scored by TABLE_SIGNALS
    |   (pixel pitch, location, width, height, nits, display schedule, etc.)
    |   + custom keywords if user provided them
    |   Pages with 4+ signal hits = LED pages
    |   |
    |   v
    |   CHOP: pdfseparate extracts LED pages + ±1 neighbors
    |   pdfunite merges into mini PDF
    |   Example: 499 pages → 7 pages (5 LED + 2 neighbors)
    |   |
    |   v
    |   TARGET: Kreuzberg/Marker OCR on the mini PDF only
    |   Kreuzberg gets 7 pages instead of 499 — no blob merging
    |   |
    |   v
    |   FALLBACK: if Chop or OCR fails, triaged pdftotext goes direct to GPT
    |
    v
[4] GPT-5.4-mini (temp 0, deterministic, streaming, ~5-15s)
    |   Reports display count as JSON builds (every 5 displays)
    |   Custom keywords appended to extraction prompt
    |
    v
[5] Validation (6 checks, instant, source-aware)
    |   - Count vs document total
    |   - Duplicate detection
    |   - Dimension range
    |   - Name quality
    |   - Fabrication check (traceability)
    |   - Table detection (skipped for pdfplumber; active for AI)
    |
    |   Three confidence states:
    |   - verified: all checks passed, export allowed
    |   - partial_review: displays found but source may be incomplete
    |   - untrusted_input: source representation failed (OCR truncated, 0 displays)
    |
    v
[6] QA Cross-Check (always runs, different model: MiMo Pro)
    |   Independent verification against source text
    |   Fixes dimension swaps, adds missing, removes true dupes
    |   "Verified: 25 displays confirmed ✓"
    |
    v
[7] Product Matching
    |   Mercury 2 (pre-queries DB, single call, ~3s)
    |   --> MiMo (tool calling fallback)
    |   --> DB deterministic (always works)
    |
    v
[8] Done. Results streamed to UI via SSE.
```

### Why Scout → Chop → Target

The previous architecture let multiple OCR backends produce different text representations of the same PDF. Kreuzberg merged 499 pages into one 1.1MB blob. Marker truncated at 10 pages. Mistral externalized tables as HTML links. Same PDF, three different inputs to GPT, three different extraction results.

The fix: **pdftotext is the scout for ALL documents.** It preserves page breaks (`\f`), preserves whitespace column alignment, and is deterministic. From the scout's page map, we physically slice the PDF (the Chop) so OCR backends only ever see the exact pages that matter. The input to GPT is now stable regardless of document size or OCR quirks.

Terminal test confirmed: pdftotext → triage → 5 pages → GPT → 40 displays from a 499-page manual. Production was getting 2 displays because Kreuzberg got all 499 pages and merged them.

---

## Model Stack

| Step | Primary | Fallback 1 | Fallback 2 | Fallback 3 |
|------|---------|------------|------------|------------|
| Text Extraction | pdftotext | Mistral OCR | — | — |
| OCR (text PDFs) | Kreuzberg | Marker | Mistral OCR | — |
| OCR (drawing PDFs) | Marker | Kreuzberg | Mistral OCR | — |
| AI Extraction | GPT-5.4-mini | Mercury 2 | MiMo V2 Pro | GLM-5.1 |
| QA Cross-Check | MiMo V2 Pro | OpenClaw | Z.AI | Mercury 2 |
| Product Matching | Mercury 2 | MiMo V2 Pro | DB deterministic | — |

**No step depends on a single provider.** If any model is down, the next one takes over. 30s timeout on QA, 60-120s on extraction.

---

## File Architecture

### Core Pipeline (backend)

| File | Lines | Purpose |
|------|-------|---------|
| `services/rfp/unified/glmExtractor.ts` | ~2,850 | Main orchestrator: pdfplumber → classify → OCR → GPT → validate → QA → match |
| `services/rfp/extractionValidator.ts` | ~280 | 6 validation checks with extractionSource-aware behavior |
| `services/rfp/extractQAAgent.ts` | ~325 | QA agent: MiMo → OpenClaw → Z.AI → Mercury chain |
| `services/rfp/aiProductMatcher.ts` | ~375 | Product matching: Mercury → MiMo → DB fallback |
| `services/rfp/productCatalog.ts` | ~1,170 | Product DB, cabinet packing, 80/20 pricing, schedule templates |
| `app/api/rfp/analyze/route.ts` | ~990 | SSE streaming endpoint, pipeline orchestration |

### Frontend

| File | Lines | Purpose |
|------|-------|---------|
| `app/tools/rfp-analyzer/RfpAnalyzerClient.tsx` | ~3,360 | Upload, SSE handling, results display, bid form reconciliation |
| `app/tools/rfp-analyzer/_components/UploadZone.tsx` | ~810 | Drag-drop upload, custom keywords, diffusion text effect |
| `app/tools/rfp-analyzer/_components/LuxWidget.tsx` | ~185 | AI chat widget (platform owner only) |
| `app/api/rfp/lux/route.ts` | ~110 | Lux backend: OpenClaw bridge → GPT-5.4-mini fallback |

---

## Step-by-Step Detail

### Step 1: pdfplumber (Deterministic)

Python script at `scripts/pdfplumber-extract.py`. Reads actual table structure from the PDF — no AI, no interpretation. If the PDF has proper table formatting (like the AV Schedules drawing sheet), pdfplumber extracts every row perfectly.

- **Panthers Combined AV Schedules:** 47/47 displays
- **Haslam (narrative, no tables):** 0 displays → falls through to AI

When pdfplumber finds displays, validation runs with `extractionSource: "pdfplumber"` which skips the table traceability check (since the table IS the source of truth).

### Step 2: pdftotext + Classification

```typescript
function classifyPdf(pdftoTextOutput: string): "text" | "drawing" {
  // Drawing: pdftotext gets almost nothing (<500 chars)
  // Text: meaningful content with LED keywords
  // Threshold: 2+ strong keyword hits = "text"
}
```

**Text PDFs:** Spec documents like Panthers Indoor (23 pages of typed text with embedded tables). Kreuzberg excels here — returns all pages with inline tables in markdown.

**Drawing PDFs:** AV schedule sheets with image-based tables. pdftotext returns almost nothing. Marker reads the image tables.

### Step 3: OCR Routing

**Direct connections — no middleware:**

- **Kreuzberg** at `http://abc_kreuz:8000/extract`
  - Field name: `files` (multipart)
  - Response: `{"0": {"content": "markdown...", "quality_score": 1}}`
  - Speed: ~100ms
  - Result: 56KB clean markdown for Panthers Indoor, all 25 displays inline

- **Marker** at `http://marker-api:8080/convert`
  - Field name: `file` (multipart)
  - Response: `{"status": "Success", "result": {"markdown": "..."}}`
  - Speed: varies (CPU-only, slower)
  - Result: Reads image-based tables from drawing sheets

**Large doc handling (>50 pages or >200KB):**

1. pdftotext already splits by page (`\f` delimiter)
2. Score each page with TABLE_SIGNALS:
   ```
   "pixel pitch", "display schedule", "display matrix", "av schedule",
   "led board schedule", "a/v interior led", "a/v scoreboard",
   "entry led", "exterior led", "location", "width", "height", "nits"
   ```
3. Keep pages with 4+ signal hits
4. Custom keywords (if provided) added to signals
5. Send only the kept pages to GPT — not the full 1139KB blob

Example: 499-page BofA Project Manual → 5 pages kept → 15KB sent → 40 displays extracted.

### Step 4: GPT-5.4-mini Extraction

**Streaming enabled.** Response streamed via SSE. As JSON builds, display count is tracked from `"name"` field occurrences and reported every 5 displays:

```
Extracting: 5 displays found (South Corridor...)
Extracting: 10 displays found (N.E Corridor...)
Extracting: 15 displays found (Panthers Den...)
```

**Prompt (short, focused — tested 25/25):**

```
Extract ALL LED displays from this RFP document. Return ONLY a JSON object with:
{
  "project": {"name": "", "client": "", "venue": "", "address": ""},
  "displays": [{"name": "location name", "pixel_pitch_mm": 3.9, ...}],
  "requirements": [{"description": "", "category": "", "status": ""}]
}

Rules:
- Use the ACTUAL room/location name from the document
- If pixel pitch not stated but others in same table have it, use that value
- Every row in source table = one row in output. DO NOT DEDUPLICATE.
- Only LED displays/videoboards/ribbons. No clocks/racks/equipment.
```

If custom keywords provided, appended: `ALSO look for displays matching these keywords: concourse, ribbon, centerhung`

**Also captures reasoning tokens** (for o-series models like o4-mini) via `delta.reasoning_content`. GPT-5.4-mini doesn't emit these, but the code is ready for when/if the model is swapped.

### Step 5: Validation (6 Checks)

| Check | Severity | What it catches |
|-------|----------|----------------|
| Count | block | Extracted 30 but document says 25 (overcounting) |
| Duplicates | block | "Elev Lobby" extracted 5x but appears 4x in source |
| Dimensions | block (>2) | Width = 50000ft (obviously wrong) |
| Names | block | Generic "LED Display 1" instead of "Panthers Den" |
| Traceability | block (>2) | Display name not found in source text (fabricated) |
| Tables | block (AI only) | "A/V INTERIOR LED BOARD SCHEDULE" header found but 0 indoor displays extracted |

**pdfplumber extractions skip the tables check** — the table is the source of truth.

**Summary messages:**
- Clean: `All 6 checks passed`
- Issues: `1 issue(s) found (tables) — running QA...`
- No "BLOCKED" language in user-facing messages.

### Step 6: QA Cross-Check

**Always runs** — not just on validation failure. Different model (MiMo Pro) reads the same source text and independently verifies.

**QA chain:** MiMo Pro → OpenClaw → Z.AI → Mercury (30s timeout each, first success wins)

**QA prompt instructs:**
- Check every name matches source exactly
- Check every dimension (watch width/height swaps — ribbons are wide and short)
- Find MISSING displays
- Find DUPLICATES — but only TRUE duplicates (same name + same dimensions listed twice = not a duplicate, it's two physical screens)
- Final count must match source document count

**Output format:**
```json
{
  "corrections": [{"index": 0, "field": "widthFt", "from": 3, "to": 22, "reason": "width/height swapped"}],
  "missing": [{"name": "LARGE ADMIN ROOM", "widthFt": 28, ...}],
  "duplicates": [3],
  "verified": true,
  "totalExpected": 25,
  "message": "Fixed 7 width/height swaps. All 25 verified."
}
```

**User-facing messages:**
- `Verifying 25 displays against source...`
- `Verified: 25 displays confirmed` (check mark)
- `Review needed: 23 displays extracted, verification inconclusive`

### Step 7: Product Matching

**Mercury 2 (primary, ~3s):**
1. Pre-query DB for indoor and outdoor products (one query each)
2. Send display specs + product list to Mercury in one call
3. Mercury picks best match per display
4. Returns: displayIndex, productId, productName, matchReason

**MiMo (fallback, tool calling):**
1. Send displays to MiMo with `query_products` tool definition
2. MiMo calls the tool with environment/pitch/brightness filters
3. Gets product list back
4. Makes second call to match each display
5. Two round-trips but more intelligent matching

**DB Deterministic (always available):**
- `ProductMatcher.matchProduct()` — pixel pitch + brightness + environment
- No AI needed, instant
- Less intelligent but never fails

---

## OCR Backends

| Backend | URL | Hosting | Cost | Best For | Speed |
|---------|-----|---------|------|----------|-------|
| Kreuzberg | `abc_kreuz:8000` | Self-hosted (Docker) | Free | Text PDFs, spec docs | ~100ms |
| Marker | `marker-api:8080` | Self-hosted (Docker) | Free | Drawing sheets, image tables | ~10-60s |
| Mistral OCR | `api.mistral.ai` | API | Paid | Scanned PDFs (last resort) | ~5-30s |

**Comparison (Panthers Outdoor, 20 pages):**

| | Kreuzberg | Marker | Mistral OCR |
|---|---|---|---|
| Pages returned | 20/20 | 10/20 | 20/20 |
| Display tables | Inline, readable | Cut off before tables | External HTML files |
| Table data usable | Yes | No (incomplete) | No (tbl-0.html references) |
| Formatting | Clean markdown | Clean but incomplete | Cleanest markdown |

---

## Pricing Model

**80/20 Rule:** 80% of display area priced at cabinet rate, 20% at module rate.

**Margin formula:** `sellingPrice = cost / (1 - marginPercent)`

**Default margins:**
- LED hardware: 15%
- Services: 20% (30% for small <100 sqft)
- Software/CMS: 35%

**Per-display calculations:**
- SqFt: `width_ft × height_ft` (from cabinet dimensions)
- Modules: total pixel count / pixels per module
- Weight: area_m2 × weight_density
- Power: area_m2 × power_density
- Circuits: `Math.ceil(totalPower / (208 * circuitAmps))`
- Display cost: sqft × $/sqft rate
- Processor cost: from product spec
- Shipping: weight-based or flat per display
- Total cost: display + processor + shipping
- Selling price: total_cost / (1 - margin)

---

## Frontend UX

### Upload Zone
- Drag-and-drop PDF (up to 2GB)
- Optional: attach Excel bid form for reconciliation
- Optional: `+ Custom keywords` — comma-separated terms for triage
- File type badges: PDF, Excel, AI extraction

### Pipeline Log (Diffusion Text Effect)
- Each new log line appears with scrambled characters that resolve left-to-right over 400ms
- Lines color-coded: AI reasoning (blue), counts/verified (green), default (gray)
- Collapsible, auto-scrolls

### Results Display
- Summary stats: total pages, relevant pages, displays found, processing time
- LED Cost Sheet: spreadsheet with all displays, specs, products, pricing
- Requirements list: categorized (compliance, technical, etc.)
- Project info: client, venue, location
- Actions: export Excel, generate PDF proposal, download bid form

### Lux Widget (Platform Owner Only)
- Floating blue chat bubble, bottom-right
- Only visible to `isPlatformOwner(session.user.email)`
- Talks to OpenClaw's `anc-proposals` agent (MiniMax M2.7)
- Falls back to GPT-5.4-mini if bridge unreachable
- Has access to: extracted displays, source PDF text, product catalog context

---

## Environment Variables

### AI Models
| Var | Default | Used By |
|-----|---------|---------|
| `OPENAI_API_KEY` | — | GPT-5.4-mini extraction |
| `OPENAI_EXTRACTION_MODEL` | `gpt-5.4-mini` | Extraction model |
| `MERCURY_API_KEY` | — | Mercury 2 matching |
| `MERCURY_API_BASE` | `https://api.inceptionlabs.ai/v1` | Mercury endpoint |
| `MIMO_API_KEY` | — | MiMo V2 Pro QA |
| `MIMO_MODEL` | `mimo-v2-pro` | QA model |
| `Z_AI_API_KEY` | — | GLM fallback |
| `Z_AI_BASE_URL` | `https://api.z.ai/api/coding/paas/v4` | Z.AI endpoint |
| `MISTRAL_API_KEY` | — | Mistral OCR + extraction fallback |

### OCR Backends
| Var | Default | Used By |
|-----|---------|---------|
| `KREUZBERG_URL` | `http://abc_kreuz:8000` | Kreuzberg OCR |
| `MARKER_URL` | `http://marker-api:8080` | Marker OCR |

### Infrastructure
| Var | Default | Used By |
|-----|---------|---------|
| `DATABASE_URL` | — | PostgreSQL (Prisma) |
| `OPENCLAW_BRIDGE_URL` | `http://172.17.0.1:18790` | Lux/OpenClaw |
| `OPENCLAW_TOKEN` | — | OpenClaw auth |

---

## Verified Test Results

| File | Expected | Got | Source |
|------|----------|-----|--------|
| Panthers Indoor (23 pages) | 25 | 25 | GPT-5.4-mini + MiMo QA |
| Panthers Outdoor (20 pages) | 18 | 18 | GPT-5.4-mini + MiMo QA |
| Panthers Combined AV Schedules (1 page) | 44-47 | 47 | pdfplumber (deterministic) |
| Haslam Sports (1 page) | 5 | 5 | GPT-5.4-mini + MiMo QA |
| BofA DD Manual (499 pages) | ~40-47 | 40 | pdftotext triage + GPT-5.4-mini |

---

## What We Tried (and Why We Moved On)

### Extraction Models Benchmarked

| Model | Panthers (25) | Haslam (5) | Time | Deterministic | Verdict |
|-------|---------------|------------|------|---------------|---------|
| GPT-5.4-mini | 25/25 | 5/5 | ~5s | Yes (temp 0) | **Winner. Primary extractor.** |
| GPT-5.4 | 25/25 | 5/5 | ~11s | Yes | Slower, no accuracy gain |
| GPT-5.1 | 25/25 | 5/5 | ~10s | Yes | Good but slower than 5.4-mini |
| GPT-4.1 | 25/25 | 5/5 | ~15s | Yes | Solid but 3x slower |
| GPT-4.1-mini | 25/25 | 3/5 | ~18s | Yes | Failed Haslam (merged displays) |
| o4-mini | 25/25 | 5/5 | ~31s | No (reasoning) | Good but 6x slower |
| Mercury 2 | 23-25/25 | 5/5 | ~5s | No (min temp 0.75) | Fast but non-deterministic |
| MiMo V2 Pro | 25/25 | 5/5 | ~75s | Yes | Accurate but 15x slower |
| MiMo V2 Omni | 25/25 | 5/5 | ~75s | Yes | Vision wasted (text pipeline) |
| GLM-5.1 | 25/25 | 6/5 | ~90s | Yes | Included a non-LED scoreboard |
| GLM-4.7 | — | — | ~90s | Yes | Older, replaced by 5.1 |
| Gemini 2.5 Flash | 25/25 (before) | 5/5 | ~30s | Yes | **Card rejected. Dead.** |
| Gemini 3.1 Pro | 25/25 (before) | — | ~60s | Yes | Escalation from Flash. Also dead. |

### OCR Backends Tested

| Backend | Text PDFs | Drawing Sheets | Speed | Cost | Verdict |
|---------|-----------|----------------|-------|------|---------|
| **Kreuzberg** | 23/23 pages, all tables inline | Can't read image tables | ~100ms | Free | **Winner for text PDFs** |
| **Marker** | 10/20 pages (cut off) | Reads image tables | ~10-60s | Free | **Winner for drawings** |
| **Mistral OCR** | 20/20 pages, tables as external HTML | OCR'd but wrong names ("HOWTH" for "NORTH") | ~5-30s | Paid | Tables unusable (external refs) |
| **MinerU** | Import error (needs GPU models) | — | — | Free | Not viable on CPU |
| **pdftotext** | All pages, whitespace columns | Can't read images | Instant | Free | **Best for triage + GPT input** |
| **Datalab Convert** | All 25 mentions in markdown tables | — | ~10s | $5 credits | Great quality but paid API |

### Text Extraction Approaches

| Approach | Result | Problem |
|----------|--------|---------|
| pdftotext → GPT-5.4-mini | 25/25 consistently | **Current winner. No OCR cost.** |
| Mistral OCR → GPT-5.4-mini | 24/25 | Mistral markdown loses 1 table row at page breaks |
| Kreuzberg → GPT-5.4-mini | 25/25 | Clean markdown, but Kreuzberg merges 499-page docs into 1 blob |
| pdftotext → MiMo | 25/25 but 75s | Too slow for production |
| pdftotext → Mercury | 23-25/25 | Non-deterministic (forced temp 0.75) |
| Vision (MiMo images) | 25/25 from 20 pages but 13 duplicates | Vision path creates cross-page dupes |
| pdfplumber (deterministic) | 47/47 on table PDFs, 0 on narrative | Only works when PDF has actual table structure |

### Deduplication Approaches

| Approach | Problem |
|----------|---------|
| AI dedup in prompt ("deduplicate across pages") | Models interpret "same name, same dims" = duplicate. But 4x Elev Lobby at 6'x4' are 4 real screens. |
| Deterministic dedup (name+width+height) | Killed legitimate same-name displays. 25→15. |
| "Never use quantity > 1" prompt | Worked. MiMo still collapsed to 15. Mercury to 23. |
| "DO NOT DEDUPLICATE" prompt | GPT-5.4-mini follows it. Mercury sometimes doesn't (temp 0.75). |
| Remove dedup entirely | **Current approach for GPT path.** QA catches true dupes. |

### QA Approaches

| Approach | Problem |
|----------|---------|
| Same model for QA (Mercury QA on Mercury extraction) | Repeats same mistakes. Misses what it missed before. |
| QA only on validation failure | Clean extractions skip QA — but sometimes "clean" has wrong dims. |
| QA always runs (different model) | **Current approach.** MiMo catches GPT's blind spots. ~15s overhead. |
| QA adds missing displays | MiMo added 10 missing when Mercury got 15→25. Powerful but slow. |
| Skip QA, trust extraction | 24 is not 25. Can't trust any single model. |

---

## Main Challenges (Unsolved or Partially Solved)

### 1. No Model Gets 25/25 Every Single Time
GPT-5.4-mini at temp 0 is deterministic — same input = same output. But the INPUT varies depending on OCR quality, page breaks, text extraction method. Different text → different extraction. The model is consistent; the text pipeline upstream is the variable.

**Mitigation:** QA cross-check catches misses. Kreuzberg gives cleanest text. pdftotext is the most reliable fallback.

### 2. Drawing Sheets (Image-Based Tables)
AV schedule sheets are essentially images with tables drawn on them. pdftotext returns nothing. Kreuzberg can't read them. Only Marker and Mistral OCR can, but:
- Marker is slow on CPU and doesn't always get full document
- Mistral OCR returns tables as external HTML file references, not inline
- Both hallucinate names ("HOWTH" instead of "NORTH")

**Mitigation:** pdfplumber handles these perfectly when the PDF has actual table structure. The combined AV Schedules file gets 47/47 from pdfplumber alone.

### 3. 500+ Page Project Manuals
Real RFPs can be 500-1400 pages. The LED section is ~5 pages. The rest is legal, structural, MEP boilerplate.

**Root cause (identified via external review):** The pipeline was letting multiple OCR backends produce different text representations of the same PDF. This is a canonicalization failure — the model is consistent, the input is not.

**Fix implemented: Scout → Chop → Target**
1. pdftotext scans all pages (instant, preserves page breaks)
2. Score each page with LED table signals (4+ hits = keep)
3. Keep ±1 neighbor pages (tables spill across page breaks)
4. pdfseparate + pdfunite physically slices the PDF to just LED pages
5. Kreuzberg/Marker OCR on the tiny mini PDF (not the full 499 pages)
6. If Chop or OCR fails, triaged pdftotext goes direct to GPT

**Result:** 499-page BofA manual → 7 pages (5 LED + 2 neighbors) → 40 displays. Previously got 2 displays because Kreuzberg merged everything into one 1.1MB blob.

### 4. Dimension Swaps (Width/Height)
Models consistently swap width and height on displays where the "short" dimension is listed first in the source. Panthers Den entries (3'×22') get extracted as (22'×3') because models assume landscape orientation.

**Mitigation:** MiMo QA catches and fixes these every time. 7-12 swaps per Panthers Indoor run, all corrected. But it adds 15s of QA time.

### 5. Non-Deterministic Models
Mercury 2 (diffusion model) can't do temp 0. Minimum temp is 0.75. Every run gives slightly different results — sometimes 25, sometimes 23, sometimes 24.

**Mitigation:** Switched to GPT-5.4-mini (supports temp 0). Mercury kept for product matching only, where slight randomness doesn't affect correctness.

### 6. Cross-Page Table Continuations
Some RFP tables span multiple pages. The last rows on page N and first rows on page N+1 can get lost or merged during extraction.

**Examples:**
- Elev Lobby appears at the end of the indoor table, continues after a page break
- Mistral OCR sometimes drops the continuation
- pdftotext preserves it (form feed between pages)

**Mitigation:** Kreuzberg handles this correctly. pdftotext + GPT also handles it. The issue is mainly with Mistral OCR.

### 7. Validation False Positives
The table traceability check (check 6) fires incorrectly on pdfplumber extractions because it's looking for table headers in pdftotext output, but pdfplumber doesn't use pdftotext — it reads the table structure directly.

**Fix implemented:** Added `extractionSource` parameter. pdfplumber extractions skip the table check. AI extractions still get the full 6-check validation.

**Also added three confidence states** (from external review):
- `verified` — all checks passed, export allowed
- `partial_review` — some displays found but source may be incomplete (flag gaps for human review)
- `untrusted_input` — source representation failed (OCR truncated, 0 displays, page slicing broke). This is NOT a review case — it's an input pipeline failure. Different problem, different signal.

This means the system can honestly say: "23 verified displays, 2 need review, 0 fabricated" instead of pretending it found 25.

### 8. Equipment vs. Display Classification
RFPs list game clocks, scoring controllers, headend racks, spare parts alongside LED displays. Models sometimes include these as "displays."

**Mitigation:** Prompt explicitly says "Only LED displays/videoboards/ribbons. No clocks, racks, spare parts." Plus `separateAiByCategory()` function filters non-LED items into requirements. Works well but occasionally misses edge cases.

---

## Natalia's Acceptance Criteria

1. Display count matches expected — exact, not approximate
2. No equipment junk (clocks, racks, spare parts) in display list
3. Display names are real locations (Panthers Den, Elev Lobby), not generic
4. Indoor files get indoor products, outdoor gets outdoor
5. RFP dimensions stay locked when changing products
6. Qty dropdown works and persists
7. Cabinet/module sizing calculates on product selection
8. 80/20 pricing (80% cabinet sqft + 20% module sqft)
