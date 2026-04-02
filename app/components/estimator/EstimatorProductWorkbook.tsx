"use client";

import React, { useMemo } from "react";
import WorkbookShell from "@/app/components/reusables/WorkbookShell";
import type { WorkbookData } from "@/app/components/reusables/workbookTypes";
import type { EstimatorAnswers } from "./questions";
import type { ScreenCalc } from "./EstimatorBridge";

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
  calcs: ScreenCalc[];
  products: ProductOption[];
  onProductSelect: (displayIndex: number, product: ProductOption) => void;
}

const fmt = (n: number) => n > 0 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";
const fmtPct = (n: number) => n > 0 ? `${(n * 100).toFixed(1)}%` : "—";

export default function EstimatorProductWorkbook({
  answers,
  calcs,
  products,
  onProductSelect,
}: EstimatorProductWorkbookProps) {
  const workbookData = useMemo<WorkbookData>(() => {
    const sortedProducts = [...products].sort((a, b) => a.label.localeCompare(b.label));
    const dropdownOpts = sortedProducts.map((p) => ({ value: p.id, label: p.label }));

    return {
      fileName: "LED Cost Sheet",
      sheets: [
        {
          name: "LED Cost Sheet",
          color: "#0A52EF",
          columns: [
            "Display", "Vendor", "Product", "Pitch",
            "H (ft)", "W (ft)", "Qty", "Total SqFt",
            "$/SqFt", "Display Cost", "Processor", "Shipping", "Total Cost",
            "Margin %", "Selling Price",
          ],
          rows: answers.displays.map((display, idx) => {
            const calc = calcs[idx];
            const selectedProductId = display.productId || "";
            const product = products.find((p) => p.id === selectedProductId);

            return {
              cells: [
                { value: display.name || display.displayName || `Display ${idx + 1}`, bold: true },
                { value: product?.manufacturer || "—" },
                {
                  value: selectedProductId,
                  dropdown: dropdownOpts,
                  onDropdownChange: (value: string) => {
                    const nextProduct = products.find((p) => p.id === value);
                    if (nextProduct) onProductSelect(idx, nextProduct);
                  },
                },
                { value: product ? `${product.pitch}mm` : (display.pixelPitch ? `${display.pixelPitch}mm` : "—"), align: "center" as const },
                { value: display.heightFt || "", align: "right" as const },
                { value: display.widthFt || "", align: "right" as const },
                { value: display.quantity || 1, align: "center" as const },
                { value: calc?.areaSqFt ? Math.round(calc.areaSqFt) : "", align: "right" as const },
                { value: calc?.costPerSqFt ? fmt(calc.costPerSqFt) : "—", align: "right" as const },
                { value: calc ? fmt(calc.hardwareCost + calc.spareParts) : "—", align: "right" as const, currency: true },
                { value: calc ? fmt(calc.processorCost + calc.equipmentCost) : "—", align: "right" as const, currency: true },
                { value: calc ? fmt(calc.shippingCost) : "—", align: "right" as const, currency: true },
                { value: calc ? fmt(calc.totalCost) : "—", align: "right" as const, currency: true, bold: true },
                { value: calc ? fmtPct(calc.marginPct) : "—", align: "center" as const },
                { value: calc ? fmt(calc.sellPrice) : "—", align: "right" as const, currency: true, bold: true },
              ],
            };
          }),
        },
      ],
    };
  }, [answers.displays, calcs, onProductSelect, products]);

  if (!products.length) return null;

  return <WorkbookShell data={workbookData} />;
}
