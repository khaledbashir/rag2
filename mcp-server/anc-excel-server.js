#!/usr/bin/env node
/**
 * ANC Excel MCP Server — Zero-dependency MCP server for AnythingLLM
 *
 * Exposes two tools:
 *   1. create_proposal — Creates a proposal in the ANC app, returns project URL
 *   2. generate_excel  — Generates a branded Excel workbook, returns download URL
 *
 * Transport: stdio (JSON-RPC over stdin/stdout)
 * Deploy: Copy to AnythingLLM container, configure in anythingllm_mcp_servers.json
 */

const ANC_BASE_URL = process.env.ANC_BASE_URL || "https://proposals.anc.com";
const ANC_API_KEY = process.env.ANC_API_KEY || "";

// ─── MCP Protocol Handler ────────────────────────────────────────────

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  // MCP uses Content-Length header framing OR newline-delimited JSON
  // AnythingLLM's MCPHypervisor uses the SDK which uses stdio with header framing
  processBuffer();
});

process.stdin.on("end", () => process.exit(0));

function processBuffer() {
  // Handle Content-Length framing (standard MCP stdio transport)
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = buffer.substring(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      // Try newline-delimited fallback
      const nlIdx = buffer.indexOf("\n");
      if (nlIdx === -1) break;
      const line = buffer.substring(0, nlIdx).trim();
      buffer = buffer.substring(nlIdx + 1);
      if (line) {
        try {
          handleMessage(JSON.parse(line));
        } catch (e) {
          // skip malformed
        }
      }
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer.substring(bodyStart, bodyStart + contentLength);
    buffer = buffer.substring(bodyStart + contentLength);

    try {
      handleMessage(JSON.parse(body));
    } catch (e) {
      sendError(null, -32700, "Parse error: " + e.message);
    }
  }
}

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result });
  const out = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`;
  process.stdout.write(out);
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  const out = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`;
  process.stdout.write(out);
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
  const out = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`;
  process.stdout.write(out);
}

// ─── Message Router ──────────────────────────────────────────────────

function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "anc-excel-server",
          version: "1.0.0",
        },
      });
      break;

    case "notifications/initialized":
      // Client acknowledged — no response needed
      break;

    case "tools/list":
      sendResponse(id, { tools: TOOLS });
      break;

    case "tools/call":
      handleToolCall(id, params).catch((err) => {
        sendError(id, -32000, err.message);
      });
      break;

    case "ping":
      sendResponse(id, {});
      break;

    default:
      if (id !== undefined) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
      break;
  }
}

// ─── Tool Definitions ────────────────────────────────────────────────

const TOOLS = [
  {
    name: "generate_excel",
    description:
      "Generates a branded multi-sheet Excel workbook (Executive Summary, Display Specs, Margin Waterfall) from project pricing data. Returns a download URL. Use this when the user asks for an Excel, spreadsheet, export, or download of their estimate.",
    inputSchema: {
      type: "object",
      properties: {
        project_name: {
          type: "string",
          description: "Project name (e.g., 'High School Gym Indoor Marquee')",
        },
        date: {
          type: "string",
          description: "Estimate date (YYYY-MM-DD)",
        },
        estimate_type: {
          type: "string",
          description: "Type: Budget Estimate, ROM Budget, or Proposal",
        },
        currency: {
          type: "string",
          description: "Currency code (default: USD)",
        },
        displays: {
          type: "array",
          description: "Array of display objects with: name, cost, selling_price, margin_dollars, margin_pct, details (object with specs)",
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
          description: "Array of service objects with: category, cost, selling_price, margin_dollars, margin_pct",
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
        grand_total_cost: { type: "number", description: "Total cost" },
        grand_total_selling: { type: "number", description: "Total selling price" },
        grand_total_margin: { type: "number", description: "Total margin dollars" },
        grand_total_margin_pct: { type: "number", description: "Margin percentage" },
      },
      required: ["project_name", "displays"],
    },
  },
  {
    name: "create_proposal",
    description:
      "Creates a proposal/budget document in the ANC Proposal Engine app. Returns a project URL where the user can view, edit, and export. Use when the user asks to create, save, or generate a proposal.",
    inputSchema: {
      type: "object",
      properties: {
        client_name: {
          type: "string",
          description: "Client or venue name",
        },
        project_name: {
          type: "string",
          description: "Optional project name",
        },
        line_items: {
          type: "array",
          description: "Array of {description, price} objects",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              price: { type: "number" },
            },
            required: ["description", "price"],
          },
        },
        document_type: {
          type: "string",
          enum: ["budget", "proposal", "loi"],
          description: "Document type (default: budget)",
        },
        notes: {
          type: "string",
          description: "Optional notes",
        },
      },
      required: ["client_name", "line_items"],
    },
  },
];

// ─── Tool Execution ──────────────────────────────────────────────────

async function handleToolCall(id, params) {
  const { name, arguments: args } = params;

  if (name === "generate_excel") {
    const result = await callGenerateExcel(args);
    sendResponse(id, {
      content: [{ type: "text", text: result }],
    });
  } else if (name === "create_proposal") {
    const result = await callCreateProposal(args);
    sendResponse(id, {
      content: [{ type: "text", text: result }],
    });
  } else {
    sendError(id, -32602, `Unknown tool: ${name}`);
  }
}

async function callGenerateExcel(data) {
  const url = `${ANC_BASE_URL}/api/agent-skill/generate-excel`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return `Error ${resp.status}: ${text || "Failed to generate Excel"}`;
  }

  const result = await resp.json();
  if (!result.success) {
    return `Error: ${result.error || "Generation failed"}`;
  }

  return `Excel generated successfully!\n\nDownload: ${result.download_url}\n\nProject: ${data.project_name}\nSheets: Executive Summary, Display Specifications, Margin Waterfall`;
}

async function callCreateProposal(data) {
  const url = `${ANC_BASE_URL}/api/agent-skill/create-proposal`;

  const headers = { "Content-Type": "application/json" };
  if (ANC_API_KEY) headers["x-api-key"] = ANC_API_KEY;

  const resp = await fetch(url, {
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
    const text = await resp.text().catch(() => "");
    return `Error ${resp.status}: ${text || "Failed to create proposal"}`;
  }

  const result = await resp.json();
  if (!result.success) {
    return `Error: ${result.error || "Creation failed"}`;
  }

  return `Proposal created!\n\nProject URL: ${result.project_url}\nClient: ${result.summary.client}\nItems: ${result.summary.items_count}\nTotal: $${result.summary.total.toLocaleString()}`;
}

// Keep process alive
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
