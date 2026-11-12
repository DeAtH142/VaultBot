x// fix-divider.mjs — owo.js 325. satırındaki bozuk DIVIDER satırını onarır
import fs from 'node:fs';
const p = 'src/commands/owo.js';
const lines = fs.readFileSync(p, 'utf8').split('\n');
const BT = '`', BS = '\\', DL = '$';
// Hedef satır:       `\`${DIVIDER}\``,
const target = '      ' + BT + BS + BT + BS + DL + '{DIVIDER}' + BS + BT + BS + BT + ',';
console.log('önce :', JSON.stringify(lines[324]));
lines[324] = target;
console.log('sonra:', JSON.stringify(lines[324]));
// 327. satırı da temizle (bozuk target satırı):
const t2 = '      ' + BT + DL + '{E.target} **Kontrol paneli aşağıda ↓**  *(Hesap eklemek için ' + BS + BT + '!hesaplarim' + BS + BT + ')*' + BT + ',';
console.log('satır 327 önce :', JSON.stringify(lines[326]));
lines[326] = t2;
console.log('satır 327 sonra:', JSON.stringify(lines[326]));
fs.writeFileSync(p, lines.join('\n'), 'utf8');
