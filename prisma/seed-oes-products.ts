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
 *   OES Quote #33555-P — U of California Irvine, Oct 2019
 *   OES Quote #44029-P — U of Illinois Memorial Stadium, Jan 2025
 *   OES Quote #38849-P — U of Michigan, Jun 2022
 *   OES Quote #15910-P — U of Michigan Crisler Arena, Dec 2010
 *   OES Quote #27025-P — U of Michigan LAX, Feb 2017
 *   OES Quote #27025-PB — U of Michigan Indoor Track, Feb 2017
 *   OES Quote #27025-PD — U of Michigan Sports Perf Ctr, Feb 2017
 * Provided by Jireh Billings, Feb 24 2026.
 *
 * CMS/Scoring equipment priced per unit (like TVs, not per sqft).
 * Unit pricing stored in extendedSpecs: { unitCost, category, weightLbs, dimensions }
 * OES margin = 15% (confirmed from State Farm Center budgetary workbook, Jul 2014).
 * Formula: sellPrice = cost / (1 - 0.15) = cost / 0.85
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

  // ── UC Irvine Quote #33555-P (Oct 2019) ───────────────────────
  {
    model: "M39XXOWV",
    displayName: "Swimming Scoreboard (19'3\" × 9'3¾\")",
    cost: 24875,
    category: "scoreboard",
    widthMm: 5867,   // 19'3"
    heightMm: 2838,  // 9'3-3/4"
    depthMm: 152,    // 6"
    weightLbs: 875,
    specs: "Swimming-specific. 10\" LED Digits for All, 6\" White Vinyl Lettering. Lanes, Places, Times, Heats, Events, Record Time, Home/Guest scores. Horn included. 120VAC 19A/60Hz. Ref drawing MC33555A-R1",
    quoteRef: "33555-P (UC Irvine, Oct 2019)",
  },

  // ── U of Illinois Memorial Stadium Quote #44029-P (Jan 2025) ──
  {
    model: "M43969A-R3",
    displayName: "Custom Football Scoreboard (97'6\" × 6')",
    cost: 41227,
    category: "scoreboard",
    widthMm: 29718,  // 97'6"
    heightMm: 1829,  // 6'
    depthMm: 152,    // 6"
    weightLbs: 2524,
    specs: "Custom Football. 4 sections: A(29'6\") B(19'8\") C(18'10\") D(29'6\"). 48\" Time/Score digits, 36\" T.O.L/Down/ToGo/BallOn/QTR, 15\" Electronic Team Names (8 char), LED Football Indicators. 3×120VAC 20A/60Hz, 37.2A max. Ref drawing M43969A-R3",
    quoteRef: "44029-P (U of Illinois, Jan 2025)",
  },
  {
    model: "ISCRMT-ST",
    displayName: "ISC Remote - Shot Time",
    cost: 203,
    category: "controller",
    widthMm: 150,
    heightMm: 80,
    depthMm: 40,
    weightLbs: 1,
    specs: "ISC remote control for shot time operation",
    quoteRef: "44029-P (U of Illinois, Jan 2025)",
  },
  {
    model: "ISCRMT-GT",
    displayName: "ISC Remote - Game Time",
    cost: 203,
    category: "controller",
    widthMm: 150,
    heightMm: 80,
    depthMm: 40,
    weightLbs: 1,
    specs: "ISC remote control for game time operation",
    quoteRef: "44029-P (U of Illinois, Jan 2025)",
  },
  {
    model: "HW186Q+",
    displayName: "ISC EDGE Protective Case",
    cost: 223,
    category: "accessory",
    widthMm: 500,
    heightMm: 350,
    depthMm: 200,
    weightLbs: 5,
    specs: "Protective carry case for ISC-EDGE controller",
    quoteRef: "44029-P (U of Illinois, Jan 2025)",
  },
  {
    model: "SHOTS36UCS-RP",
    displayName: "36\" PRO Play Clock (Outdoor, Rear Power)",
    cost: 6205,
    category: "play_clock",
    widthMm: 1803,   // 5'-11"
    heightMm: 1467,  // 4'-9 15/16"
    depthMm: 152,    // 6"
    weightLbs: 165,
    specs: "Unistrut Mounting, 36\" PRO Segmented LED Digits, Vinyl Perimeter Striping. Power and data on back. Enclosure/LED/Vinyl color TBD",
    quoteRef: "44029-P (U of Illinois, Jan 2025)",
  },
  {
    model: "M1200IRV",
    displayName: "4\" Locker Room Clock (Red, w/Power Cord)",
    cost: 617,
    category: "clock",
    widthMm: 508,    // 1'-8"
    heightMm: 203,   // 8"
    depthMm: 102,    // 4"
    weightLbs: 10,
    specs: "4\" Red LED Digits and Colon for Time (88:88), Aluminum Enclosure Black, Mounting Tabs, w/Power Cord. Shatter-Resistant Lexan",
    quoteRef: "44029-P (U of Illinois, Jan 2025)",
  },

  // ── U of Michigan Quote #38849-P (Jun 2022) ───────────────────
  {
    model: "SHOTS42RTCS",
    displayName: '42" Shot Clock System (Outdoor)',
    cost: 9325,
    category: "shot_clock",
    widthMm: 2032,   // 6'8.125"
    heightMm: 1626,  // 5'4"
    depthMm: 203,    // 8"
    weightLbs: 120,
    specs: "42\" Shot Clock system, outdoor rated. Dimensions 6'8.125\" × 5'4\" × 8\". Segmented LED digits, aluminum enclosure",
    quoteRef: "38849-P (U of Michigan, Jun 2022)",
  },
  {
    model: "M1242ROCS",
    displayName: '42" TOD Clock (Outdoor)',
    cost: 11987,
    category: "tod_clock",
    widthMm: 4064,   // 13'4.5"
    heightMm: 1524,  // 5'
    depthMm: 203,    // 8"
    weightLbs: 350,
    specs: "42\" Time of Day clock, outdoor rated. Dimensions 13'4.5\" × 5' × 8\". Segmented LED digits, aluminum enclosure",
    quoteRef: "38849-P (U of Michigan, Jun 2022)",
  },

  // ── U of Michigan Crisler Arena Quote #15910-P (Dec 2010) ─────
  {
    model: "MODEL6225",
    displayName: "Hockey Scoreboard (18' × 3'10\")",
    cost: 6546,
    category: "scoreboard",
    widthMm: 5486,   // 18'
    heightMm: 1168,  // 3'10"
    depthMm: 102,    // 4"
    weightLbs: 400,
    specs: "Hockey scoreboard. 18' × 3'10\" × 4\". Segmented LED digits for period, time, scores, penalties. Aluminum enclosure",
    quoteRef: "15910-P (U of Michigan Crisler Arena, Dec 2010)",
  },
  {
    model: "MODEL5200",
    displayName: "Practice Basketball Scoreboard (9' × 3'10\")",
    cost: 3975,
    category: "scoreboard",
    widthMm: 2743,   // 9'
    heightMm: 1168,  // 3'10"
    depthMm: 102,    // 4"
    weightLbs: 200,
    specs: "Practice basketball scoreboard. 9' × 3'10\" × 4\". Segmented LED digits for time, scores, period. Aluminum enclosure",
    quoteRef: "15910-P (U of Michigan Crisler Arena, Dec 2010)",
  },
  {
    model: "SHOTSCLK-S",
    displayName: "One-Sided Shot/Game Clock (32\")",
    cost: 1795,
    category: "shot_clock",
    widthMm: 813,    // 32"
    heightMm: 813,   // 32"
    depthMm: 152,    // 6"
    weightLbs: 35,
    specs: "One-sided shot clock / game clock combination. 32\" × 32\" × 6\". Segmented LED digits, aluminum enclosure",
    quoteRef: "15910-P (U of Michigan Crisler Arena, Dec 2010)",
  },
  {
    model: "GL-485",
    displayName: "Red/Green Hockey Goal Light Set",
    cost: 1590,
    category: "lighting",
    widthMm: 305,    // ~12"
    heightMm: 305,   // ~12"
    depthMm: 203,    // ~8"
    weightLbs: 15,
    specs: "Red/Green hockey goal light set. RS485 controlled. Includes mounting hardware",
    quoteRef: "15910-P (U of Michigan Crisler Arena, Dec 2010)",
  },
  {
    model: "232-485 CONVERTER",
    displayName: "RS232 to RS485 Signal Converter",
    cost: 325,
    category: "accessory",
    widthMm: 100,
    heightMm: 60,
    depthMm: 30,
    weightLbs: 1,
    specs: "RS232 to RS485 signal converter for scoreboard communication",
    quoteRef: "15910-P (U of Michigan Crisler Arena, Dec 2010)",
  },
  {
    model: "KEYSWITCH",
    displayName: "Independent/Simultaneous Mode Switch",
    cost: 150,
    category: "accessory",
    widthMm: 100,
    heightMm: 80,
    depthMm: 40,
    weightLbs: 1,
    specs: "Keyswitch for toggling between independent and simultaneous scoreboard control modes",
    quoteRef: "15910-P (U of Michigan Crisler Arena, Dec 2010)",
  },

  // ── U of Michigan LAX Quote #27025-P (Feb 2017) ───────────────
  {
    model: "MC27025B",
    displayName: "Custom Lacrosse Scoreboard (23' × 11')",
    cost: 25790,
    category: "scoreboard",
    widthMm: 7010,   // 23'
    heightMm: 3353,  // 11'
    depthMm: 203,    // 8"
    weightLbs: 1800,
    specs: "Custom Lacrosse. 28\" White LED Time, 23\" White LED Score/Period, 15\" White LED Saves/Shots/Player/Penalty, 10\" Electronic Team Names (8 char White LEDs). 4×(110VAC 60Hz 20A). Black enclosure, white vinyl lettering, fans included. Ref drawing MC27025B-R1",
    quoteRef: "27025-P (U of Michigan LAX, Feb 2017)",
  },
  {
    model: "MC27025A",
    displayName: "Custom Aux Lacrosse Scoreboard (16' × 4')",
    cost: 11200,
    category: "scoreboard",
    widthMm: 4877,   // 16'
    heightMm: 1219,  // 4'
    depthMm: 203,    // 8"
    weightLbs: 500,
    specs: "Auxiliary Lacrosse. 17\" White LED Time/Score, 14\" White LED Period, 10\" Electronic Team Names (8 char White LEDs). 1×(110VAC 60Hz 20A). Black enclosure, white vinyl lettering, fans included. Ref drawing MC27025A-R1",
    quoteRef: "27025-P (U of Michigan LAX, Feb 2017)",
  },
  {
    model: "SHOTS-22W",
    displayName: '22" Play Clock (White, Lacrosse)',
    cost: 2155,
    category: "play_clock",
    widthMm: 1118,   // 44"
    heightMm: 907,   // 35.7"
    depthMm: 152,    // 6"
    weightLbs: 45,
    specs: "22\" White LED Segmented Digits, Clear Safety Lexan digit covers, Black Aluminum Enclosure, Horn included",
    quoteRef: "27025-P (U of Michigan LAX, Feb 2017)",
  },

  // ── U of Michigan Indoor/Outdoor Track Quote #27025-PB (Feb 2017) ──
  {
    model: "GAME-19W",
    displayName: '19" Game Clock (White)',
    cost: 2640,
    category: "clock",
    widthMm: 1816,   // 71.5"
    heightMm: 699,   // 27.5"
    depthMm: 203,    // 8"
    weightLbs: 60,
    specs: "19\" White LED Segmented Digits, Clear Safety Lexan digit covers, Black Aluminum Enclosure. Ref drawing MC27025C-R1",
    quoteRef: "27025-PB (U of Michigan Indoor Track, Feb 2017)",
  },
  {
    model: "CUSTOM-5DGT-TRACK",
    displayName: '19" 5-Digit Track Clock',
    cost: 3350,
    category: "clock",
    widthMm: 2350,   // 92.5"
    heightMm: 699,   // 27.5"
    depthMm: 203,    // 8"
    weightLbs: 75,
    specs: "Custom 5-digit track clock. 19\" White LED Segmented Digits, Clear Safety Lexan digit covers, Black Aluminum Enclosure. Ref drawing MC27025D-R1",
    quoteRef: "27025-PB (U of Michigan Indoor Track, Feb 2017)",
  },

  // ── U of Michigan Sports Perf Ctr Quote #27025-PD (Feb 2017) ───
  {
    model: "MODEL1200A",
    displayName: '4" Clock Display (Red, Pigtail)',
    cost: 490,
    category: "clock",
    widthMm: 508,    // 20"
    heightMm: 203,   // 8"
    depthMm: 102,    // 4"
    weightLbs: 10,
    specs: "4\" Red LED Digits, Time 88:88. Aluminum enclosure, pigtail power/comm out back. RS485, 110Vac 1/4A. Program: latest pin8a1_",
    quoteRef: "27025-PD (U of Michigan Sports Perf Ctr, Feb 2017)",
  },
];

const OES_MARGIN = 0.15; // 15% — confirmed from State Farm Center budgetary workbook

function buildProducts() {
  return OES_PRODUCTS.map((p) => {
    const sellPrice = Math.round((p.cost / (1 - OES_MARGIN)) * 100) / 100;
    return {
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
      environment: "outdoor" as const,
      serviceType: "front",
      supportsHalfModule: false,
      isCurved: false,
      extendedSpecs: {
        unitCost: p.cost,
        unitSellPrice: sellPrice,
        margin: OES_MARGIN,
        category: p.category,
        weightLbs: p.weightLbs,
        specs: p.specs,
        quoteRef: (p as any).quoteRef || "42360-P (49ers, Mar 2024)",
      },
      sourceSpreadsheet: "OES Quotes (42360-P + 36175-P + 30786-P + 29376-P + 33555-P + 44029-P + 38849-P + 15910-P + 27025-P/PB/PD)",
    };
  });
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
      // Update extendedSpecs with margin data if it was previously null
      await prisma.manufacturerProduct.update({
        where: { modelNumber: product.modelNumber },
        data: { extendedSpecs: product.extendedSpecs },
      });
      console.log(`  UPDATE ${product.modelNumber} — margin ${OES_MARGIN * 100}% → sell $${(product.extendedSpecs as any).unitSellPrice}`);
      skipped++;
      continue;
    }

    await prisma.manufacturerProduct.create({ data: product });
    console.log(`  CREATE ${product.modelNumber} — ${product.displayName} — $${(product.extendedSpecs as any).unitCost} cost → $${(product.extendedSpecs as any).unitSellPrice} sell`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} updated with ${OES_MARGIN * 100}% margin.`);
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
