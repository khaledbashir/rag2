import { isMirrorMode, isModeUnselected } from "@/lib/modeDetection";

export type ProposalPreviewState =
    | "mode-unselected"
    | "excel-loading"
    | "excel-required"
    | "template";

/**
 * Intelligence projects are form-driven and can render immediately.
 * Only Mirror/AI-import projects require an imported workbook before preview.
 */
export function getProposalPreviewState(
    details: unknown,
    hasExcelPreview: boolean,
    excelImportLoading: boolean,
): ProposalPreviewState {
    if (isModeUnselected(details)) return "mode-unselected";
    if (!isMirrorMode(details)) return "template";
    // Service-sheet imports render from the persisted servicePricingDocument,
    // not the in-memory workbook — previewable immediately and after reload.
    if ((details as any)?.servicePricingDocument) return "template";
    if (hasExcelPreview) return "template";
    return excelImportLoading ? "excel-loading" : "excel-required";
}
