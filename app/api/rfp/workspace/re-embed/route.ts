/**
 * POST /api/rfp/workspace/re-embed
 *
 * Re-provisions an AnythingLLM workspace with only selected page categories.
 * Called from the Document Browser when user toggles categories on/off.
 *
 * Body: { analysisId, selectedPages: Array<{ pageNumber, category, markdown, tables }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";
import type {
  ExtractedLEDSpec,
  ExtractedProjectInfo,
  ExtractedRequirement,
} from "@/services/rfp/unified/types";
import { log } from "@/lib/logger";

const INTERNAL_ALM_URL = "http://basheer_anything-llm:3001/api/v1";
const PAGES_PER_DOC = 25;

async function getAlmUrl(): Promise<string> {
  try {
    const res = await fetch(`${INTERNAL_ALM_URL}/auth`, {
      method: "GET",
      headers: { Authorization: `Bearer ${ANYTHING_LLM_KEY}` },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return INTERNAL_ALM_URL;
  } catch { /* fall through */ }
  return ANYTHING_LLM_BASE_URL!;
}

interface SelectedPage {
  pageNumber: number;
  category: string;
  markdown: string;
  tables: Array<{ content: string }>;
}

export async function POST(request: NextRequest) {
  try {
    const { analysisId, selectedPages } = (await request.json()) as {
      analysisId: string;
      selectedPages: SelectedPage[];
    };

    if (!analysisId || !selectedPages?.length) {
      return NextResponse.json({ error: "analysisId and selectedPages required" }, { status: 400 });
    }

    if (!ANYTHING_LLM_BASE_URL || !ANYTHING_LLM_KEY) {
      return NextResponse.json({ error: "AnythingLLM not configured" }, { status: 500 });
    }

    const analysis = await prisma.rfpAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis || !analysis.aiWorkspaceSlug) {
      return NextResponse.json({ error: "Analysis or workspace not found" }, { status: 404 });
    }

    const baseUrl = await getAlmUrl();
    const slug = analysis.aiWorkspaceSlug;

    // 1. Get current workspace documents and remove them all
    const listRes = await fetch(`${baseUrl}/workspace/${slug}`, {
      headers: { Authorization: `Bearer ${ANYTHING_LLM_KEY}` },
    });

    if (listRes.ok) {
      const wsData = await listRes.json();
      const existingDocs = wsData?.workspace?.documents || [];
      const deletePaths = existingDocs.map((d: any) => d.docpath).filter(Boolean);

      if (deletePaths.length > 0) {
        await fetch(`${baseUrl}/workspace/${slug}/update-embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
          },
          body: JSON.stringify({ deletes: deletePaths }),
        });
      }
    }

    // 2. Upload selected pages in chunks
    const docPaths: string[] = [];
    for (let i = 0; i < selectedPages.length; i += PAGES_PER_DOC) {
      const chunk = selectedPages.slice(i, i + PAGES_PER_DOC);
      const startPage = chunk[0].pageNumber;
      const endPage = chunk[chunk.length - 1].pageNumber;

      const content = chunk.map((p) => {
        let text = `\n=== PAGE ${p.pageNumber} (${p.category}) ===\n${p.markdown}`;
        if (p.tables?.length > 0) {
          text += "\n\nTABLES:\n" + p.tables.map((t) => t.content).join("\n");
        }
        return text;
      }).join("\n\n");

      const formData = new FormData();
      formData.append("file", new Blob([content], { type: "text/plain" }), `rfp-pages-${startPage}-${endPage}.txt`);

      const uploadRes = await fetch(`${baseUrl}/document/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ANYTHING_LLM_KEY}` },
        body: formData,
      });

      if (uploadRes.ok) {
        const data = await uploadRes.json();
        for (const doc of data?.documents || []) {
          if (doc.location) docPaths.push(doc.location);
        }
      }
    }

    // 3. Re-upload extraction summary (structured data)
    const screens = (analysis.screens as unknown as ExtractedLEDSpec[]) || [];
    const requirements = (analysis.requirements as unknown as ExtractedRequirement[]) || [];
    const project = (analysis.project as unknown as ExtractedProjectInfo) || {};

    if (screens.length > 0) {
      const { buildExtractionSummary } = await import("@/services/rfp/unified/rfpWorkspaceProvisioner");
      const summaryMd = buildExtractionSummary({
        projectName: analysis.projectName,
        venue: analysis.venue,
        screens,
        requirements,
        project,
      });

      const summaryForm = new FormData();
      summaryForm.append("file", new Blob([summaryMd], { type: "text/plain" }), "extraction-summary.md");

      const summaryRes = await fetch(`${baseUrl}/document/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ANYTHING_LLM_KEY}` },
        body: summaryForm,
      });

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        for (const doc of data?.documents || []) {
          if (doc.location) docPaths.push(doc.location);
        }
      }
    }

    // 4. Embed all new docs
    if (docPaths.length > 0) {
      await fetch(`${baseUrl}/workspace/${slug}/update-embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
        },
        body: JSON.stringify({ adds: docPaths }),
      });
    }

    const categoryBreakdown = selectedPages.reduce<Record<string, number>>((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      pagesEmbedded: selectedPages.length,
      documentsCreated: docPaths.length,
      categories: categoryBreakdown,
    });
  } catch (err: any) {
    log.error("[re-embed] Error:", err);
    return NextResponse.json({ error: err.message || "Re-embed failed" }, { status: 500 });
  }
}
