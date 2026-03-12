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
  widthMm?: number;
  heightMm?: number;
}

interface EstimatorProductWorkbookProps {
  answers: EstimatorAnswers;
  onProductSelect: (displayIndex: number, product: ProductOption) => void;
}

export default function EstimatorProductWorkbook({
  answers,
  onProductSelect,
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
      fileName: "Budget Builder — Inline Product Picker",
      sheets: [
        {
          name: "LED Product Picker",
          color: "#0A52EF",
          columns: ["Display", "Product", "Pitch", "H (ft)", "W (ft)", "Qty"],
          editableColumns: [],
          rows: answers.displays.map((display, idx) => {
            const selectedProductId = display.productId || "";
            const product = products.find((p) => p.id === selectedProductId);
            return {
              cells: [
                { value: display.displayName || `Display ${idx + 1}`, bold: true },
                {
                  value: selectedProductId,
                  dropdown: sortedProducts.map((p) => ({ value: p.id, label: p.label })),
                  onDropdownChange: (value: string) => {
                    const nextProduct = products.find((p) => p.id === value);
                    if (nextProduct) onProductSelect(idx, nextProduct);
                  },
                },
                { value: product ? `${product.pitch}mm` : (display.pixelPitch ? `${display.pixelPitch}mm` : "—"), align: "center" },
                { value: display.heightFt || 0, align: "right" },
                { value: display.widthFt || 0, align: "right" },
                { value: 1, align: "center" },
              ],
            };
          }),
        },
      ],
    };
  }, [answers.displays, onProductSelect, products]);

  return <WorkbookShell data={workbookData} />;
}
