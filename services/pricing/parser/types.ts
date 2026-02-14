/**
 * Internal types for the pricing table parser pipeline.
 * Shared across all parser sub-modules.
 */

export interface RawRow {
  rowIndex: number;
  cells: any[];
  label: string;
  labelNorm: string;
  cost: number;
  sell: number;
  margin: number;
  marginPct: number;
  isEmpty: boolean;
  isHeader: boolean;
  isSubtotal: boolean;
  isTax: boolean;
  isBond: boolean;
  isGrandTotal: boolean;
  isAlternateHeader: boolean;
  isAlternateLine: boolean;
}

export interface ColumnMap {
  label: number;
  cost: number;
  sell: number;
  margin: number;
  marginPct: number;
}

export interface TableBoundary {
  name: string;
  startRow: number;
  endRow: number;
  alternatesStartRow: number | null;
  alternatesEndRow: number | null;
}
