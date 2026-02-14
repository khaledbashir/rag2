/**
 * PricingTableParser - Enterprise-grade Excel to PricingTable[] converter
 *
 * Parses any Margin Analysis Excel format into normalized PricingTable[] structure.
 * Designed for Natalia's "Mirror Mode" - exact replication of Excel pricing.
 *
 * ARCHITECTURE: This file is a re-export shim. All logic lives in parser/ sub-modules:
 *   - parser/types.ts          — internal types (RawRow, ColumnMap, TableBoundary)
 *   - parser/columnDetection.ts — finds pricing column headers
 *   - parser/rowParser.ts       — row parsing + subtotal detection
 *   - parser/boundaryDetection.ts — table boundary detection
 *   - parser/tableExtraction.ts — extracts PricingTable from boundaries
 *   - parser/validation.ts      — builds validation reports
 *   - parser/index.ts           — main orchestrator
 */

export {
  PRICING_PARSER_STRICT_VERSION,
  parsePricingTables,
  parsePricingTablesWithValidation,
} from "./parser/index";

export type {
  ParsePricingOptions,
  ParsePricingResult,
} from "./parser/index";
