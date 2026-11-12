import fs from 'node:fs';
const bytes = fs.readFileSync('src/commands/owo.js');
console.log('İlk 24 byte:', bytes.slice(0, 24).toString('hex').match(/../g).join(' '));
console.log('ASCII görüntü:', bytes.slice(0, 24).toString('latin1').replace(/[^\x20-\x7E]/g, '·'));
