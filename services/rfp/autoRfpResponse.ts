/**
 * Auto-RFP Response Service
 *
 * AI reads the RFP, extracts every screen requirement as structured JSON,
 * matches each to a product from the catalog, and returns pre-filled
 * EstimatorAnswers ready to drop into the Estimator.
 *
 * Pipeline: RFP text (via AnythingLLM workspace) → AI structured extraction
 *           → product matching → EstimatorAnswers with DisplayAnswers[]
 */

import { queryVault } from "@/lib/anything-llm";
import { extractJson } from "@/lib/json-utils";
import { getAllProducts, type ProductType } from "@/services/rfp/productCatalog";
import type { EstimatorAnswers, DisplayAnswers } from "@/app/components/estimator/questions";
import { getDefaultAnswers, getDefaultDisplayAnswers } from "@/app/components/estimator/questions";

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedScreen {
    name: string;
    location: string;
    widthFt: number;
    heightFt: number;
    pixelPitchMm: number | null;
    environment: "indoor" | "outdoor";
    quantity: number;
    brightness: number | null;
    serviceType: string | null;
    notes: string | null;
    confidence: number;
}

export interface ExtractedProject {
    clientName: string | null;
    projectName: string | null;
    venue: string | null;
    location: string | null;
    isOutdoor: boolean;
    isUnion: boolean;
}

export interface AutoRfpResult {
    project: ExtractedProject;
    screens: ExtractedScreen[];
    estimatorAnswers: EstimatorAnswers;
    matchReport: MatchReportEntry[];
    extractionMethod: "ai-workspace" | "ai-direct";
    rawAiResponse: string;
}

export interface MatchReportEntry {
    screenName: string;
    requestedPitch: number | null;
    requestedEnv: string;
    matchedProductId: string;
    matchedProductName: string;
    fitScore: number;
    matchConfidence: "high" | "low" | "none";
    pitchDelta: number;
}

// ============================================================================
// EXTRACTION PROMPT — Returns structured JSON, not markdown
// ============================================================================

const SCREEN_EXTRACTION_PROMPT = `You are the ANC Digital Signage Expert AI. Analyze all embedded RFP documents in this workspace and extract EVERY LED display/screen requirement.

PRIORITY SECTIONS (search in this order):
1. "SECTION 11 06 60" — Display Schedule (MASTER TRUTH for quantities/dimensions)
2. "SECTION 11 63 10" — LED Display Systems (technical specs)
3. "Division 11" — General LED display requirements
4. Any section mentioning: scoreboard, ribbon, fascia, marquee, video board, LED display

EXTRACTION RULES:
- Extract EVERY display mentioned, even if specs are partial
- Convert all dimensions to FEET (e.g. 120" = 10ft, 3048mm = 10ft)
- If pixel pitch is not specified, set to null (system will suggest best match)
- If brightness is not specified, set to null
- Quantity defaults to 1 if not stated
- Environment: "indoor" or "outdoor" — infer from context (concourse/lobby = indoor, exterior/field = outdoor)

RESPOND WITH ONLY THIS JSON STRUCTURE (no markdown, no explanation):
{
  "project": {
    "clientName": "string or null",
    "projectName": "string or null",
    "venue": "string or null",
    "location": "City, State or null",
    "isOutdoor": false,
    "isUnion": false
  },
  "screens": [
    {
      "name": "Main Scoreboard",
      "location": "center court",
      "widthFt": 40,
      "heightFt": 20,
      "pixelPitchMm": 4,
      "environment": "indoor",
      "quantity": 1,
      "brightness": 2000,
      "serviceType": "front",
      "notes": "any special requirements",
      "confidence": 0.95
    }
  ]
}

CRITICAL: Return ONLY valid JSON. No markdown code blocks. No explanations before or after.`;

// ============================================================================
// CORE PIPELINE
// ============================================================================

/**
 * Run the full Auto-RFP Response pipeline against an AnythingLLM workspace.
 */
export async function autoRfpFromWorkspace(workspaceSlug: string): Promise<AutoRfpResult> {
    console.log(`[Auto-RFP] Extracting screens from workspace: ${workspaceSlug}`);

    const rawResponse = await queryVault(workspaceSlug, SCREEN_EXTRACTION_PROMPT, "chat");

    if (!rawResponse || rawResponse.startsWith("Error")) {
        throw new Error(`AnythingLLM query failed: ${rawResponse}`);
    }

    return parseAndBuild(rawResponse, "ai-workspace");
}

/**
 * Run the pipeline against raw text (e.g. from PDF filter output or direct paste).
 */
export async function autoRfpFromText(text: string, workspaceSlug?: string): Promise<AutoRfpResult> {
    const slug = workspaceSlug || process.env.ANYTHING_LLM_WORKSPACE || "ancdashboard";
    console.log(`[Auto-RFP] Extracting screens from direct text (${text.length} chars) via workspace: ${slug}`);

    const prompt = `${SCREEN_EXTRACTION_PROMPT}\n\n--- RFP CONTENT ---\n\n${text.slice(0, 60000)}`;
    const rawResponse = await queryVault(slug, prompt, "chat");

    if (!rawResponse || rawResponse.startsWith("Error")) {
        throw new Error(`AnythingLLM query failed: ${rawResponse}`);
    }

    return parseAndBuild(rawResponse, "ai-direct");
}

// ============================================================================
// PARSE AI RESPONSE + PRODUCT MATCHING + ESTIMATOR BUILDING
// ============================================================================

function parseAndBuild(rawResponse: string, method: "ai-workspace" | "ai-direct"): AutoRfpResult {
    const jsonStr = extractJson(rawResponse);
    if (!jsonStr) {
        throw new Error("AI did not return valid JSON. Raw response: " + rawResponse.slice(0, 500));
    }

    let parsed: any;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error("Failed to parse AI JSON: " + (e as Error).message);
    }

    const project: ExtractedProject = {
        clientName: parsed?.project?.clientName || null,
        projectName: parsed?.project?.projectName || null,
        venue: parsed?.project?.venue || null,
        location: parsed?.project?.location || null,
        isOutdoor: parsed?.project?.isOutdoor === true,
        isUnion: parsed?.project?.isUnion === true,
    };

    const rawScreens: any[] = Array.isArray(parsed?.screens) ? parsed.screens : [];
    const screens: ExtractedScreen[] = rawScreens.map((s, i) => ({
        name: s.name || `Display ${i + 1}`,
        location: s.location || "",
        widthFt: toNum(s.widthFt) || 0,
        heightFt: toNum(s.heightFt) || 0,
        pixelPitchMm: toNum(s.pixelPitchMm) ?? toNum(s.pixelPitch) ?? null,
        environment: s.environment === "outdoor" ? "outdoor" : "indoor",
        quantity: Math.max(1, Math.round(toNum(s.quantity) || 1)),
        brightness: toNum(s.brightness) ?? null,
        serviceType: s.serviceType || null,
        notes: s.notes || null,
        confidence: toNum(s.confidence) || 0.5,
    }));

    // Match products + build estimator answers
    const catalog = getAllProducts();
    const matchReport: MatchReportEntry[] = [];
    const displays: DisplayAnswers[] = [];

    for (const screen of screens) {
        for (let q = 0; q < screen.quantity; q++) {
            const match = matchScreenToProduct(screen, catalog);
            matchReport.push({
                screenName: screen.quantity > 1 ? `${screen.name} #${q + 1}` : screen.name,
                requestedPitch: screen.pixelPitchMm,
                requestedEnv: screen.environment,
                matchedProductId: match.product.id,
                matchedProductName: match.product.name,
                fitScore: match.fitScore,
                matchConfidence: match.matchConfidence,
                pitchDelta: match.pitchDelta,
            });

            const d: DisplayAnswers = {
                ...getDefaultDisplayAnswers(),
                displayType: inferDisplayType(screen),
                displayName: screen.quantity > 1 ? `${screen.name} #${q + 1}` : screen.name,
                locationType: inferLocationType(screen),
                widthFt: screen.widthFt,
                heightFt: screen.heightFt,
                pixelPitch: String(match.product.pitchMm),
                productId: match.product.id,
                productName: match.product.name,
                installComplexity: inferComplexity(screen),
                serviceType: screen.serviceType === "rear" ? "Rear" : "Front/Rear",
                isReplacement: false,
                useExistingStructure: false,
                includeSpareParts: true,
                steelScope: "full",
                liftType: inferLiftType(screen),
                powerDistance: "near",
                dataRunDistance: "copper",
                excludedBundleItems: [],
            };
            displays.push(d);
        }
    }

    const answers: EstimatorAnswers = {
        ...getDefaultAnswers(),
        clientName: project.clientName || "",
        projectName: project.projectName || "",
        location: project.venue || project.location || "",
        docType: "budget",
        estimateDepth: "rom",
        currency: "USD",
        isIndoor: !project.isOutdoor,
        isNewInstall: true,
        isUnion: project.isUnion,
        displays,
        marginTier: "budget",
        ledMargin: 15,
        servicesMargin: 20,
        defaultMargin: 30,
        bondRate: 1.5,
        salesTaxRate: 9.5,
        costPerSqFtOverride: 0,
        pmComplexity: displays.length > 5 ? "complex" : "standard",
        targetPrice: 0,
    };

    return {
        project,
        screens,
        estimatorAnswers: answers,
        matchReport,
        extractionMethod: method,
        rawAiResponse: rawResponse,
    };
}

// ============================================================================
// PRODUCT MATCHING
// ============================================================================

interface ProductMatch {
    product: ProductType;
    fitScore: number;
    matchConfidence: "high" | "low" | "none";
    pitchDelta: number;
}

function scoreCatalogCandidate(screen: ExtractedScreen, product: ProductType, targetPitch: number): number {
    const text = `${screen.name} ${screen.location}`.toLowerCase();
    const productText = `${product.name} ${product.hardware} ${product.manufacturer}`.toLowerCase();
    const wantsMesh = /mesh|transparent|see.?through/.test(text);
    const ribbonLike = /ribbon|fascia|perimeter|banner/.test(text);
    const scoreboardLike = /scoreboard|video\s*board|videoboard|center.?hung|main/.test(text);
    const pitchPenalty = Math.abs(product.pitchMm - targetPitch) * 20;
    const nitsPenalty = screen.brightness && product.brightnessNits < screen.brightness
        ? 1000 + ((screen.brightness - product.brightnessNits) / Math.max(screen.brightness, 1)) * 100
        : 0;

    let contextualPenalty = 0;
    if (/mesh|transparent|see.?through/.test(productText) && !wantsMesh) contextualPenalty += 500;
    if (wantsMesh && !/mesh|transparent|see.?through/.test(productText)) contextualPenalty += 80;

    if (scoreboardLike) {
        if (/fascia|halo|perimeter|aura/.test(productText)) contextualPenalty += 120;
        if (/mesh|transparent|see.?through/.test(productText)) contextualPenalty += 250;
    }

    if (ribbonLike) {
        if (/radiance|corona/.test(productText)) contextualPenalty += 80;
        if (/fascia|halo|perimeter|aura/.test(productText)) contextualPenalty -= 20;
    }

    const manufacturerBias = /yaham/i.test(product.manufacturer) ? -3 : /\blg\b/i.test(product.manufacturer) ? 1 : 0;
    return pitchPenalty + nitsPenalty + contextualPenalty + manufacturerBias;
}

function matchScreenToProduct(screen: ExtractedScreen, catalog: ProductType[]): ProductMatch {
    const isOutdoor = screen.environment === "outdoor";
    const targetPitch = screen.pixelPitchMm;

    // Filter by environment
    let candidates = catalog.filter(p => {
        if (isOutdoor) return p.environment === "Outdoor" || p.environment === "Both";
        return p.environment === "Indoor" || p.environment === "Both";
    });
    if (candidates.length === 0) candidates = catalog;

    if (targetPitch && targetPitch > 0) {
        candidates.sort((a, b) => scoreCatalogCandidate(screen, a, targetPitch) - scoreCatalogCandidate(screen, b, targetPitch));
        const best = candidates[0];
        const pitchDiff = Math.abs(best.pitchMm - targetPitch);
        const fitScore = Math.max(0, Math.round(100 - (pitchDiff / targetPitch) * 100));
        const matchConfidence: "high" | "low" | "none" =
            pitchDiff <= 1.0 ? "high" : pitchDiff <= 3.0 ? "low" : "none";
        return { product: best, fitScore, matchConfidence, pitchDelta: pitchDiff };
    }

    // No pitch specified — pick reasonable default by area
    const area = screen.widthFt * screen.heightFt;
    let defaultPitch: number;
    if (isOutdoor) {
        defaultPitch = area > 500 ? 10 : area > 100 ? 6 : 4;
    } else {
        defaultPitch = area > 500 ? 10 : area > 100 ? 4 : 2.5;
    }

    candidates.sort((a, b) => scoreCatalogCandidate(screen, a, defaultPitch) - scoreCatalogCandidate(screen, b, defaultPitch));
    const best = candidates[0];
    const pitchDiff = Math.abs(best.pitchMm - defaultPitch);
    return { product: best, fitScore: 50, matchConfidence: "low", pitchDelta: pitchDiff };
}

// ============================================================================
// INFERENCE HELPERS
// ============================================================================

function inferDisplayType(screen: ExtractedScreen): string {
    const name = screen.name.toLowerCase();
    if (name.includes("scoreboard") || name.includes("video board") || name.includes("main")) return "scoreboard";
    if (name.includes("ribbon")) return "ribbon";
    if (name.includes("fascia")) return "fascia";
    if (name.includes("marquee")) return "marquee";
    if (name.includes("concourse") || name.includes("lobby")) return "concourse";
    if (name.includes("courtside") || name.includes("perimeter")) return "courtside";
    if (name.includes("vomitory") || name.includes("vom")) return "vomitory";
    return "custom";
}

function inferLocationType(screen: ExtractedScreen): string {
    const loc = (screen.location + " " + screen.name).toLowerCase();
    if (loc.includes("ceiling") || loc.includes("hang") || loc.includes("fly")) return "ceiling";
    if (loc.includes("floor") || loc.includes("ground") || loc.includes("perimeter")) return "floor";
    if (loc.includes("column") || loc.includes("pillar")) return "column";
    return "wall";
}

function inferComplexity(screen: ExtractedScreen): string {
    const area = screen.widthFt * screen.heightFt;
    const name = screen.name.toLowerCase();
    if (name.includes("round") || name.includes("curved") || name.includes("360")) return "complex";
    if (area > 1000) return "complex";
    if (area > 200) return "moderate";
    return "standard";
}

function inferLiftType(screen: ExtractedScreen): string {
    const area = screen.widthFt * screen.heightFt;
    const loc = (screen.location + " " + screen.name).toLowerCase();
    if (loc.includes("ceiling") || loc.includes("hang") || loc.includes("fly") || area > 500) return "crane";
    if (area > 100) return "boom";
    return "scissor";
}

function toNum(v: any): number | null {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
