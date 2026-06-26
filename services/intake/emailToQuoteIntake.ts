import { getDefaultAnswers, getDefaultDisplayAnswers, type DisplayAnswers, type EstimatorAnswers } from "@/app/components/estimator/questions";

export interface EmailToQuoteInput {
    subject?: string;
    body: string;
    source?: string;
}

export interface IntakeDisplaySpec {
    name: string;
    quantity: number;
    widthFt?: number;
    heightFt?: number;
    raw: string;
    notes: string[];
}

export interface IntakeQuoteOption {
    label: string;
    description: string;
    displays: IntakeDisplaySpec[];
    missingAssumptions: string[];
}

export interface IntakeProject {
    projectNumber: number;
    name: string;
    raw: string;
    displays: IntakeDisplaySpec[];
    quoteOptions: IntakeQuoteOption[];
    missingAssumptions: string[];
}

export interface EmailQuoteIntake {
    title: string;
    clientName: string;
    venueName?: string;
    requesterName?: string;
    requesterTitle?: string;
    requesterPhone?: string;
    requesterAddress?: string;
    requestedBreakdown: string[];
    projects: IntakeProject[];
    missingAssumptions: string[];
    estimatorAnswers: EstimatorAnswers;
    summary: string;
    aiReview?: EmailQuoteAiReview;
}

export interface EmailQuoteAiEvidence {
    claim: string;
    sourceText: string;
    confidence: number;
}

export interface EmailQuoteAiQuestion {
    question: string;
    why: string;
    priority: "high" | "medium" | "low";
}

export interface EmailQuoteAiDisplayReview {
    projectName: string;
    displayName: string;
    status: "confirmed" | "needs_review" | "inferred";
    sourceText: string;
    note: string;
}

export interface EmailQuoteAiReview {
    status: "reviewed" | "unavailable" | "failed";
    provider?: string;
    model?: string;
    reviewedAt: string;
    confidence?: number;
    summary?: string;
    reasoningMarkdown?: string;
    evidence: EmailQuoteAiEvidence[];
    questions: EmailQuoteAiQuestion[];
    riskFlags: string[];
    displayReview: EmailQuoteAiDisplayReview[];
    error?: string;
}

const COST_BUCKETS = ["hardware", "installation", "structure", "electrical", "shipping", "project management"];

function cleanLine(line: string): string {
    return line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeBody(body: string): string {
    return body
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map(cleanLine)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function titleCase(value: string): string {
    return value
        .toLowerCase()
        .replace(/\b([a-z])/g, (m) => m.toUpperCase())
        .replace(/\bLed\b/g, "LED")
        .replace(/\bVb\b/g, "VB")
        .replace(/\bVd\b/g, "VD");
}

function extractTitle(subject: string, body: string): string {
    const raw = cleanLine(subject || "");
    if (raw) return raw.replace(/^Email from\s+/i, "").trim();
    const firstProject = body.match(/^Project\s+\d+:\s*(.+)$/im)?.[1];
    return firstProject ? `${cleanLine(firstProject)} - Rough Estimate` : "Email Intake - Rough Estimate";
}

function inferClient(subject: string, body: string): string {
    const combined = `${subject}\n${body}`;
    if (/\b49ers\b|San Francisco 49ers/i.test(combined)) return "San Francisco 49ers";
    const fromLine = body.match(/^([A-Z][A-Za-z .&'-]+)$/m)?.[1];
    return fromLine ? cleanLine(fromLine) : "Client";
}

function inferVenue(subject: string, body: string): string | undefined {
    const combined = `${subject}\n${body}`;
    if (/Levi'?s Stadium/i.test(combined)) return "Levi's Stadium";
    if (/\b49ers\b/i.test(combined) && /Santa Clara/i.test(combined)) return "Levi's Stadium";
    return undefined;
}

function extractRequester(body: string) {
    const lines = body.split("\n").map(cleanLine).filter(Boolean);
    const phone = body.match(/\bM:\s*([0-9.() -]{8,})/i)?.[1]?.trim();
    const titleIdx = lines.findIndex((line) => /^EVP,|^VP,|^President|^Director|^Manager/i.test(line));
    const requesterTitle = titleIdx >= 0 ? lines[titleIdx] : undefined;
    const requesterName = titleIdx > 0 ? lines[titleIdx - 1] : undefined;
    const addressStart = lines.findIndex((line) => /^\d{3,}\s+/.test(line));
    const requesterAddress = addressStart >= 0 ? lines.slice(addressStart, addressStart + 2).join(", ") : undefined;
    return { requesterName, requesterTitle, requesterPhone: phone, requesterAddress };
}

function parseFeet(value: string): number {
    const cleaned = value.trim();
    const ftIn = cleaned.match(/^(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)?\s*(?:"|in|”)?$/i);
    if (ftIn) {
        const feet = Number(ftIn[1]);
        const inches = ftIn[2] ? Number(ftIn[2]) : 0;
        return feet + inches / 12;
    }
    const plain = cleaned.match(/^(\d+(?:\.\d+)?)/);
    return plain ? Number(plain[1]) : 0;
}

function parseDimensions(line: string, label: string): { widthFt?: number; heightFt?: number } {
    const dim = line.match(/(\d+(?:\.\d+)?\s*'(?:\s*\d+(?:\.\d+)?\s*(?:"|in|”))?|\d+(?:\.\d+)?)\s*(?:ft|feet|')?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?\s*'(?:\s*\d+(?:\.\d+)?\s*(?:"|in|”))?|\d+(?:\.\d+)?)\s*(?:ft|feet|')?/i);
    if (!dim) return {};
    const first = parseFeet(dim[1]);
    const second = parseFeet(dim[2]);
    if (!first || !second) return {};

    const isRibbon = /ribbon|ring of honor|fascia/i.test(label) || /ribbon/i.test(line);
    if (isRibbon && first <= 20 && second > first) {
        return { widthFt: second, heightFt: first };
    }
    return { widthFt: first, heightFt: second };
}

function parseQuantity(line: string): number {
    const qty = line.match(/\((\d+)\s*(?:vb|vd|video boards?|video displays?|boards?|displays?)'?s?\)/i)
        || line.match(/\bqty\s*[:=]?\s*(\d+)\b/i)
        || line.match(/\b(\d+)\s*(?:vb|vd|video boards?|video displays?|boards?|displays?)'?s?\b/i);
    return qty ? Math.max(1, Number(qty[1])) : 1;
}

function cleanProjectName(raw: string): string {
    return cleanLine(raw.replace(/\([^)]*\b(?:vb|vd|boards?|displays?)'?s?[^)]*\)/ig, ""));
}

function missingForDisplay(display: IntakeDisplaySpec, context: string): string[] {
    const missing = ["pixel pitch", "product/vendor preference", "indoor/outdoor confirmation"];
    if (!display.widthFt || !display.heightFt) missing.unshift("display dimensions");
    if (/same size|other two|plaza/i.test(context)) missing.push("source project/board dimensions to match");
    missing.push("structural assumptions", "electrical assumptions", "install access/lift assumptions");
    return Array.from(new Set(missing));
}

function displayFromLine(line: string, fallbackName: string): IntakeDisplaySpec | null {
    const cleaned = cleanLine(line);
    if (!cleaned) return null;

    const hasDimension = /(?:x|×|by)/i.test(cleaned) && /\d/.test(cleaned);
    const hasBoardLanguage = /\b(?:board|display|led|ribbon|vb|vd|video)\b/i.test(cleaned);
    const hasSameSize = /same size|other two|plaza/i.test(cleaned);
    if (!hasDimension && !hasBoardLanguage && !hasSameSize) return null;

    const [left, right = ""] = cleaned.split(/\s*=\s*/, 2);
    const baseName = right ? left : fallbackName;
    const dimensions = parseDimensions(cleaned, baseName);
    const quantity = parseQuantity(cleaned);
    const notes: string[] = [];
    if (hasSameSize) notes.push("Use prior plaza board dimensions as source assumption.");
    if (!dimensions.widthFt || !dimensions.heightFt) notes.push("Dimensions not provided in email.");

    return {
        name: titleCase(cleanLine(baseName.replace(/^Quote\s*#?\d+\s*/i, "").replace(/[:=]+$/g, "")) || fallbackName),
        quantity,
        widthFt: dimensions.widthFt,
        heightFt: dimensions.heightFt,
        raw: cleaned,
        notes,
    };
}

function splitProjectBlocks(body: string): Array<{ projectNumber: number; name: string; raw: string }> {
    const matches = Array.from(body.matchAll(/^Project\s+(\d+):\s*(.+)$/gim));
    if (matches.length === 0) return [];

    return matches.map((match, index) => {
        const start = match.index || 0;
        const end = index + 1 < matches.length ? (matches[index + 1].index || body.length) : body.length;
        const raw = body.slice(start, end).trim();
        return {
            projectNumber: Number(match[1]),
            name: cleanProjectName(match[2]),
            raw,
        };
    });
}

function parseQuoteOptions(block: string, projectName: string): IntakeQuoteOption[] {
    const optionLines = block
        .split("\n")
        .map(cleanLine)
        .filter((line) => /^Quote\s*#?\d+/i.test(line));

    return optionLines.map((line) => {
        const label = line.match(/^(Quote\s*#?\d+)/i)?.[1]?.replace(/\s+/g, " ") || "Quote Option";
        const description = cleanLine(line.replace(/^Quote\s*#?\d+\s*=?\s*/i, ""));
        const display = displayFromLine(description, `${projectName} - ${label}`);
        const displays = display ? [display] : [];
        const missing = displays.flatMap((d) => missingForDisplay(d, description));
        if (displays.length === 0) missing.push("display dimensions", "quote option scope");
        return {
            label,
            description,
            displays,
            missingAssumptions: Array.from(new Set(missing)),
        };
    });
}

function parseProject(block: { projectNumber: number; name: string; raw: string }): IntakeProject {
    const lines = block.raw.split("\n").map(cleanLine).filter(Boolean);
    const quoteOptions = parseQuoteOptions(block.raw, block.name);
    const displays: IntakeDisplaySpec[] = [];

    const headerDisplay = displayFromLine(lines[0].replace(/^Project\s+\d+:\s*/i, ""), block.name);
    if (headerDisplay && headerDisplay.notes.length === 0 && !quoteOptions.length) {
        displays.push({ ...headerDisplay, name: block.name });
    }

    for (const line of lines.slice(1)) {
        if (/^Quote\s*#?\d+/i.test(line)) continue;
        if (/^Kevin Hilton$|^EVP,|^M:|Great America|Santa Clara/i.test(line)) continue;
        const display = displayFromLine(line, block.name);
        if (display) displays.push(display);
    }

    const allDisplays = [...displays, ...quoteOptions.flatMap((option) => option.displays)];
    const missingAssumptions = Array.from(new Set([
        ...allDisplays.flatMap((display) => missingForDisplay(display, display.raw)),
        ...(quoteOptions.length ? ["preferred quote option or both options required"] : []),
    ]));

    return {
        projectNumber: block.projectNumber,
        name: block.name,
        raw: block.raw,
        displays,
        quoteOptions,
        missingAssumptions,
    };
}

function toEstimatorDisplay(display: IntakeDisplaySpec, index: number): DisplayAnswers {
    return {
        ...getDefaultDisplayAnswers(),
        displayType: /ribbon|ring of honor/i.test(display.name) ? "ribbon-board" : "custom",
        displayName: display.name || `Email Display ${index + 1}`,
        locationType: "outdoor",
        rfpWidthFt: display.widthFt || 0,
        rfpHeightFt: display.heightFt || 0,
        widthFt: display.widthFt || 0,
        heightFt: display.heightFt || 0,
        quantity: display.quantity || 1,
        pixelPitch: "",
        serviceType: "front",
        installComplexity: "standard",
        isReplacement: false,
        useExistingStructure: false,
    };
}

function buildEstimatorAnswers(intake: Omit<EmailQuoteIntake, "estimatorAnswers">): EstimatorAnswers {
    const displays = intake.projects.flatMap((project) => {
        const projectDisplays = [...project.displays, ...project.quoteOptions.flatMap((option) => option.displays)];
        return projectDisplays.map((display) => ({
            ...display,
            name: `${project.name}${display.name === project.name ? "" : ` - ${display.name}`}`,
        }));
    });

    return {
        ...getDefaultAnswers(),
        clientName: intake.clientName,
        projectName: intake.title,
        location: intake.venueName || "",
        docType: "budget",
        estimateDepth: "rom",
        isIndoor: false,
        displays: displays.map(toEstimatorDisplay),
    };
}

function buildSummary(intake: Omit<EmailQuoteIntake, "estimatorAnswers" | "summary">): string {
    const lines = [
        `Inbound email parsed into ${intake.projects.length} project area${intake.projects.length === 1 ? "" : "s"}.`,
        `Client: ${intake.clientName}${intake.venueName ? ` / ${intake.venueName}` : ""}.`,
    ];
    const displayCount = intake.projects.reduce(
        (sum, project) => sum + project.displays.length + project.quoteOptions.reduce((n, option) => n + option.displays.length, 0),
        0,
    );
    lines.push(`Displays/options identified: ${displayCount}.`);
    if (intake.missingAssumptions.length) {
        lines.push(`Needs review: ${intake.missingAssumptions.slice(0, 6).join(", ")}.`);
    }
    return lines.join(" ");
}

export function parseEmailToQuoteIntake(input: EmailToQuoteInput): EmailQuoteIntake {
    const body = normalizeBody(input.body);
    const subject = cleanLine(input.subject || "");
    const title = extractTitle(subject, body);
    const clientName = inferClient(subject, body);
    const venueName = inferVenue(subject, body);
    const requester = extractRequester(body);
    const projects = splitProjectBlocks(body).map(parseProject);

    const requestedBreakdown = COST_BUCKETS.filter((bucket) => new RegExp(bucket, "i").test(body));
    if (/breakdown|total costs?|individual project/i.test(body)) {
        for (const bucket of ["hardware", "installation"]) {
            if (!requestedBreakdown.includes(bucket)) requestedBreakdown.push(bucket);
        }
    }

    const base = {
        title,
        clientName,
        venueName,
        ...requester,
        requestedBreakdown,
        projects,
        missingAssumptions: Array.from(new Set(projects.flatMap((project) => project.missingAssumptions))),
    };

    const summary = buildSummary(base);
    const estimatorAnswers = buildEstimatorAnswers({ ...base, summary } as Omit<EmailQuoteIntake, "estimatorAnswers">);

    return {
        ...base,
        estimatorAnswers,
        summary,
    };
}
