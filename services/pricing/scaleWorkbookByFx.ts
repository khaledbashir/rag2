/**
 * scaleWorkbookByFx — Multiplies every currency-formatted numeric cell in an
 * ExcelJS workbook by the user-entered USD→target exchange rate.
 *
 * The scoping workbook generator emits USD-native values with the selected
 * currency's symbol (£/€/C$) already applied at the numFmt level. Before the
 * workbook reaches the user (preview or download), we walk every sheet and
 * multiply monetary cell values by `fx` so the displayed numbers match the
 * symbol.
 *
 * This is intentionally a POST-processing step rather than a parameter on the
 * generator: `services/rfp/pipeline/generateScopingWorkbook.ts` is shared with
 * the protected RFP pipeline, so we keep scaling outside it.
 *
 * Detection rule: cell has a numFmt containing a currency symbol or ISO marker
 *   — $, £, €, C$, USD, CAD, EUR, GBP — AND a numeric value (or a formula
 *   result). Percent cells (% in numFmt) are never scaled. Formula result
 *   caches are scaled alongside raw numbers so the in-browser Univer preview
 *   (which reads cached results) stays consistent with what Excel will show
 *   after re-evaluation.
 */

import type ExcelJS from "exceljs";
import { resolveExchangeRate } from "@/lib/pricingMath";

const CURRENCY_NUMFMT_MARKERS = ["$", "£", "€", "C$", "USD", "CAD", "EUR", "GBP"];

function isCurrencyNumFmt(numFmt: string | undefined): boolean {
    if (!numFmt) return false;
    if (numFmt.includes("%")) return false;
    return CURRENCY_NUMFMT_MARKERS.some((marker) => numFmt.includes(marker));
}

export function scaleWorkbookByFx(workbook: ExcelJS.Workbook, exchangeRate: number | null | undefined): void {
    const fx = resolveExchangeRate(exchangeRate);
    if (fx === 1) return;

    workbook.eachSheet((ws) => {
        ws.eachRow({ includeEmpty: false }, (row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (!isCurrencyNumFmt(cell.numFmt)) return;

                const value = cell.value;
                if (typeof value === "number" && Number.isFinite(value)) {
                    cell.value = value * fx;
                    return;
                }

                if (value && typeof value === "object" && "formula" in value) {
                    const f = value as { formula: string; result?: unknown };
                    if (typeof f.result === "number" && Number.isFinite(f.result)) {
                        cell.value = { formula: f.formula, result: f.result * fx };
                    }
                }
            });
        });
    });
}
