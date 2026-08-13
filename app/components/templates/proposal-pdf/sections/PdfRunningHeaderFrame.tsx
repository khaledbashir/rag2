/**
 * PdfRunningHeaderFrame — repeats the document header on every printed page.
 *
 * LED-family documents (Budget / Proposal / LOI / Change Order) carry a header
 * on continuation pages because those templates insert ContinuationPageHeader at
 * each of their explicit page breaks. Service documents flow continuously —
 * intro → scope → compensation → exhibits — so their page breaks fall wherever
 * the content lands and there is nowhere to hand-place a header. Page 2 onward
 * came out bare (Natalia 2026-08-12: "can service proposal template export with
 * header thats same as all other types?").
 *
 * The one mechanism Chrome honours for a running header is a repeated table
 * header group, so the document body is wrapped in a single-cell table whose
 * <thead> carries the real PdfHeader. Page 1 is unchanged; every continuation
 * page gets the identical header. Forced breaks inside the cell (term exhibits
 * use breakBefore: "page") still break — verified against the print pipeline.
 */
import React from "react";

interface PdfRunningHeaderFrameProps {
  /** The document header — rendered at the top of every page. */
  header: React.ReactNode;
  children: React.ReactNode;
}

// A repeated thead must not introduce borders or padding of its own; the header
// component owns its spacing exactly as it does when rendered standalone.
const cellStyle: React.CSSProperties = { padding: 0, border: "none", verticalAlign: "top" };

export default function PdfRunningHeaderFrame({ header, children }: PdfRunningHeaderFrameProps) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      {/* display is also set by the print stylesheet; inline keeps the preview
          and the PDF identical. */}
      <thead style={{ display: "table-header-group" }}>
        <tr>
          <td style={cellStyle}>{header}</td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={cellStyle}>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}
