const ExcelJS = require('exceljs');

async function run() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  const ws = wb.getWorksheet('LED Cost Sheet');
  
  console.log("Checking Row 3 (FIELD RIBBON NORTH):");
  const row4 = ws.getRow(4); // the downloaded excel has headers on 1-3, data starts at 4. But let's check
  let offset = 3;
  if(ws.getRow(4).getCell(1).value === "FIELD RIBBON NORTH") offset = 4;
  if(ws.getRow(3).getCell(1).value === "FIELD RIBBON NORTH") offset = 3;
  
  const riNorth = ws.getRow(offset);
  const riEast = ws.getRow(offset+1);
  const riTotal = ws.getRow(offset+47); // 47 elements
  
  console.log("NORTH:");
  console.log(`Product: ${riNorth.getCell('F').value?.result || riNorth.getCell('F').value}`);
  console.log(`$/SqFt: ${riNorth.getCell('P').value?.result || riNorth.getCell('P').value}`);
  console.log(`Display: ${riNorth.getCell('Q').value?.result || riNorth.getCell('Q').value}`);
  console.log(`TotalCost: ${riNorth.getCell('T').value?.result || riNorth.getCell('T').value}`);
  console.log(`Selling: ${riNorth.getCell('V').value?.result || riNorth.getCell('V').value}`);
  
  console.log("-");
  console.log("TOTAL:");
  console.log(`TotalCost: ${riTotal.getCell('T').value?.result || riTotal.getCell('T').value}`);
  console.log(`Selling: ${riTotal.getCell('V').value?.result || riTotal.getCell('V').value}`);
}
run();
