import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { detectExistingBranding, existingBrandingWarning } from "@/lib/pdf/existingBranding";

/** A one-page PDF carrying exactly the lines given. */
async function sheetWith(...lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  lines.forEach((line, index) => {
    page.drawText(line, { x: 48, y: 720 - index * 18, size: 11, font });
  });
  return doc.save();
}

describe("detectExistingBranding", () => {
  it("says nothing about a sheet with no ANC marks on it", async () => {
    const detected = await detectExistingBranding(
      await sheetWith("Oklahoma City Thunder", "Pixel pitch: 4.0mm", "DRN BY: SAM LU"),
    );
    expect(detected.found).toBe(false);
    expect(existingBrandingWarning(detected)).toBeNull();
  });

  it("finds the footer a hand-rolled sandbox branding leaves behind", async () => {
    // The literal line off the 2026-08-21 Thunder drawing.
    const detected = await detectExistingBranding(
      await sheetWith("Prepared by ANC | Oklahoma City Thunder - Indoor LED Display | Aug 20, 2026"),
    );
    expect(detected.found).toBe(true);
    expect(detected.markers).toContain("Prepared by ANC");
    expect(detected.pages).toEqual([1]);
  });

  it("finds our own footer, so re-branding our own output warns too", async () => {
    const detected = await detectExistingBranding(
      await sheetWith("ANC | Scotia Drawing Set | August 2026 | www.anc.com"),
    );
    expect(detected.found).toBe(true);
    expect(detected.markers).toContain("www.anc.com");
  });

  it("finds the house document sign-off", async () => {
    const detected = await detectExistingBranding(await sheetWith("ANC Sports Enterprises"));
    expect(detected.markers).toContain("ANC Sports Enterprises");
  });

  it("does not fire on the company name alone", async () => {
    // "ANC" appears on every drawing this endpoint will ever see. Only a full
    // branding marker counts, or the warning is noise on every single call.
    const detected = await detectExistingBranding(
      await sheetWith("ANC display schedule", "Contact ANC for spares", "anc.com/support"),
    );
    expect(detected.found).toBe(false);
  });

  it("treats a document it cannot read as unknown, never as clean", async () => {
    const detected = await detectExistingBranding(Buffer.from("not a pdf at all"));
    expect(detected.found).toBe(false);
    expect(detected.unreadable).toBeTruthy();
    expect(existingBrandingWarning(detected)).toBeNull();
  });

  it("names every page a marker was found on", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const line of ["www.anc.com", "nothing here", "Prepared by ANC"]) {
      doc.addPage([612, 792]).drawText(line, { x: 48, y: 720, size: 11, font });
    }
    const detected = await detectExistingBranding(await doc.save());
    expect(detected.pages).toEqual([1, 3]);
    expect(existingBrandingWarning(detected)).toContain("pages 1, 3");
  });

  it("leaves the caller's bytes usable afterwards", async () => {
    // pdf.js detaches whatever buffer it is handed; the ink pass and pdf-lib both
    // still need these bytes after the check runs.
    const bytes = await sheetWith("www.anc.com");
    await detectExistingBranding(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    await expect(PDFDocument.load(bytes)).resolves.toBeTruthy();
  });
});
