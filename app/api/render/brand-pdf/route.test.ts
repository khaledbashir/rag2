import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { OPTIONS, POST } from "./route";

const ENDPOINT = "https://proposals.anc.com/api/render/brand-pdf";
const CRM_ORIGIN = "https://crm.ancsports.net";

async function samplePdf(pageCount = 1): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([612, 792]);
    page.drawText(`existing page ${index + 1}`, { x: 40, y: 40, size: 10 });
  }
  return document.save();
}

describe("POST /api/render/brand-pdf", () => {
  it("allows the CRM browser to call the renderer", async () => {
    const response = await OPTIONS(
      new NextRequest(ENDPOINT, {
        method: "OPTIONS",
        headers: { origin: CRM_ORIGIN },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(CRM_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "X-Anc-Brand-Warnings",
    );
  });

  it("returns a branded multipart upload and honours overlay options", async () => {
    const input = await samplePdf(2);
    const form = new FormData();
    form.append("file", new Blob([input], { type: "application/pdf" }), "Thunder Drawing.pdf");
    form.append("placement", "overlay");
    form.append("position", "bottom-right");
    form.append("pages", "first");
    form.append("title", "OKC Thunder");

    const response = await POST(
      new NextRequest(ENDPOINT, {
        method: "POST",
        headers: { origin: CRM_ORIGIN },
        body: form,
      }),
    );
    const output = await PDFDocument.load(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("ANC_OKC_Thunder.pdf");
    expect(response.headers.get("access-control-allow-origin")).toBe(CRM_ORIGIN);
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getWidth()).toBeCloseTo(612, 1);
    expect(output.getPage(0).getHeight()).toBeCloseTo(792, 1);
  });

  it("returns JSON for a bottom band and exposes what it applied", async () => {
    const input = await samplePdf();
    const response = await POST(
      new NextRequest(`${ENDPOINT}?format=json&edge=bottom`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          base64: Buffer.from(input).toString("base64"),
          fileName: "vendor-sheet.pdf",
          title: "Vendor Sheet",
        }),
      }),
    );
    const result = (await response.json()) as {
      base64: string;
      placement: string;
      edge: string;
      pageCount: number;
      stampedPages: number;
      warnings: string[];
    };
    const output = await PDFDocument.load(Buffer.from(result.base64, "base64"));

    expect(response.status).toBe(200);
    expect(result.placement).toBe("band");
    expect(result.edge).toBe("bottom");
    expect(result.pageCount).toBe(1);
    expect(result.stampedPages).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(output.getPage(0).getMediaBox().y).toBeLessThan(0);
  });

  it("rejects non-PDF bytes instead of returning a corrupt download", async () => {
    const response = await POST(
      new NextRequest(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: "not a pdf",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/not a PDF/) });
  });

  it("does not grant arbitrary websites browser access", async () => {
    const response = await OPTIONS(
      new NextRequest(ENDPOINT, {
        method: "OPTIONS",
        headers: { origin: "https://example.com" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
