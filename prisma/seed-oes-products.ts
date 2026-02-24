/**
 * Seed OES scoring/timing products into ManufacturerProduct table.
 *
 * Run: npx tsx prisma/seed-oes-products.ts
 *
 * Sources:
 *   OES Quote #42360-P — Levi Stadium (San Francisco 49ers), Mar 2024
 *   OES Quote #36175-P — Union HS (Tulsa, OK), Jan 2021
 *   OES Quote #30786-P — UAB Soccer (AL), Aug 2018
 *   OES Quote #29376-P — U of Cincinnati Arena, 2018
 * Provided by Jireh Billings, Feb 24 2026.
 *
 * CMS/Scoring equipment priced per unit (like TVs, not per sqft).
 * Unit pricing stored in extendedSpecs: { unitCost, category, weightLbs, dimensions }
 * Margin TBD — waiting on Ross percentage from ANC team.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OES_PRODUCTS = [
  {
    model: "SHOTS36UCS",
    displayName: '36" PRO Play Clock (Outdoor)',
    cost: 5915,
    category: "play_clock",
    widthMm: 1803,   // 5'-11"
    heightMm: 1467,  // 4'-9 15/16"
    depthMm: 152,    // 6"
    weightLbs: 165,
    specs: "Unistrut Mounting, 36\" PRO Segmented LED Digits, White Vinyl Perimeter Striping, 120VAC 1 Phase 2 Wire 60Hz 5 Amps",
    quoteRef: "42360-P (49ers, Mar 2024)",
  },
  {
    model: "M1200IRA",
    displayName: '4" Locker Room Clock (Red)',
    cost: 613,
    category: "clock",
    widthMm: 508,    // 1'-8"
    heightMm: 203,   // 8"
    depthMm: 102,    // 4"
    weightLbs: 10,
    specs: "4\" Red LED Digits and Colon for Time (88:88), Aluminum Enclosure Black, Mounting Tabs Included, w/Direct Wire",
  },
  {
    model: "RACK-485S",
    displayName: "Large Distribution Panel (Rack Mount)",
    cost: 3240,
    category: "distribution",
    widthMm: 483,    // Standard 19" rack
    heightMm: 89,    // ~2U
    depthMm: 300,
    weightLbs: 15,
    specs: "RS485 Inputs (x3), RS485 Output (x8), RS232 Output (x1), Ethernet Output (x1)",
  },
  {
    model: "ISCREM-S",
    displayName: "Remote Controller (1 Toggle + 1 Push)",
    cost: 99,
    category: "controller",
    widthMm: 150,
    heightMm: 80,
    depthMm: 40,
    weightLbs: 1,
    specs: "1 Toggle Switch & 1 Push Button, ISC9000 compatible",
  },
  {
    model: "ISCREM-F",
    displayName: "Remote Controller (1 Toggle + 2 Push)",
    cost: 108,
    category: "controller",
    widthMm: 150,
    heightMm: 80,
    depthMm: 40,
    weightLbs: 1,
    specs: "1 Toggle Switch & 2 Push Buttons, ISC9000 compatible",
  },
  {
    model: "ISC9000-PR",
    displayName: "Desktop Scoreboard Controller PRO",
    cost: 564,
    category: "controller",
    widthMm: 400,
    heightMm: 200,
    depthMm: 100,
    weightLbs: 8,
    specs: "RS485/RS232, Program: latest pro8093, Protocol & Sports configurable",
  },
  {
    model: "HW186K",
    displayName: "Carry Case - ISC9000 Pro",
    cost: 170,
    category: "accessory",
    widthMm: 500,
    heightMm: 350,
    depthMm: 200,
    weightLbs: 5,
    specs: "Hard carry case for ISC9000 Pro controller",
  },
  {
    model: "M1236UCS",
    displayName: '36" PRO TOD Clock (Outdoor)',
    cost: 11943,
    category: "tod_clock",
    widthMm: 3505,   // 11'-6"
    heightMm: 1448,  // 4'-9"
    depthMm: 152,    // 6"
    weightLbs: 275,
    specs: "Unistrut Mounting, 36\" PRO Segmented LED Digits, Enclosure/LED Color TBD",
  },
  {
    model: "ISC-EDGE-PR",
    displayName: "ISC-EDGE PRO (w/o radio)",
    cost: 1301,
    category: "controller",
    widthMm: 300,
    heightMm: 200,
    depthMm: 80,
    weightLbs: 5,
    specs: "ISC-EDGE without radio, PRO option",
  },

  // ── Union HS Quote #36175-P (Jan 2021) ──────────────────────────
  {
    model: "M8025CUWH",
    displayName: "Football Scoreboard (25' × 8')",
    cost: 19760,
    category: "scoreboard",
    widthMm: 7620,   // 25'
    heightMm: 2438,  // 8'
    depthMm: 152,    // 6"
    weightLbs: 1209,
    specs: "Multi-sport (Football, Track, Lacrosse, Soccer, Rugby, Field Hockey). 30\" Time, 22\" Scores, 22\" Down/BallOn/Yards/Quarter, 17\" Timeouts, 8\" Possession, 10\" Electronic Team Names & Captions. Aluminum enclosure, Lexan digit covers, Unistrut mount",
    quoteRef: "36175-P (Union HS, Jan 2021)",
  },
  {
    model: "M3025AUWH",
    displayName: "Multi-Sport Scoreboard (25' × 4'6\")",
    cost: 12240,
    category: "scoreboard",
    widthMm: 7620,   // 25'
    heightMm: 1372,  // 4'6"
    depthMm: 152,    // 6"
    weightLbs: 640,
    specs: "Multi-sport (Football, Track, Lacrosse, Soccer, Rugby, Field Hockey). 22\" Time, 22\" Scores, 17\" Period, 6\" Possession Arrow, 10\" Electronic Team Names, Vinyl Captions. Aluminum enclosure, Lexan digit covers, Unistrut mount",
    quoteRef: "36175-P (Union HS, Jan 2021)",
  },
  {
    model: "SHOTS30OWS",
    displayName: '30" Electronic Play Clocks',
    cost: 4880,
    category: "play_clock",
    widthMm: 1562,   // 61.5"
    heightMm: 1245,  // 49"
    depthMm: 203,    // 8"
    weightLbs: 80,
    specs: "30\" White LED Segmented Digits, Black Aluminum Enclosure, Fan System, Clear Safety Lexan, Digit mounting plates, 6\" White Vinyl Border",
    quoteRef: "36175-P (Union HS, Jan 2021)",
  },
  {
    model: "RFD-XB9",
    displayName: "Radio Outdoor/Hockey 900MHz",
    cost: 315,
    category: "radio",
    widthMm: 200,
    heightMm: 100,
    depthMm: 50,
    weightLbs: 2,
    specs: "Wireless 900MHz communications to scoreboard, Antenna included. RF interference may require hard wiring fallback",
    quoteRef: "36175-P (Union HS, Jan 2021)",
  },
  {
    model: "ISC9000-X9",
    displayName: "Scoreboard Controller w/ 900MHz RF",
    cost: 710,
    category: "controller",
    widthMm: 318,    // 12.5"
    heightMm: 210,   // 8.25"
    depthMm: 102,    // 4"
    weightLbs: 5,
    specs: "Aluminum diecast, 5.2\" LCD, 4x8+4x3 Keypad, RUN/STOP/HORN buttons, RS485/RS232/RF-900MHz, USB-B diagnostics, 2x ISCREM-x remote inputs, 110-220V 1A. Includes controller, power cord, keypad inserts",
    quoteRef: "36175-P (Union HS, Jan 2021)",
  },
  {
    model: "M1217RUWZ",
    displayName: '17" Real Time Clock / Pace of Game',
    cost: 2340,
    category: "clock",
    widthMm: 1524,   // 60"
    heightMm: 711,   // 28"
    depthMm: 203,    // 8"
    weightLbs: 100,
    specs: "17\" White LED Digits, Black Aluminum Enclosure, Unistrut Included, 110 VAC 60Hz 5 Amps",
    quoteRef: "36175-P (Union HS, Jan 2021)",
  },
  {
    model: "M1202IRV",
    displayName: '2" Clock Display (Red)',
    cost: 435,
    category: "clock",
    widthMm: 254,    // 10"
    heightMm: 102,   // 4"
    depthMm: 64,     // 2.5"
    weightLbs: 5,
    specs: "2\" Red LED Digits and Colon for Time (88:88), Shatter-Resistant Lexan, Aluminum Black, Mounting Tabs, RS485, 110 VAC 60Hz 1/4 AMP",
    quoteRef: "36175-P (Union HS, Jan 2021)",
  },

  // ── UAB Soccer Quote #30786-P (Aug 2018) ────────────────────────
  {
    model: "M49XXOWV",
    displayName: "Soccer Scoreboard (33' × 8')",
    cost: 23480,
    category: "scoreboard",
    widthMm: 10058,  // 33' (396")
    heightMm: 2896,  // 96" (8')
    depthMm: 203,    // 8"
    weightLbs: 1440,
    specs: "Soccer-specific. 30\" Time/Score digits, 17\" Shots/Saves/Corner Kicks/Fouls/Half, 14\" Vinyl Team Names, Aluminum enclosure black, Lexan digit covers, Angle Iron + Horn included, 120VAC 60Hz 10A. Ref drawing MC30744A-R2",
    quoteRef: "30786-P (UAB Soccer, Aug 2018)",
  },
  {
    model: "DIST-1I3O",
    displayName: "Small Distribution Panel",
    cost: 580,
    category: "distribution",
    widthMm: 197,    // 7.75"
    heightMm: 127,   // 5"
    depthMm: 51,     // 2"
    weightLbs: 5,
    specs: "1x RS485 Input (XLR 4M), 3x RS485 Output (XLR 4F), 2x RS232 Output (DB9 M), 110-220V 1/4A. Additional panels may be needed per facility wiring",
    quoteRef: "30786-P (UAB Soccer, Aug 2018)",
  },

  // ── UC Cincinnati Arena Quote #29376-P (2018) ─────────────────
  {
    model: "SHOTS-ST",
    displayName: "Shot Clock See-Thru System (3-piece)",
    cost: 6350,
    category: "shot_clock",
    widthMm: 813,    // 32" (large clock face)
    heightMm: 813,   // 32"
    depthMm: 152,    // 6"
    weightLbs: 60,
    specs: "3-piece system: Large Clock 32\"×32\", Small Clock 22\"×22\", Control Panel. See-through design for arena mounting above backboard. Includes mounting hardware",
    quoteRef: "29376-P (UC Cincinnati Arena, 2018)",
  },
  {
    model: "SHOTS-14G7",
    displayName: "Shot Clock 14/7 Display",
    cost: 1795,
    category: "shot_clock",
    widthMm: 813,    // 32"
    heightMm: 813,   // 32"
    depthMm: 152,    // 6"
    weightLbs: 35,
    specs: "14-second / 7-second shot clock display for basketball. LED segmented digits, aluminum enclosure",
    quoteRef: "29376-P (UC Cincinnati Arena, 2018)",
  },
  {
    model: "HW182D",
    displayName: "Horn/Trumpet 120Vac",
    cost: 815,
    category: "horn",
    widthMm: 305,    // ~12"
    heightMm: 305,   // ~12"
    depthMm: 305,    // ~12"
    weightLbs: 15,
    specs: "120VAC horn/trumpet for arena buzzer system. Mounts to scoreboard or independently",
    quoteRef: "29376-P (UC Cincinnati Arena, 2018)",
  },
  {
    model: "HN-CTRL",
    displayName: "Horn Control Module",
    cost: 850,
    category: "controller",
    widthMm: 305,    // 12"
    heightMm: 254,   // 10"
    depthMm: 127,    // 5"
    weightLbs: 20,
    specs: "Controls 2x 110V horns, RS485 input, configurable trigger patterns. Mounts in equipment room or press box",
    quoteRef: "29376-P (UC Cincinnati Arena, 2018)",
  },
  {
    model: "SL-BB-EOP",
    displayName: "Strip Light BB End of Period",
    cost: 995,
    category: "lighting",
    widthMm: 1524,   // 60" (longest strip)
    heightMm: 50,
    depthMm: 25,
    weightLbs: 8,
    specs: "Red LED strip light kit for basketball End of Period indication. Includes 60\" + 30\" + 25\" strips with interconnect cables. 24Vdc 2A input. Mounts behind backboard",
    quoteRef: "29376-P (UC Cincinnati Arena, 2018)",
  },
];

function buildProducts() {
  return OES_PRODUCTS.map((p) => ({
    manufacturer: "OES",
    productFamily: "Scoring & Timing",
    modelNumber: p.model,
    displayName: p.displayName,
    productType: "cms",
    pixelPitch: 0, // Not applicable for CMS equipment
    cabinetWidthMm: p.widthMm,
    cabinetHeightMm: p.heightMm,
    cabinetDepthMm: p.depthMm,
    weightKgPerCabinet: Math.round(p.weightLbs * 0.4536 * 10) / 10, // lbs → kg
    maxNits: 0,
    maxPowerWattsPerCab: 0,
    environment: "outdoor" as const, // Default — Cincinnati arena products are indoor but keeping uniform for catalog
    serviceType: "front",
    supportsHalfModule: false,
    isCurved: false,
    extendedSpecs: {
      unitCost: p.cost,
      unitSellPrice: null, // TBD — waiting on Ross percentage from ANC
      margin: null,        // TBD
      category: p.category,
      weightLbs: p.weightLbs,
      specs: p.specs,
      quoteRef: (p as any).quoteRef || "42360-P (49ers, Mar 2024)",
    },
    sourceSpreadsheet: "OES Quotes (42360-P + 36175-P + 30786-P + 29376-P)",
  }));
}

async function main() {
  console.log("Seeding OES Scoring & Timing products...\n");

  const products = buildProducts();
  let created = 0;
  let skipped = 0;

  for (const product of products) {
    const existing = await prisma.manufacturerProduct.findUnique({
      where: { modelNumber: product.modelNumber },
    });

    if (existing) {
      console.log(`  SKIP ${product.modelNumber} (already exists)`);
      skipped++;
      continue;
    }

    await prisma.manufacturerProduct.create({ data: product });
    console.log(`  CREATE ${product.modelNumber} — ${product.displayName} — $${(product.extendedSpecs as any).unitCost} cost`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped.`);
  const total = await prisma.manufacturerProduct.count();
  console.log(`Total products in database: ${total}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
