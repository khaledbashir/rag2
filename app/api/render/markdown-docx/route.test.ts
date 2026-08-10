import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { OPTIONS, POST } from "./route";

const CRM_ORIGIN = "https://crm.ancsports.net";

describe("markdown Word export browser access", () => {
  it("allows the CRM to request a Word document", async () => {
    const response = await OPTIONS(
      new NextRequest("https://proposals.anc.com/api/render/markdown-docx", {
        method: "OPTIONS",
        headers: { origin: CRM_ORIGIN },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(CRM_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("returns a real downloadable Word file to the CRM", async () => {
    const response = await POST(
      new NextRequest("https://proposals.anc.com/api/render/markdown-docx", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: CRM_ORIGIN,
        },
        body: JSON.stringify({
          markdown: "# M&T Bank Stadium\n\n## Recommendation\n\n- Replace the display",
          subtitle: "Prepared from the CRM AI",
        }),
      }),
    );

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(CRM_ORIGIN);
    expect(response.headers.get("content-type")).toContain("wordprocessingml.document");
    expect(response.headers.get("content-disposition")).toContain("M-T-Bank-Stadium.docx");
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });

  it("does not grant arbitrary websites browser access", async () => {
    const response = await OPTIONS(
      new NextRequest("https://proposals.anc.com/api/render/markdown-docx", {
        method: "OPTIONS",
        headers: { origin: "https://example.com" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
