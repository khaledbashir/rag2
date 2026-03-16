"use client";

import type { CellValueChangedEvent, ColDef, GetRowIdParams } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useRef, useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ProposalType } from "@/types";
import { calculateArea } from "@/lib/math";
import { calculateProposalAudit } from "@/lib/estimator";

// Register AG Grid modules (required for v35+)
ModuleRegistry.registerModules([AllCommunityModule]);

// Fields that trigger audit recalculation
const AUDIT_TRIGGER_FIELDS = ["heightFt", "widthFt", "quantity", "pitchMm", "costPerSqFt", "desiredMargin", "serviceType"];

function toKey(screen: any) {
  if (screen?.id) return `id:${screen.id}`;
  if (screen?.sourceRef?.sheet && screen?.sourceRef?.row) return `src:${screen.sourceRef.sheet}:${screen.sourceRef.row}`;
  const name = (screen?.name ?? "").toString().trim().toUpperCase();
  const h = Number(screen?.heightFt ?? 0);
  const w = Number(screen?.widthFt ?? 0);
  const p = Number(screen?.pitchMm ?? 0);
  return `name:${name}:${h}:${w}:${p}`;
}

function parseOptionalNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export default function ScreensGridEditor() {
  const { control, setValue, getValues } = useFormContext<ProposalType>();
  const screens = useWatch({ control, name: "details.screens" }) || [];
  const themeClass = useMemo(
    () => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "ag-theme-quartz-dark" : "ag-theme-quartz"),
    []
  );

  const screensRef = useRef<any[]>(screens);
  screensRef.current = screens;

  const columnDefs = useMemo<ColDef[]>(
    () => [
      { field: "externalName", headerName: "Display Name", editable: true, minWidth: 200 },
      { field: "customDisplayName", headerName: "PDF Name Override", editable: true, minWidth: 180, headerTooltip: "Custom name shown in PDF (leave blank to use Display Name)" },
      { field: "name", headerName: "Internal", editable: true, minWidth: 140 },
      {
        field: "heightFt",
        headerName: "H (ft)",
        editable: true,
        minWidth: 90,
        valueParser: (p) => parseOptionalNumber(p.newValue),
      },
      {
        field: "widthFt",
        headerName: "W (ft)",
        editable: true,
        minWidth: 90,
        valueParser: (p) => parseOptionalNumber(p.newValue),
      },
      {
        field: "quantity",
        headerName: "Qty",
        editable: true,
        minWidth: 70,
        valueParser: (p) => parseOptionalNumber(p.newValue),
      },
      {
        field: "pitchMm",
        headerName: "Pitch",
        editable: true,
        minWidth: 80,
        valueParser: (p) => parseOptionalNumber(p.newValue),
      },
      { field: "brightness", headerName: "Brightness", editable: true, minWidth: 100 },
      {
        field: "serviceType",
        headerName: "Service",
        editable: true,
        minWidth: 100,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["", "Top", "Front/Rear"] },
      },
    ],
    []
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      editable: true,
      singleClickEdit: true,
    }),
    []
  );

  const getRowId = (params: GetRowIdParams) => toKey(params.data);

  const recalculateAudit = useCallback((updatedScreens: any[]) => {
    try {
      const normalized = updatedScreens.map((s: any) => ({
        name: s.name ?? s.externalName ?? "Screen",
        productType: s.productType,
        widthFt: s.widthFt ?? s.width,
        heightFt: s.heightFt ?? s.height,
        quantity: s.quantity ?? 1,
        pitchMm: s.pitchMm ?? s.pixelPitch ?? undefined,
        costPerSqFt: s.costPerSqFt,
        desiredMargin: s.desiredMargin,
        serviceType: s.serviceType,
        formFactor: s.formFactor,
        includeSpareParts: s.includeSpareParts !== false,
      }));

      const projectAddress = `${getValues("receiver.address") ?? ""} ${getValues("receiver.city") ?? ""} ${getValues("receiver.zipCode") ?? ""} ${getValues("details.location") ?? ""}`.trim();
      const { clientSummary, internalAudit } = calculateProposalAudit(normalized, {
        taxRate: getValues("details.taxRateOverride"),
        bondPct: getValues("details.bondRateOverride"),
        structuralTonnage: getValues("details.metadata.structuralTonnage"),
        reinforcingTonnage: getValues("details.metadata.reinforcingTonnage"),
        projectAddress,
        venue: getValues("details.venue"),
      });

      setValue("details.internalAudit", internalAudit);
      setValue("details.clientSummary", clientSummary);
    } catch (e) {
      console.error("ScreensGridEditor: Audit recalc failed", e);
    }
  }, [getValues, setValue]);

  const onCellValueChanged = (event: CellValueChangedEvent) => {
    const field = event.colDef.field as string | undefined;
    if (!field) return;

    const currentScreens = screensRef.current || [];
    const key = toKey(event.data);
    const idx = currentScreens.findIndex((s: any) => toKey(s) === key);
    if (idx < 0) return;

    const nextValue = (event.data as any)[field];
    setValue(`details.screens.${idx}.${field}` as any, nextValue, { shouldDirty: true, shouldValidate: true });

    // If height or width changed, recalculate areaSqFt for this screen
    if (field === "heightFt" || field === "widthFt") {
      const screen = currentScreens[idx];
      const height = field === "heightFt" ? nextValue : screen?.heightFt;
      const width = field === "widthFt" ? nextValue : screen?.widthFt;
      const area = calculateArea(Number(width) || 0, Number(height) || 0);
      setValue(`details.screens.${idx}.areaSqFt` as any, area, { shouldDirty: true });
    }

    // Recalculate full audit when relevant fields change
    if (AUDIT_TRIGGER_FIELDS.includes(field)) {
      // Build updated screens array with the new value
      const updatedScreens = currentScreens.map((s: any, i: number) => {
        if (i === idx) {
          return { ...s, [field]: nextValue };
        }
        return s;
      });
      recalculateAudit(updatedScreens);
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="shrink-0 px-4 py-3 border-b border-border bg-background/60">
        <div className="text-xs font-semibold tracking-wide">Screen Editor</div>
        <div className="text-[11px] text-muted-foreground">Edits here drive preview and export.</div>
      </div>
      <div className={["flex-1 min-h-0", themeClass].join(" ")}>
        <AgGridReact
          theme="legacy"
          rowData={screens as any[]}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          onCellValueChanged={onCellValueChanged}
          stopEditingWhenCellsLoseFocus
          suppressMovableColumns
          animateRows={false}
        />
      </div>
    </div>
  );
}
