/**
 * PdfTermExhibit — renders a single Service Contract term exhibit (header + body).
 *
 * Header style matches the existing legal-exhibit headers (blue bar + uppercase
 * tracking-wider label). Body is Markdown rendered verbatim via renderMarkdown
 * (react-markdown + remark-gfm), preserving all capitalization and all-caps.
 *
 * When `exhibitLetter` is empty, the header is just the title (inline section);
 * otherwise "Exhibit {letter} — {title}".
 */
import type { PdfColors } from "./shared";
import { renderMarkdown } from "@/lib/serviceContracts/renderMarkdown";

export interface PdfTermExhibitProps {
  colors: PdfColors;
  exhibitLetter: string;
  title: string;
  bodyMarkdown: string;
}

export default function PdfTermExhibit({ colors, exhibitLetter, title, bodyMarkdown }: PdfTermExhibitProps) {
  const label = exhibitLetter ? `Exhibit ${exhibitLetter} — ${title}` : title;
  return (
    <div className="px-6">
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
        <div style={{ width: "3px", height: "14px", borderRadius: "1px", background: colors.primary, flexShrink: 0 }} />
        <span className="text-[14px] font-bold uppercase tracking-wider" style={{ color: colors.primaryDark }}>
          {label}
        </span>
      </div>
      <div className="text-[12px] leading-relaxed" style={{ color: colors.text }}>
        {renderMarkdown(bodyMarkdown)}
      </div>
    </div>
  );
}