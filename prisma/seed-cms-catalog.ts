/**
 * Seed CMS (Control System) catalog from Natalia's CMS_BASE_BOM file.
 *
 * Sourced from /root/rag2/CMS_BASE_BOM (1).xlsx, two tabs:
 *   - "Livesync CMS Laptop" — all hardware categories
 *   - "Livesync License" — software licenses + support tiers
 *
 * heatLoadBtu is computed from maxWatt × 3.412 where applicable
 * (matches what Natalia's spreadsheet does row-by-row).
 *
 * Run: npx tsx prisma/seed-cms-catalog.ts
 * Safe to re-run: uses upsert on sku.
 */
import { PrismaClient, CmsCategory } from "@prisma/client";

const prisma = new PrismaClient();

const W_TO_BTU = 3.412;
const btu = (watt: number | null) => (watt == null ? null : Number((watt * W_TO_BTU).toFixed(3)));

type SeedItem = {
  sku: string;
  displayName: string;
  category: CmsCategory;
  unitCost: number;
  unit?: string;
  maxWatt?: number | null;
  heatLoadBtu?: number | null;
  internalNotes?: string;
  customerNotes?: string;
};

const ITEMS: SeedItem[] = [
  // ─────── SERVER_EQUIPMENT (single GPU) ───────
  { sku: "ANC-1U-1TB-4ADA-V1", displayName: "ANC-CPU-1U-I9-1TB-A4000ADA", category: "SERVER_EQUIPMENT", unitCost: 7790, maxWatt: 1600 },
  { sku: "ANC-1U-2TB-4ADA-V2", displayName: "ANC-CPU-1U-I9-2TB-A4000ADA", category: "SERVER_EQUIPMENT", unitCost: 7990, maxWatt: 1600 },
  { sku: "ANC-1U-4TB-4ADA-V1", displayName: "ANC-CPU-1U-I9-4TB-A4000ADA", category: "SERVER_EQUIPMENT", unitCost: 8990, maxWatt: 1600 },
  { sku: "ANC-1U-6TB-4ADA-V1", displayName: "ANC-CPU-1U-I9-6TB-A4000ADA", category: "SERVER_EQUIPMENT", unitCost: 10150, maxWatt: 1600 },
  { sku: "ANC-1U-8TB-4ADA-V1", displayName: "ANC-CPU-1U-I9-8TB-A4000ADA", category: "SERVER_EQUIPMENT", unitCost: 11250, maxWatt: 1600 },

  // Dual GPU
  { sku: "ANC-1U-2TB-2x4ADA-V1", displayName: "ANC-CPU-1U-I9-2TB-2A4000ADA", category: "SERVER_EQUIPMENT", unitCost: 9850, maxWatt: 1600 },
  { sku: "ANC-1U-4TB-2x4ADA-V1", displayName: "ANC-CPU-1U-I9-4TB-2A4000ADA", category: "SERVER_EQUIPMENT", unitCost: 11550, maxWatt: 1600 },
  { sku: "ANC-1U-6TB-2x4ADA-V1", displayName: "ANC-CPU-1U-I9-6TB-2A4000ADA", category: "SERVER_EQUIPMENT", unitCost: 12350, maxWatt: 1600 },
  { sku: "ANC-1U-8TB-2x4ADA-V1", displayName: "ANC-CPU-1U-I9-8TB-2A4000ADA", category: "SERVER_EQUIPMENT", unitCost: 13690, maxWatt: 1600 },

  // High core count
  { sku: "ANC-1U-I9-48T-12-A4-W", displayName: "ANC-CPU-1U-I9-48T-12-W", category: "SERVER_EQUIPMENT", unitCost: 12560, maxWatt: 1600 },
  { sku: "ANC-1U-I9-80T-20-A4-W", displayName: "ANC-CPU-1U-I9-80T-20-W", category: "SERVER_EQUIPMENT", unitCost: 14680, maxWatt: 1600 },

  // Magewell variants
  { sku: "ANC-1U-2TB-4ADA-CC", displayName: "ANC-CPU-1U-I9-2TB-A4000ADA-CC", category: "SERVER_EQUIPMENT", unitCost: 13670, maxWatt: 1600, internalNotes: "Magewell 11090" },
  { sku: "ANC-1U-4TB-4ADA-CC", displayName: "ANC-CPU-1U-I9-4TB-A4000ADA-CC", category: "SERVER_EQUIPMENT", unitCost: 14890, maxWatt: 1600, internalNotes: "Magewell 11090" },
  { sku: "ANC-1U-6TB-4ADA-CC", displayName: "ANC-CPU-1U-I9-6TB-A4000ADA-CC", category: "SERVER_EQUIPMENT", unitCost: 16980, maxWatt: 1600, internalNotes: "Magewell 11090" },
  { sku: "ANC-1U-8TB-4ADA-CC", displayName: "ANC-CPU-1U-I9-8TB-A4000ADA-CC", category: "SERVER_EQUIPMENT", unitCost: 17990, maxWatt: 1600, internalNotes: "Magewell 11090" },

  // 12G-SDI variants
  { sku: "ANC-1U-2TB-12GSDI", displayName: "ANC-CPU-1U-I9-2TB-12GSDI", category: "SERVER_EQUIPMENT", unitCost: 14980, maxWatt: 1600, internalNotes: "Magewell 11180" },
  { sku: "ANC-1U-4TB-12GSDI", displayName: "ANC-CPU-1U-I9-4TB-12GSDI", category: "SERVER_EQUIPMENT", unitCost: 15670, maxWatt: 1600, internalNotes: "Magewell 11180" },
  { sku: "ANC-1U-6TB-12GSDI", displayName: "ANC-CPU-1U-I9-6TB-12GSDI", category: "SERVER_EQUIPMENT", unitCost: 13920, maxWatt: 1600, internalNotes: "Magewell 11180" },
  { sku: "ANC-1U-8TB-12GSDI", displayName: "ANC-CPU-1U-I9-8TB-12GSDI", category: "SERVER_EQUIPMENT", unitCost: 15380, maxWatt: 1600, internalNotes: "Magewell 11180" },

  // Players & other
  { sku: "ANC-CPU-DMP-I7-AURA", displayName: "ANC-CPU-DMP-I7-64GB-2TB-12INTEL-AURA", category: "SERVER_EQUIPMENT", unitCost: 5600 },
  { sku: "ANC-LAP-GRAM-I7-AURA", displayName: "ANC-LAP-GRAM-I7-64GB-2TB-12INTEL-AURA", category: "SERVER_EQUIPMENT", unitCost: 4250 },
  { sku: "ANC-CPU-PLY-AMDV1605", displayName: "ANC-CPU-PLY-AMDV1605-1TB-VEGA8", category: "SERVER_EQUIPMENT", unitCost: 2500, internalNotes: "AMD-RV IRONLINK Player, IRONLINK 1TB M.2 Upgrade" },
  { sku: "LG-OPSP-5LENA", displayName: "LG-OPSP-5LENA Win11 OOH Player", category: "SERVER_EQUIPMENT", unitCost: 2245 },
  { sku: "LG-OPS-C001", displayName: "LG-OPS-C001 Chrome OOH Player", category: "SERVER_EQUIPMENT", unitCost: 1150 },
  { sku: "ANC-NUC-1TB-UTL", displayName: "ANC-NUC-1TB-UTL Utility NUC", category: "SERVER_EQUIPMENT", unitCost: 2700 },

  // ─────── SERVER_ADDON ───────
  { sku: "CMS-ADDON-DANTE", displayName: "Dante Audio", category: "SERVER_ADDON", unitCost: 500, maxWatt: 7.5 },
  { sku: "CMS-ADDON-RS232IP", displayName: "RS232 Over IP", category: "SERVER_ADDON", unitCost: 290, maxWatt: 180 },

  // ─────── USER_STATION ───────
  { sku: "CMS-WS-STD", displayName: "Workstation", category: "USER_STATION", unitCost: 1200, maxWatt: 15 },
  { sku: "CMS-WS-PWR", displayName: "Power Conditioning Workstation", category: "USER_STATION", unitCost: 1150, maxWatt: 600 },

  // ─────── INTERCONNECT ───────
  { sku: "CMS-NET-SWITCH", displayName: "Network Switch", category: "INTERCONNECT", unitCost: 5600, maxWatt: 614 },
  { sku: "CMS-CABLE-COPPER", displayName: "Interconnect Copper Cable", category: "INTERCONNECT", unitCost: 150, internalNotes: "MDP, HDMI, DP, Cat6, USB, Audio, Serial" },

  // ─────── TRIGGER_HARDWARE ───────
  { sku: "CMS-GPI-TRIGGER", displayName: "GPI Trigger", category: "TRIGGER_HARDWARE", unitCost: 2270, maxWatt: 60 },
  { sku: "CMS-RACK-FRAME", displayName: "Rack Frame", category: "TRIGGER_HARDWARE", unitCost: 150 },

  // ─────── SCALER ───────
  { sku: "AW-4K-PULSE-2YR", displayName: "AW-4K-PULSE-2yr", category: "SCALER", unitCost: 19800, maxWatt: 95 },
  { sku: "AW-ZENITH-200-2YR", displayName: "AW-Zenith-200-2yr", category: "SCALER", unitCost: 58000 },
  { sku: "AW-AQUILON-C", displayName: "AW-Aquilon-C", category: "SCALER", unitCost: 109000 },
  { sku: "AW-AQUILON-CPLUS", displayName: "AW-Aquilon-C+", category: "SCALER", unitCost: 135000 },
  { sku: "AW-AQUILON-CMAX", displayName: "AW-Aquilon-C-Max", category: "SCALER", unitCost: 179000 },
  { sku: "CMS-SCALER-CABLE", displayName: "Scaler Cables (per port)", category: "SCALER", unitCost: 150, unit: "each" },

  // ─────── ROUTER ───────
  { sku: "ANC-MTRX-4x2-5YR", displayName: "ANC-MTRX-4x2-5yr", category: "ROUTER", unitCost: 2200, maxWatt: 276 },
  { sku: "ANC-MTRX-4x4-5YR", displayName: "ANC-MTRX-4x4-5yr", category: "ROUTER", unitCost: 6200 },
  { sku: "ANC-MTRX-8x8-5YR", displayName: "ANC-MTRX-8x8-5yr", category: "ROUTER", unitCost: 8550 },
  { sku: "ANC-MTRX-16x16-5YR", displayName: "ANC-MTRX-16x16-5yr", category: "ROUTER", unitCost: 23850 },
  { sku: "ANC-MTRX-24x24-5YR", displayName: "ANC-MTRX-24x24-5yr", category: "ROUTER", unitCost: 31550 },
  { sku: "ANC-MTRX-32x32-5YR", displayName: "ANC-MTRX-32x32-5yr", category: "ROUTER", unitCost: 47500 },
  { sku: "ANC-MTRX-48x48-5YR", displayName: "ANC-MTRX-48x48-5yr", category: "ROUTER", unitCost: 63400 },
  { sku: "CMS-ROUTER-CABLE", displayName: "Router Cables (per port)", category: "ROUTER", unitCost: 120 },

  // ─────── KVM ───────
  { sku: "ADDER-TX", displayName: "Adder TX (Extender)", category: "KVM", unitCost: 2150, maxWatt: 18 },
  { sku: "ADDER-RX", displayName: "Adder RX (Receiver)", category: "KVM", unitCost: 2150, maxWatt: 18 },
  { sku: "ADDER-MGT", displayName: "Adder Management", category: "KVM", unitCost: 2980, maxWatt: 60 },

  // ─────── BROADCAST_DA ───────
  { sku: "ROSS-OGX-FR-CNS", displayName: "Ross OGX-FR-CNS", category: "BROADCAST_DA", unitCost: 3950, internalNotes: "2U Chassis 20 Slots" },
  { sku: "ROSS-UDA-8705A-RS2", displayName: "Ross UDA-8705A RS2", category: "BROADCAST_DA", unitCost: 762, internalNotes: "SDI to Analog Frame REF" },
  { sku: "ROSS-SRA-8901-4", displayName: "Ross SRA-8901-4", category: "BROADCAST_DA", unitCost: 1190, internalNotes: "SDI DA 2x4" },
  { sku: "APA-OG-HDMI2-1x4DA", displayName: "APA-OG-HDMI2-1x4DA", category: "BROADCAST_DA", unitCost: 750, internalNotes: "HDMI DA" },
  { sku: "AJA-OG-ROI-SDI", displayName: "AJA-OG-ROI-SDI", category: "BROADCAST_DA", unitCost: 1560, internalNotes: "SDI-HDMI" },
  { sku: "AJA-OG-ROI-DVI", displayName: "AJA-OG-ROI-DVI", category: "BROADCAST_DA", unitCost: 1560, internalNotes: "SDI-DVI" },
  { sku: "AJA-OG-Hi5-12G-HDMI", displayName: "AJA-OG-Hi5-12G to HDMI2.0", category: "BROADCAST_DA", unitCost: 1560, internalNotes: "12G-HDMI" },
  { sku: "AJA-OG-HA5-12G", displayName: "AJA-OG-HA5-12G HDMI2.0 to 12G", category: "BROADCAST_DA", unitCost: 1560, internalNotes: "HDMI to 12G" },
  { sku: "AJA-OG-FiDO-TR-12G", displayName: "AJA-OG-FiDO-TR-12G", category: "BROADCAST_DA", unitCost: 1990, internalNotes: "12G to OPT SM LC" },
  { sku: "AJA-Hi5-12G-OPT", displayName: "AJA Hi5-12G 12G to OPT/HDMI Out", category: "BROADCAST_DA", unitCost: 1560, internalNotes: "12G to OPT/HDMI" },
  { sku: "AJA-HA5-12G-OPT", displayName: "AJA-HA5-12G HDMI2.0 to 12G/OPT", category: "BROADCAST_DA", unitCost: 1560, internalNotes: "HDMI to OPT/Fiber" },
  { sku: "AJA-FiDO-T-12G", displayName: "AJA-FiDO-T-12G", category: "BROADCAST_DA", unitCost: 1450, internalNotes: "12G to OPT SM LC TX" },
  { sku: "AJA-FiDO-R-12G", displayName: "AJA-FiDO-R-12G", category: "BROADCAST_DA", unitCost: 1450, internalNotes: "12G to OPT SM LC RX" },
  { sku: "CMS-PATCH-PANEL", displayName: "Patch Panel", category: "BROADCAST_DA", unitCost: 3690 },
  { sku: "CMS-PATCH-CABLE", displayName: "Patch Cable (per cable)", category: "BROADCAST_DA", unitCost: 120 },

  // ─────── RACK ───────
  { sku: "CMS-RACK-WS", displayName: "Rack Mount Workstation", category: "RACK", unitCost: 3000, maxWatt: 20 },
  { sku: "CMS-RACK-ACC", displayName: "Rack Accessories", category: "RACK", unitCost: 1260, internalNotes: "Screws, Shelves, Laces, Power Strip" },
  { sku: "CMS-RACK-UPS", displayName: "Power Conditioning (UPS)", category: "RACK", unitCost: 3440, maxWatt: 1980 },
  { sku: "CMS-RACK-ACOUT", displayName: "Outdoor A/C Rack", category: "RACK", unitCost: 10000 },
  { sku: "CMS-RACK-CABINET", displayName: "Rack Cabinetry (44U + sides + back)", category: "RACK", unitCost: 3397.55 },

  // ─────── TRAINING ───────
  { sku: "CMS-TRAINING-WEEK", displayName: "Training", category: "TRAINING", unitCost: 1500, unit: "per_week", customerNotes: "Cost per week" },

  // ─────── INTEGRATION ───────
  { sku: "CMS-INTEG-WEEK", displayName: "Integration (2 engineers, 1 week)", category: "INTEGRATION", unitCost: 19500, unit: "per_week", customerNotes: "2 engineers, 1 week on site" },

  // ─────── SHIPPING ───────
  { sku: "CMS-SHIP-WEIGHT", displayName: "Shipping — weight rate", category: "SHIPPING", unitCost: 0.3, unit: "per_pound" },
  { sku: "CMS-SHIP-MILES", displayName: "Shipping — mileage rate", category: "SHIPPING", unitCost: 2.9, unit: "per_mile" },
  { sku: "CMS-SHIP-PKG", displayName: "Shipping — package handling", category: "SHIPPING", unitCost: 300, unit: "per_package" },

  // ─────── LICENSE ───────
  { sku: "LIVESYNC-LICENSE", displayName: "LiveSync License", category: "LICENSE", unitCost: 10000 },
  { sku: "LIVESYNC-CLOUD", displayName: "LiveSync Cloud", category: "LICENSE", unitCost: 3500 },
  { sku: "VISIONSTATS-LICENSE", displayName: "VisionStats License", category: "LICENSE", unitCost: 13500 },

  // ─────── SUPPORT_TIER ───────
  {
    sku: "SUPPORT-STARTER",
    displayName: "Starter Software Support & Maintenance",
    category: "SUPPORT_TIER",
    unitCost: 0,
    unit: "per_year",
    customerNotes: "Software Technical support via email response. Access to the latest stable release, performance improvements.",
    internalNotes: "Price TBD by Natalia/Jireh — was empty in the source BOM",
  },
  {
    sku: "SUPPORT-PREMIUM",
    displayName: "Premium Software Support & Maintenance",
    category: "SUPPORT_TIER",
    unitCost: 0,
    unit: "per_year",
    customerNotes: "Software Technical support via phone, email, remote. Access to the latest features. Onsite support within service areas (additional travel may apply).",
    internalNotes: "Price TBD by Natalia/Jireh — was empty in the source BOM",
  },
];

async function main() {
  let upserted = 0;
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    const heatLoad = it.heatLoadBtu ?? btu(it.maxWatt ?? null);
    await prisma.cmsCatalogItem.upsert({
      where: { sku: it.sku },
      update: {
        displayName: it.displayName,
        category: it.category,
        unitCost: it.unitCost,
        unit: it.unit ?? "each",
        maxWatt: it.maxWatt ?? null,
        heatLoadBtu: heatLoad,
        internalNotes: it.internalNotes ?? null,
        customerNotes: it.customerNotes ?? null,
        sortOrder: i,
        isActive: true,
      },
      create: {
        sku: it.sku,
        displayName: it.displayName,
        category: it.category,
        unitCost: it.unitCost,
        unit: it.unit ?? "each",
        maxWatt: it.maxWatt ?? null,
        heatLoadBtu: heatLoad,
        internalNotes: it.internalNotes ?? null,
        customerNotes: it.customerNotes ?? null,
        sortOrder: i,
      },
    });
    upserted++;
  }
  console.log(`Upserted ${upserted} CMS catalog items.`);
  const byCat = await prisma.cmsCatalogItem.groupBy({
    by: ["category"],
    _count: { _all: true },
    orderBy: { category: "asc" },
  });
  for (const row of byCat) console.log(`  ${row.category.padEnd(20)} ${row._count._all}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
