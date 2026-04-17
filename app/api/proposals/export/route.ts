import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { Builder as XMLBuilder } from "xml2js";
import { logActivity } from "@/services/proposal/server/activityLogService";
import { log } from "@/lib/logger";
import { resolveExchangeRate, roundToDisplay } from "@/lib/pricingMath";

/**
 * XLSX export is the only format that represents what the user sees on the
 * PDF — JSON/CSV/XML are machine-facing and stay USD-native. Fields enumerated
 * here are the numeric amounts on `details` and on each `item` that need to
 * be scaled by the proposal's exchange rate when currency ≠ USD.
 */
const XLSX_SCALE_DETAILS_FIELDS = ["subTotal", "totalAmount"] as const;
const XLSX_SCALE_ITEM_FIELDS = ["unitPrice", "total"] as const;

function scaleDetailsAndItemsForXlsx(details: Record<string, any>, items: Record<string, any>[], fx: number): { details: Record<string, any>; items: Record<string, any>[] } {
  if (fx === 1) return { details, items };

  const scaledDetails = { ...details };
  for (const field of XLSX_SCALE_DETAILS_FIELDS) {
    const value = scaledDetails[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      scaledDetails[field] = roundToDisplay(value * fx);
    }
  }

  const scaledItems = items.map((item) => {
    const next = { ...item };
    for (const field of XLSX_SCALE_ITEM_FIELDS) {
      const value = next[field];
      if (typeof value === "number" && Number.isFinite(value)) {
        next[field] = roundToDisplay(value * fx);
      }
    }
    return next;
  });

  return { details: scaledDetails, items: scaledItems };
}

// REQ-125: Sanitization Denylist - fields that must NEVER appear in client exports
const SANITIZATION_DENYLIST = [
  'internalAudit',
  'cost',
  'margin',
  'desiredMargin',
  'ancMargin',
  'marginAmount',
  'totalCost',
  'hardwareCost',
  'laborCost',
  'structureCost',
  'installCost',
  'shippingCost',
  'costPerSqFt',
  'ledCostPerSqFt',
  'structuralTonnage',
  'reinforcingTonnage',
  'bondRateOverride',
  'taxRateOverride',
  'costBasis',
  'marginValue',
];

// Deep clone and sanitize data for client-facing exports
function sanitizeForExport(data: any): any {
  // Deep clone to avoid mutating original
  const clone = JSON.parse(JSON.stringify(data));

  // Recursively remove denylist fields
  function stripFields(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(stripFields);
    }
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!SANITIZATION_DENYLIST.includes(key)) {
          sanitized[key] = stripFields(value);
        }
      }
      return sanitized;
    }
    return obj;
  }

  return stripFields(clone);
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "JSON").toUpperCase();
    // REQ-125: Check if this is an internal (admin/finance) export
    const isInternalExport = url.searchParams.get("internal") === "true";
    const body = await req.json();
    const proposalId = body.details?.proposalId;

    // --- NATALIA GATEKEEPER: AI Verification Guardrail ---
    if (proposalId && proposalId !== "new") {
      const dbProposal = await prisma.proposal.findUnique({
        where: { id: proposalId },
        select: { aiFilledFields: true, verifiedFields: true }
      });

      if (dbProposal) {
        const aiFilledFields = (dbProposal.aiFilledFields as string[]) || [];
        const verifiedFields = (dbProposal.verifiedFields as Record<string, any>) || {};
        const unverifiedFields = aiFilledFields.filter(f => !verifiedFields[f]);

        if (unverifiedFields.length > 0) {
          return NextResponse.json({
            error: "AI Guardrail Block: This proposal contains unverified AI data.",
            code: "UNVERIFIED_AI_DATA",
            blockingFields: unverifiedFields
          }, { status: 422 });
        }
      }
    }
    // ---------------------------------------------------

    // Log data export activity
    if (proposalId && proposalId !== "new") {
      logActivity(
        proposalId,
        "data_exported",
        `Exported proposal as ${format}`,
        null,
        { format, isInternal: isInternalExport },
      ).catch((err) => log.error("[Export] Activity log failed:", err));
    }

    // REQ-125: Sanitize data unless explicitly marked as internal export
    const sanitizedBody = isInternalExport ? body : sanitizeForExport(body);

    // Basic normalization: include details and items
    const details = sanitizedBody.details || {};
    const items = details.items || [];

    if (format === "JSON") {
      return NextResponse.json(sanitizedBody, { status: 200 });
    }

    if (format === "CSV") {
      // Simple CSV serializer to avoid dependency issues in different builds
      const rows = items || [];
      if (rows.length === 0) {
        return new Response("", {
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename=proposal-${details.proposalId || "export"}.csv`,
          },
        });
      }
      const keys = Object.keys(rows[0]);
      const escape = (v: any) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const csv = [keys.join(","), ...rows.map((r: any) => keys.map((k) => escape(r[k])).join(","))].join("\n");
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=proposal-${details.proposalId || "export"}.csv`,
        },
      });
    }

    if (format === "XML") {
      const builder = new XMLBuilder({ headless: true, renderOpts: { pretty: true } });
      const xml = builder.buildObject({ proposal: { details, items } });
      return new Response(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml",
          "Content-Disposition": `attachment; filename=proposal-${details.proposalId || "export"}.xml`,
        },
      });
    }

    if (format === "XLSX") {
      const fx = resolveExchangeRate(details.exchangeRate);
      const { details: xlsxDetails, items: xlsxItems } = scaleDetailsAndItemsForXlsx(details, items, fx);

      const wb = XLSX.utils.book_new();
      const wsDetails = XLSX.utils.json_to_sheet([xlsxDetails]);
      XLSX.utils.book_append_sheet(wb, wsDetails, "Details");

      if (xlsxItems.length > 0) {
        const wsItems = XLSX.utils.json_to_sheet(xlsxItems);
        XLSX.utils.book_append_sheet(wb, wsItems, "Items");
      }

      const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename=proposal-${details.proposalId || "export"}.xlsx`,
        },
      });
    }

    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  } catch (err) {
    log.error("Export error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}