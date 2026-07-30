"use client";

/**
 * Textarea with a small formatting bar — bold, bullets, numbering.
 *
 * Natalia 2026-07-30 asked for "bullet points, bold etc, more dynamic text" in
 * the Notes / Scope boxes. The document renderer reads Markdown (see
 * PdfRichBody), which is the same format the term exhibits already use, so the
 * storage format does not change and nothing needs migrating.
 *
 * These buttons write the syntax so an author never has to know it exists. The
 * value stays a plain string — still hand-editable, still what the PDF renders.
 */
import * as React from "react";
import { Bold, List, ListOrdered } from "lucide-react";

import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Edit = { value: string; selStart: number; selEnd: number };

/** Expand a selection to cover the whole of every line it touches. */
function lineSpan(value: string, start: number, end: number) {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const to = nextBreak === -1 ? value.length : nextBreak;
  return { from, to };
}

const BULLET = /^(\s*)[-*+]\s+/;
const NUMBER = /^(\s*)\d+[.)]\s+/;

/** Toggle a list prefix across the selected lines. */
export function toggleList(value: string, start: number, end: number, kind: "bullet" | "number"): Edit {
  const { from, to } = lineSpan(value, start, end);
  const block = value.slice(from, to);
  const lines = block.split("\n");
  const pattern = kind === "bullet" ? BULLET : NUMBER;
  // Already a list of this kind on every non-empty line → strip it.
  const meaningful = lines.filter((l) => l.trim());
  const allMarked = meaningful.length > 0 && meaningful.every((l) => pattern.test(l));

  let n = 0;
  const next = lines
    .map((line) => {
      if (!line.trim()) return line;
      if (allMarked) return line.replace(pattern, "$1");
      const stripped = line.replace(BULLET, "$1").replace(NUMBER, "$1");
      const indent = (stripped.match(/^\s*/) || [""])[0];
      const body = stripped.slice(indent.length);
      n += 1;
      return kind === "bullet" ? `${indent}- ${body}` : `${indent}${n}. ${body}`;
    })
    .join("\n");

  return {
    value: value.slice(0, from) + next + value.slice(to),
    selStart: from,
    selEnd: from + next.length,
  };
}

/** Wrap (or unwrap) the selection in bold markers. */
export function toggleBold(value: string, start: number, end: number): Edit {
  const selected = value.slice(start, end);

  if (selected) {
    if (/^\*\*[\s\S]+\*\*$/.test(selected)) {
      const inner = selected.slice(2, -2);
      return { value: value.slice(0, start) + inner + value.slice(end), selStart: start, selEnd: start + inner.length };
    }
    // selection sits inside an existing bold run
    if (value.slice(start - 2, start) === "**" && value.slice(end, end + 2) === "**") {
      return {
        value: value.slice(0, start - 2) + selected + value.slice(end + 2),
        selStart: start - 2,
        selEnd: end - 2,
      };
    }
    const wrapped = `**${selected}**`;
    return { value: value.slice(0, start) + wrapped + value.slice(end), selStart: start + 2, selEnd: end + 2 };
  }

  // no selection → drop in markers and park the caret between them
  return { value: `${value.slice(0, start)}****${value.slice(start)}`, selStart: start + 2, selEnd: start + 2 };
}

export interface RichTextareaProps extends Omit<TextareaProps, "onChange" | "value"> {
  value: string;
  onValueChange: (next: string) => void;
  /** Hint shown under the box. */
  hint?: React.ReactNode;
}

export function RichTextarea({ value, onValueChange, hint, className, ...props }: RichTextareaProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const apply = (fn: (v: string, s: number, e: number) => Edit) => {
    const el = ref.current;
    if (!el) return;
    const { value: next, selStart, selEnd } = fn(value ?? "", el.selectionStart, el.selectionEnd);
    onValueChange(next);
    // restore the selection after React writes the new value back
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const Btn = ({
    onClick,
    title,
    children,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()} // keep the textarea selection alive
      onClick={onClick}
      className="h-7 w-7 inline-flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Btn title="Bold" onClick={() => apply(toggleBold)}>
          <Bold className="h-3.5 w-3.5" />
        </Btn>
        <Btn title="Bulleted list" onClick={() => apply((v, s, e) => toggleList(v, s, e, "bullet"))}>
          <List className="h-3.5 w-3.5" />
        </Btn>
        <Btn title="Numbered list" onClick={() => apply((v, s, e) => toggleList(v, s, e, "number"))}>
          <ListOrdered className="h-3.5 w-3.5" />
        </Btn>
        <span className="ml-1 text-[10px] text-muted-foreground">Select text, then format</span>
      </div>
      <Textarea ref={ref} className={cn(className)} value={value} onChange={(e) => onValueChange(e.target.value)} {...props} />
      {hint}
    </div>
  );
}

export default RichTextarea;
