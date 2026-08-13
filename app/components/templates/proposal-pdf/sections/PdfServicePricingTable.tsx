/**
 * PdfServicePricingTable — the client-facing service fee table.
 *
 * Matches Natalia's Ravens service-proposal format: ITEM column + one column
 * per contract year + a YEARLY TOTAL row. Values render exactly as the source
 * Excel displays them (mirror rule — text like "INCLUDED" survives verbatim).
 * Note rows (e.g. "*20% Bundle Discount Added") render as footnotes under the
 * table, never as fee lines.
 *
 * Dressed in the LED template's pricing-table styling (Natalia 2026-08-12:
 * "also want pricing table to match LED template") — rounded bordered card,
 * blue-underlined uppercase column heads, zebra rows, pale-blue total band.
 * The visual contract lives in PdfPricingTables; keep the two in step.
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

  // Column-head cell — uppercase, blue, thin blue rule beneath (LED look).
  const headCell: React.CSSProperties = {
    padding: "4px 12px",
    fontSize: "14px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: colors.primaryDark,
    borderBottom: `2px solid ${colors.primary}`,
  };
  const bodyCell: React.CSSProperties = {
    padding: "6px 12px",
    fontSize: "14px",
    borderTop: `1px solid ${colors.borderLight}`,
    color: colors.text,
  };
  const totalCell: React.CSSProperties = {
    padding: "6px 12px",
    fontSize: "14px",
    fontWeight: 700,
    borderTop: `1px solid ${colors.primary}`,
    color: colors.primaryDark,
    background: colors.primaryLight,
  };
  const rightAlign: React.CSSProperties = { textAlign: "right", whiteSpace: "nowrap" };

  return (
    <div
      data-preview-section="service-pricing"
      className="break-inside-avoid rounded-lg border overflow-hidden"
      style={{ borderColor: colors.border, breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", breakInside: "avoid", pageBreakInside: "avoid" }}>
        <thead>
          <tr>
            <th style={{ ...headCell, textAlign: "left" }}>Item</th>
            {document.yearLabels.map((label) => (
              <th key={label} style={{ ...headCell, ...rightAlign }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((row, idx) => (
            <tr
              key={`${row.sourceRow}-${row.label}`}
              style={{ background: idx % 2 === 1 ? colors.surface : colors.white }}
            >
              <td style={bodyCell}>{row.label}</td>
              {row.cells.map((cell, i) => (
                <td key={i} style={{ ...bodyCell, ...rightAlign, fontWeight: 600, color: colors.primaryDark }}>
                  {cell.display}
                </td>
              ))}
            </tr>
          ))}
          {document.totalRow && (
            <tr>
              <td style={{ ...totalCell, textTransform: "uppercase", letterSpacing: "0.03em" }}>Yearly Total:</td>
              {document.totalRow.cells.map((cell, i) => (
                <td key={i} style={{ ...totalCell, ...rightAlign }}>
                  {cell.display}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {notes.length > 0 && (
        <div style={{ padding: "6px 12px", background: colors.white }}>
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
