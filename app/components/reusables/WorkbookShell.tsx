"use client";

/**
 * WorkbookShell — Reusable Excel-like workbook chrome.
 *
 * Renders: green title bar, column letters, row numbers, cell grid, sheet tabs.
 * Extracted from EstimatorStudio's ExcelPreview so both tools share one UI.
 */

import React, { useState, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, Plus, Download } from "lucide-react";
import type { WorkbookData, SheetTab, SheetRow, SheetCell } from "./workbookTypes";

// ═══════════════════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════════════════

interface WorkbookShellProps {
  data: WorkbookData;
  /** Buttons rendered in the title bar (right side) */
  actions?: ReactNode;
  /** Enable cell editing on non-placeholder sheets */
  editable?: boolean;
  onCellEdit?: (sheetIndex: number, rowIndex: number, colIndex: number, newValue: string) => void;
  onCellClick?: (sheetIndex: number, rowIndex: number, colIndex: number) => void;
  onAddSheet?: () => void;
  onExport?: () => void;
  exporting?: boolean;
  /** Content rendered above the grid (e.g., pipeline workflow bar) */
  toolbar?: ReactNode;
  /** Content rendered below the grid, above tabs (e.g., checkpoint) */
  footer?: ReactNode;
  /** External active tab control */
  activeTab?: number;
  onTabChange?: (idx: number) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function WorkbookShell({
  data,
  actions,
  editable = false,
  onCellEdit,
  onCellClick,
  onAddSheet,
  onExport,
  exporting,
  toolbar,
  footer,
  activeTab: controlledTab,
  onTabChange,
}: WorkbookShellProps) {
  const [internalTab, setInternalTab] = useState(0);
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;

  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);

  const activeSheet = data.sheets[activeTab] || data.sheets[0];
  if (!activeSheet) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
        <FileSpreadsheet className="w-12 h-12 opacity-30" />
        <p className="text-sm">No data to display</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 rounded-lg border border-border overflow-hidden shadow-sm">
      {/* ─── Title bar ─── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#217346] text-white text-xs shrink-0">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span className="font-medium truncate max-w-[400px]">{data.fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {onExport && (
            <button
              onClick={onExport}
              disabled={exporting}
              className="flex items-center gap-1 px-2.5 py-1 bg-white text-[#217346] hover:bg-white/90 rounded text-[10px] font-bold transition-colors disabled:opacity-50 shadow-sm"
            >
              <Download className="w-3 h-3" />
              {exporting ? "Exporting..." : "Full Scoping Workbook"}
            </button>
          )}
        </div>
      </div>

      {/* ─── Toolbar slot (pipeline steps, filters, etc.) ─── */}
      {toolbar}

      {/* ─── Column letter header ─── */}
      <div className="flex border-b border-border bg-zinc-50 dark:bg-zinc-800 shrink-0">
        <div className="w-10 shrink-0 border-r border-border" />
        {activeSheet.columns.map((_col, i) => (
          <div
            key={i}
            className="flex-1 min-w-[80px] px-2 py-0.5 text-center text-[10px] font-medium text-muted-foreground border-r border-border last:border-r-0"
          >
            {String.fromCharCode(65 + i)}
          </div>
        ))}
      </div>

      {/* ─── Sheet content ─── */}
      <div className="flex-1 overflow-auto">
        {activeSheet.placeholder ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground gap-3 py-12">
            <FileSpreadsheet className="w-10 h-10 opacity-20" />
            <p className="text-xs font-medium">{activeSheet.placeholderMessage || "Available in downloaded workbook"}</p>
            {onExport && (
              <button
                onClick={onExport}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#217346] text-white rounded text-xs font-medium hover:bg-[#1a5c38] transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                Download Workbook
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {activeSheet.rows.map((row, rowIdx) => (
                <RowView
                  key={rowIdx}
                  row={row}
                  rowNum={rowIdx + 1}
                  colCount={activeSheet.columns.length}
                  editable={editable}
                  editableColumns={activeSheet.editableColumns}
                  editingCell={editingCell}
                  sheetIndex={activeTab}
                  onCellClick={(col) => {
                    // Fire cell click handler (e.g., source page jump)
                    const cell = row.cells[col];
                    if (cell?.onClick) cell.onClick();
                    onCellClick?.(activeTab, rowIdx, col);
                    // Enter edit mode
                    if (editable) setEditingCell({ row: rowIdx, col });
                  }}
                  onCellChange={(col, value) => {
                    onCellEdit?.(activeTab, rowIdx, col, value);
                    setEditingCell(null);
                  }}
                  onCellBlur={() => setEditingCell(null)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Footer slot (checkpoint, auto-save status) ─── */}
      {footer}

      {/* ─── Sheet tabs ─── */}
      <div className="flex items-end border-t border-border bg-zinc-50 dark:bg-zinc-800 shrink-0 overflow-x-auto scrollbar-thin" style={{ minHeight: 32 }}>
        {data.sheets.filter(Boolean).map((sheet, idx) => (
          <button
            key={idx}
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab(idx); }}
            className={cn(
              "px-2.5 py-1.5 text-[10px] font-medium border-r border-border whitespace-nowrap transition-colors relative cursor-pointer select-none shrink-0",
              idx === activeTab
                ? "bg-white dark:bg-zinc-900 text-foreground"
                : sheet.placeholder
                  ? "text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
            )}
          >
            {idx === activeTab && (
              <div
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ backgroundColor: sheet.color }}
              />
            )}
            <span
              className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1", sheet.placeholder && "opacity-40")}
              style={{ backgroundColor: sheet.color }}
            />
            {sheet.name}
            {sheet.badge != null && sheet.badge > 0 && (
              <span className="ml-1 px-1 py-0.5 text-[8px] font-bold bg-blue-500 text-white rounded-full leading-none">
                {sheet.badge}
              </span>
            )}
          </button>
        ))}
        {onAddSheet && (
          <button
            onClick={() => {
              onAddSheet();
              setActiveTab(data.sheets.length);
            }}
            className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
            title="Add worksheet"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Row renderer
// ═══════════════════════════════════════════════════════════════════════════

interface RowViewProps {
  row: SheetRow;
  rowNum: number;
  colCount: number;
  editable?: boolean;
  editableColumns?: number[];
  editingCell: { row: number; col: number } | null;
  sheetIndex: number;
  onCellClick: (col: number) => void;
  onCellChange: (col: number, value: string) => void;
  onCellBlur: () => void;
}

function RowView({ row, rowNum, colCount, editable, editableColumns, editingCell, onCellClick, onCellChange, onCellBlur }: RowViewProps) {
  if (row.isSeparator) {
    return (
      <tr className="h-5">
        <td className="w-10 text-center text-[10px] text-muted-foreground border-r border-b border-border bg-zinc-50 dark:bg-zinc-800">
          {rowNum}
        </td>
        {Array.from({ length: colCount }).map((_, i) => (
          <td key={i} className="border-r border-b border-border last:border-r-0" />
        ))}
      </tr>
    );
  }

  // Spanned rows (section titles)
  const firstCell = row.cells[0];
  if (firstCell?.span && firstCell.span > 1) {
    return (
      <tr className={cn(row.isHeader && "bg-[#0A52EF]/5 dark:bg-[#0A52EF]/10", row.isTotal && "bg-emerald-50 dark:bg-emerald-900/20")}>
        <td className="w-10 text-center text-[10px] text-muted-foreground border-r border-b border-border bg-zinc-50 dark:bg-zinc-800">
          {rowNum}
        </td>
        <td
          colSpan={colCount}
          className={cn(
            "px-2 py-1 border-b border-border",
            firstCell.bold && "font-semibold",
            firstCell.header && "text-[#0A52EF] dark:text-blue-400",
            firstCell.align === "center" && "text-center",
            firstCell.className,
          )}
        >
          {formatCellValue(firstCell)}
        </td>
      </tr>
    );
  }

  const isEditingThisRow = editingCell?.row === rowNum - 1;

  return (
    <tr className={cn(
      "hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors",
      row.isHeader && "bg-zinc-100 dark:bg-zinc-800",
      row.isTotal && "bg-emerald-50 dark:bg-emerald-900/20",
    )}>
      <td className="w-10 text-center text-[10px] text-muted-foreground border-r border-b border-border bg-zinc-50 dark:bg-zinc-800">
        {rowNum}
      </td>
      {Array.from({ length: colCount }).map((_, i) => {
        const cell = row.cells[i];
        const isEditingThisCell = isEditingThisRow && editingCell?.col === i;
        const canEdit = editable && !row.isHeader && !row.isTotal && (!editableColumns || editableColumns.includes(i));

        if (!cell) {
          return (
            <td
              key={i}
              className={cn("px-2 py-1 border-r border-b border-border last:border-r-0", canEdit && "cursor-cell")}
              onClick={() => onCellClick(i)}
            />
          );
        }

        return (
          <CellView
            key={i}
            cell={cell}
            editable={canEdit}
            isEditing={isEditingThisCell}
            onClick={() => onCellClick(i)}
            onChange={(value) => onCellChange(i, value)}
            onBlur={onCellBlur}
          />
        );
      })}
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Cell renderer
// ═══════════════════════════════════════════════════════════════════════════

interface CellViewProps {
  cell: SheetCell;
  editable?: boolean;
  isEditing: boolean;
  onClick: () => void;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

function CellView({ cell, editable, isEditing, onClick, onChange, onBlur }: CellViewProps) {
  const [value, setValue] = React.useState(formatCellValue(cell));
  const committedRef = React.useRef(false);

  React.useEffect(() => {
    setValue(formatCellValue(cell));
  }, [cell]);

  // Reset committed flag when entering edit mode
  React.useEffect(() => {
    if (isEditing) committedRef.current = false;
  }, [isEditing]);

  if (isEditing && editable) {
    const commit = () => {
      if (committedRef.current) return; // Prevent double-fire (Enter + blur)
      committedRef.current = true;
      onChange(value);
      onBlur?.();
    };

    return (
      <td className="px-0 py-0 border-r border-b border-border last:border-r-0 bg-white dark:bg-zinc-900">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { committedRef.current = true; setValue(formatCellValue(cell)); onBlur?.(); }
          }}
          className="w-full h-full px-2 py-1 text-xs bg-transparent border-2 border-blue-500 focus:outline-none"
        />
      </td>
    );
  }

  if (cell.dropdown && cell.dropdown.length > 0) {
    return (
      <td
        className={cn(
          "px-1 py-0.5 border-r border-b border-border last:border-r-0",
          cell.className,
        )}
      >
        <select
          value={String(cell.value || "")}
          onChange={(e) => {
            if (cell.onDropdownChange) cell.onDropdownChange(e.target.value);
          }}
          className="w-full text-xs bg-white dark:bg-zinc-900 border border-border rounded px-1 py-0.5 cursor-pointer focus:ring-1 focus:ring-blue-400 focus:outline-none appearance-auto"
        >
          <option value="">Select product...</option>
          {cell.dropdown.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </td>
    );
  }

  return (
    <td
      onClick={onClick}
      className={cn(
        "px-2 py-1 border-r border-b border-border last:border-r-0",
        cell.bold && "font-semibold",
        cell.header && "font-semibold text-[11px]",
        cell.highlight && "bg-yellow-100 dark:bg-yellow-900/30",
        cell.align === "right" && "text-right font-mono",
        cell.align === "center" && "text-center",
        cell.onClick && "text-[#0A52EF] hover:underline cursor-pointer",
        editable && !cell.onClick && "cursor-cell hover:bg-blue-50/50 dark:hover:bg-blue-900/20",
        cell.onRemove && "group/cell",
        cell.className,
      )}
      title={cell.formula || undefined}
    >
      {(cell.onRemove || cell.onRepair) ? (
        <span className="flex items-center gap-1">
          {cell.onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); cell.onRemove!(); }}
              className="opacity-0 group-hover/cell:opacity-100 text-red-400 hover:text-red-600 transition-opacity shrink-0"
              title="Remove row"
            >
              ×
            </button>
          )}
          <span>{formatCellValue(cell)}</span>
          {cell.onRepair && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); cell.onRepair!(); }}
              className="opacity-0 group-hover/cell:opacity-100 text-[#0A52EF] hover:text-[#0A52EF]/80 transition-opacity shrink-0 ml-1 text-[10px]"
              title="AI repair — fix this row"
            >
              fix
            </button>
          )}
        </span>
      ) : (
        formatCellValue(cell)
      )}
    </td>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Formatting
// ═══════════════════════════════════════════════════════════════════════════

function formatCellValue(cell: SheetCell): string {
  if (cell.value === "" || cell.value == null) return "";

  if (cell.currency && typeof cell.value === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cell.value);
  }

  if (cell.percent && typeof cell.value === "number") {
    return `${(cell.value * 100).toFixed(1)}%`;
  }

  if (typeof cell.value === "number") {
    return cell.value.toLocaleString();
  }

  return String(cell.value);
}
