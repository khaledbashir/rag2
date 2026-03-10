"use client";

/**
 * ExcelPreview — Live spreadsheet preview with sheet tabs.
 *
 * Renders the estimator output as a realistic Excel-like table.
 * Sheet tabs at the bottom switch between Budget Summary, Display Details, etc.
 * Updates in real-time as the user answers questions.
 */

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, Download, Plus, Loader2 } from "lucide-react";
import type { ExcelPreviewData, SheetTab, SheetRow, SheetCell } from "./EstimatorBridge";

interface ExcelPreviewProps {
    data: ExcelPreviewData | null;
    onExport?: () => void;
    exporting?: boolean;
    editable?: boolean;
    onCellEdit?: (sheetIndex: number, rowIndex: number, colIndex: number, newValue: string) => void;
    onAddSheet?: () => void;
    loading?: boolean;
    error?: string | null;
}

export default function ExcelPreview({ data, onExport, exporting, editable = false, onCellEdit, onAddSheet, loading, error }: ExcelPreviewProps) {
    const [activeTab, setActiveTab] = useState(0);
    const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);

    // Loading / error / empty state
    if (!data || !data.sheets?.length) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-white dark:bg-zinc-900 rounded-lg border border-border">
                {loading ? (
                    <>
                        <Loader2 className="w-8 h-8 animate-spin opacity-40" />
                        <p className="text-sm">Generating workbook...</p>
                    </>
                ) : error ? (
                    <>
                        <FileSpreadsheet className="w-12 h-12 opacity-30 text-red-400" />
                        <p className="text-sm text-red-500">Preview failed: {error}</p>
                        <p className="text-xs text-muted-foreground">Try editing a display or refreshing the page</p>
                    </>
                ) : (
                    <>
                        <FileSpreadsheet className="w-12 h-12 opacity-30" />
                        <p className="text-sm">Add displays to generate the workbook</p>
                    </>
                )}
            </div>
        );
    }

    const activeSheet = data.sheets[activeTab] || data.sheets[0];
    if (!activeSheet) return null;

    return (
        <div className="h-full flex flex-col bg-white dark:bg-zinc-900 rounded-lg border border-border overflow-hidden shadow-sm">
            {/* Title bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#217346] text-white text-xs shrink-0">
                <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span className="font-medium truncate max-w-[300px]">{data.fileName}</span>
                </div>
{/* Export button lives in the header bar — no duplicate here */}
            </div>

            {/* Toolbar removed - fake buttons served no purpose */}

            {/* Column letter header */}
            <div className="flex border-b border-border bg-zinc-50 dark:bg-zinc-800 shrink-0">
                <div className="w-10 shrink-0 border-r border-border" />
                {activeSheet.columns.map((col, i) => (
                    <div
                        key={i}
                        className="flex-1 min-w-[80px] px-2 py-0.5 text-center text-[10px] font-medium text-muted-foreground border-r border-border last:border-r-0"
                    >
                        {String.fromCharCode(65 + i)}
                    </div>
                ))}
            </div>

            {/* Sheet content */}
            <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs">
                    <tbody>
                        {activeSheet.rows.map((row, rowIdx) => (
                            <SheetRowView
                                key={rowIdx}
                                row={row}
                                rowNum={rowIdx + 1}
                                colCount={activeSheet.columns.length}
                                editable={editable}
                                editingCell={editingCell}
                                onCellClick={(col) => editable && setEditingCell({ row: rowIdx, col })}
                                onCellChange={(col, value) => {
                                    if (onCellEdit) {
                                        onCellEdit(activeTab, rowIdx, col, value);
                                    }
                                    setEditingCell(null);
                                }}
                                onCellBlur={() => setEditingCell(null)}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Sheet tabs */}
            <div className="flex items-end border-t border-border bg-zinc-50 dark:bg-zinc-800 shrink-0 overflow-x-auto">
                {data.sheets.map((sheet, idx) => (
                    <button
                        key={idx}
                        onClick={() => setActiveTab(idx)}
                        className={cn(
                            "px-3 py-1.5 text-[11px] font-medium border-r border-border whitespace-nowrap transition-colors relative",
                            idx === activeTab
                                ? "bg-white dark:bg-zinc-900 text-foreground"
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
                            className="inline-block w-2 h-2 rounded-full mr-1.5"
                            style={{ backgroundColor: sheet.color }}
                        />
                        {sheet.name}
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

// ============================================================================
// ROW RENDERER
// ============================================================================

interface SheetRowViewProps {
    row: SheetRow;
    rowNum: number;
    colCount: number;
    editable?: boolean;
    editingCell?: { row: number; col: number } | null;
    onCellClick?: (col: number) => void;
    onCellChange?: (col: number, value: string) => void;
    onCellBlur?: () => void;
}

function SheetRowView({ row, rowNum, colCount, editable, editingCell, onCellClick, onCellChange, onCellBlur }: SheetRowViewProps) {
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

    // Handle spanned rows (title rows)
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

                if (!cell) {
                    return (
                        <td
                            key={i}
                            className={cn(
                                "px-2 py-1 border-r border-b border-border last:border-r-0",
                                editable && "cursor-cell"
                            )}
                            onClick={() => onCellClick?.(i)}
                        />
                    );
                }

                return (
                    <EditableCell
                        key={i}
                        cell={cell}
                        editable={editable && !row.isHeader}
                        isEditing={isEditingThisCell}
                        onClick={() => onCellClick?.(i)}
                        onChange={(value) => onCellChange?.(i, value)}
                        onBlur={onCellBlur}
                    />
                );
            })}
        </tr>
    );
}

// ============================================================================
// EDITABLE CELL
// ============================================================================

interface EditableCellProps {
    cell: SheetCell;
    editable?: boolean;
    isEditing: boolean;
    onClick: () => void;
    onChange: (value: string) => void;
    onBlur?: () => void;
}

function EditableCell({ cell, editable, isEditing, onClick, onChange, onBlur }: EditableCellProps) {
    // Show raw number when editing (no $, commas, %) so it's easy to type
    const rawValue = (cell.currency || cell.percent) && typeof cell.value === "number"
        ? cell.percent ? (cell.value * 100).toString() : cell.value.toString()
        : formatCellValue(cell);
    const [value, setValue] = React.useState(formatCellValue(cell));
    const wasEditing = React.useRef(false);

    React.useEffect(() => {
        setValue(formatCellValue(cell));
    }, [cell]);

    // When entering edit mode, switch to raw value
    React.useEffect(() => {
        if (isEditing && !wasEditing.current) {
            setValue(rawValue);
        }
        wasEditing.current = isEditing;
    }, [isEditing, rawValue]);

    if (isEditing && editable) {
        return (
            <td
                className={cn(
                    "px-0 py-0 border-r border-b border-border last:border-r-0 bg-white dark:bg-zinc-900"
                )}
            >
                <input
                    autoFocus
                    ref={(el) => { if (el) el.select(); }}
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={() => {
                        onChange(value);
                        onBlur?.();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            onChange(value);
                            onBlur?.();
                        }
                        if (e.key === "Escape") {
                            setValue(formatCellValue(cell));
                            onBlur?.();
                        }
                    }}
                    className="w-full h-full px-2 py-1 text-xs bg-transparent border-2 border-blue-500 focus:outline-none"
                />
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
                editable && "cursor-cell hover:bg-blue-50/50 dark:hover:bg-blue-900/20"
            )}
            title={cell.formula || undefined}
        >
            {value}
        </td>
    );
}

// ============================================================================
// CELL FORMATTING
// ============================================================================

function formatCellValue(cell: SheetCell): string {
    if (cell.value === "" || cell.value == null) return "";

    if (cell.currency && typeof cell.value === "number") {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
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
