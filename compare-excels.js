const ExcelJS = require('exceljs');

async function analyze(filePath, label) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  console.log('\n=== ' + label + ' ===');
  console.log('Tabs:', wb.worksheets.map(s => s.name).join(', '));

  const ma = wb.getWorksheet('Margin Analysis');
  if (!ma) { console.log('No Margin Analysis tab found'); return; }

  const rows = [];
  ma.eachRow((row, i) => {
    const vals = [];
    row.eachCell({includeEmpty: true}, (cell, col) => {
      vals.push(cell.value);
    });
    rows.push({row: i, vals});
  });

  console.log('Total rows:', rows.length);
  console.log('\nAll rows:');
  rows.forEach(r => {
    const display = r.vals.map(v => v === null || v === undefined ? '' : String(v)).join(' | ');
    console.log('  R' + r.row + ': ' + display);
  });
}

(async () => {
  await analyze('docs/UNC---Kenan-Stadium-RFP---Cost-Analysis-audit.xlsx', 'ORIGINAL (before fix)');
  await analyze('docs/UNC---Kenan-Stadium-RFP---Cost-Analysis-audit (1).xlsx', 'NEW (after fix)');
})();
