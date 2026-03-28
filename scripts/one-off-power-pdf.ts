/**
 * One-time script: Generate a branded PDF from Natalia's Power Requirements Excel
 * Run: npx tsx scripts/one-off-power-pdf.ts
 */

import XLSX from "xlsx";
import puppeteer from "puppeteer";
import { writeFileSync } from "fs";

const wb = XLSX.readFile("Power Requirements Per Display - Pacers Single Display (1).xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

const headers = rows[0] as string[];
const dataRows = rows.slice(1).filter((r: any) => r && r.length > 0);

// Format numbers nicely
function fmt(val: any, decimals = 2): string {
  if (val == null || val === "") return "—";
  if (typeof val === "string") return val;
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Column display config: [header label, format decimals, unit suffix]
const colConfig: Array<[string, number, string]> = [
  ["Display Name", 0, ""],
  ["Product", 0, ""],
  ["Width", 2, " ft"],
  ["Height", 2, " ft"],
  ["Width", 2, " m"],
  ["Height", 2, " m"],
  ["LED Area", 2, " m²"],
  ["VA/m²", 0, ""],
  ["Total VA", 1, " VA"],
  ["Amps @208V", 2, " A"],
  ["Qty", 0, ""],
  ["Total Power", 2, " A"],
  ["w/ Safety (120%)", 2, " A"],
  ["Weight", 0, ""],
];

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; background: white; color: #1F2937; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0A52EF; padding-bottom: 12px; margin-bottom: 24px; }
  .header-left img { height: 36px; }
  .header-right { text-align: right; }
  .doc-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; color: #0A52EF; }
  .doc-title { font-size: 16px; font-weight: 700; color: #1F2937; margin-top: 2px; }
  .doc-subtitle { font-size: 11px; color: #6B7280; margin-top: 2px; }

  .section-header { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
  .section-bar { width: 3px; height: 14px; background: #0A52EF; border-radius: 1px; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #002C73; }

  table { width: 100%; border-collapse: collapse; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; }
  thead tr { border-bottom: 2px solid #0A52EF; }
  th { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #002C73; padding: 8px 10px; text-align: left; white-space: nowrap; }
  td { font-size: 12px; padding: 8px 10px; border-top: 1px solid #F3F4F6; }
  tr:nth-child(even) td { background: #F9FAFB; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .highlight { font-weight: 600; color: #002C73; }

  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { display: flex; align-items: center; gap: 6px; }
  .footer-bar { width: 3px; height: 14px; background: #0A52EF; border-radius: 1px; }
  .footer-url { font-size: 12px; font-weight: 600; color: #0A52EF; }
  .footer-right { font-size: 12px; color: #6B7280; }

  .notes { margin-top: 16px; padding: 12px; background: #F9FAFB; border-radius: 8px; font-size: 11px; color: #6B7280; line-height: 1.5; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <img src="https://proposals.anc.com/ANC_Logo_2023_blue.png" alt="ANC" style="height: 36px;">
  </div>
  <div class="header-right">
    <div class="doc-label">Power Requirements</div>
    <div class="doc-title">Pacers — Single Display Options</div>
    <div class="doc-subtitle">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
  </div>
</div>

<div class="section-header">
  <div class="section-bar"></div>
  <div class="section-title">Power Requirements Per Display</div>
</div>

<table>
  <thead>
    <tr>
      ${colConfig.map(([label], i) => {
        const isNum = i >= 2;
        return `<th${isNum ? ' class="num"' : ''}>${label}</th>`;
      }).join("\n      ")}
    </tr>
  </thead>
  <tbody>
    ${dataRows.map((row: any) => `<tr>
      ${colConfig.map(([_, dec, suffix], i) => {
        const val = row[i];
        const isNum = i >= 2;
        const isHighlight = i === 0 || i === 1;
        const cls = [isNum ? "num" : "", isHighlight ? "highlight" : ""].filter(Boolean).join(" ");
        const display = i === 0 || i === 1 || i === 13 ? String(val || "—") : fmt(val, dec) + suffix;
        return `<td${cls ? ` class="${cls}"` : ''}>${display}</td>`;
      }).join("\n      ")}
    </tr>`).join("\n    ")}
  </tbody>
</table>

<div class="notes">
  <strong>Notes:</strong> Safety factor applied at 120% of calculated power draw. All values based on manufacturer specifications at maximum brightness. Actual power consumption may vary based on content and environmental conditions.
</div>

<div class="footer">
  <div class="footer-left">
    <div class="footer-bar"></div>
    <span class="footer-url">www.anc.com</span>
  </div>
  <div class="footer-right">ANC Sports Enterprises, LLC</div>
</div>

</body>
</html>`;

async function generate() {
  // Save HTML for preview
  writeFileSync("/tmp/power-requirements.html", html);
  console.log("HTML saved to /tmp/power-requirements.html");

  // Generate PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: "/tmp/Power_Requirements_Pacers_Single_Display.pdf",
    width: "11in",
    height: "8.5in",
    landscape: true,
    printBackground: true,
    margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
  });
  await browser.close();
  console.log("PDF saved to /tmp/Power_Requirements_Pacers_Single_Display.pdf");
}

generate().catch(console.error);
