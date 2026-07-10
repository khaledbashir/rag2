"use client";

import React, { useState } from "react";
import { useFormContext } from "react-hook-form";
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseButton } from "@/app/components";
import type { ProposalType } from "@/types";
import type {
    FreeformColumn,
    FreeformColumnAlignment,
    FreeformRow,
    FreeformRowStyle,
    FreeformTable,
} from "@/lib/freeformTables/types";
import { newColumn, newRow, newTable, normalizeTable } from "@/lib/freeformTables/resolve";

let idCounter = 0;
const uid = (prefix: string) => `${prefix}${++idCounter}-${Math.random().toString(36).slice(2, 7)}`;

const ROW_STYLE_LABELS: Record<FreeformRowStyle, string> = {
    normal: "Normal",
    header: "Header",
    subtotal: "Subtotal",
    tax: "Tax",
    bond: "Bond",
    "grand-total": "Grand Total",
};

export function FreeformTableBuilder() {
    const { watch, setValue } = useFormContext<ProposalType>();
    const rawTables = (watch("details.freeformTables" as any) || []) as FreeformTable[];
    const tables = rawTables.map(normalizeTable);
    const showFreeformTables = watch("details.showFreeformTables" as any) ?? true;
    const [openTableId, setOpenTableId] = useState<string | null>(tables[0]?.id ?? null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const commit = (nextTables: FreeformTable[]) => {
        setValue("details.freeformTables" as any, nextTables.map(normalizeTable), { shouldDirty: true });
    };

    const updateTable = (tableId: string, patch: Partial<FreeformTable>) => {
        commit(tables.map((table) => table.id === tableId ? { ...table, ...patch } : table));
    };

    const addTable = () => {
        const table = { ...newTable(), id: uid("t") };
        table.columns = [
            { ...newColumn("Column 1", "left"), id: uid("c") },
            { ...newColumn("Column 2", "right"), id: uid("c") },
        ];
        const heading = { ...newRow(table.columns, "header"), id: uid("r") };
        const body = { ...newRow(table.columns, "normal"), id: uid("r") };
        table.rows = [heading, body];
        commit([...tables, table]);
        setOpenTableId(table.id);
    };

    const removeTable = (tableId: string) => {
        commit(tables.filter((table) => table.id !== tableId));
    };

    const addColumn = (tableId: string) => {
        const table = tables.find((candidate) => candidate.id === tableId);
        if (!table) return;
        const column: FreeformColumn = {
            id: uid("c"),
            label: `Column ${table.columns.length + 1}`,
            align: "left",
        };
        updateTable(tableId, { columns: [...table.columns, column] });
    };

    const updateColumn = (tableId: string, columnId: string, patch: Partial<FreeformColumn>) => {
        const table = tables.find((candidate) => candidate.id === tableId);
        if (!table) return;
        updateTable(tableId, {
            columns: table.columns.map((column) => column.id === columnId ? { ...column, ...patch } : column),
        });
    };

    const removeColumn = (tableId: string, columnId: string) => {
        const table = tables.find((candidate) => candidate.id === tableId);
        if (!table) return;
        updateTable(tableId, { columns: table.columns.filter((column) => column.id !== columnId) });
    };

    const addRow = (tableId: string, style: FreeformRowStyle = "normal") => {
        const table = tables.find((candidate) => candidate.id === tableId);
        if (!table) return;
        updateTable(tableId, { rows: [...table.rows, { ...newRow(table.columns, style), id: uid("r") }] });
    };

    const updateRow = (tableId: string, rowId: string, patch: Partial<FreeformRow>) => {
        const table = tables.find((candidate) => candidate.id === tableId);
        if (!table) return;
        updateTable(tableId, {
            rows: table.rows.map((row) => row.id === rowId ? { ...row, ...patch } : row),
        });
    };

    const removeRow = (tableId: string, rowId: string) => {
        const table = tables.find((candidate) => candidate.id === tableId);
        if (!table) return;
        updateTable(tableId, { rows: table.rows.filter((row) => row.id !== rowId) });
    };

    const reorderRows = (tableId: string, activeId: string, overId: string) => {
        const table = tables.find((candidate) => candidate.id === tableId);
        if (!table) return;
        const fromIndex = table.rows.findIndex((row) => row.id === activeId);
        const toIndex = table.rows.findIndex((row) => row.id === overId);
        if (fromIndex < 0 || toIndex < 0) return;
        updateTable(tableId, { rows: arrayMove(table.rows, fromIndex, toIndex) });
    };

    return (
        <Card className="bg-card/40 border border-border/60" data-testid="manual-table-composer">
            <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-sm">Manual Proposal Tables</CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Type exactly what should appear. Row styles are visual only—nothing is calculated or reformatted.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor="showFreeformTables" className="text-[11px] text-muted-foreground">Show in PDF</Label>
                    <Switch
                        id="showFreeformTables"
                        checked={showFreeformTables}
                        onCheckedChange={(checked) => setValue("details.showFreeformTables" as any, checked, { shouldDirty: true })}
                        className="data-[state=checked]:bg-brand-blue"
                    />
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {tables.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center">
                        <p className="text-sm font-medium text-foreground">No manual tables yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Add a table, then add columns and rows in any order.</p>
                    </div>
                )}

                {tables.map((table) => {
                    const isOpen = openTableId === table.id;
                    return (
                        <div key={table.id} className="border border-border/60 rounded-lg overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-card/40">
                                <Input
                                    value={table.name}
                                    onChange={(event) => updateTable(table.id, { name: event.target.value })}
                                    placeholder="Section title"
                                    className="text-sm font-semibold border-transparent bg-transparent hover:border-input focus-visible:border-input h-8 flex-1"
                                />
                                <button type="button" onClick={() => setOpenTableId(isOpen ? null : table.id)} className="text-[11px] text-muted-foreground px-2">
                                    {isOpen ? "Hide" : "Edit"}
                                </button>
                                <button type="button" onClick={() => removeTable(table.id)} className="text-muted-foreground hover:text-destructive p-1" title="Remove table">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            {isOpen && (
                                <div className="px-3 pb-3 pt-3 space-y-4 border-t border-border/40">
                                    <div className="space-y-2">
                                        <div>
                                            <Label className="text-[11px] text-muted-foreground">Columns</Label>
                                            <p className="text-[10px] text-muted-foreground/80">Labels organize the editor. Only row text appears in the PDF.</p>
                                        </div>
                                        {table.columns.map((column) => (
                                            <div key={column.id} className="flex items-center gap-2">
                                                <Input
                                                    value={column.label}
                                                    onChange={(event) => updateColumn(table.id, column.id, { label: event.target.value })}
                                                    placeholder="Column label"
                                                    className="text-xs h-8 flex-1"
                                                />
                                                <Select
                                                    value={column.align ?? "left"}
                                                    onValueChange={(value) => updateColumn(table.id, column.id, { align: value as FreeformColumnAlignment })}
                                                >
                                                    <SelectTrigger className="w-[105px] h-8 text-xs bg-background border-input"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="left">Left</SelectItem>
                                                        <SelectItem value="center">Center</SelectItem>
                                                        <SelectItem value="right">Right</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <button type="button" onClick={() => removeColumn(table.id, column.id)} className="text-muted-foreground hover:text-destructive p-1" title="Remove column">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <BaseButton variant="outline" size="sm" onClick={() => addColumn(table.id)} className="h-7 text-xs">
                                            <Plus className="h-3 w-3 mr-1" /> Add column
                                        </BaseButton>
                                    </div>

                                    {table.columns.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <Label className="text-[11px] text-muted-foreground">Rows</Label>
                                                    <p className="text-[10px] text-muted-foreground/80">Choose Header, Subtotal, Tax, Bond, or Grand Total only to change appearance.</p>
                                                </div>
                                                <BaseButton variant="outline" size="sm" onClick={() => addRow(table.id)} className="h-7 text-xs shrink-0">
                                                    <Plus className="h-3 w-3 mr-1" /> Add row
                                                </BaseButton>
                                            </div>
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragEnd={(event: DragEndEvent) => {
                                                    if (event.active.id !== event.over?.id && event.over) {
                                                        reorderRows(table.id, String(event.active.id), String(event.over.id));
                                                    }
                                                }}
                                            >
                                                <SortableContext items={table.rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                                                    <div className="space-y-2">
                                                        {table.rows.map((row, index) => (
                                                            <SortableRow
                                                                key={row.id}
                                                                row={row}
                                                                index={index}
                                                                columns={table.columns}
                                                                onStyleChange={(style) => updateRow(table.id, row.id, { style })}
                                                                onUpdateCell={(columnId, value) => updateRow(table.id, row.id, { cells: { ...row.cells, [columnId]: value } })}
                                                                onRemove={() => removeRow(table.id, row.id)}
                                                            />
                                                        ))}
                                                    </div>
                                                </SortableContext>
                                            </DndContext>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                <BaseButton variant="outline" size="sm" onClick={addTable}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add manual table
                </BaseButton>
            </CardContent>
        </Card>
    );
}

function SortableRow({
    row,
    index,
    columns,
    onStyleChange,
    onUpdateCell,
    onRemove,
}: {
    row: FreeformRow;
    index: number;
    columns: FreeformColumn[];
    onStyleChange: (style: FreeformRowStyle) => void;
    onUpdateCell: (columnId: string, value: string) => void;
    onRemove: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
    const dragStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
    const rowStyle = row.style ?? "normal";

    return (
        <div ref={setNodeRef} style={dragStyle} className="rounded-md border border-border/50 bg-background/50 p-2 space-y-2">
            <div className="flex items-center gap-2">
                <button type="button" className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" {...attributes} {...listeners}>
                    <GripVertical className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] text-muted-foreground w-5 text-right">{index + 1}</span>
                <Select value={rowStyle} onValueChange={(value) => onStyleChange(value as FreeformRowStyle)}>
                    <SelectTrigger className="w-[132px] h-8 text-xs bg-background border-input" aria-label={`Row ${index + 1} style`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(ROW_STYLE_LABELS) as FreeformRowStyle[]).map((style) => (
                            <SelectItem key={style} value={style}>{ROW_STYLE_LABELS[style]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <button type="button" onClick={onRemove} className="ml-auto text-muted-foreground hover:text-destructive p-1" title="Remove row">
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}>
                {columns.map((column) => (
                    <div key={column.id} className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">{column.label || "Column"}</Label>
                        <Input
                            value={row.cells?.[column.id] ?? ""}
                            onChange={(event) => onUpdateCell(column.id, event.target.value)}
                            placeholder="Type exactly what should appear"
                            inputMode="text"
                            className="text-xs h-8"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
