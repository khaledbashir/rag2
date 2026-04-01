const ExcelJS = require('exceljs');

async function run() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  const ws = wb.getWorksheet('LED Cost Sheet');
  
  let i = 0;
  ws.eachRow((row, n) => {
    if(n>3 && row.getCell(1).value) {
        let p = row.getCell('F').value?.result || row.getCell('F').value;
        if (p && String(p).includes('LG GSQA 3.9mm')) {
          console.log(`== MATCH ROW ${n} : ${row.getCell(1).value} ==`);
          console.log(`Product: ${p}`);
          console.log(`$/SqFt: ${row.getCell('P').value?.result || row.getCell('P').value}`);
          console.log(`Display: ${row.getCell('Q').value?.result || row.getCell('Q').value}`);
          console.log(`TotalCost: ${row.getCell('T').value?.result || row.getCell('T').value}`);
          console.log(`Selling: ${row.getCell('V').value?.result || row.getCell('V').value}`);
        }
      i++;
    }
  });

}
run();
