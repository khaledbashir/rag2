/**
 * Rich body text for editable document sections — Notes, Scope of Services,
 * Intro, Compensation and the Service Contract's responsibility/term blocks.
 *
 * Natalia 2026-07-30: "is it possible to make notes, scope etc text boxes to
 * have bullet points, bold etc? more dynamic text?" These blocks were plain
 * `whitespace-pre-wrap` divs, so a typed hyphen stayed a hyphen and there was
 * no way to bold a line.
 *
 * Markdown was already the format for term exhibits (see
 * lib/serviceContracts/renderMarkdown.tsx), so the same source format is reused
 * here rather than introducing a second one. The editor writes it through
 * formatting buttons, so nobody has to know the syntax.
 *
 * Two rules this file exists to honour:
 *
 * 1. EXISTING DOCUMENTS MUST NOT SHIFT. Every saved override today is plain
 *    text whose single newlines are line breaks. Markdown would normally fold
 *    those into one paragraph. Instead of adding a breaks plugin, paragraphs
 *    keep `white-space: pre-wrap` — remark leaves the newline in the text node,
 *    so it renders exactly as it does today, and text with no Markdown in it is
 *    byte-for-byte unchanged.
 *
 * 2. STYLES MUST BE INLINE. This renders inside the Puppeteer PDF pipeline,
 *    which pulls Tailwind from a CDN that can fail — class-only rules are
 *    silently dropped there (same lesson as the break-inside fix, 2026-07-28).
 *    Bullets and bold must survive that, so nothing structural relies on a class.
 */
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** True when the text uses any formatting this renderer would act on. */
export function hasRichFormatting(text: string): boolean {
  const src = (text ?? "").trim();
  if (!src) return false;
  return src.split("\n").some((line) => {
    const l = line.trimStart();
    return (
      /^[-*+]\s+\S/.test(l) ||        // bullet list
      /^\d+[.)]\s+\S/.test(l) ||      // numbered list
      /\*\*[^*]+\*\*/.test(l) ||      // bold
      /(^|\s)_[^_]+_(\s|$)/.test(l)   // italic
    );
  });
}

const components: Components = {
  // pre-wrap keeps single newlines rendering as line breaks, matching the
  // plain-text block this replaces.
  p: ({ children }) => (
    <p style={{ margin: "0 0 10px", textAlign: "justify", whiteSpace: "pre-wrap" }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul style={{ listStyleType: "disc", paddingLeft: "20px", margin: "0 0 10px" }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ listStyleType: "decimal", paddingLeft: "20px", margin: "0 0 10px" }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ margin: "0 0 3px" }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
  em: ({ children }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
  a: ({ children }) => <span>{children}</span>,
  // A section already renders its own styled blue header; a stray "#" in the
  // body must not produce a competing heading.
  h1: ({ children }) => <p style={{ margin: "0 0 10px", fontWeight: 700 }}>{children}</p>,
  h2: ({ children }) => <p style={{ margin: "0 0 10px", fontWeight: 700 }}>{children}</p>,
  h3: ({ children }) => <p style={{ margin: "0 0 10px", fontWeight: 700 }}>{children}</p>,
};

/**
 * Renders an editable section body. Plain text renders exactly as before;
 * Markdown adds bullets, numbering and bold.
 */
export function PdfRichBody({ text, className }: { text: string; className?: string }) {
  const src = (text ?? "").trim();
  if (!src) return null;

  // No formatting markers → keep the original plain-text path untouched. This
  // is what guarantees every existing document renders identically.
  if (!hasRichFormatting(src)) {
    return (
      <div
        className={className ?? "mb-3 whitespace-pre-wrap text-justify"}
        style={{ whiteSpace: "pre-wrap", textAlign: "justify" }}
      >
        {text}
      </div>
    );
  }

  return (
    <div className={className ?? "mb-3"} style={{ marginBottom: "12px" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {src}
      </ReactMarkdown>
    </div>
  );
}

export default PdfRichBody;
