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

  return (
    <table style={{ borderCollapse: "collapse", fontSize: "11px", margin: "6px 0 12px", minWidth: "260px" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "3px 18px 3px 0", fontWeight: 700, borderBottom: `1px solid ${colors.text}` }}>
            Contract Year
          </th>
          <th style={{ textAlign: "left", padding: "3px 0", fontWeight: 700, borderBottom: `1px solid ${colors.text}` }}>
            Monthly Service Fee
          </th>
        </tr>
      </thead>
      <tbody>
        {displayRows.map((row, idx) => (
          <tr key={`${row.contractYear}-${idx}`}>
            <td style={{ padding: "4px 18px 4px 0", color: colors.text }}>{row.contractYear || `Contract Year ${idx + 1}`}</td>
            <td style={{ padding: "4px 0", color: colors.text }}>{row.monthlyFee || "________"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
