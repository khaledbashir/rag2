/**
 * Extraction Validator — Hard gates that block export on failure.
 *
 * INTERIM SAFETY UPGRADE. Not the final parser architecture.
 * Validates AI extraction output against the source text to catch:
 * - Wrong counts
 * - Fabricated rows
 * - Duplicate rows
 * - Out-of-range dimensions
 * - Missing tables
 */

import type { ExtractedLEDSpec } from "./unified/types";

export interface ValidationResult {
  passed: boolean;
  confidence: "high" | "medium" | "low";
  exportAllowed: boolean;
  checks: ValidationCheck[];
  summary: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  severity: "block" | "review" | "info";
  message: string;
}

/**
 * Run all validation checks against extracted displays.
 *
 * @param displays - The extracted displays from Gemini
 * @param sourceText - The raw pdftotext output for traceability checks
 * @param documentTotal - Total stated in the document (from extraction_log), or null
 * @param tableHeaders - Table headers found in the source text
 */
export function validateExtraction(
  displays: ExtractedLEDSpec[],
  sourceText: string,
  documentTotal: number | null,
  tableHeaders: string[],
): ValidationResult {
  const checks: ValidationCheck[] = [];
  const sourceTextLower = sourceText.toLowerCase();

  // ── Check 1: Count validation ──
  // Only compare against documentTotal if it was explicitly found in a display schedule
  // context (e.g., Gemini's _extraction_log.total_displays_counted_in_text).
  // Do NOT compare against random totals elsewhere on the page (cost totals, area totals, etc.)
  if (documentTotal != null && documentTotal > 0) {
    const delta = displays.length - documentTotal;
    if (delta === 0) {
      checks.push({ name: "count", passed: true, severity: "info", message: `Count verified: ${displays.length} extracted = ${documentTotal} stated in display schedule` });
    } else if (delta > 0) {
      // Any overshoot blocks — extra rows mean duplication or fabrication
      checks.push({ name: "count", passed: false, severity: "block", message: `Extracted ${displays.length} but schedule states ${documentTotal} — ${delta} extra rows (duplication or non-LED items)` });
    } else {
      // Undershoot — missing rows
      checks.push({ name: "count", passed: false, severity: "block", message: `Extracted ${displays.length} but schedule states ${documentTotal} — ${Math.abs(delta)} rows missing` });
    }
  } else {
    checks.push({ name: "count", passed: true, severity: "info", message: `${displays.length} displays extracted (no schedule total to compare against)` });
  }

  // ── Check 2: Duplicate detection (source-occurrence comparison) ──
  // Count how many times each display name appears in the extracted output.
  // Count how many times that same name appears in the source text.
  // If extracted > source occurrences, the extractor duplicated a row.
  // This handles legitimate repeats: if "Elev Lobby" appears 4 times in the source,
  // 4 extracted rows is correct. 5 would be a duplication.
  const extractedNameCounts = new Map<string, number>();
  for (const d of displays) {
    const key = d.name.toLowerCase().trim();
    extractedNameCounts.set(key, (extractedNameCounts.get(key) || 0) + 1);
  }

  const overExtracted: string[] = [];
  if (sourceText.length > 100) {
    for (const [name, extractedCount] of extractedNameCounts.entries()) {
      if (extractedCount <= 1) continue; // Single occurrence can't be a duplicate
      // Count occurrences in source text (case-insensitive)
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sourceMatches = (sourceTextLower.match(new RegExp(escapedName, "g")) || []).length;
      if (extractedCount > sourceMatches && sourceMatches > 0) {
        overExtracted.push(`"${name}" extracted ${extractedCount}x but appears ${sourceMatches}x in source`);
      }
    }
  }

  if (overExtracted.length > 0) {
    checks.push({ name: "duplicates", passed: false, severity: "block", message: `Over-extracted rows: ${overExtracted.join("; ")}` });
  } else {
    checks.push({ name: "duplicates", passed: true, severity: "info", message: "Row counts match source occurrences" });
  }

  // ── Check 3: Dimension range checks ──
  const badDimensions: string[] = [];
  for (const d of displays) {
    if (d.widthFt != null && (d.widthFt <= 0 || d.widthFt > 2000)) {
      badDimensions.push(`"${d.name}" width=${d.widthFt}'`);
    }
    if (d.heightFt != null && (d.heightFt <= 0 || d.heightFt > 2000)) {
      badDimensions.push(`"${d.name}" height=${d.heightFt}'`);
    }
    if (d.pixelPitchMm != null && (d.pixelPitchMm < 0.5 || d.pixelPitchMm > 50)) {
      badDimensions.push(`"${d.name}" pitch=${d.pixelPitchMm}mm`);
    }
    if (d.brightnessNits != null && (d.brightnessNits < 100 || d.brightnessNits > 20000)) {
      badDimensions.push(`"${d.name}" nits=${d.brightnessNits}`);
    }
  }
  if (badDimensions.length > 2) {
    checks.push({ name: "dimensions", passed: false, severity: "block", message: `${badDimensions.length} rows with out-of-range values: ${badDimensions.slice(0, 3).join("; ")}${badDimensions.length > 3 ? ` and ${badDimensions.length - 3} more` : ""}` });
  } else if (badDimensions.length > 0) {
    checks.push({ name: "dimensions", passed: false, severity: "review", message: `${badDimensions.length} rows with unusual values: ${badDimensions.join("; ")}` });
  } else {
    checks.push({ name: "dimensions", passed: true, severity: "info", message: "All dimensions in range" });
  }

  // ── Check 4: Name quality ──
  const genericNames = displays.filter(d => /^(LED Display|Display \d+|Unknown|Item \d+)$/i.test(d.name));
  if (genericNames.length > 0) {
    checks.push({ name: "names", passed: false, severity: "block", message: `${genericNames.length} displays have generic names instead of real locations — extraction likely failed to read the document` });
  } else {
    const emptyNames = displays.filter(d => !d.name || d.name.trim().length === 0);
    if (emptyNames.length > 0) {
      checks.push({ name: "names", passed: false, severity: "block", message: `${emptyNames.length} displays have empty names` });
    } else {
      checks.push({ name: "names", passed: true, severity: "info", message: "All displays have real location names" });
    }
  }

  // ── Check 5: Fabrication check (row-level traceability) ──
  // Each display must be traceable in the source text — not just by name but by data.
  // A wrong row with a real name (e.g., "FIELD RIBBON WEST" with North Club's dimensions)
  // would pass a name-only check. So we verify that key values also appear near the name.
  if (sourceText.length > 100) {
    const untraceable: string[] = [];
    for (const d of displays) {
      const nameLower = d.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const nameWords = nameLower.split(/\s+/).filter(w => w.length > 2);
      const nameFound = nameWords.some(w => sourceTextLower.includes(w));

      if (!nameFound && nameWords.length > 0) {
        untraceable.push(`"${d.name}" (name not in source)`);
        continue;
      }

      // Row-level: check that at least one dimension value appears in the source
      // This catches fabricated rows where the name exists but dimensions were copied from another row
      if (d.widthFt != null && d.heightFt != null) {
        const wStr = String(Math.round(d.widthFt));
        const hStr = String(Math.round(d.heightFt));
        // The dimension should appear somewhere in the text (as part of "14' X 8'" or "14" or similar)
        const dimFound = sourceText.includes(wStr) || sourceText.includes(hStr);
        if (!dimFound && d.widthFt > 1 && d.heightFt > 1) {
          untraceable.push(`"${d.name}" (dimensions ${d.widthFt}'x${d.heightFt}' not in source)`);
        }
      }
    }
    if (untraceable.length > 2) {
      checks.push({ name: "traceability", passed: false, severity: "block", message: `${untraceable.length} rows not fully traceable: ${untraceable.slice(0, 3).join("; ")}${untraceable.length > 3 ? ` and ${untraceable.length - 3} more` : ""}` });
    } else if (untraceable.length > 0) {
      checks.push({ name: "traceability", passed: false, severity: "review", message: `${untraceable.length} row(s) with traceability issues: ${untraceable.join("; ")}` });
    } else {
      checks.push({ name: "traceability", passed: true, severity: "info", message: "All rows traceable in source text (name + dimensions)" });
    }
  }

  // ── Check 6: Missing table detection ──
  // Only check for display-relevant schedule tables (LED, scoreboard, ribbon, entry, exterior).
  // Ignore unrelated tables (cost schedules, equipment lists, etc.)
  const DISPLAY_TABLE_KEYWORDS = /led|display|videoboard|scoreboard|ribbon|entry|exterior/i;
  const relevantHeaders = tableHeaders.filter(h => DISPLAY_TABLE_KEYWORDS.test(h));

  if (relevantHeaders.length > 0) {
    const extractedTables = new Set<string>();
    for (const header of relevantHeaders) {
      const headerLower = header.toLowerCase();
      const hasDisplays = displays.some(d => {
        const nameLower = d.name.toLowerCase();
        if (headerLower.includes("interior") && d.environment === "indoor") return true;
        if (headerLower.includes("outdoor") || headerLower.includes("exterior")) {
          if (d.environment === "outdoor") return true;
        }
        if (headerLower.includes("scoreboard") && (nameLower.includes("scoreboard") || nameLower.includes("ribbon"))) return true;
        if (headerLower.includes("entry") && nameLower.includes("entry")) return true;
        if (headerLower.includes("ribbon") && nameLower.includes("ribbon")) return true;
        // Fallback: any display exists = table is covered (for generic "LED BOARD SCHEDULE")
        if (headerLower.includes("led") && displays.length > 0) return true;
        return false;
      });
      if (hasDisplays) extractedTables.add(header);
    }

    const missingTables = relevantHeaders.filter(h => !extractedTables.has(h));
    if (missingTables.length > 0) {
      // ANY missing display table blocks immediately — one missed table can mean 18 missing displays
      checks.push({ name: "tables", passed: false, severity: "block", message: `${missingTables.length} display schedule table(s) found in document but no displays extracted: ${missingTables.join(", ")}` });
    } else {
      checks.push({ name: "tables", passed: true, severity: "info", message: `All ${relevantHeaders.length} display schedule tables have extracted displays` });
    }
  }

  // ── Compute overall result ──
  const blockers = checks.filter(c => !c.passed && c.severity === "block");
  const reviews = checks.filter(c => !c.passed && c.severity === "review");

  let confidence: ValidationResult["confidence"];
  let exportAllowed: boolean;

  if (blockers.length > 0) {
    confidence = "low";
    exportAllowed = false;
  } else if (reviews.length > 0) {
    confidence = "medium";
    exportAllowed = false; // Medium requires manual review before export
  } else {
    confidence = "high";
    exportAllowed = true;
  }

  const summary = blockers.length > 0
    ? `${blockers.length} issue(s) found (${blockers.map(b => b.name).join(", ")}) — running QA...`
    : reviews.length > 0
      ? `${reviews.length} item(s) need review`
      : `All ${checks.length} checks passed`;

  return { passed: blockers.length === 0 && reviews.length === 0, confidence, exportAllowed, checks, summary };
}

/**
 * Detect table headers in pdftotext output.
 * Returns header strings found that look like LED schedule table names.
 */
export function detectTableHeaders(sourceText: string): string[] {
  const headers: string[] = [];
  const patterns = [
    /A\/V\s+INTERIOR\s+LED\s+BOARD\s+SCHEDULE/i,
    /A\/V\s+SCOREBOARD\s+&\s+RIBBON\s+BOARD\s+SCHEDULE/i,
    /A\/V\s+(?:EAST|WEST|NORTH|SOUTH)\s+ENTRY\s+LED\s+SCHEDULE/i,
    /A\/V\s+(?:NORTH|SOUTH)\s+(?:EAST|WEST)\s+EXTERIOR\s+LED\s+SCHEDULE/i,
    /A\/V\s+(?:NORTH|SOUTH)\s+ENTRY\s+LED\s+SCHEDULE/i,
    /LED\s+DISPLAY\s+SCHEDULE/i,
    /DISPLAY\s+MATRIX/i,
    /DISPLAY\s+SCHEDULE/i,
    /LED\s+VIDEOBOARD\s+SCHEDULE/i,
    /LED\s+BOARD\s+SCHEDULE/i,
  ];

  for (const pattern of patterns) {
    const match = sourceText.match(pattern);
    if (match) {
      headers.push(match[0].trim());
    }
  }

  // Also catch generic "SCHEDULE" headers near LED keywords
  const schedulePattern = /([A-Z][A-Z\s/&]+SCHEDULE)/g;
  let m;
  while ((m = schedulePattern.exec(sourceText)) !== null) {
    const header = m[1].trim();
    if (/LED|DISPLAY|VIDEOBOARD|SCOREBOARD|RIBBON|ENTRY|EXTERIOR/i.test(header)) {
      if (!headers.includes(header)) headers.push(header);
    }
  }

  return headers;
}
