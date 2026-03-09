import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * POST /api/agent-skill/create-proposal
 *
 * Bridge endpoint for AnythingLLM agent skill → ANC Proposal Engine.
 * Creates a DB workspace record + proposal from simplified line items
 * collected during estimator chat sessions.
 * NOTE: Does NOT provision an AnythingLLM workspace — the estimator
 * is already chatting inside one when they trigger this skill.
 *
 * Auth: x-api-key header (AGENT_SKILL_API_KEY env var)
 *
 * Request body:
 * {
 *   client_name: string (required)
 *   project_name?: string (optional, defaults to "Budget for {client_name}")
 *   line_items: string | Array<{description: string, price: number}> (required)
 *   document_type?: "budget" | "proposal" | "loi" (default: "budget")
 *   notes?: string
 * }
 *
 * Response:
 * {
 *   success: true,
 *   project_url: string,
 *   project_id: string,
 *   summary: { client, items_count, total }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. API Key auth
    const apiKey = request.headers.get("x-api-key");
    const expectedKey = process.env.AGENT_SKILL_API_KEY;

    if (!expectedKey) {
      log.error("[AGENT-SKILL] AGENT_SKILL_API_KEY not configured");
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 503 }
      );
    }

    if (!apiKey || apiKey !== expectedKey) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    // 2. Parse body
    const body = await request.json();
    const clientName = body.client_name?.trim();
    const projectName = body.project_name?.trim() || `Budget for ${clientName}`;
    const documentType = (body.document_type || "budget").toUpperCase();
    const notes = body.notes?.trim() || "";

    if (!clientName) {
      return NextResponse.json(
        { error: "client_name is required" },
        { status: 400 }
      );
    }

    // Parse line_items — accept JSON string or array
    let lineItems: Array<{ description: string; price: number }>;
    try {
      lineItems = typeof body.line_items === "string"
        ? JSON.parse(body.line_items)
        : body.line_items;
    } catch {
      return NextResponse.json(
        { error: "line_items must be a valid JSON array of {description, price}" },
        { status: 400 }
      );
    }

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json(
        { error: "At least one line item is required" },
        { status: 400 }
      );
    }

    // 3. Map document_type to DocumentMode
    const documentMode = documentType === "PROPOSAL" ? "PROPOSAL"
      : documentType === "LOI" ? "LOI"
      : "BUDGET";

    // 4. Create workspace
    // Find or create a default user for agent-created proposals
    const agentUser = await prisma.user.upsert({
      where: { email: "agent@ancsports.com" },
      update: {},
      create: { email: "agent@ancsports.com", name: "AnythingLLM Agent" },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: projectName,
        users: { connect: { id: agentUser.id } },
      },
    });

    // 5. Calculate total
    const total = lineItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

    // 6. Build items array for the proposal (matches ProposalContext format)
    const proposalItems = lineItems.map((item, idx) => ({
      name: item.description || `Line Item ${idx + 1}`,
      description: item.description || "",
      quantity: 1,
      unitPrice: Number(item.price) || 0,
      total: Number(item.price) || 0,
    }));

    // 7. Create the proposal
    const proposal = await prisma.proposal.create({
      data: {
        workspaceId: workspace.id,
        clientName,
        status: "DRAFT",
        calculationMode: "INTELLIGENCE",
        createdByUserId: agentUser.id,
        documentMode,
        additionalNotes: notes,
        // Store line items as the pricingDocument for the PDF renderer
        pricingDocument: {
          source: "agent-skill",
          createdAt: new Date().toISOString(),
          lineItems: lineItems.map(item => ({
            description: item.description,
            price: Number(item.price) || 0,
          })),
          total,
        },
        // Also store as items JSON for the form/context
        clientSummary: JSON.stringify({
          items: proposalItems,
          subTotal: total,
          totalAmount: total,
          currency: "USD",
          documentMode,
        }),
      },
    });

    // 8. Build project URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://basheer-natalia.prd42b.easypanel.host";
    const projectUrl = `${baseUrl}/projects/${proposal.id}`;

    log.info(`[AGENT-SKILL] Created proposal ${proposal.id} for "${clientName}" — ${lineItems.length} items, $${total.toLocaleString()}`);

    return NextResponse.json({
      success: true,
      project_url: projectUrl,
      project_id: proposal.id,
      summary: {
        client: clientName,
        items_count: lineItems.length,
        total,
        document_type: documentMode,
      },
    }, { status: 201 });

  } catch (error) {
    log.error("[AGENT-SKILL] Create proposal failed:", error);
    return NextResponse.json(
      { error: "Failed to create proposal", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
