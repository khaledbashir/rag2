/**
 * PdfFreeformTables — renders user-built free-form pricing tables (Priority 1-tied).
 *
 * Renders each table as a titled section with a real <table> (variable columns):
 * header row = column labels; body = row cells; optional bold totals row that
 * sums `number` columns. Number cells are right-aligned and formatted as USD;
 * text cells are left-aligned. Styled to match the other proposal-pdf sections
 * (blue-bar section header, Arial, 12px body).
 *
 * Structured data in → structured render; a future DOCX generator consumes the
 * same FreeformTable model.
 */
import React from "react";
import type { PdfColors } from "./shared";
import type { FreeformTable } from "@/lib/freeformTables/types";
import { columnTotal, formatCurrency } from "@/lib/freeformTables/resolve";

interface PdfFreeformTablesProps {
  colors: PdfColors;
  tables: FreeformTable[];
}

function isNumeric(val: string): boolean {
  const raw = (val ?? "").toString().trim();
  return raw !== "" && Number.isFinite(Number(raw));
}

export default function PdfFreeformTables({ colors, tables }: PdfFreeformTablesProps) {
  if (!tables || tables.length === 0) return null;
  const renderable = tables.filter((t) => t.columns && t.columns.length > 0);
  if (renderable.length === 0) return null;

  return (
    <div data-preview-section="freeform-tables" className="px-6 space-y-6">
      {renderable.map((table) => {
        if (!table.columns || table.columns.length === 0) return null;
        return (
          <div key={table.id} className="break-inside-avoid">
            {/* Section header — blue bar + table name */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <div style={{ width: "3px", height: "14px", borderRadius: "1px", background: colors.primary, flexShrink: 0 }} />
              <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>
                {table.name || "Pricing"}
              </span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr>
                  {table.columns.map((col) => (
                    <th
                      key={col.id}
                      style={{
                        textAlign: col.type === "number" ? "right" : "left",
                        padding: "6px 10px",
                        borderBottom: `1px solid ${colors.primary}`,
                        color: colors.primaryDark,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        fontSize: "11px",
                      }}
                    >
                      {col.label || " "}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.id}>
                    {table.columns.map((col) => {
                      const raw = (row.cells?.[col.id] ?? "").toString();
                      const isNum = col.type === "number" && isNumeric(raw);
                      return (
                        <td
                          key={col.id}
                          style={{
                            textAlign: col.type === "number" ? "right" : "left",
                            padding: "6px 10px",
                            borderBottom: `1px solid ${colors.primaryLight}`,
                            color: colors.text,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {isNum ? formatCurrency(Number(raw)) : raw}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {table.showTotalsRow && (
                  <tr>
                    {table.columns.map((col, idx) => {
                      const isFirst = idx === 0;
                      if (col.type !== "number") {
                        return (
                          <td
                            key={col.id}
                            style={{
                              textAlign: "left",
                              padding: "6px 10px",
                              borderTop: `1.5px solid ${colors.primary}`,
                              color: colors.primaryDark,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              fontSize: "11px",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {isFirst ? "Total" : ""}
                          </td>
                        );
                      }
                      const total = columnTotal(table, col.id);
                      return (
                        <td
                          key={col.id}
                          style={{
                            textAlign: "right",
                            padding: "6px 10px",
                            borderTop: `1.5px solid ${colors.primary}`,
                            color: colors.primaryDark,
                            fontWeight: 700,
                            fontSize: "12px",
                          }}
                        >
                          {formatCurrency(total)}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}