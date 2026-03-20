"use client";

import type { CellValueChangedEvent, ColDef, GetRowIdParams } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ProposalType } from "@/types";
import {
  calculateExhibitG,
  calculateHardwareCost,
  estimatePricing,
  getAllProducts,
  getProduct,
  getProductByPitch,
} from "@/services/rfp/productCatalog";
import { formatCurrency } from "@/lib/helpers";

// Register AG Grid modules (required for v35+)
ModuleRegistry.registerModules([AllCommunityModule]);

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

function deriveZoneSizeFromArea(areaM2: number): "small" | "medium" | "large" {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return "small";
  if (areaM2 < 10) return "small";
  if (areaM2 <= 50) return "medium";
  return "large";
}

function toZoneClass(
  zoneComplexity: "standard" | "complex",
  zoneSize: "small" | "medium" | "large",
): "standard" | "medium" | "large" | "complex" {
  if (zoneComplexity === "complex") return "complex";
  if (zoneSize === "large") return "large";
  if (zoneSize === "medium") return "medium";
  return "standard";
}

export default function ScreensGridEditor() {
  const { control, setValue } = useFormContext<ProposalType>();
  const screens = useWatch({ control, name: "details.screens" }) || [];
  const productOptions = useMemo(
    () =>
      getAllProducts()
        .slice()
        .sort((a, b) => a.pitchMm - b.pitchMm)
        .map((p) => ({
          id: p.id,
          label:
            p.id === "4mm-nitxeon"
              ? "4mm Indoor (Nitxeon)"
              : p.id === "10mm-mesh"
                ? "10mm Mesh"
                : p.id === "2.5mm-mip"
                  ? "2.5mm Premium (MIP)"
                  : p.name,
        })),
    []
  );
  const productLabelMap = useMemo(
    () => Object.fromEntries(productOptions.map((p) => [p.id, p.label])),
    [productOptions]
  );

  const themeClass = useMemo(
    () => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "ag-theme-quartz-dark" : "ag-theme-quartz"),
    []
  );

  const screensRef = useRef<any[]>(screens);
  screensRef.current = screens;

  const computeRom = (screen: any) => {
    if (!screen || screen?.isManualLineItem) {
      return {
        ...screen,
        calculatedExhibitG: undefined,
        calculatedPricing: undefined,
      };
    }

    const widthFt = Number(screen?.widthFt ?? 0);
    const heightFt = Number(screen?.heightFt ?? 0);
    const pitchMm = Number(screen?.pitchMm ?? 0);

    let productId = (screen?.productType || "").toString().trim();
    if (!productId && pitchMm > 0) {
      const byPitch = getProductByPitch(pitchMm);
      if (byPitch) productId = byPitch.id;
    }
    const product = productId ? getProduct(productId) : undefined;

    const zoneComplexity: "standard" | "complex" =
      screen?.zoneComplexity === "complex" ? "complex" : "standard";

    if (!product || widthFt <= 0 || heightFt <= 0) {
      return {
        ...screen,
        productType: product?.id ?? productId ?? screen?.productType ?? "",
        zoneComplexity,
        zoneSize: screen?.zoneSize || "small",
        calculatedExhibitG: undefined,
        calculatedPricing: undefined,
      };
    }

    const effectivePitch = pitchMm > 0 ? pitchMm : product.pitchMm;
    if (effectivePitch <= 0) {
      return {
        ...screen,
        productType: product.id,
        zoneComplexity,
        zoneSize: screen?.zoneSize || "small",
        calculatedExhibitG: undefined,
        calculatedPricing: undefined,
      };
    }

    const resolutionW = Math.round((widthFt * 304.8) / effectivePitch);
    const resolutionH = Math.round((heightFt * 304.8) / effectivePitch);
    if (resolutionW <= 0 || resolutionH <= 0) {
      return {
        ...screen,
        productType: product.id,
        zoneComplexity,
        zoneSize: screen?.zoneSize || "small",
        calculatedExhibitG: undefined,
        calculatedPricing: undefined,
      };
    }

    const exhibitG = calculateExhibitG(product, resolutionW, resolutionH);
    const autoZoneSize = deriveZoneSizeFromArea(exhibitG.activeAreaM2);
    const zoneSize: "small" | "medium" | "large" =
      screen?.zoneSize === "small" || screen?.zoneSize === "medium" || screen?.zoneSize === "large"
        ? screen.zoneSize
        : autoZoneSize;
    const zoneClass = toZoneClass(zoneComplexity, zoneSize);
    const hwCost = calculateHardwareCost(exhibitG.activeAreaM2, product.id);
    const pricing = estimatePricing(exhibitG, zoneClass, hwCost);

    // Auto-set serviceType from product: Halo/Ribbon/Fascia → "Top", else → "Front/Rear"
    const productName = (product.name || product.id || "").toLowerCase();
    const isTopService = /halo|ribbon|fascia/.test(productName);
    const autoServiceType = isTopService ? "Top" : "Front/Rear";

    return {
      ...screen,
      productType: product.id,
      serviceType: screen?.serviceType || autoServiceType,
      zoneComplexity,
      zoneSize,
      pitchMm: pitchMm > 0 ? pitchMm : product.pitchMm,
      resolutionW,
      resolutionH,
      pixelResolution: resolutionW * resolutionH,
      calculatedExhibitG: {
        displayWidthFt: exhibitG.displayWidthFt,
        displayHeightFt: exhibitG.displayHeightFt,
        resolutionW: exhibitG.resolutionW,
        resolutionH: exhibitG.resolutionH,
        activeAreaM2: exhibitG.activeAreaM2,
        activeAreaSqFt: exhibitG.activeAreaSqFt,
        maxPowerW: screen.manualMaxPowerW ?? exhibitG.maxPowerW,
        avgPowerW: screen.manualAvgPowerW ?? exhibitG.avgPowerW,
        totalWeightLbs: screen.manualWeightLbs ?? exhibitG.totalWeightLbs,
        pitchMm: exhibitG.pitchMm,
      },
      calculatedPricing: {
        installCost: pricing.installCost,
        pmCost: pricing.pmCost,
        engCost: pricing.engCost,
        hardwareCost: pricing.hardwareCost,
        totalEstimate: pricing.totalEstimate,
        zoneClass: pricing.zoneClass,
      },
    };
  };

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
      {
        field: "productType",
        headerName: "Product",
        editable: true,
        minWidth: 180,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: productOptions.map((p) => p.id) },
        valueFormatter: (p) => productLabelMap[(p.value || "").toString()] || (p.value || "Select Product"),
      },
      {
        field: "zoneComplexity",
        headerName: "Complexity",
        editable: true,
        minWidth: 110,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["standard", "complex"] },
      },
      {
        field: "zoneSize",
        headerName: "Zone Size",
        editable: true,
        minWidth: 100,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["small", "medium", "large"] },
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
      {
        field: "calculatedExhibitG.maxPowerW",
        headerName: "Max Power (W)",
        editable: false,
        minWidth: 130,
        valueGetter: (p) => p.data?.calculatedExhibitG?.maxPowerW ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : Number(p.value).toLocaleString("en-US")),
      },
      {
        field: "calculatedExhibitG.totalWeightLbs",
        headerName: "Weight (lbs)",
        editable: false,
        minWidth: 120,
        valueGetter: (p) => p.data?.calculatedExhibitG?.totalWeightLbs ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : Number(p.value).toLocaleString("en-US")),
      },
      {
        field: "calculatedPricing.installCost",
        headerName: "Install Labor",
        editable: false,
        minWidth: 130,
        valueGetter: (p) => p.data?.calculatedPricing?.installCost ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : formatCurrency(Number(p.value))),
      },
      {
        field: "calculatedPricing.pmCost",
        headerName: "PM Cost",
        editable: false,
        minWidth: 110,
        valueGetter: (p) => p.data?.calculatedPricing?.pmCost ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : formatCurrency(Number(p.value))),
      },
      {
        field: "calculatedPricing.engCost",
        headerName: "Engineering",
        editable: false,
        minWidth: 120,
        valueGetter: (p) => p.data?.calculatedPricing?.engCost ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : formatCurrency(Number(p.value))),
      },
      {
        field: "calculatedPricing.hardwareCost",
        headerName: "Hardware",
        editable: false,
        minWidth: 130,
        valueGetter: (p) => p.data?.calculatedPricing?.hardwareCost ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : formatCurrency(Number(p.value))),
      },
    ],
    [productOptions, productLabelMap]
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

  const onCellValueChanged = (event: CellValueChangedEvent) => {
    const field = event.colDef.field as string | undefined;
    if (!field) return;

    const currentScreens = screensRef.current || [];
    const key = toKey(event.data);
    const idx = currentScreens.findIndex((s: any) => toKey(s) === key);
    if (idx < 0) return;

    const nextValue = (event.data as any)[field];
    const nextRow = {
      ...(currentScreens[idx] || {}),
      ...(event.data || {}),
      [field]: nextValue,
    };
    const computed = computeRom(nextRow);
    setValue(`details.screens.${idx}` as any, computed, { shouldDirty: true, shouldValidate: true });
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
