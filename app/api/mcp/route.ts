import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";

/**
 * POST /api/mcp
 *
 * Streamable HTTP MCP Server for AnythingLLM.
 * Handles JSON-RPC messages for tool discovery and execution.
 *
 * Config in AnythingLLM:
 * {
 *   "mcpServers": {
 *     "anc-excel": {
 *       "type": "streamable",
 *       "url": "https://basheer-therag2.prd42b.easypanel.host/api/mcp"
 *     }
 *   }
 * }
 */

const ANC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://basheer-therag2.prd42b.easypanel.host";
const ANC_API_KEY = process.env.AGENT_SKILL_API_KEY || "";

const TOOLS = [
  {
    name: "generate_excel",
    description:
      "Generates a branded Excel workbook with margin analysis. Returns a download URL. Use when the user asks for Excel, spreadsheet, export, or download.",
    inputSchema: {
      type: "object",
      properties: {
        project_name: { type: "string", description: "Project name" },
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
        estimate_type: { type: "string", description: "Budget Estimate, ROM Budget, or Proposal" },
        currency: { type: "string", description: "Currency (default: USD)" },
        displays: {
          type: "array",
          description: "Display objects: name, cost, selling_price, margin_dollars, margin_pct, details",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              cost: { type: "number" },
              selling_price: { type: "number" },
              margin_dollars: { type: "number" },
              margin_pct: { type: "number" },
              details: { type: "object" },
            },
            required: ["name", "cost", "selling_price"],
          },
        },
        services: {
          type: "array",
          description: "Service objects: category, cost, selling_price, margin_dollars, margin_pct",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              cost: { type: "number" },
              selling_price: { type: "number" },
              margin_dollars: { type: "number" },
              margin_pct: { type: "number" },
            },
          },
        },
        grand_total_cost: { type: "number" },
        grand_total_selling: { type: "number" },
        grand_total_margin: { type: "number" },
        grand_total_margin_pct: { type: "number" },
      },
      required: ["project_name", "displays"],
    },
  },
  {
    name: "create_proposal",
    description:
      "Creates a proposal in the ANC app. Returns the project URL. Use when user asks to create, save, or generate a proposal.",
    inputSchema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client or venue name" },
        project_name: { type: "string", description: "Optional project name" },
        line_items: {
          type: "array",
          description: "Array of {description, price}",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              price: { type: "number" },
            },
            required: ["description", "price"],
          },
        },
        document_type: { type: "string", enum: ["budget", "proposal", "loi"] },
        notes: { type: "string" },
      },
      required: ["client_name", "line_items"],
    },
  },
];

function jsonrpc(id: string | number | null, result: any) {
  return { jsonrpc: "2.0", id, result };
}

function jsonrpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function POST(request: NextRequest) {
  try {
    const msg = await request.json();
    const { id, method, params } = msg;

    // Handle JSON-RPC methods
    switch (method) {
      case "initialize":
        return NextResponse.json(
          jsonrpc(id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "anc-excel-server", version: "1.0.0" },
          })
        );

      case "notifications/initialized":
        return new NextResponse(null, { status: 204 });

      case "tools/list":
        return NextResponse.json(jsonrpc(id, { tools: TOOLS }));

      case "tools/call": {
        const { name, arguments: args } = params;
        let text: string;

        if (name === "generate_excel") {
          text = await callGenerateExcel(args);
        } else if (name === "create_proposal") {
          text = await callCreateProposal(args);
        } else {
          return NextResponse.json(jsonrpcError(id, -32602, `Unknown tool: ${name}`));
        }

        return NextResponse.json(
          jsonrpc(id, { content: [{ type: "text", text }] })
        );
      }

      case "ping":
        return NextResponse.json(jsonrpc(id, {}));

      default:
        return NextResponse.json(jsonrpcError(id, -32601, `Method not found: ${method}`));
    }
  } catch (error) {
    log.error("[MCP] Error:", error);
    return NextResponse.json(
      jsonrpcError(null, -32000, error instanceof Error ? error.message : "Internal error"),
      { status: 500 }
    );
  }
}

// Also handle GET for SSE transport (initial connection)
export async function GET() {
  // For SSE transport, return the endpoint URL
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: endpoint\ndata: /api/mcp\n\n`));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ─── Tool Implementations ────────────────────────────────────────────

async function callGenerateExcel(data: any): Promise<string> {
  try {
    const resp = await fetch(`${ANC_BASE_URL}/api/agent-skill/generate-excel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      return `Error ${resp.status}: Failed to generate Excel`;
    }

    const result = await resp.json();
    if (!result.success) {
      return `Error: ${result.error || "Generation failed"}`;
    }

    return `Excel ready!\n\nDownload: ${result.download_url}\n\nProject: ${data.project_name}\nSheets: Executive Summary, Display Specs, Margin Waterfall`;
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : "Network error"}`;
  }
}

async function callCreateProposal(data: any): Promise<string> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ANC_API_KEY) headers["x-api-key"] = ANC_API_KEY;

    const resp = await fetch(`${ANC_BASE_URL}/api/agent-skill/create-proposal`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        client_name: data.client_name,
        project_name: data.project_name,
        line_items: data.line_items,
        document_type: data.document_type || "budget",
        notes: data.notes,
      }),
    });

    if (!resp.ok) {
      return `Error ${resp.status}: Failed to create proposal`;
    }

    const result = await resp.json();
    if (!result.success) {
      return `Error: ${result.error || "Creation failed"}`;
    }

    return `Proposal created!\n\nURL: ${result.project_url}\nClient: ${result.summary.client}\nItems: ${result.summary.items_count}\nTotal: $${result.summary.total.toLocaleString()}`;
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : "Network error"}`;
  }
}
