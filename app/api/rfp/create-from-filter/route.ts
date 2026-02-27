import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { provisionProjectWorkspace, uploadDocument, addToWorkspace, queryVault, getDashboardWorkspaceSlug } from "@/lib/anything-llm";
import { findClientLogo } from "@/lib/brand-discovery";
import { extractJson } from "@/lib/json-utils";

/**
 * POST /api/rfp/create-from-filter
 *
 * Creates a new project from the PDF Filter tool's output.
 * Sync: creates workspace + proposal → returns proposalId immediately.
 * Async: embeds text + drawings in AnythingLLM, runs AI extraction.
 */

interface DrawingManifestEntry {
  pageNumber: number;
  pageIndex: number;
  category: string;
  categoryLabel: string;
  description: string;
  confidence: number;
}

interface CreateFromFilterBody {
  clientName: string;
  venue: string;
  projectTitle: string;
  /** Full extracted text from kept text pages, joined */
  extractedText: string;
  /** Kept page indices (0-based) for reference */
  keptPageIndices: number[];
  /** Drawing analysis results from Gemini 2.0 Flash */
  drawingManifest: DrawingManifestEntry[];
  /** User email from session */
  userEmail: string;
}

export async function POST(req: NextRequest) {
  try {
    // Parse FormData — extracted text arrives as a file blob to avoid
    // "Request Header Fields Too Large" from reverse proxy (50+ pages = 500KB+)
    const formData = await req.formData();

    const userEmail = formData.get("userEmail") as string | null;
    if (!userEmail) {
      return NextResponse.json({ ok: false, error: "userEmail is required" }, { status: 400 });
    }

    // Read extracted text from file blob
    const textFile = formData.get("extractedText") as File | null;
    const extractedText = textFile ? await textFile.text() : "";

    const keptPageIndices: number[] = JSON.parse(
      (formData.get("keptPageIndices") as string) || "[]"
    );
    const drawingManifest: DrawingManifestEntry[] = JSON.parse(
      (formData.get("drawingManifest") as string) || "[]"
    );

    if (!extractedText && keptPageIndices.length === 0) {
      return NextResponse.json({ ok: false, error: "No content to embed — filter produced no pages" }, { status: 400 });
    }

    const clientName = (formData.get("clientName") as string) || "Untitled Client";
    const projectTitle = (formData.get("projectTitle") as string) || `${clientName} — RFP Project`;
    const venue = (formData.get("venue") as string) || "";

    const body: CreateFromFilterBody = {
      clientName,
      venue,
      projectTitle,
      extractedText,
      keptPageIndices,
      drawingManifest,
      userEmail,
    };

    // ── 1. SYNC: Create workspace + proposal (fast, returns immediately) ──
    const clientLogo = await findClientLogo(clientName);

    const workspace = await prisma.workspace.create({
      data: {
        name: projectTitle,
        clientLogo,
        users: {
          connectOrCreate: {
            where: { email: body.userEmail },
            create: { email: body.userEmail },
          },
        },
      },
    });

    // Resolve user ID for Created By tracking
    const creatorUser = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    });

    const proposal = await prisma.proposal.create({
      data: {
        workspaceId: workspace.id,
        clientName,
        clientLogo,
        venue,
        status: "DRAFT",
        calculationMode: "INTELLIGENCE",
        mirrorMode: false,
        source: "rfp_filter",
        embeddingStatus: "pending",
        ...(creatorUser ? { createdByUserId: creatorUser.id } : {}),
      },
    });

    console.log(`[create-from-filter] Created proposal ${proposal.id} for "${clientName}" / "${projectTitle}"`);

    // ── 2. ASYNC: Provision AI workspace + embed + extract (fire-and-forget) ──
    runAsyncEmbedding(workspace.id, proposal.id, body).catch(async (err) => {
      console.error(`[create-from-filter] Async embedding failed for proposal ${proposal.id}:`, err);
      await prisma.proposal.update({ where: { id: proposal.id }, data: { embeddingStatus: "failed" } }).catch(() => {});
    });

    // ── 3. Return immediately ──
    return NextResponse.json({
      ok: true,
      proposalId: proposal.id,
      workspaceId: workspace.id,
    }, { status: 201 });

  } catch (error: any) {
    console.error("[create-from-filter] Critical error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════════
// ASYNC EMBEDDING PIPELINE (runs after response is sent)
// ════════════════════════════════════════════════════════════════

async function runAsyncEmbedding(
  workspaceId: string,
  proposalId: string,
  body: CreateFromFilterBody
) {
  const { clientName, projectTitle, extractedText, drawingManifest } = body;

  // ── 1. Provision AnythingLLM workspace ──
  await prisma.proposal.update({ where: { id: proposalId }, data: { embeddingStatus: "embedding" } });

  const slug = await provisionProjectWorkspace(projectTitle || clientName, workspaceId);
  if (!slug) {
    console.error(`[create-from-filter] Failed to provision AI workspace for ${proposalId}`);
    await prisma.proposal.update({ where: { id: proposalId }, data: { embeddingStatus: "failed" } });
    return;
  }

  // Save slug to both workspace and proposal
  await prisma.workspace.update({ where: { id: workspaceId }, data: { aiWorkspaceSlug: slug } });
  await prisma.proposal.update({ where: { id: proposalId }, data: { aiWorkspaceSlug: slug } });

  console.log(`[create-from-filter] AI workspace provisioned: ${slug}`);

  // ── 2. Build signal text (text pages + drawing descriptions) ──
  let signalText = `SMART_FILTER_FROM_CLIENT\nPROJECT=${projectTitle}\nCLIENT=${clientName}\n\n`;
  signalText += extractedText;

  // Append drawing descriptions as searchable text
  if (drawingManifest.length > 0) {
    signalText += "\n\n=== DRAWING ANALYSIS (from PDF Filter) ===\n";
    for (const d of drawingManifest) {
      const conf = d.confidence >= 60 ? "HIGH" : d.confidence >= 30 ? "MEDIUM" : "LOW";
      signalText += `\n--- DRAWING PAGE ${d.pageNumber} [${conf} confidence: ${d.confidence}%] ---\n`;
      signalText += `Category: ${d.categoryLabel}\n`;
      signalText += `Description: ${d.description}\n`;
    }
  }

  // ── 3. Upload signal text to AnythingLLM ──
  const signalFileName = `${clientName.replace(/[^a-zA-Z0-9]/g, "_")}_signal.txt`;
  const signalBuffer = Buffer.from(signalText, "utf-8");

  const uploadResult = await uploadDocument(signalBuffer, signalFileName);
  if (!uploadResult.success) {
    console.error(`[create-from-filter] Signal upload failed:`, uploadResult.message);
    return;
  }

  const docPath = uploadResult.data?.documents?.[0]?.location
    || `custom-documents/${signalFileName}`;

  // Embed in project workspace
  const embedResult = await addToWorkspace(slug, docPath);
  if (!embedResult.success) {
    console.error(`[create-from-filter] Embedding failed:`, embedResult.message);
  }

  // Also embed in master vault (dashboard workspace)
  const masterSlug = getDashboardWorkspaceSlug();
  if (masterSlug && masterSlug !== slug) {
    addToWorkspace(masterSlug, docPath).catch((e) =>
      console.warn(`[create-from-filter] Master vault embed failed:`, e)
    );
  }

  // Save RFP document record
  await prisma.rfpDocument.create({
    data: {
      name: signalFileName,
      url: docPath,
      proposalId,
    },
  });

  console.log(`[create-from-filter] Signal text embedded in ${slug} (${signalText.length} chars)`);

  // ── 4. Save drawing manifest to proposal ──
  if (drawingManifest.length > 0) {
    // Store as JSON in the intelligenceBrief field (it's a Json? field we can use)
    // We'll store it alongside any existing data
    const existingBrief = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { intelligenceBrief: true },
    });

    const briefData = (existingBrief?.intelligenceBrief as any) || {};
    briefData.drawingManifest = drawingManifest;
    briefData.filterStats = {
      totalKeptPages: body.keptPageIndices.length,
      textPages: body.keptPageIndices.length - drawingManifest.length,
      drawingPages: drawingManifest.length,
      filteredAt: new Date().toISOString(),
    };

    await prisma.proposal.update({
      where: { id: proposalId },
      data: { intelligenceBrief: briefData },
    });

    console.log(`[create-from-filter] Drawing manifest saved: ${drawingManifest.length} drawings`);
  }

  // ── 5. AI Extraction (Division 11 priority, 20 critical fields) ──
  await prisma.proposal.update({ where: { id: proposalId }, data: { embeddingStatus: "extracting" } });
  console.log(`[create-from-filter] Running AI extraction against embedded text...`);

  const extractionPrompt = `
You are the ANC Digital Signage Expert AI. Analyze the RFP content and extract Equipment (EQ) and Quantities. Follow the 17/20 Rule: extract what you can; for the rest return null and the system will Gap Fill.

===== CRITICAL FOCUS: DIVISION 11 PRIORITY (MASTER TRUTH) =====
You MUST prioritize and search for these sections in EXACT order of priority:
1. "SECTION 11 06 60" (Display Schedule) - HIGHEST PRIORITY - This is the absolute Master Truth for quantities and dimensions
2. "SECTION 11 63 10" (LED Display Systems) - SECOND PRIORITY - Technical specifications
3. "Division 11" - THIRD PRIORITY - General LED display requirements

Data found in Section 11 06 60 overrides ALL other sections. If you find Section 11 06 60, set extractionAccuracy to "High".

===== MANDATORY CITATION REQUIREMENT =====
CITATIONS (P0): Every extracted value MUST be: { "value": <actual>, "citation": "[Source: Section X, Page Y]", "confidence": 0.95 }. If no section/page found use "[Source: Document Analysis]". Do not hallucinate.

===== CONFIDENCE SCORING =====
For each extracted field, include a confidence score (0.0 to 1.0):
- 0.95-1.0: High confidence (found in Section 11 06 60 or Section 11 63 10)
- 0.80-0.94: Medium confidence (found in Division 11 or related sections)
- 0.60-0.79: Low confidence (inferred from context, may need verification)
- <0.60: Very low confidence (set to null, trigger Gap Fill)

MISSING FIELDS: If you cannot identify a field OR confidence < 0.85, set it to null. Do not guess. Null triggers Gap Fill.

===== 20 CRITICAL FIELDS TO EXTRACT =====
PROJECT-LEVEL (5):
- receiver.name (Client Name)
- details.proposalName (Project Title)
- details.venue (Venue Name)
- receiver.address (Client Address)
- extractionAccuracy ("High" if Section 11 06 60 found, else "Standard")

PER-SCREEN FIELDS (12 per screen, minimum 1 screen required):
1. Screen Name  2. Quantity  3. Location/Zone  4. Application (indoor|outdoor)  5. Pixel Pitch (e.g. 10mm)
6. Resolution Height (pixels)  7. Resolution Width (pixels)  8. Active Area Height (feet/inches)  9. Active Area Width (feet/inches)
10. Brightness (number)  11. Service Type (front|rear)  12. Structural Tonnage

PROJECT-LEVEL RULES:
- rulesDetected.structuralTonnage, reinforcingTonnage, requiresUnionLabor, requiresSpareParts

OUTPUT: Return ONLY valid JSON. No markdown. details.screens = array of objects with the EQ fields above; each field is { value, citation, confidence } or null.
Include extractionSummary with totalFields, extractedFields, completionRate, highConfidenceFields, lowConfidenceFields, missingFields.
  `;

  try {
    const aiResponse = await queryVault(slug, extractionPrompt, "chat");
    console.log(`[create-from-filter] AI Response Length: ${aiResponse.length}`);

    const jsonText = extractJson(aiResponse);
    if (jsonText) {
      try {
        const extractedData = JSON.parse(jsonText);

        // Store extraction results in intelligenceBrief
        const currentBrief = await prisma.proposal.findUnique({
          where: { id: proposalId },
          select: { intelligenceBrief: true },
        });
        const briefData = (currentBrief?.intelligenceBrief as any) || {};
        briefData.extractedData = extractedData;
        briefData.extractedAt = new Date().toISOString();

        await prisma.proposal.update({
          where: { id: proposalId },
          data: { intelligenceBrief: briefData },
        });

        console.log(`[create-from-filter] AI extraction complete and saved`);
      } catch (parseErr) {
        console.warn(`[create-from-filter] AI extraction JSON parse failed:`, parseErr);
      }
    }
  } catch (e) {
    console.error("[create-from-filter] AI Extraction failed:", e);
  }

  // Mark pipeline complete
  await prisma.proposal.update({ where: { id: proposalId }, data: { embeddingStatus: "complete" } });
  console.log(`[create-from-filter] Async pipeline complete for proposal ${proposalId}`);
}
