/** Render manual proposal tables exactly as typed, with visual-only row roles. */
import React from "react";
import type { PdfColors } from "./shared";
import type { FreeformRowStyle, FreeformTable } from "@/lib/freeformTables/types";
import { normalizeTable } from "@/lib/freeformTables/resolve";

interface PdfFreeformTablesProps {
  colors: PdfColors;
  tables: FreeformTable[];
}

function rowCellStyle(
  rowStyle: FreeformRowStyle,
  colors: PdfColors,
  alignment: "left" | "center" | "right",
): React.CSSProperties {
  const base: React.CSSProperties = {
    textAlign: alignment,
    padding: "6px 10px",
    color: colors.text,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    borderBottom: `1px solid ${colors.primaryLight}`,
  };

  if (rowStyle === "header") {
    return {
      ...base,
      color: colors.primaryDark,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      fontSize: "11px",
      borderTop: `1px solid ${colors.primary}`,
      borderBottom: `1.5px solid ${colors.primary}`,
    };
  }

  if (rowStyle === "subtotal") {
    return {
      ...base,
      fontWeight: 700,
      borderTop: "2px solid #d1d5db",
      borderBottom: "1px solid #d1d5db",
    };
  }

  // Tax and Bond are adjustment lines: they sit under the subtotal and read
  // quieter than it, matching the VAT line on ANC's existing pricing tables.
  if (rowStyle === "tax" || rowStyle === "bond") {
    return {
      ...base,
      color: colors.textMuted,
      fontSize: "11px",
      borderBottom: `1px solid ${colors.borderLight}`,
    };
  }

  if (rowStyle === "grand-total") {
    return {
      ...base,
      color: colors.primaryDark,
      background: colors.primaryLight,
      fontWeight: 700,
      textTransform: "uppercase",
      borderTop: `1.5px solid ${colors.primary}`,
      borderBottom: `1.5px solid ${colors.primary}`,
    };
  }

  return base;
}

export default function PdfFreeformTables({ colors, tables }: PdfFreeformTablesProps) {
  const renderable = (tables || [])
    .map(normalizeTable)
    .filter((table) => table.columns.length > 0 && table.rows.length > 0);
  if (renderable.length === 0) return null;

  return (
    <div data-preview-section="freeform-tables" className="px-6 space-y-6">
      {renderable.map((table) => (
        <div key={table.id} className="break-inside-avoid" style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
            <div style={{ width: "3px", height: "14px", borderRadius: "1px", background: colors.primary, flexShrink: 0 }} />
            <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>
              {table.name || "Proposal Table"}
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <tbody>
              {table.rows.map((row) => {
                const visualStyle = row.style ?? "normal";
                return (
                  <tr key={row.id} data-row-style={visualStyle}>
                    {table.columns.map((column) => (
                      <td
                        key={column.id}
                        style={rowCellStyle(visualStyle, colors, column.align ?? "left")}
                      >
                        {(row.cells?.[column.id] ?? "").toString()}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
