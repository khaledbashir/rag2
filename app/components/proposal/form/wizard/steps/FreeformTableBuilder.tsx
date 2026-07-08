"use client";
/**
 * FreeformTableBuilder — builder-from-scratch UI (Priority 1-tied).
 *
 * Lets the user build pricing/line-item tables with any number of columns and
 * rows, user-named headers, simple text + numbers (Natalia D). Multiple tables
 * per proposal. Rows are drag-reorderable (@dnd-kit/sortable, same dep as
 * Step3Math quoteItems). Writes to `details.freeformTables` +
 * `details.showFreeformTables` via react-hook-form (autosaved by the draft loop).
 *
 * Available for all document modes (service + LED).
 */
import React, { useState } from "react";
import { useFormContext } from "react-hook-form";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseButton } from "@/app/components";
import type { ProposalType } from "@/types";
import type { FreeformTable } from "@/lib/freeformTables/types";
import { newColumn, newRow, newTable, normalizeTable } from "@/lib/freeformTables/resolve";

let _id = 0;
const uid = (p: string) => `${p}${++_id}-${Math.random().toString(36).slice(2, 7)}`;

export function FreeformTableBuilder() {
    const { watch, setValue, getValues } = useFormContext<ProposalType>();
    const tables = (watch("details.freeformTables" as any) || []) as FreeformTable[];
    const showFreeform = watch("details.showFreeformTables" as any) ?? true;
    const [openTable, setOpenTable] = useState<string | null>(tables[0]?.id ?? null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const commit = (next: FreeformTable[]) => {
        setValue("details.freeformTables" as any, next, { shouldDirty: true });
    };

    const updateTable = (id: string, patch: Partial<FreeformTable>) => {
        const next = tables.map((t) => (t.id === id ? normalizeTable({ ...t, ...patch }) : t));
        commit(next);
    };

    const addTable = () => {
        const t = { ...newTable("Pricing Table"), id: uid("t") };
        t.columns = [newColumn("Item", "text"), newColumn("Price", "number")];
        t.rows = [{ ...newRow(t.columns), id: uid("r") }];
        commit([...tables, t]);
        setOpenTable(t.id);
    };

    const removeTable = (id: string) => {
        commit(tables.filter((t) => t.id !== id));
    };

    const addColumn = (tableId: string) => {
        const t = tables.find((x) => x.id === tableId);
        if (!t) return;
        updateTable(tableId, { columns: [...t.columns, { id: uid("c"), label: "Column", type: "text" }] });
    };

    const updateColumn = (tableId: string, colId: string, patch: Partial<{ label: string; type: "text" | "number" }>) => {
        const t = tables.find((x) => x.id === tableId);
        if (!t) return;
        updateTable(tableId, { columns: t.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)) });
    };

    const removeColumn = (tableId: string, colId: string) => {
        const t = tables.find((x) => x.id === tableId);
        if (!t) return;
        updateTable(tableId, { columns: t.columns.filter((c) => c.id !== colId) });
    };

    const addRow = (tableId: string) => {
        const t = tables.find((x) => x.id === tableId);
        if (!t) return;
        updateTable(tableId, { rows: [...t.rows, { ...newRow(t.columns), id: uid("r") }] });
    };

    const updateCell = (tableId: string, rowId: string, colId: string, value: string) => {
        const t = tables.find((x) => x.id === tableId);
        if (!t) return;
        updateTable(tableId, {
            rows: t.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r)),
        });
    };

    const removeRow = (tableId: string, rowId: string) => {
        const t = tables.find((x) => x.id === tableId);
        if (!t) return;
        updateTable(tableId, { rows: t.rows.filter((r) => r.id !== rowId) });
    };

    const reorderRows = (tableId: string, activeId: string, overId: string) => {
        const t = tables.find((x) => x.id === tableId);
        if (!t) return;
        const from = t.rows.findIndex((r) => r.id === activeId);
        const to = t.rows.findIndex((r) => r.id === overId);
        if (from < 0 || to < 0) return;
        updateTable(tableId, { rows: arrayMove(t.rows, from, to) });
    };

    return (
        <Card className="bg-card/40 border border-border/60">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-sm">Free-form Pricing Tables</CardTitle>
                    <p className="text-[11px] text-muted-foreground">Build pricing from scratch — any columns, any rows, name your own headers.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Label htmlFor="showFreeformTables" className="text-[11px] text-muted-foreground">Show in PDF</Label>
                    <Switch id="showFreeformTables" checked={showFreeform} onCheckedChange={(c) => setValue("details.showFreeformTables" as any, c, { shouldDirty: true })} className="data-[state=checked]:bg-brand-blue" />
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {tables.length === 0 && (
                    <p className="text-[12px] text-muted-foreground">No tables yet. Add one to start building pricing.</p>
                )}
                {tables.map((table) => {
                    const isOpen = openTable === table.id;
                    return (
                        <div key={table.id} className="border border-border/50 rounded-md">
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-card/30">
                                <button type="button" onClick={() => setOpenTable(isOpen ? null : table.id)} className="flex-1 text-left">
                                    <Input
                                        value={table.name}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => updateTable(table.id, { name: e.target.value })}
                                        className="text-sm font-semibold border-transparent bg-transparent hover:border-input focus-visible:border-input h-7"
                                    />
                                </button>
                                <button type="button" onClick={() => setOpenTable(isOpen ? null : table.id)} className="text-[11px] text-muted-foreground px-2">
                                    {isOpen ? "Hide" : "Edit"}
                                </button>
                                <button type="button" onClick={() => removeTable(table.id)} className="text-muted-foreground hover:text-destructive" title="Remove table">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            {isOpen && (
                                <div className="px-3 pb-3 pt-2 space-y-3 border-t border-border/30">
                                    {/* Columns manager */}
                                    <div className="space-y-1.5">
                                        <Label className="text-[11px] text-muted-foreground">Columns</Label>
                                        <div className="space-y-1.5">
                                            {table.columns.map((col) => (
                                                <div key={col.id} className="flex items-center gap-2">
                                                    <Input
                                                        value={col.label}
                                                        onChange={(e) => updateColumn(table.id, col.id, { label: e.target.value })}
                                                        placeholder="Header name"
                                                        className="text-xs h-8 flex-1"
                                                    />
                                                    <Select value={col.type} onValueChange={(v) => updateColumn(table.id, col.id, { type: v as "text" | "number" })}>
                                                        <SelectTrigger className="w-[110px] h-8 text-xs bg-background border-input"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="text">Text</SelectItem>
                                                            <SelectItem value="number">Number</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <button type="button" onClick={() => removeColumn(table.id, col.id)} className="text-muted-foreground hover:text-destructive p-1" title="Remove column">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <BaseButton variant="outline" size="sm" onClick={() => addColumn(table.id)} className="h-7 text-xs">
                                            <Plus className="h-3 w-3 mr-1" /> Add column
                                        </BaseButton>
                                    </div>

                                    {/* Rows */}
                                    {table.columns.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-[11px] text-muted-foreground">Rows</Label>
                                                <div className="flex items-center gap-2">
                                                    <Label htmlFor={`totals-${table.id}`} className="text-[11px] text-muted-foreground">Totals row</Label>
                                                    <Switch id={`totals-${table.id}`} checked={table.showTotalsRow} onCheckedChange={(c) => updateTable(table.id, { showTotalsRow: c })} className="data-[state=checked]:bg-brand-blue" />
                                                </div>
                                            </div>
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragEnd={(e: DragEndEvent) => { if (e.active.id !== e.over?.id && e.over) reorderRows(table.id, String(e.active.id), String(e.over.id)); }}
                                            >
                                                <SortableContext items={table.rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                                                    {table.rows.map((row, idx) => (
                                                        <SortableRow
                                                            key={row.id}
                                                            row={row}
                                                            index={idx}
                                                            columns={table.columns}
                                                            onUpdateCell={(colId, v) => updateCell(table.id, row.id, colId, v)}
                                                            onRemove={() => removeRow(table.id, row.id)}
                                                        />
                                                    ))}
                                                </SortableContext>
                                            </DndContext>
                                            <BaseButton variant="outline" size="sm" onClick={() => addRow(table.id)} className="h-7 text-xs">
                                                <Plus className="h-3 w-3 mr-1" /> Add row
                                            </BaseButton>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
                <BaseButton variant="outline" size="sm" onClick={addTable}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add pricing table
                </BaseButton>
            </CardContent>
        </Card>
    );
}

const SortableRow = ({
    row,
    index,
    columns,
    onUpdateCell,
    onRemove,
}: {
    row: FreeformTable["rows"][number];
    index: number;
    columns: FreeformTable["columns"];
    onUpdateCell: (colId: string, value: string) => void;
    onRemove: () => void;
}) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-1.5">
            <button type="button" className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" {...attributes} {...listeners}>
                <GripVertical className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] text-muted-foreground w-5 text-right">{index + 1}</span>
            {columns.map((col) => (
                <Input
                    key={col.id}
                    value={row.cells?.[col.id] ?? ""}
                    onChange={(e) => onUpdateCell(col.id, e.target.value)}
                    placeholder={col.label || col.type}
                    inputMode={col.type === "number" ? "decimal" : "text"}
                    className="text-xs h-8 flex-1"
                />
            ))}
            <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive p-1" title="Remove row">
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    );
};