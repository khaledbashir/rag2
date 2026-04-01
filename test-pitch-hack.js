const fs = require('fs');
const code = fs.readFileSync('/root/rag2/app/api/rfp/pipeline/scoping-workbook/route.ts', 'utf-8');
const lines = code.split('\n');
lines.forEach((l, i) => {
    if (l.includes('needsWestfieldReextract') || l.includes('preservePitchFromOriginal')) {
        console.log(`Line ${i+1}: ${l.trim()}`);
    }
});
