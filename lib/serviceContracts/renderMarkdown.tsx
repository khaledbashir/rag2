/**
 * Markdown → React renderer for Service Contract term exhibits.
 *
 * Uses react-markdown + remark-gfm (already a dependency) so the verbatim ANC
 * legal text renders correctly: nested lists, multi-paragraph ordered-list
 * items, GFM tables, inline bold, and all-caps preserved verbatim. Bodies stay
 * as plain Markdown text — editable in a textarea and structured enough that a
 * future DOCX generator can consume the same Markdown without rework.
 *
 * HARD RULE: text is never altered here — no case changes, no smart-quote
 * normalization, no trimming of all-caps.
 */
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-2">{children}</ol>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  table: ({ children }) => (
    <table style={{ borderCollapse: "collapse", fontSize: "11px", margin: "6px 0 12px" }}>{children}</table>
  ),
  th: ({ children }) => (
    <th style={{ textAlign: "left", padding: "3px 18px 3px 0", fontWeight: 700 }}>{children}</th>
  ),
  td: ({ children }) => <td style={{ padding: "2px 18px 2px 0" }}>{children}</td>,
};

export function renderMarkdown(md: string): React.ReactNode {
  const src = (md ?? "").trim();
  if (!src) return null;
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{src}</ReactMarkdown>;
}