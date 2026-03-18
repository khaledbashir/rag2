import { NextRequest, NextResponse } from "next/server";
import { uploadDocument, queryVault } from "@/lib/anything-llm";
import { prisma } from "@/lib/prisma";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";
import { smartFilterPdf } from "@/services/ingest/smart-filter";
import { smartFilterStreaming, shouldUseStreaming } from "@/services/ingest/smart-filter-streaming";
import { extractText as kreuzbergExtract } from "@/services/kreuzberg/kreuzbergClient";
import { screenshotPdfPage } from "@/services/ingest/pdf-screenshot";
import { DrawingService } from "@/services/vision/drawing-service";
import { analyzeTTEContent, TonnageResult } from "@/services/ingest/tonnage-extractor";
import { parseStandardExcel, generateANCProposal, isStandardFormat } from "@/services/pricing/convert-standard-excel";
import { extractJson } from "@/lib/json-utils";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const proposalId = searchParams.get("proposalId");

    if (!proposalId) {
      return NextResponse.json({ error: "proposalId required" }, { status: 400 });
    }

    const docs = await prisma.rfpDocument.findMany({
      where: { proposalId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ docs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    await prisma.rfpDocument.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // File size guard (100MB max)
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 100 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "File too large (100MB max)" }, { status: 413 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const proposalId = formData.get("proposalId") as string | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    // File type validation
    const allowedExtensions = [".pdf", ".xlsx", ".xls", ".csv", ".docx"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return NextResponse.json({ ok: false, error: `Unsupported file type: ${ext}` }, { status: 400 });
    }

    const warnings: string[] = [];
    let workspaceSlug = process.env.ANYTHING_LLM_WORKSPACE || "researcher";

    if (proposalId && proposalId !== "new") {
      try {
        const proposal = await prisma.proposal.findUnique({
          where: { id: proposalId },
          select: { aiWorkspaceSlug: true, clientName: true },
        });

        if (proposal?.aiWorkspaceSlug) {
          workspaceSlug = proposal.aiWorkspaceSlug;
        } else if (ANYTHING_LLM_BASE_URL && ANYTHING_LLM_KEY) {
          const safeNameBase = (proposal?.clientName || proposalId)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 24);
          const requestedName = `${safeNameBase || "project"}-${proposalId.slice(-6)}`;

          const res = await fetch(`${ANYTHING_LLM_BASE_URL}/workspace/new`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ANYTHING_LLM_KEY}`,
            },
            body: JSON.stringify({ name: requestedName }),
          });

          if (res.ok) {
            const created = await res.json();
            const slug = created?.workspace?.slug || created?.slug || null;
            if (slug) {
              workspaceSlug = slug;
              await prisma.proposal.update({
                where: { id: proposalId },
                data: { aiWorkspaceSlug: slug },
              });
            }
          } else {
            const text = await res.text();
            const msg = `AnythingLLM workspace creation failed (${res.status}): ${text.slice(0, 200)}`;
            log.warn(`[RFP Upload] ${msg}`);
            warnings.push(msg);
          }
        }
      } catch (e) {
        const msg = `Failed to resolve per-project workspace: ${e instanceof Error ? e.message : String(e)}`;
        log.warn(`[RFP Upload] ${msg}`);
        warnings.push(msg);
      }
    }

    // SMART INGEST PIPELINE
    let fileToEmbed: Buffer | File = file;
    let filenameToEmbed = file.name;
    let originalDocPath = "";
    let filterStats = null;
    let fullTextForTTE = ""; // Store for TTE extraction
    let excelExtractedData: any = null; // Store for Excel extraction

    // 0. Handle Excel files (Natalia's proposals)
    if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
      log.info(`[RFP Upload] Excel file detected: ${file.name}`);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Read workbook for format detection
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        
        // Check if standard format
        if (isStandardFormat(workbook)) {
          log.info('[RFP Upload] Standard Excel format detected, parsing...');
          const standardProposal = parseStandardExcel(buffer);
          excelExtractedData = generateANCProposal(standardProposal);
          
          log.info(`[RFP Upload] Excel parsed: ${excelExtractedData.screens.length} screens, $${excelExtractedData.pricing.grandTotal} total`);
          
          // Create a text summary for embedding
          const summaryText = `
EXCEL PROPOSAL IMPORT
Client: ${excelExtractedData.receiver.name}
Project: ${excelExtractedData.details.proposalName}
Screens: ${excelExtractedData.screens.length}
Total: $${excelExtractedData.pricing.grandTotal} ${excelExtractedData.pricing.currency}

Screens:
${excelExtractedData.screens.map((s: any) => `- ${s.name}: ${s.widthFt.toFixed(1)}' x ${s.heightFt.toFixed(1)}', ${s.pitchMm}mm, Qty ${s.quantity}`).join('\n')}

Line Items:
${excelExtractedData.lineItems.map((li: any) => `- ${li.description}: $${li.sellPrice.toLocaleString()}`).join('\n')}
`;
          fileToEmbed = Buffer.from(summaryText);
          filenameToEmbed = file.name.replace(/\.xlsx?$/i, '_extracted.txt');
        } else {
          log.info('[RFP Upload] Non-standard Excel format, skipping auto-parse');
          // Fall through to normal upload
        }
      } catch (excelErr) {
        const msg = `Excel parsing failed: ${excelErr instanceof Error ? excelErr.message : String(excelErr)}`;
        log.warn(`[RFP Upload] ${msg}`);
        warnings.push(msg);
        // Continue with normal upload
      }
    }

    // 0. Pre-process if PDF
    if (file.name.toLowerCase().endsWith(".pdf")) {
      log.info(`[RFP Upload] Smart Filtering PDF: ${file.name}`);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      try {
        // Determine if we need streaming (2,500+ pages) or standard filtering
        const pdfResult = await kreuzbergExtract(buffer, file.name);
        const totalPages = pdfResult.totalPages || 0;
        
        let filterResult;
        if (shouldUseStreaming(totalPages)) {
          log.info(`[RFP Upload] Using STREAMING filter for ${totalPages} pages`);
          filterResult = await smartFilterStreaming(buffer, totalPages, {
            chunkSize: 300,
            topPerChunk: 50,
            finalMaxPages: 150
          });
        } else {
          log.info(`[RFP Upload] Using STANDARD filter for ${totalPages} pages`);
          filterResult = await smartFilterPdf(buffer);
        }
        
        fullTextForTTE = filterResult.fullText || ""; // Save for TTE extraction
        log.info(`[RFP Upload] Filtered ${filterResult.totalPages} pages down to ${filterResult.retainedPages} signal pages.`);

        // --- AUTO-VISION: AV/A sheets, Elevation, Structural Attachment ---
        // Gated behind includeDrawings flag (default: false for determinism).
        // Drawing vision uses separate AI models with non-deterministic output.
        // Enable only when estimators explicitly need architectural drawing extraction.
        const includeDrawings = false; // Phase 2: make this a request parameter
        const MAX_DRAWING_PAGES_TO_SCAN = 10;
        const visionConfigured = !!(process.env.Z_AI_API_KEY || process.env.Z_AI_BASE_URL);
        let visionDisabled = false;

        if (includeDrawings && filterResult.drawingCandidates.length > 0) {
          if (visionConfigured) {
            log.info(`[RFP Upload] Found ${filterResult.drawingCandidates.length} potential drawings. Scanning up to ${MAX_DRAWING_PAGES_TO_SCAN}...`);
            const drawingService = new DrawingService();
            const pagesToScan = filterResult.drawingCandidates.slice(0, MAX_DRAWING_PAGES_TO_SCAN);
            let visionContext = "\n\n=== VISION (Drawings — searchable) ===\n";
            for (const pageNum of pagesToScan) {
              try {
                log.info(`[RFP Upload] Vision scanning page ${pageNum}...`);
                const screenshot = await screenshotPdfPage(buffer, pageNum);
                if (screenshot) {
                  const base64 = `data:image/png;base64,${screenshot.toString('base64')}`;
                  const labels = await drawingService.processDrawingPage(base64);
                  const searchDesc = await drawingService.describePageForSearch(base64, pageNum);
                  visionContext += searchDesc + "\n";
                  if (labels.length > 0) {
                    visionContext += `  Labels: ${labels.map(r => `${r.field}=${r.value}`).join(", ")}\n`;
                  }
                }
              } catch (vErr) {
                log.error(`[RFP Upload] Vision failed for page ${pageNum}`, vErr);
              }
            }
            filterResult.filteredText += visionContext;
            log.info(`[RFP Upload] Added vision descriptions to embedding (${pagesToScan.length} pages).`);
          } else {
            visionDisabled = true;
            log.info(`[RFP Upload] Vision skipped (Z_AI not configured). Drawing candidates: ${filterResult.drawingCandidates.length}`);
          }
        } else if (filterResult.drawingCandidates.length > 0) {
          log.info(`[RFP Upload] Drawing vision skipped (includeDrawings=false, deterministic mode). ${filterResult.drawingCandidates.length} candidates ignored.`);
        }

        // Create synthetic text file for embedding (Signal Only)
        fileToEmbed = Buffer.from(filterResult.filteredText);
        filenameToEmbed = file.name.replace(/\.pdf$/i, "_signal.txt");

        filterStats = {
          originalPages: filterResult.totalPages,
          keptPages: filterResult.retainedPages,
          drawingCandidates: filterResult.drawingCandidates,
          visionDisabled: visionDisabled
        };

        // Upload ORIGINAL for storage/compliance (Archive folder, NO embedding)
        const originalUpload = await uploadDocument(file, file.name, { folderName: "archive" });
        if (originalUpload.success && originalUpload.data?.documents?.[0]) {
          originalDocPath = originalUpload.data.documents[0].location;
          log.info(`[RFP Upload] Original archived at ${originalDocPath}`);
        }

      } catch (e) {
        log.error("[RFP Upload] Smart Filter failed, falling back to full upload", e);
        // Fallback: Embed the original file
        fileToEmbed = file;
        filenameToEmbed = file.name;
      }
    }

    // 1. Upload & Embed in One Go (Hub & Spoke Model)
    const masterWorkspace = process.env.ANYTHING_LLM_MASTER_WORKSPACE || "dashboard-vault";
    let targetWorkspaces: string[] = [];

    if (workspaceSlug) targetWorkspaces.push(workspaceSlug);
    if (masterWorkspace && masterWorkspace !== workspaceSlug) {
      targetWorkspaces.push(masterWorkspace);
    }

    log.info(`[RFP Upload] Uploading and syncing to: ${targetWorkspaces.join(", ")}`);

    // addToWorkspaces handles multi-workspace embedding automatically
    const uploadRes = await uploadDocument(fileToEmbed, filenameToEmbed, {
      addToWorkspaces: targetWorkspaces
    });

    if (!uploadRes.success || !uploadRes.data?.documents?.[0]) {
      log.error("[RFP Upload] Upload failed", uploadRes);
      return NextResponse.json({ ok: false, error: "Failed to upload to storage" }, { status: 500 });
    }

    const docPath = uploadRes.data.documents[0].location;
    log.info(`[RFP Upload] File uploaded to ${docPath}`);

    // 2. Persist to Database (Vault)
    // We prefer to link to the ORIGINAL PDF if available, otherwise the uploaded file
    const dbUrl = originalDocPath || docPath;

    if (proposalId && proposalId !== "new") {
      try {
        await prisma.rfpDocument.create({
          data: {
            name: file.name,
            url: dbUrl,
            proposalId: proposalId
          }
        });
        log.info(`[RFP Vault] Saved document record for proposal ${proposalId}`);
      } catch (e) {
        log.error("[RFP Vault] Failed to save DB record:", e);
      }
    }

    // 3. PIN in Project Workspace (Deep Context)
    // We force the project workspace to "focus" on this doc by pinning it.
    // We do NOT pin it in the master vault (RAG only).
    if (workspaceSlug) {
      log.info(`[RFP Upload] Pinning document in project workspace: ${workspaceSlug}`);
      const { updatePin } = await import("@/lib/anything-llm");
      try {
        await updatePin(workspaceSlug, docPath, true);
      } catch (pinErr) {
        const pinMsg = `Document pinning failed for ${workspaceSlug}: ${pinErr instanceof Error ? pinErr.message : String(pinErr)}`;
        log.warn(`[RFP Upload] ${pinMsg}`);
        warnings.push(pinMsg);
      }
    }

    // 4. Extract Data (AI Analysis) — Boss-level: Division 11 priority, citations, 20-field targets
    // Running against FILTERED signal-only context for speed and accuracy
    log.info(`[RFP Upload] Analyzing document for extraction (Division 11 + citations)...`);
    const extractionPrompt = `
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

    let extractedData = null;
    try {
      const aiResponse = await queryVault(workspaceSlug, extractionPrompt, "chat");
      log.info(`[RFP Upload] AI Response Length: ${aiResponse.length}`);

      const jsonText = extractJson(aiResponse);
      if (jsonText) {
        try {
          extractedData = JSON.parse(jsonText);
        } catch (parseErr) {
          const parseMsg = `AI extraction JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
          log.warn(`[RFP Upload] ${parseMsg}`);
          warnings.push(parseMsg);
          // Try to repair common JSON issues if needed, or just proceed without data
          // Attempt simple repair for truncated JSON
          try {
            extractedData = JSON.parse(jsonText + "}");
          } catch (e) { /* ignore */ }
        }
      }
    } catch (e) {
      log.error("[RFP Upload] AI Extraction failed", e);
    }

    // 5. TTE Tonnage Extraction (separate from AI extraction for reliability)
    let tonnageData: TonnageResult | null = null;
    try {
      // Use full text (not filtered) for TTE detection - it's usually a separate doc
      tonnageData = analyzeTTEContent(fullTextForTTE);
      
      if (tonnageData.hasTTE) {
        log.info(`[RFP Upload] TTE Report detected: ${tonnageData.totalTons} tons, $${tonnageData.steelCost} steel cost`);
        
        // Merge tonnage into extractedData
        if (extractedData) {
          extractedData.rulesDetected = extractedData.rulesDetected || {};
          extractedData.rulesDetected.structuralTonnage = {
            value: tonnageData.totalTons,
            citation: "[Source: Thornton Tomasetti Report]",
            confidence: tonnageData.confidence,
            breakdown: tonnageData.items
          };
          extractedData.rulesDetected.reinforcingTonnage = {
            value: tonnageData.items.find(i => i.type === 'reinforcing')?.tons || 0,
            citation: "[Source: Thornton Tomasetti Report]",
            confidence: 0.95
          };
          extractedData.rulesDetected.newSteelTonnage = {
            value: tonnageData.items.find(i => i.type === 'new')?.tons || 0,
            citation: "[Source: Thornton Tomasetti Report]",
            confidence: 0.95
          };
        }
      } else {
        log.info("[RFP Upload] No TTE report detected in upload");
      }
    } catch (tteErr) {
      const tteMsg = `TTE extraction failed: ${tteErr instanceof Error ? tteErr.message : String(tteErr)}`;
      log.warn(`[RFP Upload] ${tteMsg}`);
      warnings.push(tteMsg);
    }

    // If we have Excel data, use it instead of AI-extracted data
    const finalExtractedData = excelExtractedData || extractedData;
    
    if (excelExtractedData) {
      log.info('[RFP Upload] Using Excel-extracted data (not AI)');
    }

    return NextResponse.json({
      ok: true,
      url: dbUrl,
      workspaceSlug,
      extractedData: finalExtractedData,
      excelData: excelExtractedData, // Include raw Excel data for UI
      tonnageData,
      filterStats,
      warnings: warnings.length > 0 ? warnings : undefined,
      visionWarning: filterStats?.visionDisabled
        ? "Vision disabled: Drawing analysis skipped. Please manually verify structural constraints."
        : undefined,
      message: excelExtractedData
        ? "Excel proposal imported successfully with exact pricing"
        : "RFP uploaded and analyzed successfully"
    });

  } catch (error: any) {
    log.error("[RFP Upload] Critical error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
