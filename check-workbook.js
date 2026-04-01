const ExcelJS = require("exceljs");

async function checkWorkbook() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("Scoping_Workbook_Large_Format_LED_2026-04-01 (1).xlsx");
  const ws = wb.getWorksheet("LED Cost Sheet");
  
  if (!ws) {
    console.log("No LED Cost Sheet found");
    return;
  }
  
  console.log("Checking LED Cost Sheet rows:");
  // Data starts at row 4
  for (let i = 4; i <= 10; i++) {
    const row = ws.getRow(i);
    const display = row.getCell(1).value;
    if (!display) break;
    
    console.log(`Row ${i}: ${display}`);
    console.log(`  Product (F):`, JSON.stringify(row.getCell(6).value));
    console.log(`  $/SqFt (P):`, JSON.stringify(row.getCell(16).value));
    console.log(`  Display Cost (Q):`, JSON.stringify(row.getCell(17).value));
    console.log(`  Total Cost (T):`, JSON.stringify(row.getCell(20).value));
    console.log(`  Selling Price (V):`, JSON.stringify(row.getCell(22).value));
  }
  
  const ma = wb.getWorksheet("Margin Analysis");
  if (ma) {
    console.log("\nChecking Margin Analysis:");
    // Check base bid grand total (usually near the end)
    let found = false;
    for (let i = 1; i <= 100; i++) {
      const cell = ma.getCell(i, 2).value;
      if (cell === "BASE BID GRAND TOTAL") {
        console.log(`Base Bid Grand Total row ${i}:`);
        console.log(`  Cost (C):`, JSON.stringify(ma.getCell(i, 3).value));
        console.log(`  Sell (D):`, JSON.stringify(ma.getCell(i, 4).value));
        found = true;
        break;
      }
    }
  }
}

checkWorkbook().catch(console.error);
