const fs = require('fs');
const path = require('path');
const file = fs.readFileSync('node_modules/@univerjs/ui/lib/cjs/index.js', 'utf-8');
console.log(file.match(/scroll[a-zA-Z0-9_]*/g).slice(0, 50).join(', '));
