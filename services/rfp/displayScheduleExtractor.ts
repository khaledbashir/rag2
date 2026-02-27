/**
 * Display Schedule Extractor — P73
 *
 * Parses display tables from Division 11 sections of RFPs.
 * Extracts screen names, dimensions, pixel pitch, quantities, and environment.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedDisplay {
    name: string;
    location?: string;
    widthFt?: number;
    heightFt?: number;
    widthPx?: number;
    heightPx?: number;
    pitchMm?: number;
    quantity: number;
    environment: "Indoor" | "Outdoor" | "Mixed";
    brightness?: number; // nits
    notes?: string;
    confidence: number;
    citation?: string; // "[Source: Section X, Page Y]"
}

export interface DisplayScheduleResult {
    displays: ExtractedDisplay[];
    totalDisplays: number;
    sourceSection?: string;
    extractionMethod: "table-parse" | "regex" | "ai-assisted";
}

// ============================================================================
// REGEX PATTERNS
// ============================================================================

const DIMENSION_PATTERNS = [
    // "10'-0" x 6'-0"" or "10' x 6'"
    /(\d+)['']\s*[-–]?\s*(\d*)["""]?\s*[xX×]\s*(\d+)['']\s*[-–]?\s*(\d*)["""]?/,
    // "10ft x 6ft"
    /(\d+(?:\.\d+)?)\s*(?:ft|feet)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)/i,
    // "120" x 72"" (inches)
    /(\d+)[""]\s*[xX×]\s*(\d+)[""]/,
    // AJP-style: "32' tall x 106' wide"
    /(\d+(?:\.\d+)?)['']\s*(?:tall|high|h)\s*[xX×]\s*(\d+(?:\.\d+)?)['']\s*(?:wide|long|w)/i,
];

const PITCH_PATTERNS = [
    /(\d+(?:\.\d+)?)\s*mm\s*(?:pixel\s*)?pitch/i,
    /pitch[:\s]+(\d+(?:\.\d+)?)\s*mm/i,
    /P(\d+(?:\.\d+)?)\s/,
    /(\d+(?:\.\d+)?)\s*mm\s*PP/i,
    // AJP-style: "10 (mm)" or "8 (mm)"
    /(\d+(?:\.\d+)?)\s*\(\s*mm\s*\)/i,
];

const QUANTITY_PATTERNS = [
    /(?:qty|quantity)[:\s]*(\d+)/i,
    // AJP-style: "One (1)", "Two (2)" — extract the digit in parens
    /(?:one|two|three|four|five|six|eight|ten)\s*\((\d+)\)/i,
    /\((\d+)\)/,
];

const ENVIRONMENT_PATTERNS = [
    { pattern: /outdoor|exterior|weather/i, env: "Outdoor" as const },
    { pattern: /indoor|interior|lobby|concourse/i, env: "Indoor" as const },
];

// ============================================================================
// EXTRACTOR
// ============================================================================

/**
 * Extract display schedule from section text using regex patterns.
 */
export function extractDisplaySchedule(sectionText: string): DisplayScheduleResult {
    const displays: ExtractedDisplay[] = [];

    // Split into lines and look for display entries
    const lines = sectionText.split("\n").map((l) => l.trim()).filter(Boolean);

    // Strategy 1: Look for tabular data (lines with dimensions)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const context = [lines[i - 1] || "", line, lines[i + 1] || ""].join(" ");

        // Try to find dimensions
        let widthFt: number | undefined;
        let heightFt: number | undefined;

        for (const pattern of DIMENSION_PATTERNS) {
            const match = line.match(pattern) || context.match(pattern);
            if (match) {
                if (pattern.source.includes("tall|high")) {
                    // AJP-style: match[1]=height (tall), match[2]=width (wide)
                    heightFt = parseFloat(match[1]);
                    widthFt = parseFloat(match[2]);
                } else if (pattern.source.includes("ft|feet")) {
                    widthFt = parseFloat(match[1]);
                    heightFt = parseFloat(match[2]);
                } else if (pattern.source.includes('["""]')) {
                    // Inches — convert to feet
                    widthFt = parseFloat(match[1]) / 12;
                    heightFt = parseFloat(match[2]) / 12;
                } else {
                    // Feet with optional inches
                    widthFt = parseInt(match[1]) + (parseInt(match[2] || "0") / 12);
                    heightFt = parseInt(match[3]) + (parseInt(match[4] || "0") / 12);
                }
                break;
            }
        }

        if (!widthFt || !heightFt) continue; // Skip lines without dimensions

        // Extract pixel pitch
        let pitchMm: number | undefined;
        for (const pattern of PITCH_PATTERNS) {
            const match = context.match(pattern);
            if (match) {
                pitchMm = parseFloat(match[1]);
                break;
            }
        }

        // Extract quantity
        let quantity = 1;
        for (const pattern of QUANTITY_PATTERNS) {
            const match = context.match(pattern);
            if (match) {
                quantity = parseInt(match[1]);
                break;
            }
        }

        // Detect environment
        let environment: "Indoor" | "Outdoor" | "Mixed" = "Indoor";
        for (const { pattern, env } of ENVIRONMENT_PATTERNS) {
            if (pattern.test(context)) {
                environment = env;
                break;
            }
        }

        // Extract name — look for a label before the dimensions
        let name = `Display ${displays.length + 1}`;
        const nameMatch = line.match(/^([A-Z][A-Za-z0-9\s\-&/]+?)(?:\s+\d|$)/);
        if (nameMatch) {
            name = nameMatch[1].trim();
        }

        displays.push({
            name,
            widthFt: Math.round(widthFt * 100) / 100,
            heightFt: Math.round(heightFt * 100) / 100,
            pitchMm,
            quantity,
            environment,
            confidence: pitchMm ? 0.85 : 0.65,
        });
    }

    // Deduplicate by name
    const unique = new Map<string, ExtractedDisplay>();
    for (const d of displays) {
        const key = `${d.name}-${d.widthFt}-${d.heightFt}`;
        if (!unique.has(key)) {
            unique.set(key, d);
        }
    }

    const result = Array.from(unique.values());

    return {
        displays: result,
        totalDisplays: result.reduce((sum, d) => sum + d.quantity, 0),
        extractionMethod: "regex",
    };
}
