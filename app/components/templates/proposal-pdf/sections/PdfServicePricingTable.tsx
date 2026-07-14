/**
 * PdfServicePricingTable — the client-facing service fee table.
 *
 * Matches Natalia's Ravens service-proposal format: ITEM column + one column
 * per contract year + a YEARLY TOTAL row. Values render exactly as the source
 * Excel displays them (mirror rule — text like "INCLUDED" survives verbatim).
 * Note rows (e.g. "*20% Bundle Discount Added") render as footnotes under the
 * table, never as fee lines.
 */
import React from "react";

import type { PdfColors } from "./shared";
import type { ServicePricingDocument } from "@/types/servicePricing";

interface PdfServicePricingTableProps {
  colors: PdfColors;
  document: ServicePricingDocument;
}

export default function PdfServicePricingTable({ colors, document }: PdfServicePricingTableProps) {
  const lines = document.rows.filter((r) => r.kind === "line");
  const notes = document.rows.filter((r) => r.kind === "note");

  const cellBase: React.CSSProperties = {
    padding: "6px 10px",
    borderBottom: `1px solid ${colors.border}`,
    fontSize: "12px",
  };
  const yearCell: React.CSSProperties = { ...cellBase, textAlign: "right", whiteSpace: "nowrap" };

  return (
    <div data-preview-section="service-pricing" className="break-inside-avoid">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th
              style={{
                ...cellBase,
                textAlign: "left",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                borderTop: `2px solid ${colors.text}`,
                borderBottom: `2px solid ${colors.text}`,
                color: colors.text,
              }}
            >
              Item
            </th>
            {document.yearLabels.map((label) => (
              <th
                key={label}
                style={{
                  ...yearCell,
                  fontWeight: 700,
                  borderTop: `2px solid ${colors.text}`,
                  borderBottom: `2px solid ${colors.text}`,
                  color: colors.text,
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((row, idx) => (
            <tr key={`${row.sourceRow}-${row.label}`} style={idx % 2 === 1 ? { background: "rgba(0,0,0,0.03)" } : undefined}>
              <td style={{ ...cellBase, color: colors.text }}>{row.label}</td>
              {row.cells.map((cell, i) => (
                <td key={i} style={{ ...yearCell, color: colors.text }}>
                  {cell.display}
                </td>
              ))}
            </tr>
          ))}
          {document.totalRow && (
            <tr>
              <td
                style={{
                  ...cellBase,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  borderTop: `2px solid ${colors.text}`,
                  borderBottom: `2px solid ${colors.text}`,
                  color: colors.text,
                }}
              >
                Yearly Total:
              </td>
              {document.totalRow.cells.map((cell, i) => (
                <td
                  key={i}
                  style={{
                    ...yearCell,
                    fontWeight: 700,
                    borderTop: `2px solid ${colors.text}`,
                    borderBottom: `2px solid ${colors.text}`,
                    color: colors.text,
                  }}
                >
                  {cell.display}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {notes.length > 0 && (
        <div style={{ marginTop: "6px" }}>
          {notes.map((note) => (
            <p key={note.sourceRow} className="text-[11px] italic" style={{ color: colors.textMuted, margin: "2px 0" }}>
              {note.label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
