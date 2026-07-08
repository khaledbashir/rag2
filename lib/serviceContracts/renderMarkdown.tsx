/**
 * Minimal Markdown → React renderer for Service Contract term exhibits.
 *
 * Scope is deliberately small: it covers exactly what ANC's legal terms use —
 * paragraphs, ordered lists ("1. ..."), unordered lists ("- ..."), inline bold
 * ("**bold**"), and hard line breaks. All text is preserved VERBATIM — no case
 * changes, no trimming of all-caps, no smart-quotes. This keeps legal language
 * byte-identical to the source (Natalia's hard rule) and keeps the output
 * structured enough that a future DOCX generator can consume the same Markdown.
 *
 * No external dependency is introduced.
 */
import React from "react";

/** Split inline bold (**x**) into <strong> spans, preserving everything else. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`${keyPrefix}-b${i++}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

/**
 * Render a Markdown string into a styled React fragment. Block-level structure:
 * blocks separated by a blank line. A block is an ordered list, an unordered
 * list, or a paragraph. Multiple consecutive non-blank lines without a list
 * marker form a single paragraph joined by <br/>.
 */
export function renderMarkdown(md: string): React.ReactNode {
  const src = (md ?? "").replace(/\r\n/g, "\n");
  if (!src.trim()) return null;

  const blocks = src.split(/\n\s*\n/);
  const out: React.ReactNode[] = [];
  let key = 0;

  for (const block of blocks) {
    const lines = block.split("\n");
    const ordered = lines.every((l) => /^\s*\d+\.\s+/.test(l) && l.trim().length > 0);
    const unordered = lines.every((l) => /^\s*[-]\s+/.test(l) && l.trim().length > 0);

    if (ordered) {
      out.push(
        <ol key={`o${key++}`} className="list-decimal pl-5 space-y-2">
          {lines.map((line, idx) => (
            <li key={`oli${key++}-${idx}`}>
              {renderInline(line.replace(/^\s*\d+\.\s+/, ""), `o${key}`)}
            </li>
          ))}
        </ol>
      );
    } else if (unordered) {
      out.push(
        <ul key={`u${key++}`} className="list-disc pl-5 space-y-1">
          {lines.map((line, idx) => (
            <li key={`uli${key++}-${idx}`}>
              {renderInline(line.replace(/^\s*[-]\s+/, ""), `u${key}`)}
            </li>
          ))}
        </ul>
      );
    } else {
      out.push(
        <p key={`p${key++}`} className="mb-2">
          {lines.map((line, idx) => (
            <React.Fragment key={`pf${key++}-${idx}`}>
              {renderInline(line, `p${key}`)}
              {idx < lines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      );
    }
  }

  return <>{out}</>;
}