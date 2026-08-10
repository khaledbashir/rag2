import { describe, expect, it } from "vitest";
import {
  BID_FORM_METADATA_HEADERS,
  buildBidFormMetadataHeaders,
  readBidFormMetadataHeader,
} from "./bidFormResponseMetadata";

describe("bid-form response metadata headers", () => {
  it("round-trips Unicode display names through ByteString-safe headers", () => {
    const matches = [{
      sheetName: "250720_SUMMARY",
      displayName: "Level 400 – Team Store Zone",
      matchedScreen: "Owner’s Suite – East",
      confidence: 0.98,
      fieldsFilled: ["Pixel pitch – mm"],
      fieldsSkipped: [],
    }];
    const responseHeaders = buildBidFormMetadataHeaders({
      matches,
      unmatchedBlocks: ["Concourse – North"],
      unmatchedScreens: ["Browns’ Tunnel"],
      totalBlocks: 2,
      totalScreens: 2,
    });

    for (const value of Object.values(responseHeaders)) {
      expect([...value].every((character) => character.charCodeAt(0) <= 255)).toBe(true);
    }

    const headers = new Headers(responseHeaders);
    expect(readBidFormMetadataHeader(headers, BID_FORM_METADATA_HEADERS.matches, [])).toEqual(matches);
    expect(readBidFormMetadataHeader(headers, BID_FORM_METADATA_HEADERS.unmatchedBlocks, [])).toEqual([
      "Concourse – North",
    ]);
    expect(readBidFormMetadataHeader(headers, BID_FORM_METADATA_HEADERS.unmatchedScreens, [])).toEqual([
      "Browns’ Tunnel",
    ]);
  });

  it("continues to read legacy JSON headers", () => {
    const headers = new Headers({
      [BID_FORM_METADATA_HEADERS.unmatchedBlocks]: JSON.stringify(["Legacy block"]),
    });

    expect(readBidFormMetadataHeader(
      headers,
      BID_FORM_METADATA_HEADERS.unmatchedBlocks,
      [],
    )).toEqual(["Legacy block"]);
  });
});
