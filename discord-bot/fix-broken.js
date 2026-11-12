// fix-broken.js — owo.js'teki mojibake kalıntılarını temizler
const fs = require('fs');
let s = fs.readFileSync('src/commands/owo.js', 'latin1');
s = s.replace(/`> >`/g, '`> `');   // bozuk tepki işareti
s = s.replace(/\x1f/g, '');         // kontrol karakterleri
s = s.replace(/\uFFFD/g, '');       // replacement char
fs.writeFileSync('src/commands/owo.js', Buffer.from(s, 'latin1'));
console.log('temizlendi');
