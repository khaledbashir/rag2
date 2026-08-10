import type { BidFormFillResult } from "./bidFormFiller";

const METADATA_ENCODING_HEADER = "X-Bid-Form-Metadata-Encoding";
const METADATA_ENCODING = "uri-v1";

export const BID_FORM_METADATA_HEADERS = {
  matches: "X-Bid-Form-Matches",
  unmatchedBlocks: "X-Bid-Form-Unmatched-Blocks",
  unmatchedScreens: "X-Bid-Form-Unmatched-Screens",
  totalBlocks: "X-Bid-Form-Total-Blocks",
  totalScreens: "X-Bid-Form-Total-Screens",
  matchCount: "X-Bid-Form-Match-Count",
  unmatchedBlockCount: "X-Bid-Form-Unmatched-Block-Count",
  unmatchedScreenCount: "X-Bid-Form-Unmatched-Screen-Count",
} as const;

type BidFormMetadata = Pick<
  BidFormFillResult,
  "matches" | "unmatchedBlocks" | "unmatchedScreens" | "totalBlocks" | "totalScreens"
>;

/**
 * HTTP header values must be ByteStrings. URI encoding keeps the detailed
 * match metadata ASCII-only while preserving Unicode display names.
 */
export function encodeBidFormMetadata(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

export function buildBidFormMetadataHeaders(
  result: BidFormMetadata,
): Record<string, string> {
  return {
    [METADATA_ENCODING_HEADER]: METADATA_ENCODING,
    [BID_FORM_METADATA_HEADERS.matches]: encodeBidFormMetadata(result.matches),
    [BID_FORM_METADATA_HEADERS.unmatchedBlocks]: encodeBidFormMetadata(result.unmatchedBlocks),
    [BID_FORM_METADATA_HEADERS.unmatchedScreens]: encodeBidFormMetadata(result.unmatchedScreens),
    [BID_FORM_METADATA_HEADERS.totalBlocks]: String(result.totalBlocks),
    [BID_FORM_METADATA_HEADERS.totalScreens]: String(result.totalScreens),
    [BID_FORM_METADATA_HEADERS.matchCount]: String(result.matches.length),
    [BID_FORM_METADATA_HEADERS.unmatchedBlockCount]: String(result.unmatchedBlocks.length),
    [BID_FORM_METADATA_HEADERS.unmatchedScreenCount]: String(result.unmatchedScreens.length),
  };
}

export function readBidFormMetadataHeader<T>(
  headers: Pick<Headers, "get">,
  headerName: string,
  fallback: T,
): T {
  const rawValue = headers.get(headerName);
  if (!rawValue) return fallback;

  try {
    const serialized = headers.get(METADATA_ENCODING_HEADER) === METADATA_ENCODING
      ? decodeURIComponent(rawValue)
      : rawValue;
    return JSON.parse(serialized) as T;
  } catch {
    return fallback;
  }
}
