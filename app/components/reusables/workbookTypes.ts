/**
 * Shared types for Excel-like workbook rendering.
 * Used by both the Estimator (ExcelPreview) and RFP Analyzer (WorkbookShell).
 */

export interface SheetCell {
  value: string | number;
  bold?: boolean;
  header?: boolean;
  currency?: boolean;
  percent?: boolean;
  highlight?: boolean;
  formula?: string;
  align?: "left" | "center" | "right";
  span?: number;
  /** Optional click handler (e.g., source page jumps) */
  onClick?: () => void;
  /** CSS class override for special styling */
  className?: string;
  /** Dropdown options — renders a <select> instead of text */
  dropdown?: { value: string; label: string }[];
  /** Callback when dropdown selection changes */
  onDropdownChange?: (value: string) => void;
  /** Remove row callback — renders a small × button */
  onRemove?: () => void;
  /** Repair row callback — renders a wrench icon button */
  onRepair?: () => void;
}

export interface SheetRow {
  cells: SheetCell[];
  isHeader?: boolean;
  isSeparator?: boolean;
  isTotal?: boolean;
}

export interface SheetTab {
  name: string;
  color: string;
  columns: string[];
  rows: SheetRow[];
  active?: boolean;
  /** If true, show placeholder message instead of grid */
  placeholder?: boolean;
  placeholderMessage?: string;
  /** Column index that is editable (-1 = none, undefined = all if editable) */
  editableColumns?: number[];
  /** Small badge count shown on tab (e.g., number of edited fields) */
  badge?: number;
}

export interface WorkbookData {
  fileName: string;
  sheets: SheetTab[];
}
