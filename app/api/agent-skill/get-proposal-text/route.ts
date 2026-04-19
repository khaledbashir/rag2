/**
 * GET/POST /api/agent-skill/get-proposal-text
 *
 * Bridge that lets an AnythingLLM agent extract the pure text representation
 * of a proposal (including those from Mirror Mode Excel uploads) to print
 * directly into the chat back to the user.
 *
 * Auth: x-api-key header matching AGENT_SKILL_API_KEY.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapDbProposalToFormSchema } from "@/lib/proposals/mapDbProposalToForm";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(request: NextRequest): NextResponse | null {
  const expected = process.env.AGENT_SKILL_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: "Service not configured: AGENT_SKILL_API_KEY missing" }, { status: 503 });
  }
  const provided = request.headers.get("x-api-key");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  return null;
}

async function handleRequest(proposalId: string | null) {
  if (!proposalId) {
    return NextResponse.json({ error: "proposal_id is required" }, { status: 400 });
  }

  const project = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      screens: {
        include: { lineItems: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: `Proposal not found: ${proposalId}` }, { status: 404 });
  }

  // 1. Map DB to Form Schema exactly like the real PDF generator
  const formPayload = mapDbProposalToFormSchema(project);
  const details: any = formPayload.details;

  // 2. Build the Markdown replica
  let displayText = `# Proposal: ${details.proposalName || details.receiver?.name || 'Unnamed Project'} (${details.proposalNumber})\n`;
  if (details.receiver?.name) displayText += `**Client**: ${details.receiver?.name}\n`;
  if (details.proposalDate) displayText += `**Date**: ${details.proposalDate}\n`;
  displayText += `**Type**: ${details.documentMode} - ${details.pricingType}\n\n`;

  const mirrorModeActive = details.mirrorMode === true || 
    (details.calculationMode === "MIRROR") || 
    ((details.pricingDocument?.tables?.length ?? 0) > 0);

  if (mirrorModeActive && details.pricingDocument?.tables) {
     displayText += `## Scope of Work (Imported from Excel)\n`;
     // Flatten table contents to a readable format
     details.pricingDocument.tables.forEach((t: any) => {
         if (t.title) displayText += `\n### ${t.title}\n`;
         (t.rows || []).slice(0, 50).forEach((r: any) => {
             const vals = (r.cells || [])
                 .map((c: any) => c.value?.toString().trim())
                 .filter(Boolean);
             if (vals.length > 0) {
                 displayText += `- ${vals.join(" | ")}\n`;
             }
         });
     });
  } else {
      displayText += `## Displays & Scope\n`;
      if (details.screens?.length) {
          details.screens.forEach((s: any) => {
              displayText += `- **${s.name}** (Qty: ${s.quantity})\n`;
              displayText += `  Size: ${s.widthFt}ft x ${s.heightFt}ft | Pitch: ${s.pitchMm}mm\n`;
              s.lineItems?.forEach((li: any) => {
                  displayText += `  - ${li.category}: $${(li.price || 0).toLocaleString()}\n`;
              });
              displayText += "\n";
          });
      } else {
          displayText += `*No screens defined in layout.*\n`;
      }
  }

  displayText += `\n## Financials & Options\n`;
  if (details.subTotal) displayText += `**Subtotal**: $${details.subTotal.toLocaleString()}\n`;
  if (details.totalAmount) displayText += `**Total Amount**: $${details.totalAmount.toLocaleString()}\n`;
  
  if (details.paymentTerms) {
      displayText += `\n**Payment Terms**: ${details.paymentTerms}\n`;
  }
  
  if (details.customProposalNotes) {
      displayText += `\n**Notes**:\n${details.customProposalNotes}\n`;
  }

  return NextResponse.json({
      success: true,
      proposal_id: proposalId,
      client_name: details.receiver?.name || "",
      is_mirror_mode: mirrorModeActive,
      markdown_replica: displayText,
      // Pass the raw data anyway so the LLM can extract hidden fields if requested
      raw_form_data: details,
  }, { status: 200 });
}

export async function GET(request: NextRequest) {
  const authError = authorize(request);
  if (authError) return authError;
  const proposalId = request.nextUrl.searchParams.get("proposalId") || request.nextUrl.searchParams.get("proposal_id");
  return handleRequest(proposalId);
}

export async function POST(request: NextRequest) {
  const authError = authorize(request);
  if (authError) return authError;
  let body: { proposal_id?: string; proposalId?: string } = {};
  try {
    body = await request.json();
  } catch (e) {}
  return handleRequest(body.proposal_id || body.proposalId || null);
}
