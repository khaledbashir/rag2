import { NextRequest, NextResponse } from "next/server";
import { queryVault } from "@/lib/anything-llm";
import { prisma } from "@/lib/prisma";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";
import { extractJson } from "@/lib/json-utils";
import { log } from "@/lib/logger";

const EXTRACTION_PROMPT = `
You are the ANC Digital Signage Expert AI. Analyze the RFP content and extract Equipment (EQ) and Quantities. Follow the 17/20 Rule: extract what you can; for the rest return null and the system will Gap Fill.

===== CRITICAL FOCUS: DIVISION 11 PRIORITY (MASTER TRUTH) =====
You MUST prioritize and search for these sections in EXACT order of priority:
1. "SECTION 11 06 60" (Display Schedule) - HIGHEST PRIORITY - This is the absolute Master Truth for quantities and dimensions
2. "SECTION 11 63 10" (LED Display Systems) - SECOND PRIORITY - Technical specifications
3. "Division 11" - THIRD PRIORITY - General LED display requirements

REPEAT THESE KEYWORDS MULTIPLE TIMES IN YOUR SEARCH: "Section 11 06 60", "Display Schedule", "Section 11 63 10", "LED Display Systems"
Data found in Section 11 06 60 overrides ALL other sections. If you find Section 11 06 60, set extractionAccuracy to "High".

===== MANDATORY CITATION REQUIREMENT (Trust but Verify) =====
CITATIONS (P0): Every extracted value MUST be: { "value": <actual>, "citation": "[Source: Section X, Page Y]", "confidence": 0.95 }. If no section/page found use "[Source: Document Analysis]". Do not hallucinate — citations prove the value is real.

===== CONFIDENCE SCORING (REQUIRED) =====
For each extracted field, include a confidence score (0.0 to 1.0):
- 0.95-1.0: High confidence (found in Section 11 06 60 or Section 11 63 10)
- 0.80-0.94: Medium confidence (found in Division 11 or related sections)
- 0.60-0.79: Low confidence (inferred from context, may need verification)
- <0.60: Very low confidence (set to null, trigger Gap Fill)

MISSING FIELDS: If you cannot identify a field OR confidence < 0.85, set it to null. Do not guess. Null triggers Gap Fill (the Chat Sidebar will ask the user, e.g. "Section 11 did not specify Service Type. Is this Front or Rear Service?").

BRIGHTNESS: Capture the numeric value from the document (often labeled "Nits"). Store as number (e.g. 6000). The UI labels it "Brightness".

===== 20 CRITICAL FIELDS TO EXTRACT (17/20 Rule) =====
PROJECT-LEVEL (5):
- receiver.name (Client Name)
- details.proposalName (Project Title)
- details.venue (Venue Name)
- receiver.address (Client Address)
- extractionAccuracy ("High" if Section 11 06 60 found, else "Standard")

PER-SCREEN FIELDS (12 per screen, minimum 1 screen required):
1. Screen Name  2. Quantity  3. Location/Zone  4. Application (indoor|outdoor)  5. Pixel Pitch (e.g. 10mm)
6. Resolution Height (pixels)  7. Resolution Width (pixels)  8. Active Area Height (feet/inches)  9. Active Area Width (feet/inches)
10. Brightness (number)  11. Service Type (front|rear)  12. Structural Tonnage (from Thornton Tomasetti/TTE reports, "tons")

PROJECT-LEVEL RULES:
- rulesDetected.structuralTonnage, reinforcingTonnage, requiresUnionLabor, requiresSpareParts

OUTPUT: Return ONLY valid JSON. No markdown. details.screens = array of objects with the EQ fields above; each field is { value, citation, confidence } or null.
Include extractionSummary with totalFields, extractedFields, completionRate, highConfidenceFields, lowConfidenceFields, missingFields.
`;

export async function POST(req: NextRequest) {
  try {
    if (!ANYTHING_LLM_BASE_URL || !ANYTHING_LLM_KEY) {
      return NextResponse.json({ error: "AnythingLLM not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const proposalId = body.proposalId as string | undefined;
    const workspaceSlugParam = body.workspaceSlug as string | undefined;

    let workspaceSlug = workspaceSlugParam || process.env.ANYTHING_LLM_WORKSPACE || "researcher";

    if (proposalId && !workspaceSlugParam) {
      const proposal = await prisma.proposal.findUnique({
        where: { id: proposalId },
        select: { aiWorkspaceSlug: true },
      });
      if (proposal?.aiWorkspaceSlug) workspaceSlug = proposal.aiWorkspaceSlug;
    }

    log.info(`[RFP Re-extract] Running extraction on workspace: ${workspaceSlug}`);
    const aiResponse = await queryVault(workspaceSlug, EXTRACTION_PROMPT, "chat");

    const jsonText = extractJson(aiResponse);
    let extractedData: unknown = null;
    if (jsonText) {
      try {
        extractedData = JSON.parse(jsonText);
      } catch {
        try {
          extractedData = JSON.parse(jsonText + "}");
        } catch {
          // leave null
        }
      }
    }

    return NextResponse.json({
      ok: true,
      workspaceSlug,
      extractedData,
      message: "Re-extraction complete",
    });
  } catch (error: any) {
    log.error("[RFP Re-extract] Error:", error);
    return NextResponse.json({ ok: false, error: error?.message ?? "Re-extraction failed" }, { status: 500 });
  }
}
