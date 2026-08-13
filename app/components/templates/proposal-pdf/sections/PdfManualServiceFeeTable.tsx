/**
 * PdfManualServiceFeeTable — the hand-entered Contract Year fee schedule used by
 * a Service Contract when no service sheet has been imported.
 *
 * The fee column is the fee for a whole Contract Year, payable as one lump sum
 * (Natalia 2026-08-12: "for service contract, please make mass update to call
 * yearly fee"). It was labelled "Monthly Service Fee" — inherited from the
 * Ravens source document, which billed the annual fee in six installments.
 * The archival verbatim reproduction in PdfServiceAgreement keeps the old
 * wording; this is the component that prints in a live contract.
 *
 * Styled to the LED template's pricing tables (see PdfPricingTables) so both
 * document families read as one product.
 */
import React from "react";

import type { PdfColors } from "./shared";
import type { ServiceAgreementFeeRow } from "./PdfServiceAgreement";

interface PdfManualServiceFeeTableProps {
  colors: PdfColors;
  rows: ServiceAgreementFeeRow[];
}

const blankRows: ServiceAgreementFeeRow[] = [
  { contractYear: "Contract Year 1", monthlyFee: "" },
  { contractYear: "Contract Year 2", monthlyFee: "" },
  { contractYear: "Contract Year 3", monthlyFee: "" },
];

export function normalizeManualServiceFeeRows(rows: unknown): ServiceAgreementFeeRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      contractYear: String((row as ServiceAgreementFeeRow)?.contractYear ?? "").trim(),
      monthlyFee: String((row as ServiceAgreementFeeRow)?.monthlyFee ?? "").trim(),
    }))
    .filter((row) => row.contractYear || row.monthlyFee);
}

export default function PdfManualServiceFeeTable({ colors, rows }: PdfManualServiceFeeTableProps) {
  const displayRows = rows.length > 0 ? rows : blankRows;

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

  return (
    <div
      data-preview-section="service-fee-schedule"
      className="break-inside-avoid rounded-lg border overflow-hidden"
      style={{ borderColor: colors.border, margin: "6px 0 12px", breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", breakInside: "avoid", pageBreakInside: "avoid" }}>
        <thead>
          <tr>
            <th style={{ ...headCell, textAlign: "left" }}>Contract Year</th>
            <th style={{ ...headCell, textAlign: "right" }}>Yearly Service Fee</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, idx) => (
            <tr key={`${row.contractYear}-${idx}`} style={{ background: idx % 2 === 1 ? colors.surface : colors.white }}>
              <td style={bodyCell}>{row.contractYear || `Contract Year ${idx + 1}`}</td>
              <td
                style={{
                  ...bodyCell,
                  textAlign: "right",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                  color: colors.primaryDark,
                }}
              >
                {row.monthlyFee || "________"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
