// fix-mojibake.mjs — Çift kodlanmış (UTF-8→Latin-1→UTF-8) metinleri onarır
// Kullanım: node fix-mojibake.mjs <dosya>
// Mantık: Dosya metni "â€”" gibi karakterler içeriyorsa, metni latin1'e geri
// çevirip ortaya çıkan byte'ları UTF-8 olarak yeniden decode eder.
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Kullanım: node fix-mojibake.mjs <dosya>'); process.exit(1); }

const raw = fs.readFileSync(file, 'utf8');

// Çift kodlanmış mı? "â€" dizisi tipik mojibake işaretidir
const looksMojibake = /â€|Ã¼|Ã¶|ÄŸ|ÅŸ|Ä±|Ã‡/.test(raw);
if (!looksMojibake) {
  console.log(`SKIP (temiz): ${file}`);
  process.exit(0);
}

// Onar: mevcut string'i latin1 byte'lara çevir → bu byte'lar asıl UTF-8 verisi
const fixed = Buffer.from(raw, 'latin1').toString('utf8');

// Doğrulama: onarılmış metinde hâlâ mojibake var mı? (çift kırılmış dosyalar için tekrar uygula)
let final = fixed;
if (/â€|Ã¼|Ã¶|ÄŸ|ÅŸ/.test(final)) {
  final = Buffer.from(final, 'latin1').toString('utf8');
}

fs.writeFileSync(file, final, 'utf8');
console.log(`FIXED: ${file} (${raw.length} → ${final.length} karakter)`);
