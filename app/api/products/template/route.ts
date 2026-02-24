/**
 * /api/products/template — Download product catalog import templates
 *
 * GET ?type=led  → LED display products template (.xlsx)
 * GET ?type=cms  → CMS/Scoring equipment template (.xlsx)
 * GET ?type=all  → Combined template with both sheets (.xlsx)
 * GET (default)  → Combined template
 *
 * Each template has the correct column headers matching the import endpoint,
 * plus 2-3 example rows so users know the expected format.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

const LED_HEADERS = [
  "manufacturer",
  "product_family",
  "model_number",
  "display_name",
  "pixel_pitch",
  "cabinet_width_mm",
  "cabinet_height_mm",
  "cabinet_depth_mm",
  "weight_kg",
  "max_nits",
  "typical_nits",
  "refresh_rate",
  "max_power_watts",
  "typical_power_watts",
  "environment",
  "ip_rating",
  "service_type",
  "is_curved",
  "cost_per_sqft",
  "msrp_per_sqft",
];

const LED_EXAMPLES = [
  {
    manufacturer: "Yaham",
    product_family: "MiracleV",
    model_number: "YMV-HO4T",
    display_name: "MiracleV HO4T 4mm Outdoor",
    pixel_pitch: 4,
    cabinet_width_mm: 960,
    cabinet_height_mm: 960,
    cabinet_depth_mm: 95,
    weight_kg: 30,
    max_nits: 6000,
    typical_nits: 4500,
    refresh_rate: 3840,
    max_power_watts: 600,
    typical_power_watts: 200,
    environment: "outdoor",
    ip_rating: "IP65",
    service_type: "front",
    is_curved: "no",
    cost_per_sqft: 85,
    msrp_per_sqft: "",
  },
  {
    manufacturer: "LG",
    product_family: "LSAA",
    model_number: "LSAA012-DX",
    display_name: "LG LSAA 1.2mm Indoor",
    pixel_pitch: 1.2,
    cabinet_width_mm: 600,
    cabinet_height_mm: 337.5,
    cabinet_depth_mm: 44.9,
    weight_kg: 5.8,
    max_nits: 1200,
    typical_nits: 600,
    refresh_rate: 7680,
    max_power_watts: 150,
    typical_power_watts: 52.5,
    environment: "indoor",
    ip_rating: "",
    service_type: "front",
    is_curved: "no",
    cost_per_sqft: 210,
    msrp_per_sqft: "",
  },
];

const CMS_HEADERS = [
  "manufacturer",
  "product_family",
  "model_number",
  "display_name",
  "product_type",
  "unit_cost",
  "unit_sell_price",
  "margin_percent",
  "category",
  "width_mm",
  "height_mm",
  "depth_mm",
  "weight_lbs",
  "environment",
  "specs",
  "quote_ref",
];

const CMS_EXAMPLES = [
  {
    manufacturer: "OES",
    product_family: "Scoring & Timing",
    model_number: "SHOTS36UCS",
    display_name: '36" PRO Play Clock (Outdoor)',
    product_type: "cms",
    unit_cost: 5915,
    unit_sell_price: 6959,
    margin_percent: 15,
    category: "play_clock",
    width_mm: 1803,
    height_mm: 1467,
    depth_mm: 152,
    weight_lbs: 165,
    environment: "outdoor",
    specs: "36\" PRO Segmented LED Digits, Unistrut Mounting",
    quote_ref: "42360-P (49ers, Mar 2024)",
  },
  {
    manufacturer: "OES",
    product_family: "Scoring & Timing",
    model_number: "ISC9000-PR",
    display_name: "Desktop Scoreboard Controller PRO",
    product_type: "cms",
    unit_cost: 564,
    unit_sell_price: 664,
    margin_percent: 15,
    category: "controller",
    width_mm: 400,
    height_mm: 200,
    depth_mm: 100,
    weight_lbs: 8,
    environment: "indoor",
    specs: "RS485/RS232, Program: latest pro8093",
    quote_ref: "42360-P (49ers, Mar 2024)",
  },
];

function buildWorkbook(type: string): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  if (type === "led" || type === "all") {
    const ledData = [LED_HEADERS, ...LED_EXAMPLES.map((ex) => LED_HEADERS.map((h) => (ex as any)[h] ?? ""))];
    const ledSheet = XLSX.utils.aoa_to_sheet(ledData);
    // Set column widths
    ledSheet["!cols"] = LED_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ledSheet, "LED Products");
  }

  if (type === "cms" || type === "all") {
    const cmsData = [CMS_HEADERS, ...CMS_EXAMPLES.map((ex) => CMS_HEADERS.map((h) => (ex as any)[h] ?? ""))];
    const cmsSheet = XLSX.utils.aoa_to_sheet(cmsData);
    cmsSheet["!cols"] = CMS_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, cmsSheet, "CMS Scoring Products");
  }

  return wb;
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "all";
  const validTypes = ["led", "cms", "all"];
  const selectedType = validTypes.includes(type) ? type : "all";

  const wb = buildWorkbook(selectedType);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename =
    selectedType === "led"
      ? "ANC_LED_Product_Template.xlsx"
      : selectedType === "cms"
        ? "ANC_CMS_Product_Template.xlsx"
        : "ANC_Product_Catalog_Template.xlsx";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
}
