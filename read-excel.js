const ExcelJS = require('exceljs');
async function run() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  const ws = wb.getWorksheet('LED Cost Sheet');
  if (!ws) { console.log('No LED Cost Sheet'); return; }
  
  const lastRow = ws.rowCount;
  let totalCost = 0, totalSelling = 0;
  // read specific cells on row 3-4 (first few)
  for (let i = 3; i <= 5; i++) {
    const row = ws.getRow(i);
    if (!row.getCell(1).value) break;
    console.log(`Row ${i}: Product=${row.getCell('F').value?.result || row.getCell('F').value}, PxH=${row.getCell('J').value?.result || row.getCell('J').value}, SqFt=${row.getCell('M').value?.result || row.getCell('M').value}, $/SqFt=${row.getCell('P').value?.result || row.getCell('P').value}, TotalCost=${row.getCell('T').value?.result || row.getCell('T').value}, Selling=${row.getCell('V').value?.result || row.getCell('V').value}`);
  }
}
run();
