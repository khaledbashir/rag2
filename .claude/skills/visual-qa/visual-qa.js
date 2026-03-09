/**
 * Visual QA Test Suite — P48, P62, P78
 *
 * Comprehensive test cases for the ANC Proposal Engine.
 * Run manually or via Browserless for automated screenshot comparison.
 *
 * Usage:
 *   node .claude/skills/visual-qa/visual-qa.js [test-name]
 *   node .claude/skills/visual-qa/visual-qa.js --list
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://proposals.anc.com";

// ============================================================================
// TEST CASES
// ============================================================================

const TEST_CASES = [
    // Phase A: Mirror Mode Polish
    {
        id: "mirror-excel-upload",
        phase: "A",
        prompt: "P48",
        name: "Mirror Mode — Excel Upload & Parse",
        url: `${BASE_URL}/proposals/new`,
        steps: [
            "Navigate to /proposals/new",
            "Upload a valid ANC Excel estimate file",
            "Verify Step 1 shows parsed pricing tables",
            "Verify line items appear with descriptions and amounts",
            "Verify grand total matches Excel",
        ],
        expected: "Pricing tables render correctly with all line items and totals matching Excel source",
    },
    {
        id: "mirror-pdf-output",
        phase: "A",
        prompt: "P48",
        name: "Mirror Mode — PDF Output Fidelity",
        url: `${BASE_URL}/proposals`,
        steps: [
            "Open an existing mirror mode proposal",
            "Navigate to Step 4 (Export)",
            "Click Export PDF",
            "Verify PDF renders ProposalTemplate5 layout",
            "Verify pricing table matches screen preview",
            "Verify filename follows ANC_{Client}_{Type}_{Date}.pdf convention",
        ],
        expected: "PDF output matches on-screen preview with correct filename convention",
    },
    {
        id: "mirror-share-link",
        phase: "A",
        prompt: "P48",
        name: "Mirror Mode — Share Link",
        url: `${BASE_URL}/proposals`,
        steps: [
            "Open an existing proposal",
            "Generate a share link",
            "Open share link in incognito",
            "Verify ProposalTemplate5 renders for anonymous viewer",
        ],
        expected: "Share link renders full proposal without authentication",
    },
    {
        id: "mirror-alternate-tagging",
        phase: "A",
        prompt: "P48",
        name: "Mirror Mode — Alternate Line Items",
        url: `${BASE_URL}/proposals/new`,
        steps: [
            "Upload Excel with alternate items",
            "Navigate to Step 2",
            "Verify alternate items are tagged with isAlternate",
            "Verify alternates are excluded from grand total in PDF",
        ],
        expected: "Alternate items render with visual distinction and are excluded from totals",
    },

    // Phase C: Intelligence Mode
    {
        id: "intelligence-basic",
        phase: "C",
        prompt: "P62",
        name: "Intelligence Mode — Basic Flow",
        url: `${BASE_URL}/proposals/new`,
        steps: [
            "Click 'Or start manually' in Step 1",
            "Add a screen in Step 2 (10ft x 6ft, 2.5mm pitch)",
            "Set margin to 25% in Step 3",
            "Verify audit table shows correct calculations",
            "Verify Sell Price = Cost / (1 - 0.25)",
            "Verify bond at 1.5% of sell price",
        ],
        expected: "Intelligence Mode calculates correctly using Natalia Divisor Model",
    },
    {
        id: "intelligence-margin-presets",
        phase: "C",
        prompt: "P62",
        name: "Intelligence Mode — Margin Presets",
        url: `${BASE_URL}/proposals/new`,
        steps: [
            "Start manual proposal",
            "Navigate to Step 3",
            "Click each margin preset (Aggressive 15%, Standard 25%, Premium 35%, Strategic 40%)",
            "Verify margin slider updates",
            "Verify audit table recalculates",
        ],
        expected: "All 4 margin presets apply correctly and trigger recalculation",
    },
    {
        id: "intelligence-quote-items",
        phase: "C",
        prompt: "P62",
        name: "Intelligence Mode — Quote Items Builder",
        url: `${BASE_URL}/proposals/new`,
        steps: [
            "Start manual proposal with 2 screens",
            "Navigate to Step 3",
            "Click Auto-fill to populate quote items",
            "Verify 2 quote items appear",
            "Drag to reorder items",
            "Click Add to add manual item",
            "Click From Catalog to import product",
        ],
        expected: "Quote items auto-fill, reorder via drag, and support catalog import",
    },
    {
        id: "intelligence-audit-csv",
        phase: "C",
        prompt: "P62",
        name: "Intelligence Mode — Export Audit CSV",
        url: `${BASE_URL}/proposals/new`,
        steps: [
            "Create proposal with screens",
            "Navigate to Step 3",
            "Click 'Export Audit CSV' in audit table",
            "Verify CSV downloads with filename ANC_Audit_YYYY-MM-DD.csv",
            "Open CSV and verify 25 columns per screen + totals row",
        ],
        expected: "CSV exports with complete financial breakdown",
    },
    {
        id: "intelligence-bo-tax",
        phase: "C",
        prompt: "P62",
        name: "Intelligence Mode — B&O Tax Toggle",
        url: `${BASE_URL}/proposals/new`,
        steps: [
            "Start manual proposal",
            "Navigate to Step 3",
            "Toggle B&O Tax on",
            "Verify 2% B&O tax appears in calculations",
            "Toggle B&O Tax off",
            "Verify B&O tax removed",
        ],
        expected: "B&O tax toggle correctly adds/removes 2% Morgantown tax",
    },

    // Phase B: Product Catalog
    {
        id: "product-catalog-admin",
        phase: "B",
        prompt: "P78",
        name: "Product Catalog — Admin UI",
        url: `${BASE_URL}/admin/products`,
        steps: [
            "Navigate to /admin/products",
            "Verify product table loads with seeded products",
            "Search for 'LG'",
            "Filter by environment 'Indoor'",
            "Verify filtering works correctly",
        ],
        expected: "Product catalog admin shows seeded products with working search and filters",
    },

    // Phase D: AI Copilot
    {
        id: "copilot-panel",
        phase: "D",
        prompt: "P78",
        name: "AI Copilot — Panel UI",
        url: `${BASE_URL}/proposals/new`,
        steps: [
            "Look for chat bubble button (bottom-right)",
            "Click to open Copilot panel",
            "Verify slide-out panel appears",
            "Verify quick actions are shown",
            "Type a message and press Enter",
            "Verify echo response appears (if no AI configured)",
        ],
        expected: "Copilot panel opens, shows quick actions, and handles messages",
    },

    // Full system
    {
        id: "full-system-smoke",
        phase: "E",
        prompt: "P78",
        name: "Full System — Smoke Test",
        url: `${BASE_URL}`,
        steps: [
            "Login with valid credentials",
            "Verify dashboard loads",
            "Navigate to /proposals",
            "Create new proposal",
            "Upload Excel OR start manually",
            "Configure screens in Step 2",
            "Set margin in Step 3",
            "Export PDF in Step 4",
            "Verify PDF downloads",
        ],
        expected: "Complete end-to-end flow works without errors",
    },
];

// ============================================================================
// CLI
// ============================================================================

function listTests() {
    console.log("\n📋 ANC Proposal Engine — Visual QA Test Cases\n");
    console.log(`Total: ${TEST_CASES.length} tests\n`);

    const phases = [...new Set(TEST_CASES.map((t) => t.phase))];
    for (const phase of phases) {
        const tests = TEST_CASES.filter((t) => t.phase === phase);
        console.log(`\n--- Phase ${phase} (${tests.length} tests) ---`);
        for (const t of tests) {
            console.log(`  [${t.id}] ${t.name} (${t.prompt})`);
        }
    }
    console.log("");
}

function showTest(id) {
    const test = TEST_CASES.find((t) => t.id === id);
    if (!test) {
        console.error(`Test '${id}' not found. Use --list to see available tests.`);
        process.exit(1);
    }

    console.log(`\n🧪 ${test.name} (${test.prompt}, Phase ${test.phase})`);
    console.log(`   URL: ${test.url}`);
    console.log(`   Steps:`);
    test.steps.forEach((s, i) => console.log(`     ${i + 1}. ${s}`));
    console.log(`   Expected: ${test.expected}\n`);
}

// Main
const arg = process.argv[2];
if (arg === "--list" || arg === "-l") {
    listTests();
} else if (arg) {
    showTest(arg);
} else {
    listTests();
    console.log("Usage:");
    console.log("  node visual-qa.js --list          List all tests");
    console.log("  node visual-qa.js <test-id>       Show test details");
    console.log("");
}
