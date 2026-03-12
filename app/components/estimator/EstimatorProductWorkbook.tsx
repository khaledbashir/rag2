"use client";

import React, { useEffect, useMemo, useState } from "react";
import WorkbookShell from "@/app/components/reusables/WorkbookShell";
import type { WorkbookData } from "@/app/components/reusables/workbookTypes";
import type { EstimatorAnswers } from "./questions";

interface ProductOption {
  id: string;
  label: string;
  pitch: number;
  name: string;
  manufacturer?: string;
  nits?: number;
  widthMm?: number;
  heightMm?: number;
}

interface EstimatorProductWorkbookProps {
  answers: EstimatorAnswers;
  onProductSelect: (displayIndex: number, product: ProductOption) => void;
  onDisplayEdit: (displayIndex: number, field: "displayName" | "heightFt" | "widthFt", value: string) => void;
}

export default function EstimatorProductWorkbook({
  answers,
  onProductSelect,
  onDisplayEdit,
}: EstimatorProductWorkbookProps) {
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    const env = answers.isIndoor ? "indoor" : "outdoor";
    fetch(`/api/rfp/pipeline/products?environment=${env}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setProducts(data?.products || []))
      .catch(() => setProducts([]));
  }, [answers.isIndoor]);

  const workbookData = useMemo<WorkbookData>(() => {
    const sortedProducts = [...products].sort((a, b) => a.label.localeCompare(b.label));
    return {
      fileName: "Budget Builder — LED Cost Sheet",
      sheets: [
        {
          name: "LED Cost Sheet",
          color: "#0A52EF",
          columns: [
            "Display", "Vendor", "Product", "Pitch",
            "H (ft)", "W (ft)", "H (px)", "W (px)",
            "SqFt/Screen", "Qty", "Total SqFt",
            "NITs", "Service", "$/SqFt", "Display Cost", "Processor", "Shipping", "Total Cost",
            "Margin %", "Selling Price",
          ],
          editableColumns: [0, 4, 5],
          rows: answers.displays.map((display, idx) => {
            const selectedProductId = display.productId || "";
            const product = products.find((p) => p.id === selectedProductId);
            const widthFt = display.widthFt || 0;
            const heightFt = display.heightFt || 0;
            const qty = 1;
            const pitch = product?.pitch ?? (parseFloat(display.pixelPitch || "0") || 0);
            const widthPx = pitch > 0 ? Math.round(widthFt * 304.8 / pitch) : 0;
            const heightPx = pitch > 0 ? Math.round(heightFt * 304.8 / pitch) : 0;
            const sqFtPerScreen = Math.round(widthFt * heightFt * 100) / 100;
            const totalSqFt = sqFtPerScreen * qty;
            return {
              cells: [
                { value: display.displayName || `Display ${idx + 1}`, bold: true },
                { value: product?.manufacturer || "—" },
                {
                  value: selectedProductId,
                  dropdown: sortedProducts.map((p) => ({ value: p.id, label: p.label })),
                  onDropdownChange: (value: string) => {
                    const nextProduct = products.find((p) => p.id === value);
                    if (nextProduct) onProductSelect(idx, nextProduct);
                  },
                },
                { value: product ? `${product.pitch}mm` : (display.pixelPitch ? `${display.pixelPitch}mm` : "—"), align: "center" },
                { value: heightFt || "", align: "right" },
                { value: widthFt || "", align: "right" },
                { value: heightPx || "", align: "right" },
                { value: widthPx || "", align: "right" },
                { value: sqFtPerScreen || "", align: "right" },
                { value: qty, align: "center" },
                { value: totalSqFt || "", align: "right" },
                { value: product?.nits || "—", align: "center" },
                { value: display.serviceType || "—", align: "center" },
                { value: "", align: "right" },
                { value: "", align: "right" },
                { value: "", align: "right" },
                { value: "", align: "right" },
                { value: "", align: "right" },
                { value: "", align: "center" },
                { value: "", align: "right" },
              ],
            };
          }),
        },
      ],
    };
  }, [answers.displays, onProductSelect, products]);

  return (
    <WorkbookShell
      data={workbookData}
      editable
      onCellEdit={(_sheetIdx, rowIdx, colIdx, value) => {
        if (colIdx === 0) onDisplayEdit(rowIdx, "displayName", value);
        if (colIdx === 4) onDisplayEdit(rowIdx, "heightFt", value);
        if (colIdx === 5) onDisplayEdit(rowIdx, "widthFt", value);
      }}
    />
  );
}
