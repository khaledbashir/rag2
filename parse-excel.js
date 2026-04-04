const ExcelJS = require('exceljs');

async function run() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  const ws = wb.getWorksheet('LED Cost Sheet');
  
  let i = 0;
  ws.eachRow((row, n) => {
    if(n>3 && n<8 && row.getCell(1).value) {
        let p = row.getCell('F').value?.result || row.getCell('F').value;
        console.log(`Row ${n}: Product = ${p}`);
      i++;
    }
  });
  
  const m = wb.getWorksheet('Margin Analysis');
  if (m) console.log("Has margin analysis");
}
run();
